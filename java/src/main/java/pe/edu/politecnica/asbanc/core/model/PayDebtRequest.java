package pe.edu.politecnica.asbanc.core.model;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record PayDebtRequest(
    @NotBlank(message = "fechaTxn es obligatoria")
    @Pattern(regexp = "^[0-9]{8}$", message = "fechaTxn debe tener formato AAAAMMDD o DDMMAAAA (8 dígitos)")
    String fechaTxn,

    @NotBlank(message = "horaTxn es obligatoria")
    @Pattern(regexp = "^[0-9]{6}$", message = "horaTxn debe tener formato HHMMSS (6 dígitos)")
    String horaTxn,

    @NotBlank(message = "canalPago es obligatorio")
    @Size(min = 1, max = 2)
    String canalPago,

    @NotBlank(message = "codigoBanco es obligatorio")
    @Size(min = 1, max = 4)
    String codigoBanco,

    @NotBlank(message = "numOperacionBanco es obligatorio")
    @Size(min = 1, max = 20)
    String numOperacionBanco,

    @NotBlank(message = "formaPago es obligatoria")
    @Size(min = 1, max = 2)
    String formaPago,

    @NotBlank(message = "tipoConsulta es obligatorio")
    String tipoConsulta,

    @NotBlank(message = "idConsulta es obligatorio")
    String idConsulta,

    String codigoProducto,

    @NotBlank(message = "numDocumento es obligatorio")
    String numDocumento,

    @NotNull(message = "importePagado es obligatorio")
    @DecimalMin(value = "0.01", message = "importePagado debe ser mayor a 0")
    BigDecimal importePagado,

    String monedaDoc,
    String codigoEmpresa
) {
    public PayDebtRequest {
        if (fechaTxn != null) fechaTxn = fechaTxn.trim();
        if (horaTxn != null) horaTxn = horaTxn.trim();
        if (canalPago != null) canalPago = canalPago.trim();
        if (codigoBanco != null) codigoBanco = codigoBanco.trim();
        if (numOperacionBanco != null) numOperacionBanco = numOperacionBanco.trim();
        if (formaPago != null) formaPago = formaPago.trim();
        if (tipoConsulta != null) tipoConsulta = tipoConsulta.trim();
        if (idConsulta != null) idConsulta = idConsulta.trim().toUpperCase();
        if (codigoProducto != null) codigoProducto = codigoProducto.trim();
        if (numDocumento != null) numDocumento = numDocumento.trim();
        if (monedaDoc != null) monedaDoc = monedaDoc.trim();
        if (codigoEmpresa != null) codigoEmpresa = codigoEmpresa.trim();
    }
}
