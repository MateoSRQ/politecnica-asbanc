import { FastifyInstance } from 'fastify';
import { authController } from '../controllers/auth.controller.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/Auth/token', authController.generateToken.bind(authController));
}
