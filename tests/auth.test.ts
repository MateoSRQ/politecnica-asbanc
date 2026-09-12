import { describe, expect, it } from 'vitest';
import { signJwt, verifyJwt } from '../src/infrastructure/security/jwt.util.js';

describe('Pruebas de Seguridad y Tokens JWT (Página 8 Guía V47)', () => {
  const secret = 'test_secret_key_123456';

  it('debe firmar y verificar un token JWT válido', () => {
    const token = signJwt({ sub: 'asbanc_ftr', rol: 'bank_gateway' }, secret, 3600);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const check = verifyJwt(token, secret);
    expect(check.valid).toBe(true);
    expect(check.payload?.sub).toBe('asbanc_ftr');
    expect(check.payload?.iss).toBe('politecnica.edu.pe');
  });

  it('debe rechazar un token si la firma no coincide', () => {
    const token = signJwt({ sub: 'asbanc_ftr' }, secret, 3600);
    const check = verifyJwt(token, 'wrong_secret');
    expect(check.valid).toBe(false);
    expect(check.error).toContain('no coincide');
  });

  it('debe rechazar un token manipulado (tampered)', () => {
    const token = signJwt({ sub: 'asbanc_ftr' }, secret, 3600);
    const parts = token.split('.');
    // Manipulamos el payload
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'hacker' })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const check = verifyJwt(tamperedToken, secret);
    expect(check.valid).toBe(false);
  });

  it('debe rechazar un token expirado', () => {
    // Expiración negativa (-10s)
    const token = signJwt({ sub: 'asbanc_ftr' }, secret, -10);
    const check = verifyJwt(token, secret);
    expect(check.valid).toBe(false);
    expect(check.error).toContain('expirado');
  });
});
