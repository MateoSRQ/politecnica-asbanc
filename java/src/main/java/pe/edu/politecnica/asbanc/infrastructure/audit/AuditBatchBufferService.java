package pe.edu.politecnica.asbanc.infrastructure.audit;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import pe.edu.politecnica.asbanc.core.model.AuditLogRecord;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.locks.ReentrantLock;

@Service
public class AuditBatchBufferService {

    private static final Logger log = LoggerFactory.getLogger(AuditBatchBufferService.class);
    private static final int BATCH_SIZE = 100;

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final ConcurrentLinkedQueue<AuditLogRecord> queue = new ConcurrentLinkedQueue<>();
    private final ReentrantLock flushLock = new ReentrantLock();
    private volatile String cachedTableName = "dbo.AuditoriaLogs";

    public AuditBatchBufferService(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void init() {
        resolveTableName();
    }

    public void enqueue(AuditLogRecord record) {
        queue.offer(record);
    }

    @Scheduled(fixedDelay = 50)
    public void scheduledFlush() {
        if (queue.isEmpty() || !flushLock.tryLock()) {
            return;
        }

        try {
            while (!queue.isEmpty()) {
                drainBatch();
            }
        } finally {
            flushLock.unlock();
        }
    }

    private void drainBatch() {
        List<AuditLogRecord> batch = new ArrayList<>(BATCH_SIZE);
        AuditLogRecord item;
        while (batch.size() < BATCH_SIZE && (item = queue.poll()) != null) {
            batch.add(item);
        }

        if (batch.isEmpty()) {
            return;
        }

        try {
            String sql = "INSERT INTO " + cachedTableName + " " +
                "(TraceId, Metodo, Endpoint, ClientIp, CodigoBanco, IdConsulta, NumOperacionBanco, CodigoRespuesta, ExecutionTimeMs, RequestPayload, ResponsePayload, CreatedAt) " +
                "VALUES (:traceId, :metodo, :endpoint, :clientIp, :codigoBanco, :idConsulta, :numOperacionBanco, :codigoRespuesta, :executionTimeMs, :requestPayload, :responsePayload, GETDATE())";

            MapSqlParameterSource[] batchParams = batch.stream().map(record -> {
                MapSqlParameterSource params = new MapSqlParameterSource();
                params.addValue("traceId", record.traceId());
                params.addValue("metodo", record.metodo());
                params.addValue("endpoint", record.endpoint());
                params.addValue("clientIp", record.clientIp());
                params.addValue("codigoBanco", record.codigoBanco());
                params.addValue("idConsulta", record.idConsulta());
                params.addValue("numOperacionBanco", record.numOperacionBanco());
                params.addValue("codigoRespuesta", record.codigoRespuesta());
                params.addValue("executionTimeMs", record.executionTimeMs());
                params.addValue("requestPayload", record.requestPayload());
                params.addValue("responsePayload", record.responsePayload());
                return params;
            }).toArray(MapSqlParameterSource[]::new);

            jdbcTemplate.batchUpdate(sql, batchParams);
        } catch (Exception e) {
            log.warn("Error en volcado por lotes de AuditoriaLogs ({} items): {}", batch.size(), e.getMessage());
        }
    }

    private void resolveTableName() {
        try {
            Integer exists = jdbcTemplate.getJdbcTemplate().queryForObject(
                "SELECT OBJECT_ID('dbo.AuditoriaLogs', 'U')", Integer.class);
            if (exists != null && exists > 0) {
                cachedTableName = "dbo.AuditoriaLogs";
            } else {
                cachedTableName = "politecnica_asbanc.dbo.AuditoriaLogs";
            }
        } catch (Exception e) {
            cachedTableName = "dbo.AuditoriaLogs";
        }
        log.info("AuditBatchBufferService inicializado con tabla: {}", cachedTableName);
    }

    @PreDestroy
    public void flushAllOnShutdown() {
        log.info("Cerrando servicio: vaciando buffer de auditoría ({} registros restantes)...", queue.size());
        flushLock.lock();
        try {
            while (!queue.isEmpty()) {
                drainBatch();
            }
        } finally {
            flushLock.unlock();
        }
        log.info("Buffer de auditoría vaciado correctamente.");
    }
}
