import { env } from './config/env.js';
import { closeMssqlPool, getMssqlPool } from './infrastructure/database/mssql.connection.js';
import { logger } from './infrastructure/telemetry/logger.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  logger.info('==================================================');
  logger.info('🚀 INICIANDO SERVICIO POLITÉCNICA ASBANC FTR');
  logger.info(`Entorno: ${env.NODE_ENV} | Puerto: ${env.PORT} | Host: ${env.HOST}`);
  logger.info('==================================================');

  // Inicializar conexiones a infraestructura
  try {
    await getMssqlPool();
  } catch (error) {
    logger.warn('MSSQL no está listo todavía; continuará reintentando en segundo plano.');
  }

  const server = buildServer();

  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    logger.info(`Servidor escuchando en http://${env.HOST}:${env.PORT}`);
    logger.info(`Métricas Prometheus activas en http://${env.HOST}:${env.PORT}${env.METRICS_ROUTE}`);
    logger.info(`Health check activo en http://${env.HOST}:${env.PORT}/health`);
  } catch (err) {
    logger.error({ err }, 'Error al iniciar el servidor HTTP Fastify');
    process.exit(1);
  }

  // Cierre limpio (Graceful Shutdown)
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Señal de terminación recibida. Cerrando recursos...');
    await server.close();
    await closeMssqlPool();
    logger.info('Servicio detenido correctamente.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Fallo fatal en el arranque');
  process.exit(1);
});
