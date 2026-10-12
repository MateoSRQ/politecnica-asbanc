package pe.edu.politecnica.asbanc.infrastructure.offhost;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.DiscrepancyItem;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.PaymentDetailRecord;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.ReconciliationResult;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class ReconciliationService {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationService.class);

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public ReconciliationService(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public ReconciliationResult reconcile(File paymentFile) {
        if (!paymentFile.exists()) {
            throw new IllegalArgumentException("Archivo de pagos no existe: " + paymentFile.getAbsolutePath());
        }

        List<PaymentDetailRecord> offHostRecords = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new FileReader(paymentFile))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("DD")) {
                    offHostRecords.add(PaymentFileParser.parseDetailLine(line));
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("Error leyendo archivo para conciliación: " + e.getMessage(), e);
        }

        int coincidentes = 0;
        List<DiscrepancyItem> discrepancias = new ArrayList<>();

        for (PaymentDetailRecord offRecord : offHostRecords) {
            String numOp = offRecord.numOperacionBanco();
            String numDoc = offRecord.numDocumento();

            String sql = "SELECT TOP 1 monto FROM Ctas_Ctes.Alumno_Pago_Detalle WHERE num_documento = :numOp";
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, new MapSqlParameterSource("numOp", numOp));

            if (rows.isEmpty()) {
                discrepancias.add(new DiscrepancyItem(
                    numOp,
                    numDoc,
                    "SOLO_EN_OFFHOST",
                    offRecord.importePagado(),
                    BigDecimal.ZERO,
                    "Operación reportada por banco no encontrada en pagos registrados On-Host"
                ));
            } else {
                BigDecimal montoOnHost = (BigDecimal) rows.get(0).get("monto");
                if (montoOnHost != null && montoOnHost.compareTo(offRecord.importePagado()) == 0) {
                    coincidentes++;
                } else {
                    discrepancias.add(new DiscrepancyItem(
                        numOp,
                        numDoc,
                        "DIFERENCIA_MONTO",
                        offRecord.importePagado(),
                        montoOnHost != null ? montoOnHost : BigDecimal.ZERO,
                        "Monto reportado difiere del monto registrado en base de datos"
                    ));
                }
            }
        }

        String status = discrepancias.isEmpty() ? "CONCILIADO_OK" : "CON_DISCREPANCIAS";
        log.info("Conciliación finalizada para {}: Total={}, Coincidentes={}, Discrepancias={}",
            paymentFile.getName(), offHostRecords.size(), coincidentes, discrepancias.size());

        return new ReconciliationResult(status, offHostRecords.size(), coincidentes, discrepancias.size(), discrepancias);
    }
}
