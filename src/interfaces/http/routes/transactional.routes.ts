import { FastifyInstance } from 'fastify';
import { transactionalController } from '../controllers/transactional.controller.js';
import { asbancAuthMiddleware } from '../middlewares/auth.middleware.js';

export async function transactionalRoutes(fastify: FastifyInstance): Promise<void> {
  // Rutas transaccionales de ASBANC FTR
  fastify.post(
    '/api/Transactional/ValidateCustomer',
    { preHandler: [asbancAuthMiddleware] },
    transactionalController.validateCustomer.bind(transactionalController),
  );

  fastify.post(
    '/api/Transactional/ListDebts',
    { preHandler: [asbancAuthMiddleware] },
    transactionalController.listDebts.bind(transactionalController),
  );

  fastify.post(
    '/api/Transactional/PayDebt',
    { preHandler: [asbancAuthMiddleware] },
    transactionalController.payDebt.bind(transactionalController),
  );

  fastify.post(
    '/api/Transactional/ReversePay',
    { preHandler: [asbancAuthMiddleware] },
    transactionalController.reversePay.bind(transactionalController),
  );
}
