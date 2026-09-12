import { FastifyInstance } from 'fastify';
import { authController } from '../controllers/auth.controller.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Emisión de token OAuth 2.0 / JWT (Pág. 8 de Guía V47)
  fastify.post('/api/Auth/token', authController.generateToken.bind(authController));
}
