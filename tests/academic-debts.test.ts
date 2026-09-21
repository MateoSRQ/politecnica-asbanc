import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { env } from '../src/config/env.js';
import { webhookService } from '../src/core/services/webhook.service.js';
import { closeMssqlPool, getMssqlPool } from '../src/infrastructure/database/mssql.connection.js';
import { buildServer } from '../src/server.js';

describe('Requerimiento: Consulta de Deuda Más Antigua por Código de Alumno y Pago con Webhook', () => {
  let app: FastifyInstance;
  let authToken: string;

  // Estudiante de prueba real en BDACADEMICO6
  const testStudent = {
    codigoAlumno: '26023353010012',
    dni: '74202604',
    nombreEsperado: 'MARTHA ORTEGA RIOS',
  };

  beforeAll(async () => {
    await getMssqlPool();
    app = buildServer();
    await app.ready();

    // Obtener token JWT
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/Auth/token',
      payload: {
        client_id: env.ASBANC_CLIENT_ID,
        client_secret: env.ASBANC_CLIENT_SECRET,
      },
    });
    const tokenBody = JSON.parse(tokenRes.body);
    authToken = 'Bearer ' + tokenBody.access_token;
  });

  afterAll(async () => {
    await app.close();
    await closeMssqlPool();
  });

  it('1. ValidateCustomer debe reconocer al estudiante por código de alumno', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/Transactional/ValidateCustomer',
      headers: { authorization: authToken },
      payload: {
        tipoConsulta: '0', // 0 = Código de alumno
        idConsulta: testStudent.codigoAlumno,
        codigoEmpresa: '998',
        codigoProducto: '001',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.codigoRespuesta).toBe('00');
    expect(body.descripcionResp).toBe('OK');
    expect(body.nombreCliente).toContain('MARTHA ORTEGA RIOS');
  });

  it('2. ListDebts debe retornar ÚNICAMENTE la deuda más antigua no pagada, ordenada por periodo y cuota', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/Transactional/ListDebts',
      headers: { authorization: authToken },
      payload: {
        tipoConsulta: '0', // Por código de alumno
        idConsulta: testStudent.codigoAlumno,
        codigoEmpresa: '998',
        codigoProducto: '001',
        codigoBanco: '1020',
        canalPago: '10',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.codigoRespuesta).toBe('00');
    expect(body.deudasPendientes).toBeInstanceOf(Array);
    // Debe retornar la deuda más antigua (exactamente 1 concepto pendiente a pagar)
    expect(body.deudasPendientes.length).toBe(1);

    const deudaMasAntigua = body.deudasPendientes[0];
    expect(deudaMasAntigua.numDocumento).toBeDefined();
    expect(deudaMasAntigua.deuda).toBeGreaterThan(0);
    expect(deudaMasAntigua.fechaVencimiento).toBeDefined();
    expect(deudaMasAntigua.descDocumento).toBeDefined();
  });

  it('3. PayDebt debe marcar la cuota como pagada, invocar el webhook placeholder y retornar 00', async () => {
    // 3.1 Obtener la deuda más antigua actual
    const listRes = await app.inject({
      method: 'POST',
      url: '/api/Transactional/ListDebts',
      headers: { authorization: authToken },
      payload: {
        tipoConsulta: '0',
        idConsulta: testStudent.codigoAlumno,
        codigoEmpresa: '998',
        codigoProducto: '001',
        codigoBanco: '1020',
        canalPago: '10',
      },
    });
    const deuda = JSON.parse(listRes.body).deudasPendientes[0];
    const pagoId = deuda.numDocumento;

    // Espiar el Webhook Placeholder
    const webhookSpy = vi.spyOn(webhookService, 'dispatchPaymentWebhook');

    // 3.2 Realizar el pago en el banco
    const numOpBanco = 'OP' + Date.now().toString().slice(-8); // Max 12 chars
    const payRes = await app.inject({
      method: 'POST',
      url: '/api/Transactional/PayDebt',
      headers: { authorization: authToken },
      payload: {
        fechaTxn: '14092026',
        horaTxn: '120000',
        canalPago: '10',
        codigoBanco: '1020',
        numOperacionBanco: numOpBanco,
        formaPago: '01',
        tipoConsulta: '0',
        idConsulta: testStudent.codigoAlumno,
        codigoProducto: '001',
        numDocumento: pagoId,
        importePagado: deuda.deuda,
        monedaDoc: '1',
        codigoEmpresa: '998',
      },
    });

    expect(payRes.statusCode).toBe(200);
    const payBody = JSON.parse(payRes.body);
    expect(payBody.codigoRespuesta).toBe('00');
    expect(payBody.descripcionResp).toBe('OK');
    expect(payBody.numOperacionERP).toBeDefined();

    // 3.3 Validar que el webhook placeholder fue invocado con los datos de la deuda
    expect(webhookSpy).toHaveBeenCalled();
    const webhookArg = webhookSpy.mock.calls[0][0];
    expect(webhookArg.event).toBe('debt.payment.confirmed');
    expect(webhookArg.pagoId).toBe(parseInt(pagoId, 10));
    expect(webhookArg.codigoAlumno).toBe(testStudent.codigoAlumno);
    expect(webhookArg.numOperacionBanco).toBe(numOpBanco);

    // 3.4 Validar idempotencia: Reintentar el mismo pago con la misma operación
    const retryRes = await app.inject({
      method: 'POST',
      url: '/api/Transactional/PayDebt',
      headers: { authorization: authToken },
      payload: {
        fechaTxn: '14092026',
        horaTxn: '120000',
        canalPago: '10',
        codigoBanco: '1020',
        numOperacionBanco: numOpBanco,
        formaPago: '01',
        tipoConsulta: '0',
        idConsulta: testStudent.codigoAlumno,
        codigoProducto: '001',
        numDocumento: pagoId,
        importePagado: deuda.deuda,
        monedaDoc: '1',
        codigoEmpresa: '998',
      },
    });
    const retryBody = JSON.parse(retryRes.body);
    expect(retryBody.codigoRespuesta).toBe('00');
    expect(retryBody.descripcionResp).toContain('IDEMPOTENTE');

    // 3.5 Verificar que la siguiente consulta de ListDebts ahora retorna la SIGUIENTE deuda más antigua
    const nextDebtRes = await app.inject({
      method: 'POST',
      url: '/api/Transactional/ListDebts',
      headers: { authorization: authToken },
      payload: {
        tipoConsulta: '0',
        idConsulta: testStudent.codigoAlumno,
        codigoEmpresa: '998',
        codigoProducto: '001',
        codigoBanco: '1020',
        canalPago: '10',
      },
    });
    const nextBody = JSON.parse(nextDebtRes.body);
    expect(nextBody.codigoRespuesta).toBe('00');
    // El documento ya no debe ser el que acabamos de pagar
    expect(nextBody.deudasPendientes[0].numDocumento).not.toBe(pagoId);

    // 3.6 Limpieza / Restauración (ReversePay para dejar la base de datos intacta)
    const reverseRes = await app.inject({
      method: 'POST',
      url: '/api/Transactional/ReversePay',
      headers: { authorization: authToken },
      payload: {
        fechaTxn: '14092026',
        horaTxn: '120500',
        codigoBanco: '1020',
        numOperacionBanco: numOpBanco,
        numDocumento: pagoId,
        codigoEmpresa: '998',
      },
    });
    expect(reverseRes.statusCode).toBe(200);
    const reverseBody = JSON.parse(reverseRes.body);
    expect(reverseBody.codigoRespuesta).toBe('00');

    webhookSpy.mockRestore();
  });
});
