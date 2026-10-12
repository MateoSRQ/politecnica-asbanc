package pe.edu.politecnica.asbanc.interfaces.rest;

import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.Map;

@RestController
public class HealthController {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectProvider<PrometheusMeterRegistry> meterRegistryProvider;

    public HealthController(JdbcTemplate jdbcTemplate, ObjectProvider<PrometheusMeterRegistry> meterRegistryProvider) {
        this.jdbcTemplate = jdbcTemplate;
        this.meterRegistryProvider = meterRegistryProvider;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        boolean dbOk = false;
        try {
            Integer one = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            dbOk = (one != null && one == 1);
        } catch (Exception ignored) {}

        long uptimeSeconds = ManagementFactory.getRuntimeMXBean().getUptime() / 1000;

        Map<String, Object> body = Map.of(
            "status", dbOk ? "UP" : "DEGRADED",
            "service", "politecnica-asbanc-java",
            "database", dbOk ? "CONNECTED" : "DISCONNECTED",
            "uptimeSeconds", uptimeSeconds,
            "timestamp", Instant.now().toString()
        );

        return ResponseEntity.ok(body);
    }

    @GetMapping(value = "/metrics", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> metrics() {
        PrometheusMeterRegistry registry = meterRegistryProvider.getIfAvailable();
        if (registry != null) {
            return ResponseEntity.ok(registry.scrape());
        }
        return ResponseEntity.ok("# Prometheus registry not available\n");
    }
}
