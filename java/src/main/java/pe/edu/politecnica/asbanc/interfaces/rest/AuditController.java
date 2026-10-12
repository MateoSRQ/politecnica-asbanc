package pe.edu.politecnica.asbanc.interfaces.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.politecnica.asbanc.core.model.AuditLogRecord;
import pe.edu.politecnica.asbanc.core.model.AuditPageResponse;
import pe.edu.politecnica.asbanc.core.services.AuditService;

import java.io.PrintWriter;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@RestController
public class AuditController {

    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    public AuditController(AuditService auditService, ObjectMapper objectMapper) {
        this.auditService = auditService;
        this.objectMapper = objectMapper;
    }

    @GetMapping(value = {"/api/Audit", "/api/audit"})
    public ResponseEntity<AuditPageResponse> listAudits(
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "50") int limit,
        @RequestParam(required = false) String codigoBanco,
        @RequestParam(required = false) String metodo,
        @RequestParam(required = false) String codigoRespuesta,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String traceId
    ) {
        AuditPageResponse resp = auditService.findAudits(page, limit, codigoBanco, metodo, codigoRespuesta, search, traceId);
        return ResponseEntity.ok(resp);
    }

    @GetMapping(value = {"/api/Audit/{id}", "/api/audit/{id}"})
    public ResponseEntity<?> getAuditById(@PathVariable Long id) {
        AuditLogRecord record = auditService.findById(id);
        if (record == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Auditoría no encontrada");
        }
        return ResponseEntity.ok(record);
    }

    @GetMapping(value = {"/api/Audit/export", "/api/audit/export"})
    public void exportAudits(
        @RequestParam(defaultValue = "csv") String format,
        @RequestParam(defaultValue = "1000") int limit,
        HttpServletResponse response
    ) {
        try {
            List<AuditLogRecord> records = auditService.exportLastAudits(limit);
            String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));

            if ("json".equalsIgnoreCase(format)) {
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"auditoria_asbanc_" + dateStr + ".json\"");
                PrintWriter writer = response.getWriter();
                objectMapper.writeValue(writer, records);
                writer.flush();
            } else {
                response.setContentType("text/csv; charset=UTF-8");
                response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"auditoria_asbanc_" + dateStr + ".csv\"");
                PrintWriter writer = response.getWriter();

                writer.println("Id,TraceId,Metodo,Endpoint,ClientIp,CodigoBanco,IdConsulta,NumOperacionBanco,CodigoRespuesta,ExecutionTimeMs,CreatedAt");

                for (AuditLogRecord r : records) {
                    writer.println(String.format("%d,%s,%s,%s,%s,%s,%s,%s,%s,%d,%s",
                        r.id() != null ? r.id() : 0,
                        escapeCsv(r.traceId()),
                        escapeCsv(r.metodo()),
                        escapeCsv(r.endpoint()),
                        escapeCsv(r.clientIp()),
                        escapeCsv(r.codigoBanco()),
                        escapeCsv(r.idConsulta()),
                        escapeCsv(r.numOperacionBanco()),
                        escapeCsv(r.codigoRespuesta()),
                        r.executionTimeMs() != null ? r.executionTimeMs() : 0,
                        r.createdAt() != null ? r.createdAt().toString() : ""
                    ));
                }
                writer.flush();
            }
        } catch (Exception e) {
            response.setStatus(HttpStatus.INTERNAL_SERVER_ERROR.value());
        }
    }

    private String escapeCsv(String val) {
        if (val == null) return "";
        String s = val.replace("\"", "\"\"");
        if (s.contains(",") || s.contains("\n") || s.contains("\"")) {
            return "\"" + s + "\"";
        }
        return s;
    }
}
