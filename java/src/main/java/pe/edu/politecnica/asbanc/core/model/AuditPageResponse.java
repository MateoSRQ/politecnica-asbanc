package pe.edu.politecnica.asbanc.core.model;

import java.util.List;

public record AuditPageResponse(
    List<AuditLogRecord> data,
    int page,
    int limit,
    long total,
    int totalPages
) {}
