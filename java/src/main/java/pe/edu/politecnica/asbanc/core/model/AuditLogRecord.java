package pe.edu.politecnica.asbanc.core.model;

import java.time.LocalDateTime;

public record AuditLogRecord(
    Long id,
    String traceId,
    String metodo,
    String endpoint,
    String clientIp,
    String codigoBanco,
    String idConsulta,
    String numOperacionBanco,
    String codigoRespuesta,
    Integer executionTimeMs,
    String requestPayload,
    String responsePayload,
    LocalDateTime createdAt
) {
    public AuditLogRecord(
        String traceId,
        String metodo,
        String endpoint,
        String clientIp,
        String codigoBanco,
        String idConsulta,
        String numOperacionBanco,
        String codigoRespuesta,
        Integer executionTimeMs,
        String requestPayload,
        String responsePayload
    ) {
        this(null, traceId, metodo, endpoint, clientIp, codigoBanco, idConsulta, numOperacionBanco, codigoRespuesta, executionTimeMs, requestPayload, responsePayload, LocalDateTime.now());
    }
}
