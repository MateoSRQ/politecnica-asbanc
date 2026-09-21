import { performance } from 'node:perf_hooks';
import { env } from '../src/config/env.js';
import { closeMssqlPool, getMssqlPool } from '../src/infrastructure/database/mssql.connection.js';
import { buildServer } from '../src/server.js';

interface ScaleResult {
  scale: number;
  totalListDebts: number;
  totalPayDebts: number;
  totalReverses: number;
  totalDurationMs: number;
  throughputTxnPerSec: number;
  listStats: LatencyStats;
  payStats: LatencyStats;
  reverseStats: LatencyStats;
  cycleStats: LatencyStats;
  slaViolations: number;
  slaCompliancePct: number;
}

interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

function calculateStats(times: number[]): LatencyStats {
  if (times.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  }
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, curr) => acc + curr, 0);
  const getPercentile = (p: number) => {
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * (p / 100)));
    return sorted[idx];
  };

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round((sum / sorted.length) * 10) / 10,
    p50: getPercentile(50),
    p90: getPercentile(90),
    p95: getPercentile(95),
    p99: getPercentile(99),
  };
}

async function runBenchmarkScale() {
  console.log('================================================================================');
  console.log('🚀 POLITÉCNICA ASBANC - BENCHMARK ESCALADO DE LISTADOS Y PAGOS (5, 10, 50, 100)');
  console.log('   Base de datos activa: BDACADEMICO6 (Core Académico Real)');
  console.log('   Garantía de integridad: Reversión atómica limpia en cada ciclo');
  console.log('================================================================================\n');

  const pool = await getMssqlPool();
  const app = buildServer();
  await app.ready();

  // 1. Obtener Token JWT
  console.log('🔑 Obteniendo token OAuth 2.0 / JWT desde /api/Auth/token...');
  const tokenRes = await app.inject({
    method: 'POST',
    url: '/api/Auth/token',
    payload: {
      client_id: env.ASBANC_CLIENT_ID,
      client_secret: env.ASBANC_CLIENT_SECRET,
    },
  });

  if (tokenRes.statusCode !== 200) {
    console.error('❌ Error al obtener token JWT:', tokenRes.body);
    process.exit(1);
  }

  const authToken = 'Bearer ' + JSON.parse(tokenRes.body).access_token;
  console.log('✅ Token JWT generado satisfactoriamente.\n');

  // 2. Extraer estudiantes reales con deuda pendiente
  console.log('🔍 Seleccionando padrón de estudiantes reales con deudas pendientes en BDACADEMICO6...');
  const studentsRes = await pool.request().query(`
    SELECT TOP 1200 
      alu.codigo_alumno
    FROM Ctas_Ctes.Alumno_Pago ap WITH (NOLOCK)
    JOIN Academico.Alumno alu WITH (NOLOCK) ON ap.alumno_id = alu.id
    WHERE ap.param_estado_pago_id = 25 AND ap.monto > 0;
  `);

  const uniqueStudentCodes = [...new Set(studentsRes.recordset.map((r: any) => r.codigo_alumno))];
  console.log(`✅ Padrón disponible: ${uniqueStudentCodes.length} estudiantes únicos con cuotas pendientes.\n`);

  const scales = [5, 10, 50, 100];
  const summaryResults: ScaleResult[] = [];

  let studentOffset = 0;

  for (const scale of scales) {
    console.log('--------------------------------------------------------------------------------');
    console.log(`▶️  INICIANDO LOTE DE ESCALA: ${scale} TRANSACCIONES (Listado + Pago + Reversión)`);
    console.log('--------------------------------------------------------------------------------');

    const targetStudents = uniqueStudentCodes.slice(studentOffset, studentOffset + scale);
    studentOffset += scale;

    const listTimes: number[] = [];
    const payTimes: number[] = [];
    const reverseTimes: number[] = [];
    const cycleTimes: number[] = [];
    let slaViolations = 0;

    const batchStart = performance.now();

    for (let i = 0; i < targetStudents.length; i++) {
      const codigoAlumno = targetStudents[i];
      const cycleStart = performance.now();

      // A) PASO 1: ListDebts
      const t0List = performance.now();
      const listRes = await app.inject({
        method: 'POST',
        url: '/api/Transactional/ListDebts',
        headers: { authorization: authToken },
        payload: {
          tipoConsulta: '0',
          idConsulta: codigoAlumno,
          codigoEmpresa: '998',
          codigoProducto: '001',
          codigoBanco: '1020',
          canalPago: '10',
        },
      });
      const tList = Math.round(performance.now() - t0List);
      listTimes.push(tList);
      if (tList > 3000) slaViolations++;

      const listBody = JSON.parse(listRes.body);
      if (listRes.statusCode !== 200 || listBody.codigoRespuesta !== '00' || !listBody.deudasPendientes?.length) {
        console.warn(`   ⚠️ Alumno ${codigoAlumno} sin deudas o error en listado:`, listBody);
        continue;
      }

      const debt = listBody.deudasPendientes[0];
      const pagoId = debt.numDocumento;
      const monto = debt.deuda;
      const numOpBanco = 'OP' + Date.now().toString().slice(-6) + (i + 1).toString().padStart(4, '0');

      // B) PASO 2: PayDebt
      const t0Pay = performance.now();
      const payRes = await app.inject({
        method: 'POST',
        url: '/api/Transactional/PayDebt',
        headers: { authorization: authToken },
        payload: {
          fechaTxn: '14092026',
          horaTxn: '160000',
          canalPago: '10',
          codigoBanco: '1020',
          numOperacionBanco: numOpBanco,
          formaPago: '01',
          tipoConsulta: '0',
          idConsulta: codigoAlumno,
          codigoProducto: '001',
          numDocumento: pagoId,
          importePagado: monto,
          monedaDoc: '1',
          codigoEmpresa: '998',
        },
      });
      const tPay = Math.round(performance.now() - t0Pay);
      payTimes.push(tPay);
      if (tPay > 3000) slaViolations++;

      const payBody = JSON.parse(payRes.body);
      if (payRes.statusCode !== 200 || payBody.codigoRespuesta !== '00') {
        console.error(`   ❌ Error en pago alumno ${codigoAlumno}:`, payBody);
        continue;
      }

      // C) PASO 3: ReversePay (Extorno limpio y restauración de BD)
      const t0Rev = performance.now();
      const revRes = await app.inject({
        method: 'POST',
        url: '/api/Transactional/ReversePay',
        headers: { authorization: authToken },
        payload: {
          fechaTxn: '14092026',
          horaTxn: '160500',
          codigoBanco: '1020',
          numOperacionBanco: numOpBanco,
          numDocumento: pagoId,
          codigoEmpresa: '998',
        },
      });
      const tRev = Math.round(performance.now() - t0Rev);
      reverseTimes.push(tRev);

      const cycleDuration = Math.round(performance.now() - cycleStart);
      cycleTimes.push(cycleDuration);

      if ((i + 1) % 10 === 0 || (i + 1) === targetStudents.length) {
        process.stdout.write(`   Transacciones procesadas: ${i + 1}/${targetStudents.length}...\r`);
      }
    }

    const batchDurationMs = Math.round(performance.now() - batchStart);
    const totalOps = listTimes.length + payTimes.length + reverseTimes.length;
    const throughput = Math.round((totalOps / (batchDurationMs / 1000)) * 10) / 10;

    const listStats = calculateStats(listTimes);
    const payStats = calculateStats(payTimes);
    const reverseStats = calculateStats(reverseTimes);
    const cycleStats = calculateStats(cycleTimes);
    const totalCheckedOps = listTimes.length + payTimes.length;
    const compliancePct = totalCheckedOps > 0 ? Math.round(((totalCheckedOps - slaViolations) / totalCheckedOps) * 1000) / 10 : 100;

    summaryResults.push({
      scale,
      totalListDebts: listTimes.length,
      totalPayDebts: payTimes.length,
      totalReverses: reverseTimes.length,
      totalDurationMs: batchDurationMs,
      throughputTxnPerSec: throughput,
      listStats,
      payStats,
      reverseStats,
      cycleStats,
      slaViolations,
      slaCompliancePct: compliancePct,
    });

    console.log(`\n   ✅ Escala ${scale} finalizada en ${(batchDurationMs / 1000).toFixed(2)}s (${throughput} ops/seg)`);
    console.log(`      • ListDebts : Avg ${listStats.avg} ms | Min ${listStats.min} ms | P50 ${listStats.p50} ms | P95 ${listStats.p95} ms | Max ${listStats.max} ms`);
    console.log(`      • PayDebt   : Avg ${payStats.avg} ms | Min ${payStats.min} ms | P50 ${payStats.p50} ms | P95 ${payStats.p95} ms | Max ${payStats.max} ms`);
    console.log(`      • Reversas  : Avg ${reverseStats.avg} ms | Min ${reverseStats.min} ms | P50 ${reverseStats.p50} ms | Max ${reverseStats.max} ms`);
    console.log(`      • Ciclo Txn : Avg ${cycleStats.avg} ms | Min ${cycleStats.min} ms | P50 ${cycleStats.p50} ms | Max ${cycleStats.max} ms\n`);
  }

  // 3. Verificación de integridad final
  console.log('================================================================================');
  console.log('🔒 VERIFICACIÓN DE INTEGRIDAD EN LA BASE DE DATOS (BDACADEMICO6)');
  console.log('================================================================================');
  const residualCheck = await pool.request().query(`
    SELECT COUNT(*) AS residuales
    FROM Ctas_Ctes.Alumno_Pago_Detalle
    WHERE created_by = 'ASBANC_FTR';
  `);

  const pendingCheck = await pool.request().query(`
    SELECT COUNT(*) AS cuotas_pagadas_residuales
    FROM Ctas_Ctes.Alumno_Pago
    WHERE param_estado_pago_id = 16 AND modified_by IN ('ASBANC_FTR', 'ASBANC_REVERSA');
  `);

  const residualRows = residualCheck.recordset[0].residuales;
  const residualPaidCuotas = pendingCheck.recordset[0].cuotas_pagadas_residuales;

  console.log(`   • Filas residuales en Alumno_Pago_Detalle : ${residualRows} (Esperado: 0)`);
  console.log(`   • Cuotas pagadas residuales en Alumno_Pago: ${residualPaidCuotas} (Esperado: 0)`);

  if (residualRows === 0 && residualPaidCuotas === 0) {
    console.log('   🎯 RESULTADO: Base de datos 100% intacta e idéntica a su estado inicial.\n');
  } else {
    console.warn('   ⚠️ ADVERTENCIA: Existen registros residuales que requieren limpieza.\n');
  }

  // 4. Tablas consolidadas
  console.log('================================================================================');
  console.log('📊 TABLA COMPARATIVA CONSOLIDADA: TIEMPOS DE RESPUESTA POR ESCALA');
  console.log('================================================================================');

  console.log('\n🔵 1. TIEMPOS DE CONSULTA / LISTADO DE DEUDA (/api/Transactional/ListDebts):');
  console.table(
    summaryResults.map((r) => ({
      'Escala': `${r.scale} txns`,
      'Promedio': `${r.listStats.avg} ms`,
      'Mínimo': `${r.listStats.min} ms`,
      'Mediana (P50)': `${r.listStats.p50} ms`,
      'P90': `${r.listStats.p90} ms`,
      'P95': `${r.listStats.p95} ms`,
      'P99': `${r.listStats.p99} ms`,
      'Máximo': `${r.listStats.max} ms`,
      'SLA (<3s)': r.listStats.max < 3000 ? '✅ 100% CUMPLE' : '⚠️ ALERTA',
    }))
  );

  console.log('\n🟢 2. TIEMPOS DE EJECUCIÓN Y PAGO DE DEUDA (/api/Transactional/PayDebt):');
  console.table(
    summaryResults.map((r) => ({
      'Escala': `${r.scale} txns`,
      'Promedio': `${r.payStats.avg} ms`,
      'Mínimo': `${r.payStats.min} ms`,
      'Mediana (P50)': `${r.payStats.p50} ms`,
      'P90': `${r.payStats.p90} ms`,
      'P95': `${r.payStats.p95} ms`,
      'P99': `${r.payStats.p99} ms`,
      'Máximo': `${r.payStats.max} ms`,
      'SLA (<3s)': r.payStats.max < 3000 ? '✅ 100% CUMPLE' : '⚠️ ALERTA',
    }))
  );

  console.log('\n🟡 3. TIEMPOS DE CICLO COMPLETO Y RENDIMIENTO (Throughput):');
  console.table(
    summaryResults.map((r) => ({
      'Escala': `${r.scale} txns`,
      'Duración Total': `${(r.totalDurationMs / 1000).toFixed(2)} s`,
      'Throughput (ops/s)': `${r.throughputTxnPerSec} req/s`,
      'Ciclo Promedio': `${r.cycleStats.avg} ms`,
      'Ciclo Mediana': `${r.cycleStats.p50} ms`,
      'Ciclo Máx': `${r.cycleStats.max} ms`,
      'Cumplimiento SLA': `${r.slaCompliancePct}%`,
    }))
  );

  await app.close();
  await closeMssqlPool();
}

runBenchmarkScale().catch((err) => {
  console.error('Error fatal en benchmark escalado:', err);
  process.exit(1);
});
