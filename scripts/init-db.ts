import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import { env } from '../src/config/env.js';

async function initDatabase(): Promise<void> {
  console.log('🔄 Conectando a Microsoft SQL Server (master) para aprovisionar base de datos...');

  // Conexión inicial a master para verificar o crear la BD
  const masterConfig: sql.config = {
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: 'master',
    server: env.DB_SERVER,
    port: env.DB_PORT,
    connectionTimeout: 10000,
    requestTimeout: 30000,
    options: {
      encrypt: env.DB_ENCRYPT,
      trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    },
  };

  let pool = await sql.connect(masterConfig);

  console.log('📦 Verificando si existe la base de datos:', env.DB_NAME);
  await pool.request().query(`
    IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '${env.DB_NAME}')
    BEGIN
      CREATE DATABASE [${env.DB_NAME}];
      PRINT 'Base de datos creada.';
    END
  `);

  await pool.close();

  // Conexión a la base de datos de la aplicación
  console.log(`🔌 Conectando a [${env.DB_NAME}] para ejecutar schema y seed...`);
  const appDbConfig: sql.config = {
    ...masterConfig,
    database: env.DB_NAME,
  };

  pool = await sql.connect(appDbConfig);

  const scriptsDir = path.resolve(process.cwd(), 'scripts');
  const schemaPath = path.join(scriptsDir, 'schema.sql');
  const seedPath = path.join(scriptsDir, 'seed.sql');

  // Ejecutar Schema
  console.log('📜 Ejecutando scripts/schema.sql...');
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  await executeSqlBatches(pool, schemaContent);

  // Ejecutar Seed Data
  console.log('🌱 Ejecutando scripts/seed.sql...');
  const seedContent = fs.readFileSync(seedPath, 'utf8');
  await executeSqlBatches(pool, seedContent);

  console.log('✅ Base de datos MSSQL inicializada y poblada con éxito.');
  await pool.close();
}

/**
 * MSSQL no soporta ejecutar 'GO' en una sola query string.
 * Esta función separa los bloques delimitados por GO y los ejecuta individualmente.
 */
async function executeSqlBatches(pool: sql.ConnectionPool, sqlScript: string): Promise<void> {
  const batches = sqlScript
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  for (const batch of batches) {
    try {
      await pool.request().query(batch);
    } catch (err: any) {
      // Si el error es de tipo USE database o algo inocuo, informar
      console.error('❌ Error al ejecutar lote SQL:', err.message);
      console.error('Lote con error:\n', batch.substring(0, 150) + '...');
      throw err;
    }
  }
}

initDatabase().catch((err) => {
  console.error('❌ Error crítico al inicializar base de datos:', err);
  process.exit(1);
});
