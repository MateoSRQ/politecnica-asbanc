package pe.edu.politecnica.asbanc.core.model;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ValidateCustomerResponse(
    String codigoRespuesta,
    String descripcionResp,
    String nombreCliente,
    TransactionMetrics metrics,
    Integer responseTimeMs
) {
    public ValidateCustomerResponse(String codigoRespuesta, String descripcionResp, String nombreCliente) {
        this(codigoRespuesta, descripcionResp, nombreCliente, null, null);
    }
}
