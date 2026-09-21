import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { env } from '../src/config/env.js';
import { webhookService } from '../src/core/services/webhook.service.js';
import { closeMssqlPool, getMssqlPool } from '../src/infrastructure/database/mssql.connection.js';
import { buildServer } from '../src/server.js';

describe('Batería de Pruebas HTTP: Ciclo Completo de Pago para 10 Alumnos', () => {
  let app: FastifyInstance;
  let authToken: string;

  // Lista de 10 estudiantes reales en BDACADEMICO6 con cuotas pendientes
  const students = [
    { codigoAlumno: '26023353010012', dni: '74202604', nombre: 'MARTHA ORTEGA' },
    { codigoAlumno: '26023355010008', dni: '29612370', nombre: 'ZULLY AURORA VELARDE' },
    { codigoAlumno: '26023356010013', dni: '75480329', nombre: 'WALDIR CLAUDIO LIZARAZO' },
    { codigoAlumno: '26023351010005', dni: '48036844', nombre: 'FLAVIA SILVANA GOMEZ' },
    { codigoAlumno: '26023352010049', dni: '10042636', nombre: 'EDGARDO FELIX TINEO' },
    { codigoAlumno: '26023353010005', dni: '41460153', nombre: 'PERCY RICHARD BOLIVAR' },
    { codigoAlumno: '26023355010010', dni: '46199320', nombre: 'KAROL BRIGITTE HUAMANI' },
    { codigoAlumno: '26023356010010', dni: '71737047', nombre: 'JUAN DIEGO SANDOVAL' },
    { codigoAlumno: '26023352010001', dni: '72016837', nombre: 'RAUL MIGUEL ENCISO' },
    { codigoAlumno: '26023356010020', dni: '47968187', nombre: 'EDUARDO GUSTAVO POMA' },
  ];

  beforeAll(async () => {
    await getMssqlPool();
    app = buildServer();
    await app.ready();

    // 0. Autenticación: Obtener token JWT válido
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/Auth/token',
      payload: {
        client_id: env.ASBANC_CLIENT_ID,
        client_secret: env.ASBANC_CLIENT_SECRET,
      },
    });

    expect(tokenRes.statusCode).toBe(200);
    const tokenBody = JSON.parse(tokenRes.body);
    expect(tokenBody.access_token).toBeDefined();
    authToken = 'Bearer ' + tokenBody.access_token;
  });

  afterAll(async () => {
    await app.close();
    await closeMssqlPool();
  });

  // Ejecutar el ciclo completo para cada uno de los 10 alumnos
  students.forEach((student, index) => {
    describe(`Alumno #${index + 1}: ${student.codigoAlumno} (${student.nombre})`, () => {
      let originalDebtId: string;
      let debtAmount: number;
      let numOpBanco: string;

      it(`1. Listar pagos pendientes: debe retornar la deuda más antigua no pagada`, async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/Transactional/ListDebts',
          headers: { authorization: authToken },
          payload: {
            tipoConsulta: '0', // Consulta por código de alumno
            idConsulta: student.codigoAlumno,
            codigoEmpresa: '998',
            codigoProducto: '001',
            codigoBanco: '1020',
            canalPago: '10',
          },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.codigoRespuesta).toBe('00');
        expect(body.descripcionResp).toBe('OK');
        expect(body.deudasPendientes).toBeInstanceOf(Array);
        expect(body.deudasPendientes.length).toBe(1);

        const oldestDebt = body.deudasPendientes[0];
        expect(oldestDebt.numDocumento).toBeDefined();
        expect(oldestDebt.deuda).toBeGreaterThan(0);

        originalDebtId = oldestDebt.numDocumento;
        debtAmount = oldestDebt.deuda;
      });

      it(`2. Ejecutar el pago: debe aplicar el pago atómicamente y notificar webhook placeholder`, async () => {
        expect(originalDebtId).toBeDefined();
        numOpBanco = 'OP' + Date.now().toString().slice(-6) + (index + 1).toString().padStart(2, '0');

        const webhookSpy = vi.spyOn(webhookService, 'dispatchPaymentWebhook');

        const payRes = await app.inject({
          method: 'POST',
          url: '/api/Transactional/PayDebt',
          headers: { authorization: authToken },
          payload: {
            fechaTxn: '14092026',
            horaTxn: '140000',
            canalPago: '10',
            codigoBanco: '1020',
            numOperacionBanco: numOpBanco,
            formaPago: '01',
            tipoConsulta: '0',
            idConsulta: student.codigoAlumno,
            codigoProducto: '001',
            numDocumento: originalDebtId,
            importePagado: debtAmount,
            monedaDoc: '1',
            codigoEmpresa: '998',
          },
        });

        expect(payRes.statusCode).toBe(200);
        const payBody = JSON.parse(payRes.body);
        expect(payBody.codigoRespuesta).toBe('00');
        expect(payBody.descripcionResp).toBe('OK');
        expect(payBody.numOperacionERP).toBeDefined();
        expect(payBody.nombreCliente).toBeDefined();

        // 4. Comprobar el éxito: verificar despacho de webhook
        expect(webhookSpy).toHaveBeenCalled();
        const callArg = webhookSpy.mock.calls[0][0];
        expect(callArg.event).toBe('debt.payment.confirmed');
        expect(callArg.pagoId).toBe(parseInt(originalDebtId, 10));
        expect(callArg.codigoAlumno).toBe(student.codigoAlumno);
        expect(callArg.numOperacionBanco).toBe(numOpBanco);

        webhookSpy.mockRestore();
      });

      it(`3. Revisar si ya está pagado: validar idempotencia y exclusión de la deuda en ListDebts`, async () => {
        // A) Intentar pagar nuevamente con la misma operación bancaria (Idempotencia)
        const dupPayRes = await app.inject({
          method: 'POST',
          url: '/api/Transactional/PayDebt',
          headers: { authorization: authToken },
          payload: {
            fechaTxn: '14092026',
            horaTxn: '140000',
            canalPago: '10',
            codigoBanco: '1020',
            numOperacionBanco: numOpBanco,
            formaPago: '01',
            tipoConsulta: '0',
            idConsulta: student.codigoAlumno,
            codigoProducto: '001',
            numDocumento: originalDebtId,
            importePagado: debtAmount,
            monedaDoc: '1',
            codigoEmpresa: '998',
          },
        });

        expect(dupPayRes.statusCode).toBe(200);
        const dupBody = JSON.parse(dupPayRes.body);
        expect(dupBody.codigoRespuesta).toBe('00');
        expect(dupBody.descripcionResp).toContain('IDEMPOTENTE');

        // B) Consultar deudas pendientes: la cuota pagada ya NO debe ser la deuda más antigua
        const listAfterPayRes = await app.inject({
          method: 'POST',
          url: '/api/Transactional/ListDebts',
          headers: { authorization: authToken },
          payload: {
            tipoConsulta: '0',
            idConsulta: student.codigoAlumno,
            codigoEmpresa: '998',
            codigoProducto: '001',
            codigoBanco: '1020',
            canalPago: '10',
          },
        });

        const listAfterBody = JSON.parse(listAfterPayRes.body);
        if (listAfterBody.codigoRespuesta === '00') {
          // Si tiene más deudas pendientes, el id debe ser diferente al que acabamos de pagar
          expect(listAfterBody.deudasPendientes[0].numDocumento).not.toBe(originalDebtId);
        } else {
          // Si no tiene más deudas pendientes, debe devolver código 22
          expect(listAfterBody.codigoRespuesta).toBe('22');
        }
      });

      it(`5. Revertir el pago: restaurar cuota a pendiente y dejar base de datos intacta`, async () => {
        const revRes = await app.inject({
          method: 'POST',
          url: '/api/Transactional/ReversePay',
          headers: { authorization: authToken },
          payload: {
            fechaTxn: '14092026',
            horaTxn: '140500',
            codigoBanco: '1020',
            numOperacionBanco: numOpBanco,
            numDocumento: originalDebtId,
            codigoEmpresa: '998',
          },
        });

        expect(revRes.statusCode).toBe(200);
        const revBody = JSON.parse(revRes.body);
        expect(revBody.codigoRespuesta).toBe('00');
        expect(revBody.descripcionResp).toBe('OK');

        // Comprobación final: ListDebts debe retornar nuevamente la deuda original
        const finalListRes = await app.inject({
          method: 'POST',
          url: '/api/Transactional/ListDebts',
          headers: { authorization: authToken },
          payload: {
            tipoConsulta: '0',
            idConsulta: student.codigoAlumno,
            codigoEmpresa: '998',
            codigoProducto: '001',
            codigoBanco: '1020',
            canalPago: '10',
          },
        });

        const finalBody = JSON.parse(finalListRes.body);
        expect(finalBody.codigoRespuesta).toBe('00');
        expect(finalBody.deudasPendientes[0].numDocumento).toBe(originalDebtId);
      });
    });
  });
});
