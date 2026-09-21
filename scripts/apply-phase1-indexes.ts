import sql from 'mssql';
import { env } from '../src/config/env.js';

async function applyPhase1Indexes() {
  console.log('================================================================================');
  console.log('🚀 APLICANDO ÍNDICES ESTRATÉGICOS - FASE 1 EN BDACADEMICO6');
  console.log('================================================================================\n');

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

  const indexStatements = [
    {
      name: 'IX_Alumno_CodigoAlumno',
      table: 'Academico.Alumno',
      sql: `
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Alumno_CodigoAlumno' AND object_id = OBJECT_ID('Academico.Alumno'))
        BEGIN
          CREATE NONCLUSTERED INDEX IX_Alumno_CodigoAlumno
          ON Academico.Alumno (codigo_alumno)
          INCLUDE (id, persona_id);
        END
      `,
    },
    {
      name: 'IX_Alumno_PersonaId',
      table: 'Academico.Alumno',
      sql: `
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Alumno_PersonaId' AND object_id = OBJECT_ID('Academico.Alumno'))
        BEGIN
          CREATE NONCLUSTERED INDEX IX_Alumno_PersonaId
          ON Academico.Alumno (persona_id)
          INCLUDE (id, codigo_alumno);
        END
      `,
    },
    {
      name: 'IX_AlumnoPago_Alumno_Estado',
      table: 'Ctas_Ctes.Alumno_Pago',
      sql: `
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AlumnoPago_Alumno_Estado' AND object_id = OBJECT_ID('Ctas_Ctes.Alumno_Pago'))
        BEGIN
          CREATE NONCLUSTERED INDEX IX_AlumnoPago_Alumno_Estado
          ON Ctas_Ctes.Alumno_Pago (alumno_id, param_estado_pago_id)
          INCLUDE (num_cuota, fecha_vencimiento, monto, fecha_generacion, carga_academica_sede_id, created_at);
        END
      `,
    },
    {
      name: 'IX_AlumnoPagoDetalle_PagoId_NumDoc',
      table: 'Ctas_Ctes.Alumno_Pago_Detalle',
      sql: `
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AlumnoPagoDetalle_PagoId_NumDoc' AND object_id = OBJECT_ID('Ctas_Ctes.Alumno_Pago_Detalle'))
        BEGIN
          CREATE NONCLUSTERED INDEX IX_AlumnoPagoDetalle_PagoId_NumDoc
          ON Ctas_Ctes.Alumno_Pago_Detalle (alumno_pago_id, num_documento)
          INCLUDE (monto, tipo_pago, created_by, created_at);
        END
      `,
    },
  ];

  for (const idx of indexStatements) {
    const t0 = Date.now();
    process.stdout.write(`⚙️  Creando / Verificando ${idx.name} en ${idx.table}... `);
    await pool.request().query(idx.sql);
    const elapsed = Date.now() - t0;
    console.log(`✅ OK (${elapsed} ms)`);
  }

  console.log('\n--------------------------------------------------------------------------------');
  console.log('🔍 VERIFICACIÓN DE ÍNDICES ACTIVOS EN BDACADEMICO6:');
  console.log('--------------------------------------------------------------------------------');

  const verifyRes = await pool.request().query(`
    SELECT 
      s.name + '.' + t.name AS Tabla,
      i.name AS Indice,
      i.type_desc AS Tipo,
      STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS ColumnasClave
    FROM sys.indexes i
    JOIN sys.tables t ON i.object_id = t.object_id
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE i.name IN ('IX_Alumno_CodigoAlumno', 'IX_Alumno_PersonaId', 'IX_AlumnoPago_Alumno_Estado', 'IX_AlumnoPagoDetalle_PagoId_NumDoc')
      AND ic.is_included_column = 0
    GROUP BY s.name, t.name, i.name, i.type_desc
    ORDER BY Tabla, Indice;
  `);

  console.table(verifyRes.recordset);

  console.log('🎯 Todos los índices estratégicos de Fase 1 se encuentran creados y operativos.\n');
  await pool.close();
}

applyPhase1Indexes().catch((err) => {
  console.error('Error aplicando índices:', err);
  process.exit(1);
});
