import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../../config/env.js';
import { signJwt, timingSafeStringEqual } from '../../../infrastructure/security/jwt.util.js';
import { logger } from '../../../infrastructure/telemetry/logger.js';

interface TokenRequestBody {
  grant_type?: string;
  client_id?: string;
  client_secret?: string;
  username?: string;
  password?: string;
}

export class AuthController {
  /**
   * POST /api/Auth/token
   * Emisor oficial de tokens JWT según requerimiento OAuth 2.0 / ASBANC FTR V47 (Pág. 8)
   */
  async generateToken(
    request: FastifyRequest<{ Body: TokenRequestBody }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      let clientId = request.body?.client_id || request.body?.username;
      let clientSecret = request.body?.client_secret || request.body?.password;

      // Soporte para credenciales en cabecera Authorization: Basic base64(client_id:client_secret)
      const authHeader = request.headers.authorization;
      if ((!clientId || !clientSecret) && authHeader && authHeader.startsWith('Basic ')) {
        const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
        const [id, secret] = credentials.split(':');
        if (id && secret) {
          clientId = id;
          clientSecret = secret;
        }
      }

      // Validar credenciales con comparación en tiempo constante (timing attack protection)
      const isValid =
        Boolean(
          clientId &&
          clientSecret &&
          ((timingSafeStringEqual(clientId, env.ASBANC_CLIENT_ID) &&
            timingSafeStringEqual(clientSecret, env.ASBANC_CLIENT_SECRET)) ||
            timingSafeStringEqual(clientSecret, env.ASBANC_AUTH_SECRET))
        );

      if (!isValid) {
        logger.warn(
          { ip: request.ip, clientId },
          'Intento de autenticación fallido: Credenciales inválidas'
        );
        reply.status(401).send({
          codigoRespuesta: '99',
          descripcionResp: 'CREDENCIALES ASBANC INVALIDAS (CLIENT_ID / CLIENT_SECRET INCORRECTOS)',
        });
        return;
      }

      const expiresIn = env.JWT_EXPIRATION_SECONDS; // 24h (86400s) por defecto según pág. 8
      const token = signJwt(
        {
          sub: clientId || env.ASBANC_CLIENT_ID,
          empresa: env.ASBANC_DEFAULT_COMPANY_CODE,
          aud: 'ASBANC_FTR_GATEWAY',
          scope: 'asbanc:transactional',
        },
        env.JWT_SECRET,
        expiresIn
      );

      logger.info(
        { ip: request.ip, clientId, expiresIn },
        'Token JWT emitido exitosamente para concentrador ASBANC'
      );

      reply.send({
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
        scope: 'asbanc:transactional',
        codigoRespuesta: '00',
        descripcionResp: 'TOKEN GENERADO EXITOSAMENTE',
      });
    } catch (error: any) {
      logger.error({ err: error.message }, 'Error al generar token JWT');
      reply.status(500).send({
        codigoRespuesta: '99',
        descripcionResp: 'ERROR INTERNO GENERANDO TOKEN DE AUTENTICACION',
      });
    }
  }
}

export const authController = new AuthController();
