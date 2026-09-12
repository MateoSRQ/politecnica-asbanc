/**
 * ==========================================================
 * PRUEBA DE ESTRÉS Y RENDIMIENTO CONTINUA (5 MINUTOS)
 * Específica para Certificación ASBANC FTR / YAPAGO
 * ==========================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import sql from 'mssql';
import { env } from '../src/config/env.js';

const BASE_URL = `http://127.0.0.1:${env.PORT}`;
const AUTH_HEADER = `Basic ${env.ASBANC_AUTH_SECRET}`;
const TEST_DURATION_SECONDS = 300; // 5 minutos exactos
const NUM_WORKERS = 10; // 10 ventanillas concurrentes (Norma ASBANC V47 pág. 28)

const CLIENT_IDENTIFIERS = [
  { tipo: '1', id: '10000001' },
  { tipo: '1', id: '42271578' },
  { tipo: '1', id: '07854856' },
  { tipo: '1', id: '78478457' },
  { tipo: '1', id: '45896321' },
  { tipo: '0', id: '202610001' },
  { tipo: '0', id: '202610002' },
  { tipo: '0', id: '202610003' },
  { tipo: '2', id: '20103040501' },
  { tipo: '2', id: '20324578596' },
  { tipo: '1', id: '99999999' }, // Inexistente para probar código 16
];

const BANKS = ['1020', '1023', '1022', '1024'];
const CHANNELS = ['10', '81', '60', '30'];

interface Stats {
  totalRequests: number;
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
  byBank: Record<string, number>;
  latencies: number[];
  slaViolations: number; // > 3000ms
  slaWarnings: number;    // > 2500ms
  startTime: number;
  endTime: number;
}

const stats: Stats = {
  totalRequests: 0,
  byMethod: {},
  byStatus: {},
  byBank: {},
  latencies: [],
  slaViolations: 0,
  slaWarnings: 0,
  startTime: 0,
  endTime: 0,
};

async function postJson(endpoint: string, body: any): Promise<{ durationMs: number; status: number; data: any }> {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': AUTH_HEADER,
      },
      body: JSON.stringify(body),
    });
    const durationMs = Math.round(performance.now() - start);
    const data = await res.json();
    return { durationMs, status: res.status, data };
  } catch (error: any) {
    const durationMs = Math.round(performance.now() - start);
    return { durationMs, status: 500, data: { codigoRespuesta: '99', descripcionResp: error.message } };
  }
}

function recordResult(method: string, bank: string, durationMs: number, statusCode: string) {
  stats.totalRequests++;
  stats.byMethod[method] = (stats.byMethod[method] || 0) + 1;
  stats.byStatus[statusCode] = (stats.byStatus[statusCode] || 0) + 1;
  stats.byBank[bank] = (stats.byBank[bank] || 0) + 1;
  stats.latencies.push(durationMs);

  if (durationMs > 3000) {
    stats.slaViolations++;
  } else if (durationMs > 2500) {
    stats.slaWarnings++;
  }
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function runWorker(workerId: number, stopTime: number, pool: sql.ConnectionPool): Promise<void> {
  let counter = 0;

  while (Date.now() < stopTime) {
    counter++;
    const client = CLIENT_IDENTIFIERS[Math.floor(Math.random() * CLIENT_IDENTIFIERS.length)];
    const bank = BANKS[Math.floor(Math.random() * BANKS.length)];
    const channel = CHANNELS[Math.floor(Math.random() * CHANNELS.length)];

    // 1. ValidateCustomer
    const valRes = await postJson('/api/Transactional/ValidateCustomer', {
      tipoConsulta: client.tipo,
      idConsulta: client.id,
      codigoEmpresa: '998',
      codigoProducto: '001',
    });
    recordResult('ValidateCustomer', bank, valRes.durationMs, valRes.data.codigoRespuesta || '99');

    // 2. ListDebts
    const listRes = await postJson('/api/Transactional/ListDebts', {
      tipoConsulta: client.tipo,
      idConsulta: client.id,
      codigoEmpresa: '998',
      codigoProducto: '001',
      codigoBanco: bank,
      canalPago: channel,
    });
    recordResult('ListDebts', bank, listRes.durationMs, listRes.data.codigoRespuesta || '99');

    // 3. PayDebt si hay deudas
    const debts = listRes.data.deudasPendientes || [];
    if (debts.length > 0) {
      const debtToPay = debts[0];
      const numOp = 'W' + workerId + '-' + Date.now().toString().slice(-8);

      const payRes = await postJson('/api/Transactional/PayDebt', {
        fechaTxn: '11092026',
        horaTxn: '183000',
        canalPago: channel,
        codigoBanco: bank,
        numOperacionBanco: numOp,
        formaPago: '01',
        tipoConsulta: client.tipo,
        idConsulta: client.id,
        codigoProducto: '001',
        numDocumento: debtToPay.numDocumento,
        importePagado: debtToPay.deuda,
        monedaDoc: '1',
        codigoEmpresa: '998',
      });
      recordResult('PayDebt', bank, payRes.durationMs, payRes.data.codigoRespuesta || '99');

      // 4. Prueba de Idempotencia (10% de las veces)
      if (Math.random() < 0.10) {
        const idempRes = await postJson('/api/Transactional/PayDebt', {
          fechaTxn: '11092026',
          horaTxn: '183000',
          canalPago: channel,
          codigoBanco: bank,
          numOperacionBanco: numOp,
          formaPago: '01',
          tipoConsulta: client.tipo,
          idConsulta: client.id,
          codigoProducto: '001',
          numDocumento: debtToPay.numDocumento,
          importePagado: debtToPay.deuda,
          monedaDoc: '1',
          codigoEmpresa: '998',
        });
        recordResult('PayDebt_Idempotent', bank, idempRes.durationMs, idempRes.data.codigoRespuesta || '99');
      }

      // 5. Extorno / ReversePay (15% de las veces para reabrir la deuda y probar reversas)
      if (Math.random() < 0.15) {
        const revRes = await postJson('/api/Transactional/ReversePay', {
          fechaTxn: '11092026',
          horaTxn: '183500',
          codigoBanco: bank,
          tipoConsulta: client.tipo,
          idConsulta: client.id,
          numOperacionBanco: numOp,
          numDocumento: debtToPay.numDocumento,
          codigoEmpresa: '998',
        });
        recordResult('ReversePay', bank, revRes.durationMs, revRes.data.codigoRespuesta || '99');
      }
    } else if (client.id !== '99999999') {
      // Si el cliente se quedó sin deudas, restablecer sus deudas en MSSQL para que el ciclo continúe
      try {
        await pool.request()
          .input('IdConsulta', sql.VarChar(14), client.id)
          .input('TipoConsulta', sql.VarChar(1), client.tipo)
          .query(`
            UPDATE d
            SET d.Estado = 'PENDIENTE', d.FechaPago = NULL, d.NumOperacionERP = NULL
            FROM dbo.Deudas d
            INNER JOIN dbo.Clientes c ON c.Id = d.ClienteId
            WHERE c.IdConsulta = @IdConsulta AND c.TipoConsulta = @TipoConsulta
          `);
      } catch {
        // Ignorar
      }
    }

    // Pequeña pausa de 100ms a 300ms por ventanilla para emular ritmo humano realista
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  }
}

async function main(): Promise<void> {
  console.log('🚀 =========================================================');
  console.log('🚀 INICIANDO PRUEBA DE ESTRÉS ASBANC FTR - 5 MINUTOS (300s)');
  console.log(`🚀 Concurrencia: ${NUM_WORKERS} ventanillas bancarias simultáneas`);
  console.log(`🚀 Bancos simulados: BCP (1020), BBVA (1023), Interbank (1022), Scotia (1024)`);
  console.log(`🚀 Canales: Ventanilla (10), Yape (81), Web (60), Agente (30)`);
  console.log('🚀 =========================================================\n');

  // Conectar a MSSQL para mantenimiento de deudas durante la prueba
  const pool = await sql.connect({
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    server: env.DB_SERVER,
    port: env.DB_PORT,
    options: {
      encrypt: env.DB_ENCRYPT,
      trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    },
  });

  stats.startTime = Date.now();
  const stopTime = stats.startTime + TEST_DURATION_SECONDS * 1000;

  // Temporizador de reporte en consola cada 30 segundos
  const intervalId = setInterval(() => {
    const elapsedSec = Math.round((Date.now() - stats.startTime) / 1000);
    const remainingSec = Math.max(0, TEST_DURATION_SECONDS - elapsedSec);
    const rps = (stats.totalRequests / (elapsedSec || 1)).toFixed(1);

    const sorted = [...stats.latencies].sort((a, b) => a - b);
    const avg = sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0;
    const p95 = calculatePercentile(sorted, 95);

    const minStr = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const secStr = String(elapsedSec % 60).padStart(2, '0');

    console.log(
      `⏱️ [${minStr}:${secStr} / 05:00] Txns: ${stats.totalRequests.toLocaleString()} | RPS: ${rps} | Media: ${avg}ms | p95: ${p95}ms | Errores 99: ${stats.byStatus['99'] || 0} | SLA Violations (>3s): ${stats.slaViolations}`
    );
  }, 30000);

  // Lanzar las 10 ventanillas concurrentes
  const workers = Array.from({ length: NUM_WORKERS }, (_, i) => runWorker(i + 1, stopTime, pool));
  await Promise.all(workers);

  clearInterval(intervalId);
  stats.endTime = Date.now();
  await pool.close();

  // Análisis Final
  const totalSeconds = (stats.endTime - stats.startTime) / 1000;
  const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
  const avgLatency = sortedLatencies.length ? (sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length).toFixed(1) : '0';
  const minLatency = sortedLatencies[0] || 0;
  const maxLatency = sortedLatencies[sortedLatencies.length - 1] || 0;
  const p50 = calculatePercentile(sortedLatencies, 50);
  const p90 = calculatePercentile(sortedLatencies, 90);
  const p95 = calculatePercentile(sortedLatencies, 95);
  const p99 = calculatePercentile(sortedLatencies, 99);

  // Consultar métricas de Prometheus finales
  let prometheusMetrics = '';
  try {
    const mRes = await fetch(`${BASE_URL}/metrics`);
    prometheusMetrics = await mRes.text();
  } catch {
    //
  }

  // Consultar base de datos final
  let totalTxnDB = 0;
  let totalAuditDB = 0;
  try {
    const reportPool = await sql.connect({
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      server: env.DB_SERVER,
      port: env.DB_PORT,
      options: {
        encrypt: env.DB_ENCRYPT,
        trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
      },
    });
    const r1 = await reportPool.request().query('SELECT COUNT(*) AS c FROM dbo.TransaccionesBancarias');
    totalTxnDB = r1.recordset[0].c;
    const r2 = await reportPool.request().query('SELECT COUNT(*) AS c FROM dbo.AuditoriaLogs');
    totalAuditDB = r2.recordset[0].c;
    await reportPool.close();
  } catch {
    //
  }

  const finalReport = {
    testDurationSeconds: totalSeconds,
    totalTransactions: stats.totalRequests,
    throughputRps: Number((stats.totalRequests / totalSeconds).toFixed(2)),
    slaAnalysis: {
      slaThresholdMs: 3000,
      slaViolationsCount: stats.slaViolations,
      slaCompliancePercentage: Number((((stats.totalRequests - stats.slaViolations) / stats.totalRequests) * 100).toFixed(2)),
      slaWarningsCount: stats.slaWarnings,
    },
    latencyMetricsMs: {
      min: minLatency,
      average: Number(avgLatency),
      p50,
      p90,
      p95,
      p99,
      max: maxLatency,
    },
    requestsByMethod: stats.byMethod,
    responsesByCode: stats.byStatus,
    transactionsByBank: stats.byBank,
    databaseVerification: {
      transaccionesBancariasEnDB: totalTxnDB,
      registrosAuditoriaEnDB: totalAuditDB,
    },
  };

  const reportPath = path.join(process.cwd(), 'stress_test_report_5min.json');
  fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2), 'utf8');

  console.log('\n=========================================================');
  console.log('🏁 INFORME FINAL DE PRUEBA DE ESTRÉS (5 MINUTOS)');
  console.log('=========================================================');
  console.log(`⏱️  Duración Total           : ${totalSeconds.toFixed(1)} segundos (5 min)`);
  console.log(`📦 Transacciones Totales      : ${stats.totalRequests.toLocaleString()}`);
  console.log(`⚡ Throughput Promedio       : ${(stats.totalRequests / totalSeconds).toFixed(1)} req/seg`);
  console.log(`🎯 Cumplimiento SLA (<3.0s)  : ${finalReport.slaAnalysis.slaCompliancePercentage}%`);
  console.log(`🚫 Violaciones SLA (>3.0s)   : ${stats.slaViolations}`);
  console.log(`⚠️  Advertencias SLA (>2.5s)  : ${stats.slaWarnings}`);
  console.log('---------------------------------------------------------');
  console.log('📈 LATENCIAS MEDIDAS (ms):');
  console.log(`   • Mínima    : ${minLatency} ms`);
  console.log(`   • Promedio  : ${avgLatency} ms`);
  console.log(`   • Percentil 50 (Mediana) : ${p50} ms`);
  console.log(`   • Percentil 90 : ${p90} ms`);
  console.log(`   • Percentil 95 : ${p95} ms`);
  console.log(`   • Percentil 99 : ${p99} ms`);
  console.log(`   • Máxima    : ${maxLatency} ms`);
  console.log('---------------------------------------------------------');
  console.log('📊 DISTRIBUCIÓN POR MÉTODO:');
  for (const [m, count] of Object.entries(stats.byMethod)) {
    console.log(`   • ${m.padEnd(20)}: ${count.toLocaleString()}`);
  }
  console.log('---------------------------------------------------------');
  console.log('📑 DISTRIBUCIÓN POR CÓDIGO DE RESPUESTA:');
  for (const [code, count] of Object.entries(stats.byStatus)) {
    console.log(`   • Código [${code}]: ${count.toLocaleString()}`);
  }
  console.log('---------------------------------------------------------');
  console.log('🏛️ VERIFICACIÓN EN BASE DE DATOS (MSSQL):');
  console.log(`   • Pagos en dbo.TransaccionesBancarias : ${totalTxnDB.toLocaleString()}`);
  console.log(`   • Auditorías en dbo.AuditoriaLogs      : ${totalAuditDB.toLocaleString()}`);
  console.log('=========================================================\n');
}

main().catch((err) => {
  console.error('Fallo en la prueba de estrés:', err);
  process.exit(1);
});
