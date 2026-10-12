package pe.edu.politecnica.asbanc.infrastructure.telemetry;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
public class MetricsService {

    private final MeterRegistry registry;

    public MetricsService(MeterRegistry registry) {
        this.registry = registry;
    }

    public void recordTransaction(String method, String bankCode, String channel, String statusCode, long durationMs) {
        String safeBank = (bankCode != null && !bankCode.isBlank()) ? bankCode : "N/A";
        String safeChannel = (channel != null && !channel.isBlank()) ? channel : "N/A";
        String safeMethod = (method != null && !method.isBlank()) ? method : "UNKNOWN";
        String safeStatus = (statusCode != null && !statusCode.isBlank()) ? statusCode : "99";

        Counter.builder("asbanc_txn_total")
            .description("Total de transacciones bancarias procesadas")
            .tags("method", safeMethod, "bank_code", safeBank, "channel", safeChannel, "status_code", safeStatus)
            .register(registry)
            .increment();

        Timer.builder("asbanc_txn_duration_seconds")
            .description("Histograma de latencia de transacciones bancarias")
            .tags("method", safeMethod, "bank_code", safeBank, "channel", safeChannel, "status_code", safeStatus)
            .publishPercentileHistogram()
            .register(registry)
            .record(Duration.ofMillis(durationMs));
    }

    public void recordSlaViolation(String method, String bankCode) {
        String safeBank = (bankCode != null && !bankCode.isBlank()) ? bankCode : "N/A";
        String safeMethod = (method != null && !method.isBlank()) ? method : "UNKNOWN";

        Counter.builder("asbanc_sla_violations_total")
            .description("Total de violaciones del umbral de advertencia SLA")
            .tags("method", safeMethod, "bank_code", safeBank)
            .register(registry)
            .increment();
    }

    public void recordIdempotencyHit(String bankCode) {
        String safeBank = (bankCode != null && !bankCode.isBlank()) ? bankCode : "N/A";

        Counter.builder("asbanc_idempotency_hits_total")
            .description("Total de peticiones bancarias duplicadas interceptadas por idempotencia")
            .tags("bank_code", safeBank)
            .register(registry)
            .increment();
    }
}
