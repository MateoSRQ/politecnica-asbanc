import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../../config/env.js';
import { timingSafeStringEqual, verifyJwt } from '../../../infrastructure/security/jwt.util.js';
import { logger } from '../../../infrastructure/telemetry/logger.js';

declare module 'fastify' {
  interface FastifyRequest {
    jwtPayload?: any;
  }
}

export async function asbancAuthMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!env.ASBANC_AUTH_ENABLED) {
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader) {
    logger.warn({ ip: request.ip, url: request.url }, 'Petición rechazada: Cabecera Authorization ausente');
    return reply.status(401).send({
      codigoRespuesta: '99',
      descripcionResp: 'AUTORIZACION REQUERIDA (CABECERA BASIC AUTH / TOKEN AUSENTE)',
    });
  }

  const token = authHeader.replace(/^(Basic|Bearer)\s+/i, '').trim();

  if (timingSafeStringEqual(token, env.ASBANC_AUTH_SECRET)) {
    return;
  }

  const jwtCheck = verifyJwt(token, env.JWT_SECRET);
  if (jwtCheck.valid && jwtCheck.payload) {
    request.jwtPayload = jwtCheck.payload;
    return;
  }

  logger.warn(
    { ip: request.ip, url: request.url, reason: jwtCheck.error },
    'Petición rechazada: Token ASBANC no coincide con el pactado ni es un JWT válido',
  );
  return reply.status(401).send({
    codigoRespuesta: '99',
    descripcionResp: `TOKEN ASBANC INVALIDO O EXPIRADO: ${jwtCheck.error || 'Firma no reconocida'}`,
  });
}
