package pe.edu.politecnica.asbanc.core.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ReversePayRequest(
    @NotBlank(message = "fechaTxn es obligatoria")
    String fechaTxn,

    @NotBlank(message = "horaTxn es obligatoria")
    String horaTxn,

    @NotBlank(message = "codigoBanco es obligatorio")
    @Size(min = 1, max = 4)
    String codigoBanco,

    @NotBlank(message = "numOperacionBanco es obligatorio")
    @Size(min = 1, max = 20)
    String numOperacionBanco,

    @NotBlank(message = "numDocumento es obligatorio")
    String numDocumento,

    String codigoEmpresa,
    String motivoExtorno,
    String tipoConsulta,
    String idConsulta,
    String formaPago,
    java.math.BigDecimal importePagado,
    String monedaDoc
) {
    public ReversePayRequest(
        String fechaTxn,
        String horaTxn,
        String codigoBanco,
        String numOperacionBanco,
        String numDocumento,
        String codigoEmpresa,
        String motivoExtorno
    ) {
        this(fechaTxn, horaTxn, codigoBanco, numOperacionBanco, numDocumento, codigoEmpresa, motivoExtorno, null, null, null, null, null);
    }

    public ReversePayRequest {
        if (fechaTxn != null) fechaTxn = fechaTxn.trim();
        if (horaTxn != null) horaTxn = horaTxn.trim();
        if (codigoBanco != null) codigoBanco = codigoBanco.trim();
        if (numOperacionBanco != null) numOperacionBanco = numOperacionBanco.trim();
        if (numDocumento != null) numDocumento = numDocumento.trim();
        if (codigoEmpresa != null) codigoEmpresa = codigoEmpresa.trim();
        if (motivoExtorno != null) motivoExtorno = motivoExtorno.trim();
        if (tipoConsulta != null) tipoConsulta = tipoConsulta.trim();
        if (idConsulta != null) idConsulta = idConsulta.trim();
        if (formaPago != null) formaPago = formaPago.trim();
        if (monedaDoc != null) monedaDoc = monedaDoc.trim();
    }
}
