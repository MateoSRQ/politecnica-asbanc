import { FastifyInstance } from 'fastify';
import { getMssqlPool } from '../../../infrastructure/database/mssql.connection.js';
import { register } from '../../../infrastructure/telemetry/metrics.js';
import { asbancAuthMiddleware } from '../middlewares/auth.middleware.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_req, reply) => {
    let dbStatus = 'disconnected';

    try {
      const pool = await getMssqlPool();
      if (pool.connected) {
        dbStatus = 'connected';
      }
    } catch {
      dbStatus = 'error';
    }

    const isHealthy = dbStatus === 'connected';

    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        mssql: dbStatus,
      },
    });
  });

  fastify.get('/metrics', { preHandler: [asbancAuthMiddleware] }, async (_req, reply) => {
    reply.header('Content-Type', register.contentType);
    return reply.send(await register.metrics());
  });
}
