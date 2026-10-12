package pe.edu.politecnica.asbanc.interfaces.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.GenerateDebtsResponse;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.ProcessPaymentsResponse;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.ReconciliationResult;
import pe.edu.politecnica.asbanc.infrastructure.offhost.DebtFileGenerator;
import pe.edu.politecnica.asbanc.infrastructure.offhost.PaymentFileParser;
import pe.edu.politecnica.asbanc.infrastructure.offhost.ReconciliationService;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class OffHostControllerMockMvcTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private pe.edu.politecnica.asbanc.infrastructure.security.JwtTokenService jwtTokenService;

    @MockBean
    private DebtFileGenerator debtFileGenerator;

    private String getValidToken() {
        return jwtTokenService.generateToken("asbanc_test_client");
    }

    @MockBean
    private PaymentFileParser paymentFileParser;

    @MockBean
    private ReconciliationService reconciliationService;

    @MockBean
    private pe.edu.politecnica.asbanc.infrastructure.offhost.AsbancSftpService sftpService;

    @Test
    @DisplayName("POST /api/OffHost/GenerateDebts debe retornar 200 y resumen del archivo generado")
    void testGenerateDebtsSuccess() throws Exception {
        GenerateDebtsResponse mockResp = new GenerateDebtsResponse(
            "FTRCOB11102026001.TXT",
            "./storage/off-host/FTRCOB11102026001.TXT",
            50L,
            new BigDecimal("12500.00"),
            BigDecimal.ZERO,
            "ARCHIVO GENERADO CON EXITO"
        );

        when(debtFileGenerator.generateDebtsFile(anyString(), anyInt())).thenReturn(mockResp);

        String reqJson = """
            {
              "tipoActualizacion": "R",
              "secuencia": 1
            }
        """;

        mockMvc.perform(post("/api/OffHost/GenerateDebts")
                .header("Authorization", "Bearer " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(reqJson))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fileName").value("FTRCOB11102026001.TXT"))
            .andExpect(jsonPath("$.totalRecords").value(50))
            .andExpect(jsonPath("$.importeTotalSoles").value(12500.00));
    }

    @Test
    @DisplayName("POST /api/OffHost/ProcessPayments debe procesar lote y retornar 200")
    void testProcessPaymentsSuccess() throws Exception {
        ProcessPaymentsResponse mockResp = new ProcessPaymentsResponse(
            "FTRPAG11102026001.TXT",
            10,
            10,
            0,
            "PROCESADO_OK"
        );

        when(paymentFileParser.processPaymentFile(any())).thenReturn(mockResp);

        String reqJson = """
            {
              "fileName": "FTRPAG11102026001.TXT"
            }
        """;

        mockMvc.perform(post("/api/OffHost/ProcessPayments")
                .header("Authorization", "Bearer " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(reqJson))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fileName").value("FTRPAG11102026001.TXT"))
            .andExpect(jsonPath("$.totalLeidos").value(10))
            .andExpect(jsonPath("$.totalAplicados").value(10));
    }

    @Test
    @DisplayName("POST /api/OffHost/ProcessPayments con fileName faltante debe retornar HTTP 200 y codigoRespuesta 99 (Norma ASBANC)")
    void testProcessPaymentsMissingFileName() throws Exception {
        String reqJson = "{}";

        mockMvc.perform(post("/api/OffHost/ProcessPayments")
                .header("Authorization", "Bearer " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(reqJson))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.codigoRespuesta").value("99"));
    }

    @Test
    @DisplayName("POST /api/OffHost/Reconcile debe ejecutar conciliación cruzada y retornar 200")
    void testReconcileSuccess() throws Exception {
        ReconciliationResult mockResult = new ReconciliationResult(
            "CONCILIADO_OK",
            5,
            5,
            0,
            Collections.emptyList()
        );

        when(reconciliationService.reconcile(any())).thenReturn(mockResult);

        String reqJson = """
            {
              "fileName": "FTRPAG11102026001.TXT"
            }
        """;

        mockMvc.perform(post("/api/OffHost/Reconcile")
                .header("Authorization", "Bearer " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(reqJson))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CONCILIADO_OK"))
            .andExpect(jsonPath("$.totalProcesados").value(5))
            .andExpect(jsonPath("$.totalCoincidentes").value(5))
            .andExpect(jsonPath("$.totalDiscrepancias").value(0));
    }

    @Test
    @DisplayName("POST /api/OffHost/GenerateDebts sin token debe retornar 401")
    void testGenerateDebtsUnauthorized() throws Exception {
        mockMvc.perform(post("/api/OffHost/GenerateDebts")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.codigoRespuesta").value("99"));
    }

    @Test
    @DisplayName("POST /api/OffHost/SftpSync debe sincronizar y retornar 200")
    void testSftpSyncSuccess() throws Exception {
        pe.edu.politecnica.asbanc.core.model.OffHostModels.SftpSyncResult mockResult =
            new pe.edu.politecnica.asbanc.core.model.OffHostModels.SftpSyncResult(
                "OK", 1, 1, java.util.List.of("FTRPAG11102026001.TXT"),
                java.util.Collections.emptyList(), "Sincronizado"
            );

        when(sftpService.syncAndReconcile()).thenReturn(mockResult);

        mockMvc.perform(post("/api/OffHost/SftpSync")
                .header("Authorization", "Bearer " + getValidToken()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("OK"))
            .andExpect(jsonPath("$.filesDownloaded").value(1))
            .andExpect(jsonPath("$.filesProcessed").value(1));
    }
}
