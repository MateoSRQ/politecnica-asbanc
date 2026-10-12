package pe.edu.politecnica.asbanc.core.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import pe.edu.politecnica.asbanc.core.model.PayDebtRequest;
import pe.edu.politecnica.asbanc.core.model.ReversePayRequest;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class WebhookService {

    private static final Logger log = LoggerFactory.getLogger(WebhookService.class);

    private final AsbancProperties properties;
    private final RestClient restClient;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public WebhookService(AsbancProperties properties) {
        this.properties = properties;
        this.restClient = RestClient.builder().build();
    }

    public void dispatchPaymentWebhook(PayDebtRequest request, String numOperacionERP, String nombreCliente) {
        String url = properties.getWebhookUrl();
        if (url == null || url.isBlank()) {
            return;
        }

        executor.submit(() -> {
            try {
                Map<String, Object> payload = Map.of(
                    "event", "PAYMENT_CONFIRMED",
                    "numOperacionERP", numOperacionERP,
                    "numOperacionBanco", request.numOperacionBanco(),
                    "codigoBanco", request.codigoBanco(),
                    "canalPago", request.canalPago(),
                    "numDocumento", request.numDocumento(),
                    "importePagado", request.importePagado(),
                    "nombreCliente", nombreCliente,
                    "fechaTxn", request.fechaTxn(),
                    "horaTxn", request.horaTxn()
                );

                restClient.post()
                    .uri(url)
                    .header("Content-Type", "application/json")
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();

                log.info("Webhook de pago despachado exitosamente a {}", url);
            } catch (Exception e) {
                log.warn("Error despachando webhook de pago a {}: {}", url, e.getMessage());
            }
        });
    }

    public void dispatchReverseWebhook(ReversePayRequest request, String numOperacionERP, String nombreCliente) {
        String url = properties.getWebhookUrl();
        if (url == null || url.isBlank()) {
            return;
        }

        executor.submit(() -> {
            try {
                Map<String, Object> payload = Map.of(
                    "event", "PAYMENT_REVERSED",
                    "numOperacionERP", numOperacionERP,
                    "numOperacionBanco", request.numOperacionBanco(),
                    "codigoBanco", request.codigoBanco(),
                    "numDocumento", request.numDocumento(),
                    "nombreCliente", nombreCliente,
                    "fechaTxn", request.fechaTxn(),
                    "horaTxn", request.horaTxn()
                );

                restClient.post()
                    .uri(url)
                    .header("Content-Type", "application/json")
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();

                log.info("Webhook de extorno despachado exitosamente a {}", url);
            } catch (Exception e) {
                log.warn("Error despachando webhook de extorno a {}: {}", url, e.getMessage());
            }
        });
    }
}
