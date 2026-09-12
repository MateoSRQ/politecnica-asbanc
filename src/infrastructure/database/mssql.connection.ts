import sql from 'mssql';
import { env } from '../../config/env.js';
import { logger } from '../telemetry/logger.js';

const sqlConfig: sql.config = {
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  server: env.DB_SERVER,
  port: env.DB_PORT,
  connectionTimeout: env.DB_CONNECTION_TIMEOUT,
  requestTimeout: env.DB_REQUEST_TIMEOUT,
  pool: {
    min: env.DB_POOL_MIN,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    enableArithAbort: true,
  },
};

let pool: sql.ConnectionPool | null = null;
let poolPromise: Promise<sql.ConnectionPool> | null = null;

export async function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  if (poolPromise) {
    return poolPromise;
  }

  poolPromise = (async () => {
    try {
      logger.info(
        { server: env.DB_SERVER, port: env.DB_PORT, database: env.DB_NAME },
        'Conectando a Microsoft SQL Server...'
      );
      pool = await new sql.ConnectionPool(sqlConfig).connect();
      logger.info('Conexión exitosa a Microsoft SQL Server (pool listo).');
      return pool;
    } catch (error) {
      logger.error({ error }, 'Error crítico al conectar a Microsoft SQL Server');
      pool = null;
      throw error;
    } finally {
      poolPromise = null;
    }
  })();

  return poolPromise;
}

export async function closeMssqlPool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    logger.info('Pool de conexiones MSSQL cerrado correctamente.');
  }
}

export { sql };
