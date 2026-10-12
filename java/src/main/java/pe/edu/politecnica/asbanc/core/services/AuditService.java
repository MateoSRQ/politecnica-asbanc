package pe.edu.politecnica.asbanc.core.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import pe.edu.politecnica.asbanc.core.model.AuditLogRecord;
import pe.edu.politecnica.asbanc.core.model.AuditPageResponse;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private volatile String cachedTableName = null;

    public AuditService(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private String resolveTableName() {
        if (cachedTableName != null) return cachedTableName;
        try {
            Integer exists = jdbcTemplate.getJdbcTemplate().queryForObject(
                "SELECT OBJECT_ID('dbo.AuditoriaLogs', 'U')", Integer.class);
            cachedTableName = (exists != null && exists > 0) ? "dbo.AuditoriaLogs" : "politecnica_asbanc.dbo.AuditoriaLogs";
        } catch (Exception e) {
            cachedTableName = "dbo.AuditoriaLogs";
        }
        return cachedTableName;
    }

    private AuditLogRecord mapRow(ResultSet rs, int rowNum) throws SQLException {
        Timestamp ts = rs.getTimestamp("CreatedAt");
        LocalDateTime created = ts != null ? ts.toLocalDateTime() : null;

        return new AuditLogRecord(
            rs.getLong("Id"),
            rs.getString("TraceId"),
            rs.getString("Metodo"),
            rs.getString("Endpoint"),
            rs.getString("ClientIp"),
            rs.getString("CodigoBanco"),
            rs.getString("IdConsulta"),
            rs.getString("NumOperacionBanco"),
            rs.getString("CodigoRespuesta"),
            rs.getInt("ExecutionTimeMs"),
            rs.getString("RequestPayload"),
            rs.getString("ResponsePayload"),
            created
        );
    }

    public AuditPageResponse findAudits(int page, int limit, String bankCode, String method, String statusCode, String search, String traceId) {
        String tableName = resolveTableName();
        int safePage = Math.max(1, page);
        int safeLimit = Math.min(100, Math.max(1, limit));
        int offset = (safePage - 1) * safeLimit;

        StringBuilder whereClause = new StringBuilder(" WHERE 1=1 ");
        MapSqlParameterSource params = new MapSqlParameterSource();

        if (bankCode != null && !bankCode.isBlank()) {
            whereClause.append(" AND CodigoBanco = :bankCode ");
            params.addValue("bankCode", bankCode.trim());
        }
        if (method != null && !method.isBlank()) {
            whereClause.append(" AND Metodo LIKE :method ");
            params.addValue("method", "%" + method.trim() + "%");
        }
        if (statusCode != null && !statusCode.isBlank()) {
            whereClause.append(" AND CodigoRespuesta = :statusCode ");
            params.addValue("statusCode", statusCode.trim());
        }
        if (traceId != null && !traceId.isBlank()) {
            whereClause.append(" AND TraceId = :traceId ");
            params.addValue("traceId", traceId.trim());
        }
        if (search != null && !search.isBlank()) {
            whereClause.append(" AND (IdConsulta LIKE :search OR NumOperacionBanco LIKE :search) ");
            params.addValue("search", "%" + search.trim() + "%");
        }

        String countSql = "SELECT COUNT(*) FROM " + tableName + whereClause;
        Long total = jdbcTemplate.queryForObject(countSql, params, Long.class);
        if (total == null) total = 0L;

        String selectSql = "SELECT Id, TraceId, Metodo, Endpoint, ClientIp, CodigoBanco, IdConsulta, NumOperacionBanco, CodigoRespuesta, ExecutionTimeMs, RequestPayload, ResponsePayload, CreatedAt " +
            "FROM " + tableName + whereClause + " ORDER BY Id DESC OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY";

        params.addValue("offset", offset);
        params.addValue("limit", safeLimit);

        List<AuditLogRecord> data = jdbcTemplate.query(selectSql, params, this::mapRow);
        int totalPages = (int) Math.ceil((double) total / safeLimit);

        return new AuditPageResponse(data, safePage, safeLimit, total, totalPages);
    }

    public AuditLogRecord findById(Long id) {
        String tableName = resolveTableName();
        String sql = "SELECT TOP 1 Id, TraceId, Metodo, Endpoint, ClientIp, CodigoBanco, IdConsulta, NumOperacionBanco, CodigoRespuesta, ExecutionTimeMs, RequestPayload, ResponsePayload, CreatedAt FROM " + tableName + " WHERE Id = :id";
        List<AuditLogRecord> list = jdbcTemplate.query(sql, new MapSqlParameterSource("id", id), this::mapRow);
        return list.isEmpty() ? null : list.get(0);
    }

    public List<AuditLogRecord> exportLastAudits(int limit) {
        String tableName = resolveTableName();
        int safeLimit = Math.min(5000, Math.max(1, limit));
        String sql = "SELECT TOP " + safeLimit + " Id, TraceId, Metodo, Endpoint, ClientIp, CodigoBanco, IdConsulta, NumOperacionBanco, CodigoRespuesta, ExecutionTimeMs, RequestPayload, ResponsePayload, CreatedAt FROM " + tableName + " ORDER BY Id DESC";
        return jdbcTemplate.query(sql, this::mapRow);
    }
}
