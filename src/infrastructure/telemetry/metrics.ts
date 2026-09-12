import client from 'prom-client';

// Colectar métricas por defecto de Node.js (CPU, Memory, EventLoop)
client.collectDefaultMetrics({ prefix: 'politecnica_asbanc_' });

export const register = client.register;

// Histograma de latencia transaccional (con buckets ajustados al SLA < 3.0s)
export const txnDurationHistogram = new client.Histogram({
  name: 'asbanc_txn_duration_seconds',
  help: 'Duración de las transacciones ASBANC en segundos',
  labelNames: ['method', 'bank_code', 'channel', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 1.75, 2.5, 3.0, 5.0],
});

// Contador global de transacciones
export const txnCounter = new client.Counter({
  name: 'asbanc_txn_total',
  help: 'Número total de transacciones recibidas de ASBANC',
  labelNames: ['method', 'bank_code', 'channel', 'status_code'],
});

// Alertas de violación de SLA (> 2.5s)
export const slaViolationsCounter = new client.Counter({
  name: 'asbanc_sla_violations_total',
  help: 'Número de transacciones que excedieron el umbral crítico de tiempo de respuesta',
  labelNames: ['method', 'bank_code'],
});

// Contador de eventos de idempotencia (reintentos interceptados)
export const idempotencyHitsCounter = new client.Counter({
  name: 'asbanc_idempotency_hits_total',
  help: 'Número de pagos duplicados prevenidos mediante control de idempotencia',
  labelNames: ['bank_code'],
});
