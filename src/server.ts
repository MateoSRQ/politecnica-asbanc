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

export function buildServer(): FastifyInstance {
  const app = fastify({
    logger: false, // Usamos nuestro logger Pino centralizado
    trustProxy: true,
    connectionTimeout: 5000,
    caseSensitive: false, // Soporta URLs tanto en mayúsculas como en minúsculas
  });

  // Plugins de seguridad y cabeceras
  app.register(cors, { origin: true });
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

  // Hooks de auditoría y telemetría (MDC, latencia, Prometheus)
  registerAuditHooks(app);

  // Registro de rutas
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(transactionalRoutes);
  app.register(auditRoutes);

  // Manejo de errores no controlados (retorna código 99 según norma ASBANC)
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    const isClientError = statusCode >= 400 && statusCode < 500;

    if (isClientError) {
      logger.warn({ error: error.message, traceId: request.traceId, statusCode }, 'Error en petición del cliente');
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

  // Manejo de ruta no encontrada
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      codigoRespuesta: '99',
      descripcionResp: `RUTA NO ENCONTRADA: ${request.method} ${request.url}`,
    });
  });

  return app;
}
