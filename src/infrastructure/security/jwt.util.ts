import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  iss: string;
  sub: string;
  iat: number;
  exp: number;
  [key: string]: any;
}

/**
 * Genera un token JWT firmado con HMAC-SHA256 (HS256)
 */
export function signJwt(
  payload: Record<string, any>,
  secret: string,
  expiresInSeconds: number = 86400
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    iss: 'politecnica.edu.pe',
    sub: payload.sub || 'asbanc_client',
    iat: now,
    exp: now + expiresInSeconds,
    ...payload,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifica la firma y vigencia de un token JWT
 */
export function verifyJwt(
  token: string,
  secret: string
): { valid: boolean; payload?: JwtPayload; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Formato de token JWT inválido' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    const expectedSignature = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const signatureBuf = Buffer.from(signatureB64);
    const expectedBuf = Buffer.from(expectedSignature);

    if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
      return { valid: false, error: 'Firma de token JWT no coincide' };
    }

    const payload: JwtPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token JWT expirado' };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: `Error al decodificar token: ${err.message}` };
  }
}

/**
 * Compara dos cadenas de texto en tiempo constante para mitigar ataques de canal lateral (timing attacks)
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
