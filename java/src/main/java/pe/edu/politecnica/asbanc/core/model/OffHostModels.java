package pe.edu.politecnica.asbanc.core.model;

import java.math.BigDecimal;
import java.util.List;

public class OffHostModels {

    public record DebtFileHeader(
        String nombreArchivo,
        String tipoActualizacion,
        String codigoEmpresa,
        String fechaTransmision,
        String horaTransmision,
        long numeroRegistros,
        BigDecimal importeTotalSoles,
        BigDecimal importeTotalDolares,
        String filler,
        long mac
    ) {}

    public record DebtDetailRecord(
        String tipoActualizacion,
        String codigoCliente,
        String nombreCliente,
        String codigoProducto,
        String numDocumento,
        String descripcion,
        String fechaVencimiento,
        String fechaEmision,
        BigDecimal deuda,
        BigDecimal mora,
        BigDecimal gastosAdm,
        BigDecimal pagoMinimo,
        String periodo,
        String anio,
        String cuota,
        String moneda,
        String filler
    ) {}

    public record PaymentDetailRecord(
        String tipoRegistro,
        String sucursal,
        String moneda,
        String ctaRecaudadora,
        String codigoCliente,
        String nombreCliente,
        String codigoProducto,
        String numDocumento,
        String fechaVencimiento,
        String fechaTransaccion,
        String horaTransaccion,
        BigDecimal importePagado,
        String agencia,
        String direccion,
        String numOperacionBanco,
        String canalPago,
        String formaPago,
        String fechaContable,
        String tipoOperacion,
        String codigoBanco,
        String filler
    ) {}

    public record ReconciliationResult(
        String status,
        int totalProcesados,
        int totalCoincidentes,
        int totalDiscrepancias,
        List<DiscrepancyItem> discrepancias
    ) {}

    public record DiscrepancyItem(
        String numOperacionBanco,
        String numDocumento,
        String tipoDiscrepancia,
        BigDecimal montoOffHost,
        BigDecimal montoOnHost,
        String detalle
    ) {}

    public record GenerateDebtsResponse(
        String fileName,
        String filePath,
        long totalRecords,
        BigDecimal importeTotalSoles,
        BigDecimal importeTotalDolares,
        String message
    ) {}

    public record ProcessPaymentsResponse(
        String fileName,
        int totalLeidos,
        int totalAplicados,
        int totalErrores,
        String message
    ) {}

    public record SftpSyncResult(
        String status,
        int filesDownloaded,
        int filesProcessed,
        List<String> processedFiles,
        List<ReconciliationResult> reconciliations,
        String message
    ) {}

    public record SftpUploadResult(
        String status,
        String fileName,
        String remotePath,
        long bytesUploaded,
        String message
    ) {}
}
