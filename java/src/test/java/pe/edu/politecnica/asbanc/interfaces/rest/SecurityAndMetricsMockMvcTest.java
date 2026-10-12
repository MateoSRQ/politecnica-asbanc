package pe.edu.politecnica.asbanc.interfaces.rest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.politecnica.asbanc.core.services.CustomerService;
import pe.edu.politecnica.asbanc.core.services.DebtService;
import pe.edu.politecnica.asbanc.core.services.PaymentService;
import pe.edu.politecnica.asbanc.core.services.ReversePaymentService;
import pe.edu.politecnica.asbanc.infrastructure.security.JwtTokenService;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class SecurityAndMetricsMockMvcTest {

    @Autowired
    private MockMvc mockMvc;

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
    @DisplayName("Health endpoint debe ser público sin token")
    void testHealthPublic() throws Exception {
        mockMvc.perform(get("/health"))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("Metrics endpoint sin autenticación debe retornar 401")
    void testMetricsWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/metrics"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Metrics endpoint con Bearer token válido debe retornar 200")
    void testMetricsWithAuthReturns200() throws Exception {
        mockMvc.perform(get("/metrics")
                .header("Authorization", "Bearer " + getValidToken()))
            .andExpect(status().isOk());
    }

    @Test
    @DisplayName("Audit endpoint sin autenticación debe retornar 401")
    void testAuditWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/api/Audit"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Actuator Prometheus sin autenticación debe retornar 401")
    void testActuatorPrometheusWithoutAuthReturns401() throws Exception {
        mockMvc.perform(get("/actuator/prometheus"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Actuator Prometheus con Bearer token válido debe retornar 200")
    void testActuatorPrometheusWithAuthReturns200() throws Exception {
        mockMvc.perform(get("/actuator/prometheus")
                .header("Authorization", "Bearer " + getValidToken()))
            .andExpect(status().isOk());
    }
}
