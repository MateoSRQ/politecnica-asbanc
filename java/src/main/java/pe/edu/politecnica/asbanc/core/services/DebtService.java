package pe.edu.politecnica.asbanc.core.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import pe.edu.politecnica.asbanc.core.constants.AsbancConstants;
import pe.edu.politecnica.asbanc.core.model.DebtItem;
import pe.edu.politecnica.asbanc.core.model.ListDebtsRequest;
import pe.edu.politecnica.asbanc.core.model.ListDebtsResponse;
import pe.edu.politecnica.asbanc.core.utils.AsbancUtil;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Service
public class DebtService {

    private static final Logger log = LoggerFactory.getLogger(DebtService.class);

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final AsbancProperties properties;

    public DebtService(NamedParameterJdbcTemplate jdbcTemplate, AsbancProperties properties) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
    }

    public ListDebtsResponse listDebts(ListDebtsRequest request) {
        String tipo = request.tipoConsulta();
        String idConsulta = request.idConsulta();
        String prod = (request.codigoProducto() != null && !request.codigoProducto().isBlank()) ? request.codigoProducto() : "001";

        try {
            String sql = """
                SELECT TOP 1 
                  alu.id AS alumno_id,
                  alu.codigo_alumno,
                  per.nro_documento,
                  LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo,
                  debt.pago_id,
                  debt.num_cuota,
                  debt.deuda,
                  debt.fecha_vencimiento,
                  debt.fecha_generacion,
                  debt.created_at,
                  debt.concepto,
                  debt.periodo_nombre,
                  debt.periodo_fecha_inicio
                FROM Academico.Alumno alu
                JOIN General.Persona per ON alu.persona_id = per.id
                OUTER APPLY (
                  SELECT TOP 1
                    ap.id AS pago_id,
                    ap.num_cuota,
                    ROUND(ISNULL(Ctas_Ctes.ObtieneMontoPago(ap.id), ap.monto), 2) AS deuda,
                    ap.fecha_vencimiento,
                    ap.fecha_generacion,
                    ap.created_at,
                    CASE WHEN ap.num_cuota = 0 THEN 'MATRICULA' ELSE 'CUOTA ' + CAST(ap.num_cuota AS VARCHAR) END AS concepto,
                    p.nombre AS periodo_nombre,
                    p.fecha_inicio AS periodo_fecha_inicio
                  FROM Ctas_Ctes.Alumno_Pago ap
                  LEFT JOIN Ctas_Ctes.Alumno_Pago_Cuota apc ON ap.id = apc.alumno_pago_id
                  LEFT JOIN Ctas_Ctes.Alumno_Cuota ac ON apc.alumno_cuota_id = ac.id
                  LEFT JOIN Carga_Academica.Carga_Academica_Sede cas ON ap.carga_academica_sede_id = cas.id
                  LEFT JOIN Carga_Academica.Carga_Academica ca ON cas.carga_academica_id = ca.id
                  LEFT JOIN General.Periodo p ON ca.periodo_id = p.id
                  WHERE ap.alumno_id = alu.id
                    AND ap.param_estado_pago_id = 25 -- PENDIENTE
                  ORDER BY 
                    ISNULL(p.fecha_inicio, '1900-01-01') ASC,
                    ISNULL(p.id, 0) ASC,
                    ap.num_cuota ASC,
                    ap.fecha_vencimiento ASC,
                    ap.id ASC
                ) debt
                WHERE 
                  (:tipo = '0' AND (alu.codigo_alumno = :idConsulta OR per.nro_documento = :idConsulta))
                  OR (:tipo IN ('1', '2') AND (per.nro_documento = :idConsulta OR alu.codigo_alumno = :idConsulta))
                  OR (alu.codigo_alumno = :idConsulta OR per.nro_documento = :idConsulta)
            """;

            MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("tipo", tipo)
                .addValue("idConsulta", idConsulta);

            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, params);
            if (!rows.isEmpty()) {
                Map<String, Object> row = rows.get(0);
                Object pagoIdObj = row.get("pago_id");

                if (pagoIdObj == null) {
                    return new ListDebtsResponse(AsbancConstants.ResponseCodes.CUSTOMER_NO_DEBTS, "CLIENTE SIN DEUDAS PENDIENTES", Collections.emptyList());
                }

                Integer numCuota = (Integer) row.get("num_cuota");
                String conceptoDesc = (numCuota != null && numCuota == 0) ? "MATRICULA" : (numCuota != null ? "CUOTA " + numCuota : "PENSION");
                String periodoNombre = (String) row.get("periodo_nombre");
                String descDoc = AsbancUtil.sanitizeString(conceptoDesc + (periodoNombre != null ? " " + periodoNombre : ""), 30);

                BigDecimal deuda = (BigDecimal) row.get("deuda");
                Object vencObj = row.get("fecha_vencimiento");
                Object genObj = row.get("fecha_generacion");
                if (genObj == null) genObj = row.get("created_at");
                if (genObj == null) genObj = row.get("periodo_fecha_inicio");

                LocalDateTime vencDate = convertToLocalDateTime(vencObj);
                LocalDateTime emisionDate = convertToLocalDateTime(genObj);

                DebtItem item = new DebtItem(
                    prod,
                    String.valueOf(pagoIdObj),
                    descDoc,
                    AsbancUtil.formatDateAsbanc(vencDate),
                    AsbancUtil.formatDateAsbanc(emisionDate),
                    deuda != null ? deuda : BigDecimal.ZERO,
                    deuda != null ? deuda : BigDecimal.ZERO,
                    "1"
                );

                return new ListDebtsResponse(AsbancConstants.ResponseCodes.OK, "OK", List.of(item));
            }

            if (properties.isTestMode()) {
                try {
                    String fallbackSql = """
                        SELECT TOP 1
                          d.CodigoProducto,
                          d.NumDocumento,
                          d.DescDocumento,
                          d.FechaVencimiento,
                          d.FechaEmision,
                          d.Deuda,
                          d.PagoMinimo,
                          d.MonedaDoc
                        FROM politecnica_asbanc.dbo.Deudas d
                        JOIN politecnica_asbanc.dbo.Clientes c ON d.ClienteId = c.Id
                        WHERE ((c.TipoConsulta = :tipo AND c.IdConsulta = :idConsulta) OR (c.IdConsulta = :idConsulta))
                          AND d.Estado = 'PENDIENTE'
                        ORDER BY d.FechaVencimiento ASC, d.Id ASC
                    """;
                    List<Map<String, Object>> fallbackRows = jdbcTemplate.queryForList(fallbackSql, params);
                    if (!fallbackRows.isEmpty()) {
                        Map<String, Object> d = fallbackRows.get(0);
                        DebtItem item = new DebtItem(
                            (String) d.get("CodigoProducto"),
                            (String) d.get("NumDocumento"),
                            (String) d.get("DescDocumento"),
                            (String) d.get("FechaVencimiento"),
                            (String) d.get("FechaEmision"),
                            (BigDecimal) d.get("Deuda"),
                            (BigDecimal) d.get("PagoMinimo"),
                            (String) d.get("MonedaDoc")
                        );
                        return new ListDebtsResponse(AsbancConstants.ResponseCodes.OK, "OK", List.of(item));
                    }
                } catch (Exception fbEx) {
                    log.debug("Fallback deudas politecnica_asbanc no disponible: {}", fbEx.getMessage());
                }
            }

            return new ListDebtsResponse(AsbancConstants.ResponseCodes.CUSTOMER_NOT_FOUND, "CLIENTE NO EXISTE", Collections.emptyList());
        } catch (Exception e) {
            log.error("Error consultando deudas para {}: {}", idConsulta, e.getMessage(), e);
            return new ListDebtsResponse(AsbancConstants.ResponseCodes.UNKNOWN_ERROR, "ERROR DESCONOCIDO", Collections.emptyList());
        }
    }

    private LocalDateTime convertToLocalDateTime(Object dateObj) {
        if (dateObj == null) return LocalDateTime.now();
        if (dateObj instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        if (dateObj instanceof java.sql.Date d) return d.toLocalDate().atStartOfDay();
        if (dateObj instanceof java.time.LocalDateTime ldt) return ldt;
        if (dateObj instanceof java.time.LocalDate ld) return ld.atStartOfDay();
        if (dateObj instanceof java.util.Date ud) return new java.sql.Timestamp(ud.getTime()).toLocalDateTime();
        return LocalDateTime.now();
    }
}
