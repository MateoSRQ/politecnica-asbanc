import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FastifyInstance } from 'fastify';
import { env } from '../src/config/env.js';
import { closeMssqlPool, getMssqlPool } from '../src/infrastructure/database/mssql.connection.js';
import { buildServer } from '../src/server.js';

describe('Pruebas de Integración End-to-End de Rutas HTTP (server.inject)', () => {
  let app: FastifyInstance;
  let validToken: string;

  beforeAll(async () => {
    await getMssqlPool();
    app = buildServer();
    await app.ready();

    // Generar un token válido para las pruebas transaccionales
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/Auth/token',
      payload: {
        client_id: env.ASBANC_CLIENT_ID,
        client_secret: env.ASBANC_CLIENT_SECRET,
      },
    });
    const tokenBody = JSON.parse(tokenRes.body);
    validToken = tokenBody.access_token;
  });

  afterAll(async () => {
    await app.close();
    await closeMssqlPool();
  });

  describe('1. Health y Métricas', () => {
    it('GET /health debe devolver status 200 y conectividad con MSSQL', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('UP');
      expect(body.services.mssql).toBe('connected');
    });

    it('GET /metrics debe exponer métricas Prometheus en formato texto plano', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.body).toContain('politecnica_asbanc_');
    });
  });

  describe('2. Autenticación y Emisión de Tokens (/api/Auth/token)', () => {
    it('debe rechazar credenciales inválidas con 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/Auth/token',
        payload: {
          client_id: 'bad_user',
          client_secret: 'bad_secret',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.codigoRespuesta).toBe('99');
      expect(body.descripcionResp).toContain('CREDENCIALES ASBANC INVALIDAS');
    });

    it('debe emitir token JWT válido con 200 y expiración de 24h', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/Auth/token',
        payload: {
          client_id: env.ASBANC_CLIENT_ID,
          client_secret: env.ASBANC_CLIENT_SECRET,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.codigoRespuesta).toBe('00');
      expect(body.token_type).toBe('Bearer');
      expect(typeof body.access_token).toBe('string');
      expect(body.expires_in).toBe(86400);
    });

    it('debe soportar credenciales mediante cabecera Basic Auth', async () => {
      const credentials = Buffer.from(`${env.ASBANC_CLIENT_ID}:${env.ASBANC_CLIENT_SECRET}`).toString('base64');
      const res = await app.inject({
        method: 'POST',
        url: '/api/Auth/token',
        headers: {
          authorization: `Basic ${credentials}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.codigoRespuesta).toBe('00');
      expect(typeof body.access_token).toBe('string');
    });
  });

  describe('3. Seguridad y Middleware Transaccional', () => {
    it('debe rechazar peticiones transaccionales sin cabecera Authorization con 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/Transactional/ValidateCustomer',
        payload: {
          tipoConsulta: '1',
          idConsulta: '10000001',
          codigoEmpresa: '998',
          codigoProducto: '001',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.codigoRespuesta).toBe('99');
    });

    it('debe autorizar peticiones con token JWT Bearer emitido', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/Transactional/ValidateCustomer',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        payload: {
          tipoConsulta: '1',
          idConsulta: '10000001',
          codigoEmpresa: '998',
          codigoProducto: '001',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.codigoRespuesta).toBe('00');
      expect(body.nombreCliente).toBe('JUAN PEREZ ROJAS');
    });

    it('debe soportar URLs tanto en minúsculas como en mayúsculas (caseSensitive: false)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactional/validatecustomer',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        payload: {
          tipoConsulta: '1',
          idConsulta: '10000001',
          codigoEmpresa: '998',
          codigoProducto: '001',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.codigoRespuesta).toBe('00');
      expect(body.nombreCliente).toBe('JUAN PEREZ ROJAS');
    });
  });

  describe('4. Auditoría Forense (/api/Audit)', () => {
    it('GET /api/Audit debe retornar lista paginada con filtros', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/Audit?page=1&limit=5',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('GET /api/Audit/export con format=csv debe retornar archivo CSV con Content-Disposition', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/Audit/export?format=csv&limit=10',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename="auditoria_asbanc_');
      expect(res.body).toContain('TraceId');
    });

    it('GET /api/Audit/export con format=json debe retornar array JSON estructurado', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/Audit/export?format=json&limit=5',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('5. Manejo de Errores y Casos Límite', () => {
    it('debe retornar 404 con código 99 para rutas inexistentes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/RutaNoExistente',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.codigoRespuesta).toBe('99');
      expect(body.descripcionResp).toContain('RUTA NO ENCONTRADA');
    });

    it('debe responder 400 con código 99 para JSON malformado', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/Auth/token',
        headers: {
          'content-type': 'application/json',
        },
        payload: '{"malformed_json: missing_brace',
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.codigoRespuesta).toBe('99');
      expect(body.descripcionResp).toContain('PETICION INVALIDA');
    });
  });

  describe('6. Parámetro GET metrics en Endpoints', () => {
    it('GET /health?metrics=true debe retornar elemento metrics con responseTimeMs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health?metrics=true',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('metrics');
      expect(typeof body.metrics.responseTimeMs).toBe('number');
      expect(body.metrics.unit).toBe('ms');
      expect(typeof body.responseTimeMs).toBe('number');
      expect(res.headers['x-response-time-ms']).toBeDefined();
    });

    it('POST /api/Transactional/ValidateCustomer?metrics debe retornar metrics en la respuesta de la transacción', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/Transactional/ValidateCustomer?metrics=true',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        payload: {
          tipoConsulta: '1',
          idConsulta: '10000001',
          codigoEmpresa: '998',
          codigoProducto: '001',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.codigoRespuesta).toBe('00');
      expect(body).toHaveProperty('metrics');
      expect(typeof body.metrics.responseTimeMs).toBe('number');
      expect(body.metrics.unit).toBe('ms');
      expect(typeof body.responseTimeMs).toBe('number');
      expect(body.nombreCliente).toBe('JUAN PEREZ ROJAS');
    });

    it('POST /api/Auth/token?metrics debe incluir metrics en la emisión del token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/Auth/token?metrics=1',
        payload: {
          client_id: env.ASBANC_CLIENT_ID,
          client_secret: env.ASBANC_CLIENT_SECRET,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('metrics');
      expect(typeof body.metrics.responseTimeMs).toBe('number');
    });

    it('sin parámetro metrics NO debe incluir elemento metrics (estándar ASBANC limpio)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/Transactional/ValidateCustomer',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        payload: {
          tipoConsulta: '1',
          idConsulta: '10000001',
          codigoEmpresa: '998',
          codigoProducto: '001',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.metrics).toBeUndefined();
      expect(body.responseTimeMs).toBeUndefined();
    });
  });
});
