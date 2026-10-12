package pe.edu.politecnica.asbanc.core.model;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record TransactionMetrics(
    int responseTimeMs,
    int executionTimeMs,
    String unit
) {}
