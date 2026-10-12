package pe.edu.politecnica.asbanc.infrastructure.offhost;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.PaymentDetailRecord;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.ProcessPaymentsResponse;
import pe.edu.politecnica.asbanc.core.model.PayDebtRequest;
import pe.edu.politecnica.asbanc.core.model.ReversePayRequest;
import pe.edu.politecnica.asbanc.core.services.PaymentService;
import pe.edu.politecnica.asbanc.core.services.ReversePaymentService;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Service
public class PaymentFileParser {

    private static final Logger log = LoggerFactory.getLogger(PaymentFileParser.class);

    private final PaymentService paymentService;
    private final ReversePaymentService reversePaymentService;

    public PaymentFileParser(PaymentService paymentService, ReversePaymentService reversePaymentService) {
        this.paymentService = paymentService;
        this.reversePaymentService = reversePaymentService;
    }

    public static PaymentDetailRecord parseDetailLine(String line) {
        if (line == null || line.length() < 240) {
            throw new IllegalArgumentException("Línea de pago inválida (longitud mínima 240): " + (line != null ? line.length() : 0));
        }

        String tipoRegistro = line.substring(0, 2).trim();
        if (!"DD".equals(tipoRegistro)) {
            throw new IllegalArgumentException("Tipo de registro no coincide con 'DD': " + tipoRegistro);
        }

        String sucursal = line.substring(2, 5).trim();
        String moneda = line.substring(5, 6).trim();
        String ctaRecaudadora = line.substring(6, 26).trim();
        String codigoCliente = line.substring(26, 40).trim();
        String nombreCliente = line.substring(40, 70).trim();
        String codigoProducto = line.substring(70, 73).trim();
        String numDocumento = line.substring(73, 89).trim();
        String fechaVenc = line.substring(89, 97).trim();
        String fechaTxn = line.substring(97, 105).trim();
        String horaTxn = line.substring(105, 111).trim();

        String rawImporte = line.substring(111, 126).trim();
        BigDecimal importePagado = new BigDecimal(rawImporte).divide(BigDecimal.valueOf(100));

        String agencia = line.substring(126, 141).trim();
        String direccion = line.substring(141, 181).trim();
        String numOperacionBanco = line.substring(181, 193).trim();
        String canalPago = line.substring(193, 195).trim();
        String formaPago = line.substring(195, 197).trim();
        String fechaContable = line.substring(197, 205).trim();
        String tipoOperacion = line.substring(205, 206).trim();
        String codigoBanco = line.substring(206, 210).trim();
        String filler = line.substring(210, 240).trim();

        return new PaymentDetailRecord(
            tipoRegistro, sucursal, moneda, ctaRecaudadora, codigoCliente, nombreCliente,
            codigoProducto, numDocumento, fechaVenc, fechaTxn, horaTxn, importePagado,
            agencia, direccion, numOperacionBanco, canalPago, formaPago, fechaContable,
            tipoOperacion, codigoBanco, filler
        );
    }

    public ProcessPaymentsResponse processPaymentFile(File file) {
        if (!file.exists()) {
            throw new IllegalArgumentException("Archivo de pagos no existe: " + file.getAbsolutePath());
        }

        int leidos = 0;
        int aplicados = 0;
        int errores = 0;

        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank() || line.startsWith("CC")) {
                    continue;
                }
                if (!line.startsWith("DD")) {
                    continue;
                }

                leidos++;
                try {
                    PaymentDetailRecord record = parseDetailLine(line);
                    if ("P".equalsIgnoreCase(record.tipoOperacion())) {
                        PayDebtRequest payReq = new PayDebtRequest(
                            record.fechaTransaccion(),
                            record.horaTransaccion(),
                            record.canalPago(),
                            record.codigoBanco(),
                            record.numOperacionBanco(),
                            record.formaPago(),
                            "0",
                            record.codigoCliente(),
                            record.codigoProducto(),
                            record.numDocumento(),
                            record.importePagado(),
                            record.moneda(),
                            "001"
                        );
                        paymentService.payDebt(payReq);
                        aplicados++;
                    } else if ("A".equalsIgnoreCase(record.tipoOperacion())) {
                        ReversePayRequest revReq = new ReversePayRequest(
                            record.fechaTransaccion(),
                            record.horaTransaccion(),
                            record.codigoBanco(),
                            record.numOperacionBanco(),
                            record.numDocumento(),
                            "001",
                            "EXTORNO_OFFHOST"
                        );
                        reversePaymentService.reversePay(revReq);
                        aplicados++;
                    }
                } catch (Exception ex) {
                    log.error("Error aplicando línea de pago en {}: {}", file.getName(), ex.getMessage());
                    errores++;
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("Error leyendo archivo de pagos: " + e.getMessage(), e);
        }

        log.info("Procesamiento de pagos Off-Host culminado en {}: leidos={}, aplicados={}, errores={}",
            file.getName(), leidos, aplicados, errores);

        return new ProcessPaymentsResponse(file.getName(), leidos, aplicados, errores, "Procesamiento completado");
    }
}
