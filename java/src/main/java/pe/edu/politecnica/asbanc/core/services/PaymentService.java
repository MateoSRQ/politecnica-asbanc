package pe.edu.politecnica.asbanc.core.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import pe.edu.politecnica.asbanc.core.constants.AsbancConstants;
import pe.edu.politecnica.asbanc.core.model.PayDebtRequest;
import pe.edu.politecnica.asbanc.core.model.PayDebtResponse;
import pe.edu.politecnica.asbanc.core.utils.AsbancUtil;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;
import pe.edu.politecnica.asbanc.infrastructure.telemetry.MetricsService;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final AsbancProperties properties;
    private final MetricsService metricsService;
    private final WebhookService webhookService;

    public PaymentService(
        NamedParameterJdbcTemplate jdbcTemplate,
        TransactionTemplate transactionTemplate,
        AsbancProperties properties,
        MetricsService metricsService,
        WebhookService webhookService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.transactionTemplate = transactionTemplate;
        this.properties = properties;
        this.metricsService = metricsService;
        this.webhookService = webhookService;
    }

    public PayDebtResponse payDebt(PayDebtRequest request) {
        try {
            Long pagoId = null;
            try {
                pagoId = Long.parseLong(request.numDocumento());
            } catch (NumberFormatException ignored) {}

            if (pagoId != null) {
                final Long finalPagoId = pagoId;
                PayDebtResponse txResponse = transactionTemplate.execute(status -> {
                    String checkSql = """
                        SELECT 
                          ap.id AS pago_id,
                          ap.alumno_id,
                          ap.num_cuota,
                          ap.monto,
                          ap.param_estado_pago_id,
                          ap.fecha_pago,
                          alu.codigo_alumno,
                          per.nro_documento,
                          LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo
                        FROM Ctas_Ctes.Alumno_Pago ap
                        JOIN Academico.Alumno alu ON ap.alumno_id = alu.id
                        JOIN General.Persona per ON alu.persona_id = per.id
                        WHERE ap.id = :pagoId
                    """;

                    MapSqlParameterSource checkParams = new MapSqlParameterSource().addValue("pagoId", finalPagoId);
                    List<Map<String, Object>> debtRows = jdbcTemplate.queryForList(checkSql, checkParams);

                    if (debtRows.isEmpty()) {
                        return null;
                    }

                    Map<String, Object> debt = debtRows.get(0);
                    String fullName = (String) debt.get("nombre_completo");
                    String nombreCliente = AsbancUtil.sanitizeString(fullName, 30);
                    String numOperacionERP = String.format("%09d", finalPagoId);
                    Integer estadoPago = (Integer) debt.get("param_estado_pago_id");
                    Integer numCuota = (Integer) debt.get("num_cuota");

                    if (estadoPago != null && estadoPago == 16) {
                        String dupSql = "SELECT TOP 1 id FROM Ctas_Ctes.Alumno_Pago_Detalle WHERE alumno_pago_id = :pagoId AND num_documento = :numOp";
                        MapSqlParameterSource dupParams = new MapSqlParameterSource()
                            .addValue("pagoId", finalPagoId)
                            .addValue("numOp", request.numOperacionBanco());

                        List<Map<String, Object>> dupRows = jdbcTemplate.queryForList(dupSql, dupParams);
                        if (!dupRows.isEmpty()) {
                            metricsService.recordIdempotencyHit(request.codigoBanco());
                            return new PayDebtResponse(AsbancConstants.ResponseCodes.OK, nombreCliente, numOperacionERP, "PAGO PREVIAMENTE REGISTRADO (IDEMPOTENTE)");
                        } else {
                            return new PayDebtResponse(AsbancConstants.ResponseCodes.CUSTOMER_NO_DEBTS, nombreCliente, numOperacionERP, "DEUDA YA SE ENCUENTRA CANCELADA");
                        }
                    }

                    LocalDateTime fechaPagoDate = AsbancUtil.parseAsbancDate(request.fechaTxn(), request.horaTxn());
                    Timestamp fechaPagoTs = Timestamp.valueOf(fechaPagoDate);

                    String updateSql = """
                        UPDATE Ctas_Ctes.Alumno_Pago
                        SET 
                          param_estado_pago_id = 16,
                          monto_pagado_sin_mora = :importe,
                          monto_pagado_con_mora = :importe,
                          fecha_pago = :fechaPago,
                          lugar_pago = 'BANCOS',
                          modified_at = GETDATE(),
                          modified_by = 'ASBANC_FTR'
                        WHERE id = :pagoId AND param_estado_pago_id = 25
                    """;

                    MapSqlParameterSource updateParams = new MapSqlParameterSource()
                        .addValue("pagoId", finalPagoId)
                        .addValue("importe", request.importePagado())
                        .addValue("fechaPago", fechaPagoTs);

                    int rowsUpdated = jdbcTemplate.update(updateSql, updateParams);
                    if (rowsUpdated > 0) {
                        String insertSql = """
                            INSERT INTO Ctas_Ctes.Alumno_Pago_Detalle (
                              alumno_pago_id, fecha_pago, lugar_pago, param_estado_pago_id,
                              tipo_pago, serie, num_documento, monto, estado_auditoria,
                              created_at, created_by, num_cuota
                            ) VALUES (
                              :pagoId, :fechaPago, 'BANCOS', 16,
                              'ASBANC', 'FTR', :numOp, :importe, 1,
                              GETDATE(), 'ASBANC_FTR', :numCuota
                            )
                        """;

                        MapSqlParameterSource insertParams = new MapSqlParameterSource()
                            .addValue("pagoId", finalPagoId)
                            .addValue("fechaPago", fechaPagoTs)
                            .addValue("numOp", request.numOperacionBanco())
                            .addValue("importe", request.importePagado())
                            .addValue("numCuota", numCuota != null ? numCuota : 1);

                        jdbcTemplate.update(insertSql, insertParams);

                        return new PayDebtResponse(AsbancConstants.ResponseCodes.OK, nombreCliente, numOperacionERP, "OK");
                    } else {
                        String dupSql = "SELECT TOP 1 id FROM Ctas_Ctes.Alumno_Pago_Detalle WHERE alumno_pago_id = :pagoId AND num_documento = :numOp";
                        MapSqlParameterSource dupParams = new MapSqlParameterSource()
                            .addValue("pagoId", finalPagoId)
                            .addValue("numOp", request.numOperacionBanco());

                        List<Map<String, Object>> dupRows = jdbcTemplate.queryForList(dupSql, dupParams);
                        if (!dupRows.isEmpty()) {
                            metricsService.recordIdempotencyHit(request.codigoBanco());
                            return new PayDebtResponse(AsbancConstants.ResponseCodes.OK, nombreCliente, numOperacionERP, "PAGO PREVIAMENTE REGISTRADO (IDEMPOTENTE)");
                        } else {
                            return new PayDebtResponse(AsbancConstants.ResponseCodes.CUSTOMER_NO_DEBTS, nombreCliente, numOperacionERP, "DEUDA YA SE ENCUENTRA CANCELADA");
                        }
                    }
                });

                if (txResponse != null) {
                    if (AsbancConstants.ResponseCodes.OK.equals(txResponse.codigoRespuesta()) && !"PAGO PREVIAMENTE REGISTRADO (IDEMPOTENTE)".equals(txResponse.descripcionResp())) {
                        webhookService.dispatchPaymentWebhook(request, txResponse.numOperacionERP(), txResponse.nombreCliente());
                    }
                    return txResponse;
                }
            }

            if (properties.isTestMode()) {
                try {
                    String spSql = """
                        EXEC politecnica_asbanc.dbo.sp_Asbanc_PayDebt
                          @FechaTxn = :fechaTxn,
                          @HoraTxn = :horaTxn,
                          @CanalPago = :canal,
                          @CodigoBanco = :banco,
                          @NumOperacionBanco = :numOp,
                          @FormaPago = :forma,
                          @TipoConsulta = :tipo,
                          @IdConsulta = :idConsulta,
                          @CodigoProducto = :prod,
                          @NumDocumento = :numDoc,
                          @ImportePagado = :importe,
                          @MonedaDoc = :moneda,
                          @CodigoEmpresa = :empresa
                    """;

                    MapSqlParameterSource spParams = new MapSqlParameterSource()
                        .addValue("fechaTxn", request.fechaTxn())
                        .addValue("horaTxn", request.horaTxn())
                        .addValue("canal", request.canalPago())
                        .addValue("banco", request.codigoBanco())
                        .addValue("numOp", request.numOperacionBanco())
                        .addValue("forma", request.formaPago())
                        .addValue("tipo", request.tipoConsulta())
                        .addValue("idConsulta", request.idConsulta())
                        .addValue("prod", request.codigoProducto() != null ? request.codigoProducto() : "001")
                        .addValue("numDoc", request.numDocumento())
                        .addValue("importe", request.importePagado())
                        .addValue("moneda", request.monedaDoc() != null ? request.monedaDoc() : "1")
                        .addValue("empresa", request.codigoEmpresa() != null ? request.codigoEmpresa() : properties.getCompanyCode());

                    List<Map<String, Object>> spRows = jdbcTemplate.queryForList(spSql, spParams);
                    if (!spRows.isEmpty()) {
                        Map<String, Object> r = spRows.get(0);
                        String code = (String) r.get("CodigoRespuesta");
                        String name = (String) r.get("NombreCliente");
                        String erp = (String) r.get("NumOperacionERP");
                        String desc = (String) r.get("DescripcionResp");
                        return new PayDebtResponse(code, name != null ? name : "", erp != null ? erp : "", desc != null ? desc : "OK");
                    }
                } catch (Exception fbEx) {
                    log.debug("Fallback Stored Procedure politecnica_asbanc no disponible: {}", fbEx.getMessage());
                }
            }

            return new PayDebtResponse(AsbancConstants.ResponseCodes.UNKNOWN_ERROR, "", "", "DOCUMENTO DE DEUDA NO ENCONTRADO");
        } catch (Exception e) {
            log.error("Error en PayDebt {}: {}", request.numOperacionBanco(), e.getMessage(), e);
            return new PayDebtResponse(AsbancConstants.ResponseCodes.UNKNOWN_ERROR, "", "", "ERROR DESCONOCIDO");
        }
    }
}
