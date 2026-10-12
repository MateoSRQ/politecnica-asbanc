package pe.edu.politecnica.asbanc.interfaces.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import pe.edu.politecnica.asbanc.core.model.AuditLogRecord;
import pe.edu.politecnica.asbanc.infrastructure.audit.AuditBatchBufferService;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;
import pe.edu.politecnica.asbanc.infrastructure.telemetry.MetricsService;

import java.util.UUID;

@Component
public class AuditInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AuditInterceptor.class);

    private final AuditBatchBufferService auditBuffer;
    private final MetricsService metricsService;
    private final AsbancProperties properties;
    private final ObjectMapper objectMapper;

    public AuditInterceptor(
        AuditBatchBufferService auditBuffer,
        MetricsService metricsService,
        AsbancProperties properties,
        ObjectMapper objectMapper
    ) {
        this.auditBuffer = auditBuffer;
        this.metricsService = metricsService;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String traceId = request.getHeader("X-Request-ID");
        if (traceId == null || traceId.isBlank()) {
            traceId = UUID.randomUUID().toString();
        }

        request.setAttribute("ASBANC_TRACE_ID", traceId);
        request.setAttribute("ASBANC_START_TIME", System.currentTimeMillis());

        MDC.put("traceId", traceId);
        MDC.put("uri", request.getRequestURI());
        MDC.put("method", request.getMethod());

        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        try {
            Long startTime = (Long) request.getAttribute("ASBANC_START_TIME");
            long durationMs = (startTime != null) ? Math.max(1, System.currentTimeMillis() - startTime) : 1;

            String traceId = (String) request.getAttribute("ASBANC_TRACE_ID");
            String uri = request.getRequestURI();
            String method = uri.substring(uri.lastIndexOf('/') + 1);

            String bankCode = (String) request.getAttribute("ASBANC_BANK_CODE");
            String channel = (String) request.getAttribute("ASBANC_CHANNEL");
            String idConsulta = (String) request.getAttribute("ASBANC_ID_CONSULTA");
            String numOpBanco = (String) request.getAttribute("ASBANC_NUM_OP_BANCO");
            String statusCode = (String) request.getAttribute("ASBANC_STATUS_CODE");
            if (statusCode == null) statusCode = String.valueOf(response.getStatus());

            metricsService.recordTransaction(method, bankCode, channel, statusCode, durationMs);
            if (durationMs > properties.getSlaWarningThresholdMs()) {
                metricsService.recordSlaViolation(method, bankCode);
                log.warn("ALERTA SLA: Transacción {} superó {}ms (duración: {}ms)", uri, properties.getSlaWarningThresholdMs(), durationMs);
            }

            MDC.put("bankCode", bankCode != null ? bankCode : "N/A");
            MDC.put("channel", channel != null ? channel : "N/A");
            MDC.put("durationMs", String.valueOf(durationMs));
            MDC.put("codigoRespuesta", statusCode);

            log.info("Transacción ASBANC procesada en {}ms", durationMs);

            if (uri.toLowerCase().startsWith("/api/transactional") || uri.toLowerCase().startsWith("/api/auth")) {
                Object respObj = request.getAttribute("ASBANC_RESPONSE");
                String responsePayload = "";
                if (respObj != null) {
                    try {
                        responsePayload = objectMapper.writeValueAsString(respObj);
                    } catch (Exception ignored) {}
                }

                String requestPayload = "{}";
                if (request instanceof org.springframework.web.util.ContentCachingRequestWrapper cachingReq) {
                    byte[] buf = cachingReq.getContentAsByteArray();
                    if (buf != null && buf.length > 0) {
                        try {
                            String encoding = cachingReq.getCharacterEncoding() != null ? cachingReq.getCharacterEncoding() : "UTF-8";
                            requestPayload = new String(buf, encoding);
                        } catch (Exception ignored) {}
                    }
                }

                AuditLogRecord audit = new AuditLogRecord(
                    traceId,
                    method,
                    uri,
                    request.getRemoteAddr(),
                    bankCode,
                    idConsulta,
                    numOpBanco,
                    statusCode,
                    (int) durationMs,
                    requestPayload,
                    responsePayload
                );

                auditBuffer.enqueue(audit);
            }
        } finally {
            MDC.clear();
        }
    }
}
