import { FastifyInstance } from 'fastify';
import { auditController } from '../controllers/audit.controller.js';
import { asbancAuthMiddleware } from '../middlewares/auth.middleware.js';

export async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  // Consulta paginada de auditoría
  fastify.get('/api/Audit', { preHandler: [asbancAuthMiddleware] }, auditController.getAudits.bind(auditController));

  // Descarga / exportación de auditorías (CSV o JSON)
  fastify.get(
    '/api/Audit/export',
    { preHandler: [asbancAuthMiddleware] },
    auditController.exportAudits.bind(auditController),
  );

  // Detalle de auditoría individual por ID
  fastify.get(
    '/api/Audit/:id',
    { preHandler: [asbancAuthMiddleware] },
    auditController.getAuditById.bind(auditController),
  );
}
