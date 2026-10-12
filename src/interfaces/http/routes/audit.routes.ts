import { FastifyInstance } from 'fastify';
import { auditController } from '../controllers/audit.controller.js';
import { asbancAuthMiddleware } from '../middlewares/auth.middleware.js';

export async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/Audit', { preHandler: [asbancAuthMiddleware] }, auditController.getAudits.bind(auditController));

  fastify.get(
    '/api/Audit/export',
    { preHandler: [asbancAuthMiddleware] },
    auditController.exportAudits.bind(auditController),
  );

  fastify.get(
    '/api/Audit/:id',
    { preHandler: [asbancAuthMiddleware] },
    auditController.getAuditById.bind(auditController),
  );
}
