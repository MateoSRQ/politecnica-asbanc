import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastify, { FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { logger } from './infrastructure/telemetry/logger.js';
import { registerAuditHooks } from './interfaces/http/middlewares/audit.middleware.js';
import { healthRoutes } from './interfaces/http/routes/health.routes.js';
import { transactionalRoutes } from './interfaces/http/routes/transactional.routes.js';
import { auditRoutes } from './interfaces/http/routes/audit.routes.js';
import { authRoutes } from './interfaces/http/routes/auth.routes.js';
import { offHostRoutes } from './interfaces/http/routes/off-host.routes.js';

export function buildServer(): FastifyInstance {
  const app = fastify({
    logger: false,
    trustProxy: true,
    connectionTimeout: 30000,
    keepAliveTimeout: 30000,
    caseSensitive: false,
  });

  app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
  });
  app.register(helmet, { contentSecurityPolicy: false });

  if (env.RATE_LIMIT_ENABLED) {
    app.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: '1 minute',
      errorResponseBuilder: (request, context) => ({
        codigoRespuesta: '99',
        descripcionResp: `LIMITE DE PETICIONES EXCEDIDO: Reintente en ${context.after}`,
      }),
    });
  }

  registerAuditHooks(app);

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(transactionalRoutes);
  app.register(auditRoutes);
  app.register(offHostRoutes);

  app.setErrorHandler((error, request, reply) => {
    const isTransactional = request.url.toLowerCase().includes('/api/transactional');
    const rawStatusCode = error.statusCode || 500;
    const statusCode = isTransactional ? 200 : rawStatusCode;
    const isClientError = rawStatusCode >= 400 && rawStatusCode < 500;

    if (isClientError) {
      logger.warn(
        { error: error.message, traceId: request.traceId, statusCode: rawStatusCode },
        'Error en petición del cliente',
      );
    } else {
      logger.error({ error: error.message, stack: error.stack, traceId: request.traceId }, 'Excepción no controlada');
    }

    const response = {
      codigoRespuesta: '99',
      descripcionResp: isClientError ? `PETICION INVALIDA: ${error.message}` : 'ERROR DESCONOCIDO INTERNO',
    };
    (reply as any).payloadData = response;
    reply.status(statusCode).send(response);
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      codigoRespuesta: '99',
      descripcionResp: `RUTA NO ENCONTRADA: ${request.method} ${request.url}`,
    });
  });

  return app;
}
