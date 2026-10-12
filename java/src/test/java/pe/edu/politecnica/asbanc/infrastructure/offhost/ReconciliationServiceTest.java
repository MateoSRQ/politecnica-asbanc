package pe.edu.politecnica.asbanc.infrastructure.offhost;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.ReconciliationResult;

import java.io.File;
import java.io.FileWriter;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReconciliationServiceTest {

    private NamedParameterJdbcTemplate jdbcTemplate;
    private ReconciliationService reconciliationService;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(NamedParameterJdbcTemplate.class);
        reconciliationService = new ReconciliationService(jdbcTemplate);
    }

    private File createMockPaymentFile(String content) throws Exception {
        File file = tempDir.resolve("FTRPAG_TEST.TXT").toFile();
        try (FileWriter writer = new FileWriter(file)) {
            writer.write(content);
        }
        return file;
    }

    private String createSampleDetailLine(String numOpBanco, String numDoc, String importeStr) {
        StringBuilder sb = new StringBuilder();
        sb.append("DD");
        sb.append(String.format("%-3s", "001"));
        sb.append("1");
        sb.append(String.format("%-20s", "191-1234567-0-01"));
        sb.append(String.format("%-14s", "201820005"));
        sb.append(String.format("%-30s", "PEREZ PEREZ JUAN CARLOS"));
        sb.append(String.format("%-3s", "001"));
        sb.append(String.format("%-16s", numDoc));
        sb.append("20261015");
        sb.append("20261011");
        sb.append("120000");
        sb.append(String.format("%015d", (long)(Double.parseDouble(importeStr) * 100)));
        sb.append(String.format("%-15s", "AGENCIA MIRAFLO"));
        sb.append(String.format("%-40s", "AV LARCO 123"));
        sb.append(String.format("%-12s", numOpBanco));
        sb.append("10");
        sb.append("01");
        sb.append("20261011");
        sb.append("P");
        sb.append("1020");
        sb.append(String.format("%-30s", ""));

        return sb.toString();
    }

    @Test
    @DisplayName("Debe conciliar al 100% cuando los montos y operaciones coinciden")
    void testReconcileMatching() throws Exception {
        String line = createSampleDetailLine("OP-1001", "10726", "250.00");
        File file = createMockPaymentFile(line + "\r\n");

        when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class)))
            .thenReturn(List.of(Map.of("monto", new BigDecimal("250.00"))));

        ReconciliationResult result = reconciliationService.reconcile(file);

        assertEquals("CONCILIADO_OK", result.status());
        assertEquals(1, result.totalProcesados());
        assertEquals(1, result.totalCoincidentes());
        assertEquals(0, result.totalDiscrepancias());
        assertTrue(result.discrepancias().isEmpty());
    }

    @Test
    @DisplayName("Debe registrar discrepancia SOLO_EN_OFFHOST cuando la operación no existe en base de datos")
    void testReconcileSoloEnOffHost() throws Exception {
        String line = createSampleDetailLine("OP-OFF-ONLY", "10726", "250.00");
        File file = createMockPaymentFile(line + "\r\n");

        when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class)))
            .thenReturn(Collections.emptyList());

        ReconciliationResult result = reconciliationService.reconcile(file);

        assertEquals("CON_DISCREPANCIAS", result.status());
        assertEquals(1, result.totalProcesados());
        assertEquals(0, result.totalCoincidentes());
        assertEquals(1, result.totalDiscrepancias());
        assertEquals("SOLO_EN_OFFHOST", result.discrepancias().get(0).tipoDiscrepancia());
    }

    @Test
    @DisplayName("Debe registrar discrepancia DIFERENCIA_MONTO cuando los importes difieren")
    void testReconcileDiferenciaMonto() throws Exception {
        String line = createSampleDetailLine("OP-DIFF", "10726", "250.00");
        File file = createMockPaymentFile(line + "\r\n");

        when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class)))
            .thenReturn(List.of(Map.of("monto", new BigDecimal("300.00"))));

        ReconciliationResult result = reconciliationService.reconcile(file);

        assertEquals("CON_DISCREPANCIAS", result.status());
        assertEquals(1, result.totalProcesados());
        assertEquals(0, result.totalCoincidentes());
        assertEquals(1, result.totalDiscrepancias());
        assertEquals("DIFERENCIA_MONTO", result.discrepancias().get(0).tipoDiscrepancia());
        assertEquals(0, new BigDecimal("250.00").compareTo(result.discrepancias().get(0).montoOffHost()));
        assertEquals(0, new BigDecimal("300.00").compareTo(result.discrepancias().get(0).montoOnHost()));
    }

    @Test
    @DisplayName("Debe arrojar IllegalArgumentException si el archivo no existe")
    void testReconcileFileNotFound() {
        File file = new File("archivo_inexistente_9999.txt");
        assertThrows(IllegalArgumentException.class, () -> reconciliationService.reconcile(file));
    }
}
