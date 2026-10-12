import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import { env } from '../src/config/env.js';

async function exportLast1000() {
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

  let auditTable = 'politecnica_asbanc.dbo.AuditoriaLogs';
  try {
    const check = await pool.request().query("SELECT OBJECT_ID('dbo.AuditoriaLogs', 'U') AS tblId;");
    if (check.recordset[0]?.tblId) {
      auditTable = 'dbo.AuditoriaLogs';
    }
  } catch {}

  console.log(`📡 Consultando los últimos 1,000 registros desde ${auditTable}...`);

  const result = await pool.request().query(`
    SELECT TOP 1000
      Id,
      TraceId,
      Metodo,
      Endpoint,
      ClientIp,
      CodigoBanco,
      IdConsulta,
      NumOperacionBanco,
      CodigoRespuesta,
      ExecutionTimeMs,
      RequestPayload,
      ResponsePayload,
      FORMAT(CreatedAt, 'yyyy-MM-dd HH:mm:ss.fff') AS CreatedAt
    FROM ${auditTable}
    ORDER BY Id DESC;
  `);

  const rows = result.recordset;
  console.log(`✅ ${rows.length} registros obtenidos con éxito.`);

  const jsonPath = path.resolve(process.cwd(), 'audit_last_1000.json');
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf-8');
  console.log(`💾 Archivo JSON guardado en: ${jsonPath} (${(fs.statSync(jsonPath).size / 1024).toFixed(1)} KB)`);

  const csvHeaders = [
    'Id',
    'TraceId',
    'Metodo',
    'Endpoint',
    'ClientIp',
    'CodigoBanco',
    'IdConsulta',
    'NumOperacionBanco',
    'CodigoRespuesta',
    'ExecutionTimeMs',
    'CreatedAt',
  ];

  const csvRows = [csvHeaders.join(',')];
  for (const row of rows) {
    csvRows.push(
      [
        row.Id,
        `"${row.TraceId || ''}"`,
        `"${row.Metodo || ''}"`,
        `"${row.Endpoint || ''}"`,
        `"${row.ClientIp || ''}"`,
        `"${row.CodigoBanco || ''}"`,
        `"${row.IdConsulta || ''}"`,
        `"${row.NumOperacionBanco || ''}"`,
        `"${row.CodigoRespuesta || ''}"`,
        row.ExecutionTimeMs,
        `"${row.CreatedAt || ''}"`,
      ].join(','),
    );
  }

  const csvPath = path.resolve(process.cwd(), 'audit_last_1000.csv');
  fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf-8');
  console.log(`💾 Archivo CSV guardado en: ${csvPath} (${(fs.statSync(csvPath).size / 1024).toFixed(1)} KB)`);

  const latencies = rows.map((r: any) => r.ExecutionTimeMs).sort((a: number, b: number) => a - b);
  const avgLatency = (latencies.reduce((acc: number, val: number) => acc + val, 0) / latencies.length).toFixed(1);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  const methodCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  const bankCounts: Record<string, number> = {};

  for (const r of rows) {
    const m = r.Metodo?.replace('/api/Transactional/', '') || 'Otros';
    methodCounts[m] = (methodCounts[m] || 0) + 1;

    const s = r.CodigoRespuesta || 'N/A';
    statusCounts[s] = (statusCounts[s] || 0) + 1;

    const b = r.CodigoBanco || 'Sin Banco';
    bankCounts[b] = (bankCounts[b] || 0) + 1;
  }

  console.log('\n================================================================================');
  console.log('📊 RESUMEN ESTADÍSTICO DE LOS ÚLTIMOS 1,000 REGISTROS AUDITADOS');
  console.log('================================================================================');
  console.log(`📅 Rango de Fechas : ${rows[rows.length - 1].CreatedAt}  ──▶  ${rows[0].CreatedAt}`);
  console.log(`⏱️  Latencia Promedio: ${avgLatency} ms | p50: ${p50} ms | p95: ${p95} ms | p99: ${p99} ms`);
  console.log(`🆔 Rango de IDs     : #${rows[rows.length - 1].Id} al #${rows[0].Id}`);

  console.log('\n📌 Distribución por Método:');
  console.table(methodCounts);

  console.log('📌 Distribución por Código de Respuesta:');
  console.table(statusCounts);

  console.log('📌 Muestra de los últimos 5 registros:');
  console.table(
    rows.slice(0, 5).map((r: any) => ({
      ID: r.Id,
      Método: r.Metodo?.replace('/api/Transactional/', ''),
      Banco: r.CodigoBanco || 'N/A',
      'Id Consulta': r.IdConsulta || 'N/A',
      'Op. Banco': r.NumOperacionBanco || 'N/A',
      'Cod Resp': r.CodigoRespuesta,
      Latencia: `${r.ExecutionTimeMs} ms`,
      Fecha: r.CreatedAt,
    })),
  );

  await pool.close();
}

exportLast1000().catch((err) => {
  console.error('Error al exportar registros:', err);
  process.exit(1);
});
