import sql from 'mssql';
import { env } from '../src/config/env.js';

async function viewAudit(): Promise<void> {
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

  const result = await pool.request().query(`
    SELECT TOP 15 
      Id,
      LEFT(TraceId, 8) + '...' AS TraceId,
      REPLACE(Endpoint, '/api/Transactional/', '') AS Metodo,
      ISNULL(CodigoBanco, 'N/A') AS Banco,
      CodigoRespuesta AS Resp,
      CAST(ExecutionTimeMs AS VARCHAR) + ' ms' AS Latencia,
      FORMAT(CreatedAt, 'yyyy-MM-dd HH:mm:ss') AS Fecha
    FROM dbo.AuditoriaLogs
    ORDER BY Id DESC;
  `);

  console.log('\n📜 ÚLTIMOS 15 REGISTROS DE AUDITORÍA TRANSACCIONAL EN MSSQL:');
  console.table(result.recordset);

  const summary = await pool.request().query(`
    SELECT 
      COUNT(*) AS TotalAuditorias,
      AVG(ExecutionTimeMs) AS LatenciaPromedioMs,
      MAX(ExecutionTimeMs) AS LatenciaMaximaMs
    FROM dbo.AuditoriaLogs;
  `);

  console.log('📊 Resumen General de Auditoría:');
  console.log(`   • Total transacciones auditadas : ${summary.recordset[0].TotalAuditorias.toLocaleString()}`);
  console.log(`   • Latencia promedio histórica   : ${summary.recordset[0].LatenciaPromedioMs} ms`);
  console.log(`   • Latencia máxima registrada    : ${summary.recordset[0].LatenciaMaximaMs} ms\n`);

  await pool.close();
}

viewAudit().catch((err) => {
  console.error('Error consultando auditoría:', err.message);
  process.exit(1);
});
