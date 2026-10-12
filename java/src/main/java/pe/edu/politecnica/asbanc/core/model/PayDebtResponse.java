package pe.edu.politecnica.asbanc.core.model;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PayDebtResponse(
    String codigoRespuesta,
    String nombreCliente,
    String numOperacionERP,
    String descripcionResp,
    TransactionMetrics metrics,
    Integer responseTimeMs
) {
    public PayDebtResponse(String codigoRespuesta, String nombreCliente, String numOperacionERP, String descripcionResp) {
        this(codigoRespuesta, nombreCliente, numOperacionERP, descripcionResp, null, null);
    }
}
