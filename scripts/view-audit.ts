import sql from 'mssql';
import { env } from '../src/config/env.js';

async function getAuditTableName(pool: sql.ConnectionPool): Promise<string> {
  try {
    const check = await pool.request().query("SELECT OBJECT_ID('dbo.AuditoriaLogs', 'U') AS tblId;");
    if (check.recordset[0]?.tblId) {
      return 'dbo.AuditoriaLogs';
    }
    return 'politecnica_asbanc.dbo.AuditoriaLogs';
  } catch {
    return 'politecnica_asbanc.dbo.AuditoriaLogs';
  }
}

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

  const auditTable = await getAuditTableName(pool);

  // Parámetro de cantidad a mostrar (default: 5 detallados)
  const argLimit = parseInt(process.argv[2], 10);
  const detailLimit = !isNaN(argLimit) && argLimit > 0 ? argLimit : 5;

  const result = await pool.request().query(`
    SELECT TOP ${detailLimit}
      Id,
      TraceId,
      REPLACE(Endpoint, '/api/Transactional/', '') AS Metodo,
      ISNULL(CodigoBanco, 'N/A') AS Banco,
      IdConsulta,
      NumOperacionBanco,
      CodigoRespuesta AS Resp,
      CAST(ExecutionTimeMs AS VARCHAR) + ' ms' AS Latencia,
      FORMAT(CreatedAt, 'yyyy-MM-dd HH:mm:ss') AS Fecha,
      RequestPayload,
      ResponsePayload
    FROM ${auditTable}
    ORDER BY Id DESC;
  `);

  console.log('\n================================================================================');
  console.log(`📜 ÚLTIMAS ${detailLimit} TRANSACCIONES AUDITADAS EN MSSQL (${auditTable})`);
  console.log('================================================================================');

  console.table(
    result.recordset.map((r: any) => ({
      ID: r.Id,
      Método: r.Metodo,
      Banco: r.Banco,
      'Id Consulta': r.IdConsulta || 'N/A',
      'Op. Banco': r.NumOperacionBanco || 'N/A',
      'Cod Resp': r.Resp,
      Latencia: r.Latencia,
      'Fecha y Hora': r.Fecha,
    })),
  );

  console.log('\n================================================================================');
  console.log('🔍 DETALLE COMPLETO DE PAYLOADS Y RESPUESTAS (JSON):');
  console.log('================================================================================');

  result.recordset.forEach((tx: any, i: number) => {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(
      `🔹 [${i + 1}/${result.recordset.length}] ID Transacción: #${tx.Id} | Método: ${tx.Metodo} | Latencia: ${tx.Latencia}`,
    );
    console.log(`   Trace ID  : ${tx.TraceId}`);
    console.log(`   Fecha     : ${tx.Fecha}`);
    console.log(`   Respuesta : Código ASBANC "${tx.Resp}"`);

    let reqObj = null;
    let respObj = null;
    try {
      reqObj = JSON.parse(tx.RequestPayload);
    } catch {
      reqObj = tx.RequestPayload;
    }
    try {
      respObj = JSON.parse(tx.ResponsePayload);
    } catch {
      respObj = tx.ResponsePayload;
    }

    console.log(`\n   📥 PAYLOAD ENVIADO POR EL BANCO (Request):`);
    console.log(
      JSON.stringify(reqObj, null, 6)
        .split('\n')
        .map((l) => '      ' + l)
        .join('\n'),
    );

    console.log(`\n   📤 RESPUESTA RETORNADA AL BANCO (Response):`);
    console.log(
      JSON.stringify(respObj, null, 6)
        .split('\n')
        .map((l) => '      ' + l)
        .join('\n'),
    );
  });

  const summary = await pool.request().query(`
    SELECT 
      COUNT(*) AS TotalAuditorias,
      AVG(ExecutionTimeMs) AS LatenciaPromedioMs,
      MAX(ExecutionTimeMs) AS LatenciaMaximaMs
    FROM ${auditTable};
  `);

  console.log('\n================================================================================');
  console.log('📊 RESUMEN HISTÓRICO GENERAL DE AUDITORÍA:');
  console.log('================================================================================');
  console.log(`   • Total transacciones auditadas : ${summary.recordset[0].TotalAuditorias.toLocaleString()}`);
  console.log(`   • Latencia promedio histórica   : ${summary.recordset[0].LatenciaPromedioMs} ms`);
  console.log(`   • Latencia máxima registrada    : ${summary.recordset[0].LatenciaMaximaMs} ms\n`);

  await pool.close();
}

viewAudit().catch((err) => {
  console.error('Error consultando auditoría:', err.message);
  process.exit(1);
});
