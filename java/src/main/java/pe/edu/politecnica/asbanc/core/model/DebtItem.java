package pe.edu.politecnica.asbanc.core.model;

import java.math.BigDecimal;

public record DebtItem(
    String codigoProducto,
    String numDocumento,
    String descDocumento,
    String fechaVencimiento,
    String fechaEmision,
    BigDecimal deuda,
    BigDecimal pagoMinimo,
    String monedaDoc
) {}
