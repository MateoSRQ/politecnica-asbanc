package pe.edu.politecnica.asbanc.core.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ValidateCustomerRequest(
    @NotBlank(message = "tipoConsulta es obligatorio")
    @Pattern(regexp = "^[0-2]$", message = "tipoConsulta debe ser '0' (Código), '1' (DNI) o '2' (RUC)")
    String tipoConsulta,

    @NotBlank(message = "idConsulta es obligatorio")
    @Size(min = 1, max = 14, message = "idConsulta debe tener entre 1 y 14 caracteres")
    String idConsulta,

    String codigoEmpresa,
    String codigoProducto
) {
    public ValidateCustomerRequest {
        if (tipoConsulta != null) tipoConsulta = tipoConsulta.trim();
        if (idConsulta != null) idConsulta = idConsulta.trim().toUpperCase();
        if (codigoEmpresa != null) codigoEmpresa = codigoEmpresa.trim();
        if (codigoProducto != null) codigoProducto = codigoProducto.trim();
    }
}
