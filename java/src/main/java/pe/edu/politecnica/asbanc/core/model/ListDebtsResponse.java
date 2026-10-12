package pe.edu.politecnica.asbanc.core.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ListDebtsResponse(
    String codigoRespuesta,
    String descripcionResp,
    List<DebtItem> deudasPendientes,
    TransactionMetrics metrics,
    Integer responseTimeMs
) {
    public ListDebtsResponse(String codigoRespuesta, String descripcionResp, List<DebtItem> deudasPendientes) {
        this(codigoRespuesta, descripcionResp, deudasPendientes, null, null);
    }
}
