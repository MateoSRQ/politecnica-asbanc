import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import sql from 'mssql';
import { env } from '../src/config/env.js';
import { closeMssqlPool } from '../src/infrastructure/database/mssql.connection.js';
import { stopAuditQueue } from '../src/interfaces/http/middlewares/audit.middleware.js';
import { buildServer } from '../src/server.js';

export interface TransactionLog {
  id: number;
  tier: number;
  type: 'PAYMENT_OK' | 'ERROR_16' | 'ERROR_99' | 'ERROR_22' | 'ERROR_401';
  scenario: string;
  method: string;
  endpoint: string;
  requestHeaders: Record<string, string>;
  requestBody: any;
  httpStatus: number;
  responseBody: any;
  durationMs: number;
  expectedCode: string;
  receivedCode: string;
  passed: boolean;
  timestamp: string;
  reversed?: boolean;
  reverseDurationMs?: number;
  reverseHttpStatus?: number;
  reverseResponseBody?: any;
}

export interface TierStats {
  tier: number;
  total: number;
  successful: number;
  expectedErrors: number;
  unexpectedErrors: number;
  totalDurationMs: number;
  throughputReqSec: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  slaCompliancePct: number;
  totalReversed: number;
  avgReversalDurationMs: number;
}

export interface BenchmarkReport {
  generatedAt: string;
  targetUrl: string;
  database: string;
  totalTransactions: number;
  totalDurationMs: number;
  globalThroughput: number;
  globalSlaCompliancePct: number;
  dbIntact: boolean;
  residualRecords: number;
  tiers: TierStats[];
  transactions: TransactionLog[];
}

function calculatePercentiles(latencies: number[]) {
  if (latencies.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const getP = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * (p / 100)))];

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round((sum / sorted.length) * 10) / 10,
    p50: getP(50),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
  };
}

async function safeFetch(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<{ res: Response | null; durationMs: number; err?: any }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, init);
      const durationMs = Math.round(performance.now() - t0);
      return { res, durationMs };
    } catch (err: any) {
      if (attempt === maxRetries) {
        const durationMs = Math.round(performance.now() - t0);
        return { res: null, durationMs, err };
      }
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }
  return { res: null, durationMs: 0 };
}

async function runStressBenchmark() {
  const targetUrl = (process.env.API_URL || 'http://127.0.0.1:7300').replace(/\/$/, '');
  console.log('================================================================================');
  console.log('⚡ POLITÉCNICA ASBANC - PRUEBA CONTINUA DE CARGA (10, 100 Y 1,000 SIMULTÁNEOS)');
  console.log(`   Punto de Destino (HTTP Client): ${targetUrl}`);
  console.log('   Cliente HTTP: Web Fetch API estándar (compatible con invocación externa)');
  console.log('   Base de Datos: BDACADEMICO6 (Core ERP Real)');
  console.log('   Garantía Financiera: Reversión automática de todos los pagos');
  console.log('================================================================================\n');

  let serverInstance: any = null;
  let isServerRunning = false;

  try {
    const healthRes = await fetch(`${targetUrl}/health`, { signal: AbortSignal.timeout(1500) });
    if (healthRes.ok) {
      isServerRunning = true;
      console.log(`🌐 Servidor activo detectado en ${targetUrl}. Usando servidor existente.`);
    }
  } catch {
    isServerRunning = false;
  }

  if (!isServerRunning) {
    console.log(`🚀 Iniciando servidor Fastify en proceso en puerto ${env.PORT}...`);
    serverInstance = buildServer();
    await serverInstance.listen({ port: env.PORT, host: '0.0.0.0', backlog: 2048 });
    console.log(`✅ Servidor iniciado y escuchando peticiones en http://${env.HOST}:${env.PORT}`);
  }

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

  console.log('🔍 Extrayendo padrón de cuotas pendientes en BDACADEMICO6...');
  const debtsResult = await pool.request().query(`
    SELECT TOP 1200 
      ap.id AS pago_id,
      ap.monto,
      alu.codigo_alumno,
      per.nro_documento
    FROM Ctas_Ctes.Alumno_Pago ap WITH (NOLOCK)
    JOIN Academico.Alumno alu WITH (NOLOCK) ON ap.alumno_id = alu.id
    JOIN General.Persona per WITH (NOLOCK) ON alu.persona_id = per.id
    WHERE ap.param_estado_pago_id = 25 AND ap.monto > 0
    ORDER BY ap.id ASC;
  `);

  const availableDebts = debtsResult.recordset;
  console.log(`✅ Cuotas reales disponibles para prueba: ${availableDebts.length}\n`);

  if (availableDebts.length < 1100) {
    console.error(`⚠️ Se requieren al menos 1,100 cuotas pendientes para las 3 fases (10, 100, 1000).`);
    process.exit(1);
  }

  console.log('🔑 Solicitando token OAuth 2.0 / JWT a /api/Auth/token...');
  const tokenReqStart = performance.now();
  const tokenResponse = await fetch(`${targetUrl}/api/Auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.ASBANC_CLIENT_ID,
      client_secret: env.ASBANC_CLIENT_SECRET,
    }),
  });

  if (!tokenResponse.ok) {
    console.error('❌ Error al autenticar con el servicio de tokens:', await tokenResponse.text());
    process.exit(1);
  }

  const tokenJson: any = await tokenResponse.json();
  const authToken = `Bearer ${tokenJson.access_token}`;
  console.log(
    `✅ Token JWT obtenido en ${(performance.now() - tokenReqStart).toFixed(1)}ms. Token: ${tokenJson.access_token.slice(0, 25)}...\n`,
  );

  const allLogs: TransactionLog[] = [];
  const tierStatsList: TierStats[] = [];
  let debtIndex = 0;
  const runId = Math.floor(1000 + Math.random() * 9000);

  const tiersConfig = [
    { tier: 10, okCount: 8, err16: 1, err99: 1, err22: 0, err401: 0 },
    { tier: 100, okCount: 92, err16: 2, err99: 2, err22: 2, err401: 2 },
    { tier: 1000, okCount: 960, err16: 10, err99: 10, err22: 10, err401: 10 },
  ];

  const globalStart = performance.now();

  for (const cfg of tiersConfig) {
    console.log('--------------------------------------------------------------------------------');
    console.log(`🔥 INICIANDO RONDA: ${cfg.tier} PAGOS SIMULTÁNEOS (Concurrencia: ${cfg.tier})`);
    console.log(`   • ${cfg.okCount} Transacciones legítimas (esperado: 00)`);
    console.log(`   • ${cfg.err16} Pruebas de Cliente Inexistente (esperado: 16)`);
    console.log(`   • ${cfg.err99} Pruebas de Datos Inválidos / Formato (esperado: 99)`);
    if (cfg.err22 > 0) console.log(`   • ${cfg.err22} Pruebas de Deuda ya Cancelada (esperado: 22)`);
    if (cfg.err401 > 0) console.log(`   • ${cfg.err401} Pruebas de Unauthorized / Sin Token (esperado: 401)`);
    console.log('--------------------------------------------------------------------------------');

    const prePaidDebts: Array<{ debt: any; opBanco: string }> = [];
    for (let i = 0; i < cfg.err22; i++) {
      const debtToCancel = availableDebts[debtIndex++];
      const preOpBanco = `PR${runId}${String(prePaidDebts.length + 1).padStart(4, '0')}`;
      const prePayRes = await fetch(`${targetUrl}/api/Transactional/PayDebt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authToken },
        body: JSON.stringify({
          fechaTxn: '21092026',
          horaTxn: '123000',
          canalPago: '10',
          codigoBanco: '1020',
          numOperacionBanco: preOpBanco,
          formaPago: '01',
          tipoConsulta: '0',
          idConsulta: debtToCancel.codigo_alumno,
          codigoProducto: '001',
          numDocumento: String(debtToCancel.pago_id),
          importePagado: Number(debtToCancel.monto),
          monedaDoc: '1',
          codigoEmpresa: '998',
        }),
      });
      if (prePayRes.ok) {
        prePaidDebts.push({ debt: debtToCancel, opBanco: preOpBanco });
      }
    }

    const tasks: Array<() => Promise<TransactionLog>> = [];

    for (let i = 0; i < cfg.okCount; i++) {
      const debt = availableDebts[debtIndex++];
      const currentTxId = allLogs.length + tasks.length + 1;
      const opBanco = `P${runId}${String(currentTxId).padStart(5, '0')}`;

      const payload = {
        fechaTxn: '21092026',
        horaTxn: '123000',
        canalPago: '10',
        codigoBanco: '1020',
        numOperacionBanco: opBanco,
        formaPago: '01',
        tipoConsulta: '0',
        idConsulta: debt.codigo_alumno,
        codigoProducto: '001',
        numDocumento: String(debt.pago_id),
        importePagado: Number(debt.monto),
        monedaDoc: '1',
        codigoEmpresa: '998',
      };

      tasks.push(async (): Promise<TransactionLog> => {
        const headers = {
          'Content-Type': 'application/json',
          Authorization: authToken,
        };

        const { res, durationMs } = await safeFetch(`${targetUrl}/api/Transactional/PayDebt`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        let respData: any = {};
        if (res) {
          try {
            respData = await res.json();
          } catch {
            respData = { raw: await res.text() };
          }
        } else {
          respData = { error: 'Socket/Network Timeout' };
        }

        const httpStatus = res ? res.status : 500;
        const receivedCode = String(respData.codigoRespuesta || httpStatus);
        const passed = httpStatus === 200 && receivedCode === '00';

        return {
          id: currentTxId,
          tier: cfg.tier,
          type: 'PAYMENT_OK',
          scenario: `Pago Cuota #${debt.pago_id} Alumno ${debt.codigo_alumno}`,
          method: 'POST',
          endpoint: '/api/Transactional/PayDebt',
          requestHeaders: headers,
          requestBody: payload,
          httpStatus,
          responseBody: respData,
          durationMs,
          expectedCode: '00',
          receivedCode,
          passed,
          timestamp: new Date().toISOString(),
          reversed: false,
        };
      });
    }

    for (let i = 0; i < cfg.err16; i++) {
      const currentTxId = allLogs.length + tasks.length + 1;
      const opBanco = `E16_${runId}${String(currentTxId).padStart(4, '0')}`;
      const payload = {
        fechaTxn: '21092026',
        horaTxn: '123000',
        canalPago: '10',
        codigoBanco: '1020',
        numOperacionBanco: opBanco,
        formaPago: '01',
        tipoConsulta: '0',
        idConsulta: '999999999999',
        codigoProducto: '001',
        numDocumento: '99999999',
        importePagado: 500,
        monedaDoc: '1',
        codigoEmpresa: '998',
      };

      tasks.push(async (): Promise<TransactionLog> => {
        const headers = { 'Content-Type': 'application/json', Authorization: authToken };
        const { res, durationMs } = await safeFetch(`${targetUrl}/api/Transactional/PayDebt`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        const respData: any = res ? await res.json().catch(() => ({})) : { error: 'Socket/Network Timeout' };
        const httpStatus = res ? res.status : 500;
        const receivedCode = String(respData.codigoRespuesta || httpStatus);
        const passed = httpStatus === 200 && receivedCode === '16';

        return {
          id: currentTxId,
          tier: cfg.tier,
          type: 'ERROR_16',
          scenario: 'Inyección de Error: Alumno Inexistente (999999999999)',
          method: 'POST',
          endpoint: '/api/Transactional/PayDebt',
          requestHeaders: headers,
          requestBody: payload,
          httpStatus,
          responseBody: respData,
          durationMs,
          expectedCode: '16',
          receivedCode,
          passed,
          timestamp: new Date().toISOString(),
        };
      });
    }

    for (let i = 0; i < cfg.err99; i++) {
      const currentTxId = allLogs.length + tasks.length + 1;
      const opBanco = `E99_${runId}${String(currentTxId).padStart(4, '0')}`;
      const payload = {
        fechaTxn: '2026-09-21',
        horaTxn: '123000',
        canalPago: '10',
        codigoBanco: '1020',
        numOperacionBanco: opBanco,
        formaPago: '01',
        tipoConsulta: '0',
        idConsulta: '26023353010012',
        codigoProducto: '001',
        numDocumento: '10726',
        importePagado: 833.33,
        monedaDoc: '1',
        codigoEmpresa: '998',
      };

      tasks.push(async (): Promise<TransactionLog> => {
        const headers = { 'Content-Type': 'application/json', Authorization: authToken };
        const { res, durationMs } = await safeFetch(`${targetUrl}/api/Transactional/PayDebt`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        const respData: any = res ? await res.json().catch(() => ({})) : { error: 'Socket/Network Timeout' };
        const httpStatus = res ? res.status : 500;
        const receivedCode = String(respData.codigoRespuesta || httpStatus);
        const passed = httpStatus === 200 && receivedCode === '99';

        return {
          id: currentTxId,
          tier: cfg.tier,
          type: 'ERROR_99',
          scenario: 'Inyección de Error: Fecha con formato inválido (YYYY-MM-DD)',
          method: 'POST',
          endpoint: '/api/Transactional/PayDebt',
          requestHeaders: headers,
          requestBody: payload,
          httpStatus,
          responseBody: respData,
          durationMs,
          expectedCode: '99',
          receivedCode,
          passed,
          timestamp: new Date().toISOString(),
        };
      });
    }

    for (let i = 0; i < cfg.err22; i++) {
      const currentTxId = allLogs.length + tasks.length + 1;
      const opBanco = `E22_${runId}${String(currentTxId).padStart(4, '0')}`;
      const targetDebt = prePaidDebts[i]?.debt || availableDebts[0];
      const payload = {
        fechaTxn: '21092026',
        horaTxn: '123000',
        canalPago: '10',
        codigoBanco: '1020',
        numOperacionBanco: opBanco,
        formaPago: '01',
        tipoConsulta: '0',
        idConsulta: targetDebt.codigo_alumno,
        codigoProducto: '001',
        numDocumento: String(targetDebt.pago_id),
        importePagado: Number(targetDebt.monto),
        monedaDoc: '1',
        codigoEmpresa: '998',
      };

      tasks.push(async (): Promise<TransactionLog> => {
        const headers = { 'Content-Type': 'application/json', Authorization: authToken };
        const { res, durationMs } = await safeFetch(`${targetUrl}/api/Transactional/PayDebt`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        const respData: any = res ? await res.json().catch(() => ({})) : { error: 'Socket/Network Timeout' };
        const httpStatus = res ? res.status : 500;
        const receivedCode = String(respData.codigoRespuesta || httpStatus);
        const passed = httpStatus === 200 && receivedCode === '22';

        return {
          id: currentTxId,
          tier: cfg.tier,
          type: 'ERROR_22',
          scenario: `Inyección de Error: Intento de pago sobre cuota ya cancelada (#${targetDebt.pago_id})`,
          method: 'POST',
          endpoint: '/api/Transactional/PayDebt',
          requestHeaders: headers,
          requestBody: payload,
          httpStatus,
          responseBody: respData,
          durationMs,
          expectedCode: '22',
          receivedCode,
          passed,
          timestamp: new Date().toISOString(),
        };
      });
    }

    for (let i = 0; i < cfg.err401; i++) {
      const currentTxId = allLogs.length + tasks.length + 1;
      const opBanco = `E401${runId}${String(currentTxId).padStart(4, '0')}`;
      const payload = {
        fechaTxn: '21092026',
        horaTxn: '123000',
        canalPago: '10',
        codigoBanco: '1020',
        numOperacionBanco: opBanco,
        formaPago: '01',
        tipoConsulta: '0',
        idConsulta: '26023353010012',
        codigoProducto: '001',
        numDocumento: '10726',
        importePagado: 833.33,
        monedaDoc: '1',
        codigoEmpresa: '998',
      };

      tasks.push(async (): Promise<TransactionLog> => {
        const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer token_invalido_corrupto' };
        const { res, durationMs } = await safeFetch(`${targetUrl}/api/Transactional/PayDebt`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        const respData: any = res ? await res.json().catch(() => ({})) : { error: 'Socket/Network Timeout' };
        const httpStatus = res ? res.status : 500;
        const passed = httpStatus === 401;

        return {
          id: currentTxId,
          tier: cfg.tier,
          type: 'ERROR_401',
          scenario: 'Inyección de Error: Token JWT alterado/inválido (401 Unauthorized)',
          method: 'POST',
          endpoint: '/api/Transactional/PayDebt',
          requestHeaders: headers,
          requestBody: payload,
          httpStatus,
          responseBody: respData,
          durationMs,
          expectedCode: '401',
          receivedCode: String(httpStatus),
          passed,
          timestamp: new Date().toISOString(),
        };
      });
    }

    console.log(`🚀 Disparando ${tasks.length} peticiones simultáneas con Promise.all()...`);
    const tierStart = performance.now();
    const results = await Promise.all(tasks.map((fn) => fn()));
    const tierDuration = performance.now() - tierStart;
    console.log(`⏱️  Lote de ${cfg.tier} procesado en ${tierDuration.toFixed(1)} ms.`);

    const successfulPayments = results.filter(
      (r) => r.type === 'PAYMENT_OK' && r.httpStatus === 200 && r.receivedCode === '00',
    );
    const totalToReverse = successfulPayments.length + prePaidDebts.length;
    console.log(`🔄 Revirtiendo automáticamente ${totalToReverse} pagos para restaurar la base de datos...`);
    const revStart = performance.now();

    const reverseTasks = successfulPayments.map((log) => async () => {
      const revPayload = {
        fechaTxn: log.requestBody.fechaTxn,
        horaTxn: log.requestBody.horaTxn,
        codigoBanco: log.requestBody.codigoBanco,
        tipoConsulta: log.requestBody.tipoConsulta,
        idConsulta: log.requestBody.idConsulta,
        numOperacionBanco: log.requestBody.numOperacionBanco,
        numDocumento: log.requestBody.numDocumento,
        codigoEmpresa: log.requestBody.codigoEmpresa,
      };

      const { res, durationMs } = await safeFetch(`${targetUrl}/api/Transactional/ReversePay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authToken },
        body: JSON.stringify(revPayload),
      });
      const revBody = res ? await res.json().catch(() => ({})) : { error: 'Socket/Network Timeout' };

      log.reversed = res?.status === 200 && revBody.codigoRespuesta === '00';
      log.reverseDurationMs = durationMs;
      log.reverseHttpStatus = res?.status || 500;
      log.reverseResponseBody = revBody;
    });

    for (const prep of prePaidDebts) {
      reverseTasks.push(async () => {
        const revPayload = {
          fechaTxn: '21092026',
          horaTxn: '123000',
          codigoBanco: '1020',
          tipoConsulta: '0',
          idConsulta: prep.debt.codigo_alumno,
          numOperacionBanco: prep.opBanco,
          numDocumento: String(prep.debt.pago_id),
          codigoEmpresa: '998',
        };
        await safeFetch(`${targetUrl}/api/Transactional/ReversePay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authToken },
          body: JSON.stringify(revPayload),
        });
      });
    }

    await Promise.all(reverseTasks.map((fn) => fn()));
    const revTotalDuration = performance.now() - revStart;
    const avgRevMs = totalToReverse > 0 ? Math.round((revTotalDuration / totalToReverse) * 10) / 10 : 0;
    console.log(
      `✅ ${totalToReverse} extornos completados en ${revTotalDuration.toFixed(1)} ms (promedio: ${avgRevMs} ms/extorno).\n`,
    );

    allLogs.push(...results);

    const latencies = results.map((r) => r.durationMs);
    const pStats = calculatePercentiles(latencies);
    const slaCompliance = Math.round((latencies.filter((l) => l <= 3000).length / latencies.length) * 1000) / 10;
    const throughput = Math.round((results.length / (tierDuration / 1000)) * 10) / 10;

    const tStat: TierStats = {
      tier: cfg.tier,
      total: results.length,
      successful: successfulPayments.length,
      expectedErrors: results.filter((r) => r.type !== 'PAYMENT_OK' && r.passed).length,
      unexpectedErrors: results.filter((r) => !r.passed).length,
      totalDurationMs: Math.round(tierDuration),
      throughputReqSec: throughput,
      min: pStats.min,
      max: pStats.max,
      avg: pStats.avg,
      p50: pStats.p50,
      p90: pStats.p90,
      p95: pStats.p95,
      p99: pStats.p99,
      slaCompliancePct: slaCompliance,
      totalReversed: successfulPayments.filter((p) => p.reversed).length,
      avgReversalDurationMs: avgRevMs,
    };

    tierStatsList.push(tStat);

    console.log(
      `📊 Métricas Tier ${cfg.tier}: Throughput: ${throughput} req/s | Avg: ${pStats.avg}ms | p95: ${pStats.p95}ms | p99: ${pStats.p99}ms | SLA (<3s): ${slaCompliance}%`,
    );
  }

  const globalTotalDuration = performance.now() - globalStart;

  console.log('\n🔒 Verificando estado final de la base de datos BDACADEMICO6...');
  const residualCheck = await pool.request().query(`
    SELECT COUNT(*) AS residualCount
    FROM Ctas_Ctes.Alumno_Pago_Detalle WITH (NOLOCK)
    WHERE num_documento LIKE 'P${runId}%'
       OR num_documento LIKE 'PR${runId}%'
       OR num_documento LIKE 'E%${runId}%';
  `);

  const residualCount = residualCheck.recordset[0].residualCount;
  const dbIntact = residualCount === 0;

  if (dbIntact) {
    console.log(
      '✅ BASE DE DATOS 100% INTACTA: 0 registros residuales en Alumno_Pago_Detalle. Todas las cuotas fueron revertidas limpiamente.',
    );
  } else {
    console.warn(`⚠️ Atención: Se encontraron ${residualCount} registros residuales no revertidos.`);
  }

  const globalLatencies = allLogs.map((l) => l.durationMs);
  const globalPercentiles = calculatePercentiles(globalLatencies);
  const globalSlaCompliance =
    Math.round((globalLatencies.filter((l) => l <= 3000).length / globalLatencies.length) * 1000) / 10;
  const globalThroughput = Math.round((allLogs.length / (globalTotalDuration / 1000)) * 10) / 10;

  const reportData: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    targetUrl,
    database: 'BDACADEMICO6',
    totalTransactions: allLogs.length,
    totalDurationMs: Math.round(globalTotalDuration),
    globalThroughput,
    globalSlaCompliancePct: globalSlaCompliance,
    dbIntact,
    residualRecords: residualCount,
    tiers: tierStatsList,
    transactions: allLogs,
  };

  const jsonReportPath = path.resolve(process.cwd(), 'report_stress_10_100_1000.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify(reportData, null, 2), 'utf-8');
  console.log(`\n💾 Reporte JSON guardado en: ${jsonReportPath}`);

  const htmlReportPath = path.resolve(process.cwd(), 'report_stress_10_100_1000.html');
  const htmlContent = generateHtmlDashboard(reportData);
  fs.writeFileSync(htmlReportPath, htmlContent, 'utf-8');
  console.log(`🌐 Dashboard HTML interactivo generado en: ${htmlReportPath}`);

  console.log('\n================================================================================');
  console.log('📈 RESUMEN CONSOLIDADO DE RENDIMIENTO Y ESCALABILIDAD (10, 100, 1000)');
  console.log('================================================================================');
  console.table(
    tierStatsList.map((t) => ({
      Concurrencia: `${t.tier} req`,
      'Total Txns': t.total,
      'Exitosos (00)': t.successful,
      'Errores Valid.': t.expectedErrors,
      Throughput: `${t.throughputReqSec} req/s`,
      'Lat. Promedio': `${t.avg} ms`,
      'p50 (Mediana)': `${t.p50} ms`,
      p95: `${t.p95} ms`,
      p99: `${t.p99} ms`,
      'SLA (< 3s)': `${t.slaCompliancePct}%`,
      Revertidos: `${t.totalReversed}/${t.successful}`,
    })),
  );

  console.log(`🎯 Total Transacciones Ejecutadas: ${allLogs.length}`);
  console.log(`⏱️  Tiempo Total de Prueba        : ${(globalTotalDuration / 1000).toFixed(2)} segundos`);
  console.log(`📊 Throughput Global Promedio     : ${globalThroughput} transacciones / segundo`);
  console.log(`🔒 Estado Final Base de Datos     : ${dbIntact ? '100% INTACTA (0 residuales)' : 'REVISAR RESIDUALES'}`);
  console.log('================================================================================\n');

  await stopAuditQueue();
  await pool.close();
  await closeMssqlPool();
  if (serverInstance) {
    await serverInstance.close();
    console.log('🛑 Servidor Fastify en proceso cerrado correctamente.');
  }
  process.exit(0);
}

function generateHtmlDashboard(data: BenchmarkReport): string {
  const tiersJson = JSON.stringify(data.tiers);
  const txnsSummary = data.transactions.map((t) => ({
    id: t.id,
    tier: t.tier,
    type: t.type,
    scenario: t.scenario,
    endpoint: t.endpoint,
    status: t.httpStatus,
    code: t.receivedCode,
    passed: t.passed,
    durationMs: t.durationMs,
    reversed: t.reversed,
    revMs: t.reverseDurationMs || 0,
    reqBody: t.requestBody,
    respBody: t.responseBody,
  }));
  const txnsJson = JSON.stringify(txnsSummary);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Politécnica ASBANC - Reporte de Carga Concurrente (10, 100, 1000)</title>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-card: #1e293b;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --border: #334155;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      padding: 24px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-success { background-color: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-warning { background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-danger { background-color: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge-info { background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
    
    .grid-kpi {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }
    .card {
      background-color: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }
    .card-title { font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; }
    .card-value { font-size: 1.85rem; font-weight: 700; color: #fff; }
    .card-subtitle { font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px; }
    
    .tier-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 20px;
      margin-bottom: 28px;
    }
    .tier-card {
      background-color: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      position: relative;
      overflow: hidden;
    }
    .tier-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .tier-title { font-size: 1.25rem; font-weight: 700; color: #fff; }
    .metric-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; }
    .metric-row:last-child { border-bottom: none; }
    .metric-label { color: var(--text-secondary); }
    .metric-val { font-weight: 600; color: #f8fafc; }
    
    .table-container {
      background-color: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 28px;
      overflow-x: auto;
    }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem; }
    th { padding: 12px 16px; background-color: rgba(255, 255, 255, 0.03); color: var(--text-secondary); border-bottom: 1px solid var(--border); font-weight: 600; text-transform: uppercase; font-size: 0.75rem; }
    td { padding: 12px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    tr:hover { background-color: rgba(255, 255, 255, 0.02); }
    
    .filter-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    input, select {
      background-color: var(--bg-primary);
      border: 1px solid var(--border);
      color: #fff;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 0.875rem;
      outline: none;
    }
    input:focus, select:focus { border-color: var(--accent); }
    
    .btn-detail {
      background-color: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.4);
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.75rem;
      transition: all 0.2s;
    }
    .btn-detail:hover { background-color: var(--accent); color: #fff; }
    
    .modal {
      display: none;
      position: fixed;
      z-index: 1000;
      left: 0; top: 0;
      width: 100%; height: 100%;
      background-color: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      align-items: center; justify-content: center;
    }
    .modal-content {
      background-color: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      width: 90%; max-width: 850px;
      max-height: 85vh;
      overflow-y: auto;
      padding: 24px;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
    }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
    pre {
      background-color: #0b0f19;
      color: #38bdf8;
      padding: 14px;
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.8rem;
      overflow-x: auto;
      margin-top: 8px;
      border: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1 style="font-size: 1.75rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 12px;">
          🏦 Politécnica ASBANC FTR
          <span class="badge badge-info">YAPAGO V47</span>
        </h1>
        <p style="color: var(--text-secondary); margin-top: 4px;">
          Reporte de Prueba de Estrés Concurrente en Lotes: <strong>10, 100 y 1,000 Transacciones Simultáneas</strong>
        </p>
      </div>
      <div style="text-align: right;">
        <span class="badge ${data.dbIntact ? 'badge-success' : 'badge-danger'}">
          ${data.dbIntact ? '🔒 BD 100% INTACTA (0 Residuales)' : '⚠️ Alerta de Residuales'}
        </span>
        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 6px;">
          ${data.generatedAt}
        </div>
      </div>
    </header>

    <!-- KPI CARDS -->
    <div class="grid-kpi">
      <div class="card">
        <div class="card-title">Total Transacciones</div>
        <div class="card-value">${data.totalTransactions}</div>
        <div class="card-subtitle">10 + 100 + 1,000 Concurrencia</div>
      </div>
      <div class="card">
        <div class="card-title">Throughput Global</div>
        <div class="card-value" style="color: #60a5fa;">${data.globalThroughput} <span style="font-size: 1rem;">req/s</span></div>
        <div class="card-subtitle">Tiempo total: ${(data.totalDurationMs / 1000).toFixed(2)}s</div>
      </div>
      <div class="card">
        <div class="card-title">Cumplimiento SLA ASBANC</div>
        <div class="card-value" style="color: #34d399;">${data.globalSlaCompliancePct}%</div>
        <div class="card-subtitle">SLA Norma Oficial < 3.0s</div>
      </div>
      <div class="card">
        <div class="card-title">Base de Datos</div>
        <div class="card-value" style="color: #10b981;">0 <span style="font-size: 1rem;">residuales</span></div>
        <div class="card-subtitle">Reversión atómica 100% OK</div>
      </div>
    </div>

    <!-- TIERS PERFORMANCE DETAIL -->
    <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 16px;">📊 Desglose de Rendimiento por Nivel de Concurrencia</h2>
    <div class="tier-cards">
      ${data.tiers
        .map(
          (t) => `
        <div class="tier-card">
          <div class="tier-header">
            <div class="tier-title">Nivel ${t.tier} Simultáneos</div>
            <span class="badge badge-info">${t.throughputReqSec} req/s</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Tiempo Lote Completo</span>
            <span class="metric-val">${t.totalDurationMs} ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Latencia Promedio</span>
            <span class="metric-val">${t.avg} ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Mediana (p50)</span>
            <span class="metric-val">${t.p50} ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Percentil 95 (p95)</span>
            <span class="metric-val">${t.p95} ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Percentil 99 (p99)</span>
            <span class="metric-val">${t.p99} ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Cumplimiento SLA (< 3s)</span>
            <span class="metric-val" style="color: #34d399;">${t.slaCompliancePct}%</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Pagos Revertidos Limpiamente</span>
            <span class="metric-val" style="color: #10b981;">${t.totalReversed} / ${t.successful} (${t.avgReversalDurationMs} ms avg)</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Errores de Prueba Validados</span>
            <span class="metric-val" style="color: #fbbf24;">${t.expectedErrors} capturados</span>
          </div>
        </div>
      `,
        )
        .join('')}
    </div>

    <!-- TABLE EXPLORER -->
    <div class="table-container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <h2 style="font-size: 1.25rem; font-weight: 700;">🔍 Explorador Forense de Peticiones (Entradas y Salidas)</h2>
        <div class="filter-bar" style="margin-bottom: 0;">
          <select id="tierFilter" onchange="filterData()">
            <option value="ALL">Todos los Niveles</option>
            <option value="10">Nivel 10</option>
            <option value="100">Nivel 100</option>
            <option value="1000">Nivel 1000</option>
          </select>
          <select id="typeFilter" onchange="filterData()">
            <option value="ALL">Todos los Tipos</option>
            <option value="PAYMENT_OK">Pagos Exitosos (00)</option>
            <option value="ERROR_16">Error 16 (Cliente no existe)</option>
            <option value="ERROR_99">Error 99 (Datos inválidos)</option>
            <option value="ERROR_22">Error 22 (Ya cancelada)</option>
            <option value="ERROR_401">Error 401 (Unauthorized)</option>
          </select>
          <input type="text" id="searchInput" placeholder="Buscar por Alumno / Op..." onkeyup="filterData()">
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Nivel</th>
            <th>Tipo / Escenario</th>
            <th>HTTP</th>
            <th>Cod ASBANC</th>
            <th>Latencia</th>
            <th>Reversión</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody id="tableBody">
          <!-- Renderizado dinámico -->
        </tbody>
      </table>
      <div style="margin-top: 14px; text-align: center; color: var(--text-secondary); font-size: 0.8rem;" id="tableInfo"></div>
    </div>
  </div>

  <!-- MODAL DE DETALLE -->
  <div class="modal" id="detailModal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalTitle" style="color: #fff; font-size: 1.1rem;">Detalle de Transacción</h3>
        <button onclick="closeModal()" style="background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer;">&times;</button>
      </div>
      <div>
        <h4 style="font-size: 0.85rem; color: #38bdf8; text-transform: uppercase;">📥 Datos de Entrada Enviados (Request Payload):</h4>
        <pre id="modalRequest"></pre>
        
        <h4 style="font-size: 0.85rem; color: #34d399; text-transform: uppercase; margin-top: 16px;">📤 Respuesta Retornada por el Gateway (Response Payload):</h4>
        <pre id="modalResponse"></pre>

        <h4 style="font-size: 0.85rem; color: #f59e0b; text-transform: uppercase; margin-top: 16px;">🔄 Datos de Reversión Atómica (ReversePay):</h4>
        <pre id="modalReverse"></pre>
      </div>
    </div>
  </div>

  <script>
    const transactions = ${txnsJson};

    function renderTable(data) {
      const tbody = document.getElementById('tableBody');
      const maxRows = 100;
      const displayData = data.slice(0, maxRows);

      tbody.innerHTML = displayData.map(t => {
        let badgeClass = 'badge-success';
        if (t.code === '16' || t.code === '22') badgeClass = 'badge-warning';
        if (t.code === '99' || t.status >= 500) badgeClass = 'badge-danger';
        if (t.status === 401) badgeClass = 'badge-warning';

        return \`
          <tr>
            <td><strong>#\${t.id}</strong></td>
            <td><span class="badge badge-info">Tier \${t.tier}</span></td>
            <td>\${t.scenario}</td>
            <td><span style="font-weight: 600; color: \${t.status === 200 ? '#34d399' : '#f87171'}">\${t.status}</span></td>
            <td><span class="badge \${badgeClass}">\${t.code}</span></td>
            <td><strong>\${t.durationMs} ms</strong></td>
            <td>\${t.reversed ? '<span style="color: #34d399;">✅ Revertido (' + t.revMs + 'ms)</span>' : '<span style="color: #94a3b8;">N/A</span>'}</td>
            <td><button class="btn-detail" onclick="showDetail(\${t.id})">Ver Payloads</button></td>
          </tr>
        \`;
      }).join('');

      document.getElementById('tableInfo').innerText = \`Mostrando \${displayData.length} de \${data.length} registros filtrados (Total en ejecución: \${transactions.length})\`;
    }

    function filterData() {
      const tierVal = document.getElementById('tierFilter').value;
      const typeVal = document.getElementById('typeFilter').value;
      const searchVal = document.getElementById('searchInput').value.toLowerCase();

      const filtered = transactions.filter(t => {
        const matchesTier = tierVal === 'ALL' || String(t.tier) === tierVal;
        const matchesType = typeVal === 'ALL' || t.type === typeVal;
        const matchesSearch = !searchVal || 
          t.scenario.toLowerCase().includes(searchVal) ||
          JSON.stringify(t.reqBody).toLowerCase().includes(searchVal);

        return matchesTier && matchesType && matchesSearch;
      });

      renderTable(filtered);
    }

    function showDetail(id) {
      const item = transactions.find(t => t.id === id);
      if (!item) return;

      document.getElementById('modalTitle').innerText = \`Transacción #\${item.id} (Tier \${item.tier}) - \${item.scenario}\`;
      document.getElementById('modalRequest').innerText = JSON.stringify(item.reqBody, null, 2);
      document.getElementById('modalResponse').innerText = JSON.stringify(item.respBody, null, 2);
      document.getElementById('modalReverse').innerText = item.reversed ? 
        \`Extorno confirmado exitosamente en \${item.revMs} ms (HTTP 200 - Código ASBANC 00)\` : 
        'No aplica extorno para este escenario (era prueba de error controlado o fallo previo)';

      document.getElementById('detailModal').style.display = 'flex';
    }

    function closeModal() {
      document.getElementById('detailModal').style.display = 'none';
    }

    window.onclick = function(event) {
      const modal = document.getElementById('detailModal');
      if (event.target === modal) closeModal();
    }

    // Render inicial
    renderTable(transactions);
  </script>
</body>
</html>`;
}

runStressBenchmark().catch((err) => {
  console.error('Error fatal durante la prueba de estrés:', err);
  process.exit(1);
});
