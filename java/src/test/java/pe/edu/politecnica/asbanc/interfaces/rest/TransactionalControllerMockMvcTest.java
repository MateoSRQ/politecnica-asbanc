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
import pe.edu.politecnica.asbanc.core.model.DebtItem;
import pe.edu.politecnica.asbanc.core.model.ListDebtsRequest;
import pe.edu.politecnica.asbanc.core.model.ListDebtsResponse;
import pe.edu.politecnica.asbanc.core.model.PayDebtRequest;
import pe.edu.politecnica.asbanc.core.model.PayDebtResponse;
import pe.edu.politecnica.asbanc.core.model.ReversePayRequest;
import pe.edu.politecnica.asbanc.core.model.ReversePayResponse;
import pe.edu.politecnica.asbanc.core.model.ValidateCustomerRequest;
import pe.edu.politecnica.asbanc.core.model.ValidateCustomerResponse;
import pe.edu.politecnica.asbanc.core.services.CustomerService;
import pe.edu.politecnica.asbanc.core.services.DebtService;
import pe.edu.politecnica.asbanc.core.services.PaymentService;
import pe.edu.politecnica.asbanc.core.services.ReversePaymentService;
import pe.edu.politecnica.asbanc.infrastructure.security.JwtTokenService;

import java.math.BigDecimal;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class TransactionalControllerMockMvcTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtTokenService jwtTokenService;

    @MockBean
    private CustomerService customerService;

    @MockBean
    private DebtService debtService;

    @MockBean
    private PaymentService paymentService;

    @MockBean
    private ReversePaymentService reversePaymentService;

    private String getValidToken() {
        return jwtTokenService.generateToken("asbanc_test_client");
    }

    @Test
    @DisplayName("ValidateCustomer debe responder HTTP 200 y JSON canónico")
    void testValidateCustomer() throws Exception {
        when(customerService.validateCustomer(any(ValidateCustomerRequest.class)))
            .thenReturn(new ValidateCustomerResponse("00", "OK", "MARTHA ORTEGA RIOS"));

        String payload = """
            {
              "tipoConsulta": "0",
              "idConsulta": "26023353010012",
              "codigoEmpresa": "998"
            }
        """;

        mockMvc.perform(post("/api/Transactional/ValidateCustomer")
                .header("Authorization", "Bearer " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.codigoRespuesta").value("00"))
            .andExpect(jsonPath("$.nombreCliente").value("MARTHA ORTEGA RIOS"));
    }

    @Test
    @DisplayName("ValidateCustomer con entrada inválida debe responder HTTP 200 con código 99")
    void testValidateCustomerInvalidInput() throws Exception {
        String invalidPayload = """
            {
              "tipoConsulta": "9",
              "idConsulta": ""
            }
        """;

        mockMvc.perform(post("/api/Transactional/ValidateCustomer")
                .header("Authorization", "Bearer " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalidPayload))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.codigoRespuesta").value("99"))
            .andExpect(jsonPath("$.descripcionResp").exists());
    }

    @Test
    @DisplayName("ListDebts debe retornar deudas pendientes en HTTP 200")
    void testListDebts() throws Exception {
        DebtItem item = new DebtItem("001", "10727", "CUOTA PENSION", "20032026", "05032026", new BigDecimal("833.33"), new BigDecimal("833.33"), "1");
        when(debtService.listDebts(any(ListDebtsRequest.class)))
            .thenReturn(new ListDebtsResponse("00", "OK", List.of(item)));

        String payload = """
            {
              "tipoConsulta": "0",
              "idConsulta": "26023353010012",
              "codigoEmpresa": "998",
              "codigoProducto": "001"
            }
        """;

        mockMvc.perform(post("/api/Transactional/ListDebts")
                .header("Authorization", "Bearer " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.codigoRespuesta").value("00"))
            .andExpect(jsonPath("$.deudasPendientes[0].numDocumento").value("10727"));
    }

    @Test
    @DisplayName("PayDebt debe aplicar pago y retornar HTTP 200 con numOperacionERP")
    void testPayDebt() throws Exception {
        when(paymentService.payDebt(any(PayDebtRequest.class)))
            .thenReturn(new PayDebtResponse("00", "MARTHA ORTEGA RIOS", "000010727", "OK"));

        String payload = """
            {
              "fechaTxn": "20260928",
              "horaTxn": "110000",
              "canalPago": "10",
              "codigoBanco": "1020",
              "numOperacionBanco": "OP-TEST-001",
              "formaPago": "01",
              "tipoConsulta": "0",
              "idConsulta": "26023353010012",
              "codigoProducto": "001",
              "numDocumento": "10727",
              "importePagado": 833.33,
              "monedaDoc": "1",
              "codigoEmpresa": "998"
            }
        """;

        mockMvc.perform(post("/api/Transactional/PayDebt")
                .header("Authorization", "Bearer " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.codigoRespuesta").value("00"))
            .andExpect(jsonPath("$.numOperacionERP").value("000010727"));
    }

    @Test
    @DisplayName("ReversePay debe ejecutar extorno atómico con HTTP 200")
    void testReversePay() throws Exception {
        when(reversePaymentService.reversePay(any(ReversePayRequest.class)))
            .thenReturn(new ReversePayResponse("00", "MARTHA ORTEGA RIOS", "000010727", "OK"));

        String payload = """
            {
              "fechaTxn": "20260928",
              "horaTxn": "110500",
              "codigoBanco": "1020",
              "numOperacionBanco": "OP-TEST-001",
              "numDocumento": "10727",
              "codigoEmpresa": "998"
            }
        """;

        mockMvc.perform(post("/api/Transactional/ReversePay")
                .header("Authorization", "Bearer " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.codigoRespuesta").value("00"))
            .andExpect(jsonPath("$.descripcionResp").value("OK"));
    }

    @Test
    @DisplayName("ValidateCustomer con cabecera Basic <token> debe ser aceptado exitosamente")
    void testValidateCustomerWithBasicAuth() throws Exception {
        when(customerService.validateCustomer(any(ValidateCustomerRequest.class)))
            .thenReturn(new ValidateCustomerResponse("00", "OK", "MARTHA ORTEGA RIOS"));

        String payload = """
            {
              "tipoConsulta": "0",
              "idConsulta": "26023353010012",
              "codigoEmpresa": "998"
            }
        """;

        mockMvc.perform(post("/api/Transactional/ValidateCustomer")
                .header("Authorization", "Basic " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.codigoRespuesta").value("00"))
            .andExpect(jsonPath("$.nombreCliente").value("MARTHA ORTEGA RIOS"));
    }

    @Test
    @DisplayName("ListDebts con payload inválido debe retornar HTTP 200 con deudasPendientes vacías")
    void testListDebtsInvalidInputContract() throws Exception {
        String invalidPayload = """
            {
              "tipoConsulta": "invalid",
              "idConsulta": ""
            }
        """;

        mockMvc.perform(post("/api/Transactional/ListDebts")
                .header("Authorization", "Bearer " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalidPayload))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.codigoRespuesta").value("99"))
            .andExpect(jsonPath("$.deudasPendientes").isArray())
            .andExpect(jsonPath("$.deudasPendientes").isEmpty());
    }

    @Test
    @DisplayName("PayDebt con payload inválido debe retornar HTTP 200 con numOperacionERP vacío")
    void testPayDebtInvalidInputContract() throws Exception {
        String invalidPayload = """
            {
              "fechaTxn": "invalid",
              "importePagado": -10
            }
        """;

        mockMvc.perform(post("/api/Transactional/PayDebt")
                .header("Authorization", "Bearer " + getValidToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalidPayload))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.codigoRespuesta").value("99"))
            .andExpect(jsonPath("$.numOperacionERP").value(""));
    }

    @Test
    @DisplayName("Petición sin cabecera Authorization debe responder HTTP 401 con JSON canónico ASBANC (código 99)")
    void testUnauthorizedRequestReturnsAsbancJson() throws Exception {
        mockMvc.perform(post("/api/Transactional/ValidateCustomer")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.codigoRespuesta").value("99"))
            .andExpect(jsonPath("$.descripcionResp").value("AUTORIZACION REQUERIDA (CABECERA BASIC AUTH / TOKEN AUSENTE)"));
    }
}
