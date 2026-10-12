package pe.edu.politecnica.asbanc.core.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import pe.edu.politecnica.asbanc.core.constants.AsbancConstants;
import pe.edu.politecnica.asbanc.core.model.ValidateCustomerRequest;
import pe.edu.politecnica.asbanc.core.model.ValidateCustomerResponse;
import pe.edu.politecnica.asbanc.core.utils.AsbancUtil;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;

import java.util.List;
import java.util.Map;

@Service
public class CustomerService {

    private static final Logger log = LoggerFactory.getLogger(CustomerService.class);

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final AsbancProperties properties;

    public CustomerService(NamedParameterJdbcTemplate jdbcTemplate, AsbancProperties properties) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
    }

    public ValidateCustomerResponse validateCustomer(ValidateCustomerRequest request) {
        String tipo = request.tipoConsulta();
        String idConsulta = request.idConsulta();

        try {
            String sql = """
                SELECT TOP 1 
                  alu.id AS alumno_id,
                  alu.codigo_alumno,
                  per.nro_documento,
                  LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo
                FROM Academico.Alumno alu
                JOIN General.Persona per ON alu.persona_id = per.id
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
                String fullName = (String) rows.get(0).get("nombre_completo");
                String sanitized = AsbancUtil.sanitizeString(fullName, 30);
                return new ValidateCustomerResponse(AsbancConstants.ResponseCodes.OK, "OK", sanitized);
            }

            if (properties.isTestMode()) {
                try {
                    String fallbackSql = """
                        SELECT TOP 1 NombreCliente
                        FROM politecnica_asbanc.dbo.Clientes
                        WHERE (TipoConsulta = :tipo AND IdConsulta = :idConsulta)
                           OR (IdConsulta = :idConsulta)
                    """;
                    List<Map<String, Object>> fallbackRows = jdbcTemplate.queryForList(fallbackSql, params);
                    if (!fallbackRows.isEmpty()) {
                        String name = (String) fallbackRows.get(0).get("NombreCliente");
                        return new ValidateCustomerResponse(AsbancConstants.ResponseCodes.OK, "OK", AsbancUtil.sanitizeString(name, 30));
                    }
                } catch (Exception fbEx) {
                    log.debug("Fallback politecnica_asbanc no disponible o tabla no existe: {}", fbEx.getMessage());
                }
            }

            return new ValidateCustomerResponse(AsbancConstants.ResponseCodes.CUSTOMER_NOT_FOUND, "CLIENTE NO EXISTE", "");
        } catch (Exception e) {
            log.error("Error validando cliente {}: {}", idConsulta, e.getMessage(), e);
            return new ValidateCustomerResponse(AsbancConstants.ResponseCodes.UNKNOWN_ERROR, "ERROR DESCONOCIDO", "");
        }
    }
}
