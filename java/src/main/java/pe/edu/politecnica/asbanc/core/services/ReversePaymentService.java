package pe.edu.politecnica.asbanc.core.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import pe.edu.politecnica.asbanc.core.constants.AsbancConstants;
import pe.edu.politecnica.asbanc.core.model.ReversePayRequest;
import pe.edu.politecnica.asbanc.core.model.ReversePayResponse;
import pe.edu.politecnica.asbanc.core.utils.AsbancUtil;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;

import java.util.List;
import java.util.Map;

@Service
public class ReversePaymentService {

    private static final Logger log = LoggerFactory.getLogger(ReversePaymentService.class);

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final AsbancProperties properties;
    private final WebhookService webhookService;

    public ReversePaymentService(
        NamedParameterJdbcTemplate jdbcTemplate,
        TransactionTemplate transactionTemplate,
        AsbancProperties properties,
        WebhookService webhookService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.transactionTemplate = transactionTemplate;
        this.properties = properties;
        this.webhookService = webhookService;
    }

    public ReversePayResponse reversePay(ReversePayRequest request) {
        try {
            Long pagoId = null;
            try {
                pagoId = Long.parseLong(request.numDocumento());
            } catch (NumberFormatException ignored) {}

            if (pagoId != null) {
                final Long finalPagoId = pagoId;
                ReversePayResponse txResponse = transactionTemplate.execute(status -> {
                    String checkSql = """
                        SELECT 
                          ap.id AS pago_id,
                          ap.param_estado_pago_id,
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

                    String deleteSql = """
                        DELETE FROM Ctas_Ctes.Alumno_Pago_Detalle 
                        WHERE alumno_pago_id = :pagoId AND num_documento = :numOp
                    """;
                    MapSqlParameterSource deleteParams = new MapSqlParameterSource()
                        .addValue("pagoId", finalPagoId)
                        .addValue("numOp", request.numOperacionBanco());

                    int deleted = jdbcTemplate.update(deleteSql, deleteParams);

                    String updateSql = """
                        UPDATE Ctas_Ctes.Alumno_Pago
                        SET 
                          param_estado_pago_id = 25,
                          monto_pagado_sin_mora = 0,
                          monto_pagado_con_mora = 0,
                          fecha_pago = NULL,
                          lugar_pago = NULL,
                          modified_at = GETDATE(),
                          modified_by = 'ASBANC_REVERSE'
                        WHERE id = :pagoId
                    """;
                    jdbcTemplate.update(updateSql, new MapSqlParameterSource().addValue("pagoId", finalPagoId));

                    if (deleted > 0) {
                        return new ReversePayResponse(AsbancConstants.ResponseCodes.OK, nombreCliente, numOperacionERP, "OK");
                    } else {
                        return new ReversePayResponse(AsbancConstants.ResponseCodes.OK, nombreCliente, numOperacionERP, "EXTORNO YA PROCESADO O DOCUMENTO INTACTO");
                    }
                });

                if (txResponse != null) {
                    if ("OK".equals(txResponse.descripcionResp())) {
                        webhookService.dispatchReverseWebhook(request, txResponse.numOperacionERP(), txResponse.nombreCliente());
                    }
                    return txResponse;
                }
            }

            if (properties.isTestMode()) {
                try {
                    String spSql = """
                        EXEC politecnica_asbanc.dbo.sp_Asbanc_ReversePay
                          @FechaTxn = :fechaTxn,
                          @HoraTxn = :horaTxn,
                          @CodigoBanco = :banco,
                          @NumOperacionBanco = :numOp,
                          @NumDocumento = :numDoc,
                          @CodigoEmpresa = :empresa
                    """;

                    MapSqlParameterSource spParams = new MapSqlParameterSource()
                        .addValue("fechaTxn", request.fechaTxn())
                        .addValue("horaTxn", request.horaTxn())
                        .addValue("banco", request.codigoBanco())
                        .addValue("numOp", request.numOperacionBanco())
                        .addValue("numDoc", request.numDocumento())
                        .addValue("empresa", request.codigoEmpresa() != null ? request.codigoEmpresa() : properties.getCompanyCode());

                    List<Map<String, Object>> spRows = jdbcTemplate.queryForList(spSql, spParams);
                    if (!spRows.isEmpty()) {
                        Map<String, Object> r = spRows.get(0);
                        String code = (String) r.get("CodigoRespuesta");
                        String name = (String) r.get("NombreCliente");
                        String erp = (String) r.get("NumOperacionERP");
                        String desc = (String) r.get("DescripcionResp");
                        return new ReversePayResponse(code, name != null ? name : "", erp != null ? erp : "", desc != null ? desc : "OK");
                    }
                } catch (Exception fbEx) {
                    log.debug("Fallback extorno politecnica_asbanc no disponible: {}", fbEx.getMessage());
                }
            }

            return new ReversePayResponse(AsbancConstants.ResponseCodes.UNKNOWN_ERROR, "", "", "DOCUMENTO NO ENCONTRADO PARA REVERSA");
        } catch (Exception e) {
            log.error("Error en ReversePay {}: {}", request.numOperacionBanco(), e.getMessage(), e);
            return new ReversePayResponse(AsbancConstants.ResponseCodes.UNKNOWN_ERROR, "", "", "ERROR DESCONOCIDO");
        }
    }
}
