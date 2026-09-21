import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { performance } from 'node:perf_hooks';
import { env } from '../src/config/env.js';
import { webhookService } from '../src/core/services/webhook.service.js';
import { closeMssqlPool, getMssqlPool } from '../src/infrastructure/database/mssql.connection.js';
import { buildServer } from '../src/server.js';

interface TransactionBenchmark {
  studentIndex: number;
  codigoAlumno: string;
  nombre: string;
  deudaId: string;
  monto: number;
  numOpBanco: string;
  numOpERP: string;
  // Latencias en milisegundos (ms)
  timeValidateMs: number;
  timeListDebtMs: number;
  timePayDebtMs: number;
  timeCheckIdempotenceMs: number;
  timeReversePayMs: number;
  totalCycleTimeMs: number;
  slaCompliant: boolean;
}

describe('Batería de Pruebas Vitest: 5 Transacciones Bancarias Completas (ASBANC FTR / BDACADEMICO6)', () => {
  let app: FastifyInstance;
  let authToken: string;

  // 5 Estudiantes con deudas pendientes en BDACADEMICO6
  const targetStudents = [
    { codigoAlumno: '26023353010012', dni: '74202604', nombre: 'MARTHA ORTEGA' },
    { codigoAlumno: '26023355010008', dni: '29612370', nombre: 'ZULLY AURORA VELARDE' },
    { codigoAlumno: '26023356010013', dni: '75480329', nombre: 'WALDIR CLAUDIO LIZARAZO' },
    { codigoAlumno: '26023351010005', dni: '48036844', nombre: 'FLAVIA SILVANA GOMEZ' },
    { codigoAlumno: '26023352010049', dni: '10042636', nombre: 'EDGARDO FELIX TINEO' },
  ];

  const benchmarks: TransactionBenchmark[] = [];

  beforeAll(async () => {
    await getMssqlPool();
    app = buildServer();
    await app.ready();

    // Autenticación: Emitir token OAuth 2.0 / JWT
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

    // Imprimir reporte de rendimiento y tiempos por transacción
    console.log('\n========================================================================================================');
    console.log('⏱️  REPORTE DE TIEMPOS DE RESPUESTA - BATERÍA DE 5 TRANSACCIONES (BDACADEMICO6)');
    console.log('========================================================================================================');

    console.table(
      benchmarks.map((b) => ({
        'Txn #': b.studentIndex,
        'Cód. Alumno': b.codigoAlumno,
        'Nombre': b.nombre,
        'Cuota ID': b.deudaId,
        'Monto (S/)': b.monto.toFixed(2),
        '1. Validar': `${b.timeValidateMs} ms`,
        '2. Listar': `${b.timeListDebtMs} ms`,
        '3. Pagar': `${b.timePayDebtMs} ms`,
        '4. Idempotencia': `${b.timeCheckIdempotenceMs} ms`,
        '5. Revertir': `${b.timeReversePayMs} ms`,
        'Total Ciclo': `${b.totalCycleTimeMs} ms`,
        'SLA (<3s)': b.slaCompliant ? '✅ CUMPLE' : '❌ VIOLACIÓN',
      }))
    );

    const calcAvg = (key: keyof TransactionBenchmark) =>
      (benchmarks.reduce((acc, curr) => acc + (curr[key] as number), 0) / benchmarks.length).toFixed(1);

    // Verificación final de base de datos intacta (cero registros residuales)
    const pool = await getMssqlPool();
    const residualCheck = await pool.request().query(
      "SELECT COUNT(*) AS c FROM Ctas_Ctes.Alumno_Pago_Detalle WHERE created_by = 'ASBANC_FTR'"
    );
    expect(residualCheck.recordset[0].c).toBe(0);
    console.log('🔒 Verificación de Integridad: 0 registros residuales en Ctas_Ctes.Alumno_Pago_Detalle (Base de datos 100% intacta).');

    console.log('📊 Resumen Estadístico Promedio por Transacción:');
    console.log(`   • 1. Validar Cliente    (ValidateCustomer) : ${calcAvg('timeValidateMs')} ms`);
    console.log(`   • 2. Listar Deuda       (ListDebts)        : ${calcAvg('timeListDebtMs')} ms`);
    console.log(`   • 3. Ejecutar y Pagar   (PayDebt)          : ${calcAvg('timePayDebtMs')} ms`);
    console.log(`   • 4. Re-check / Idemp.  (PayDebt dup)      : ${calcAvg('timeCheckIdempotenceMs')} ms`);
    console.log(`   • 5. Reversión / Extorno(ReversePay)       : ${calcAvg('timeReversePayMs')} ms`);
    console.log(`   • Tiempo Total Ciclo Promedio              : ${calcAvg('totalCycleTimeMs')} ms`);
    console.log('========================================================================================================\n');
  });

  // Ejecutar el ciclo para cada una de las 5 transacciones
  targetStudents.forEach((student, idx) => {
    describe(`Transacción #${idx + 1}: ${student.codigoAlumno} - ${student.nombre}`, () => {
      const benchmark: TransactionBenchmark = {
        studentIndex: idx + 1,
        codigoAlumno: student.codigoAlumno,
        nombre: student.nombre,
        deudaId: '',
        monto: 0,
        numOpBanco: '',
        numOpERP: '',
        timeValidateMs: 0,
        timeListDebtMs: 0,
        timePayDebtMs: 0,
        timeCheckIdempotenceMs: 0,
        timeReversePayMs: 0,
        totalCycleTimeMs: 0,
        slaCompliant: true,
      };

      it(`1. ValidateCustomer: validar existencia de estudiante por código`, async () => {
        const t0 = performance.now();
        const res = await app.inject({
          method: 'POST',
          url: '/api/Transactional/ValidateCustomer',
          headers: { authorization: authToken },
          payload: {
            tipoConsulta: '0', // 0 = Código de alumno
            idConsulta: student.codigoAlumno,
            codigoEmpresa: '998',
            codigoProducto: '001',
          },
        });
        const elapsed = Math.round(performance.now() - t0);
        benchmark.timeValidateMs = elapsed;

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.codigoRespuesta).toBe('00');
        expect(body.nombreCliente).toBeDefined();
        expect(elapsed).toBeLessThan(3000); // SLA ASBANC < 3s
      });

      it(`2. ListDebts: listar la deuda más antigua pendiente`, async () => {
        const t0 = performance.now();
        const res = await app.inject({
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
        const elapsed = Math.round(performance.now() - t0);
        benchmark.timeListDebtMs = elapsed;

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.codigoRespuesta).toBe('00');
        expect(body.deudasPendientes).toBeInstanceOf(Array);
        expect(body.deudasPendientes.length).toBe(1);

        const debt = body.deudasPendientes[0];
        expect(debt.numDocumento).toBeDefined();
        expect(debt.deuda).toBeGreaterThan(0);

        benchmark.deudaId = debt.numDocumento;
        benchmark.monto = debt.deuda;
        expect(elapsed).toBeLessThan(3000); // SLA ASBANC < 3s
      });

      it(`3. PayDebt: ejecutar y pagar la deuda (transacción ACID en MSSQL)`, async () => {
        expect(benchmark.deudaId).toBeDefined();
        const numOpBanco = 'OP' + Date.now().toString().slice(-6) + (idx + 1).toString().padStart(2, '0');
        benchmark.numOpBanco = numOpBanco;

        const webhookSpy = vi.spyOn(webhookService, 'dispatchPaymentWebhook');

        const t0 = performance.now();
        const res = await app.inject({
          method: 'POST',
          url: '/api/Transactional/PayDebt',
          headers: { authorization: authToken },
          payload: {
            fechaTxn: '14092026',
            horaTxn: '150000',
            canalPago: '10',
            codigoBanco: '1020',
            numOperacionBanco: numOpBanco,
            formaPago: '01',
            tipoConsulta: '0',
            idConsulta: student.codigoAlumno,
            codigoProducto: '001',
            numDocumento: benchmark.deudaId,
            importePagado: benchmark.monto,
            monedaDoc: '1',
            codigoEmpresa: '998',
          },
        });
        const elapsed = Math.round(performance.now() - t0);
        benchmark.timePayDebtMs = elapsed;

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.codigoRespuesta).toBe('00');
        expect(body.numOperacionERP).toBeDefined();
        benchmark.numOpERP = body.numOperacionERP;

        // Validar webhook placeholder
        expect(webhookSpy).toHaveBeenCalled();
        webhookSpy.mockRestore();

        expect(elapsed).toBeLessThan(3000); // SLA ASBANC < 3s
      });

      it(`4. Idempotencia: verificar que la deuda está cancelada y no permite doble cobro`, async () => {
        const t0 = performance.now();
        const retryRes = await app.inject({
          method: 'POST',
          url: '/api/Transactional/PayDebt',
          headers: { authorization: authToken },
          payload: {
            fechaTxn: '14092026',
            horaTxn: '150000',
            canalPago: '10',
            codigoBanco: '1020',
            numOperacionBanco: benchmark.numOpBanco,
            formaPago: '01',
            tipoConsulta: '0',
            idConsulta: student.codigoAlumno,
            codigoProducto: '001',
            numDocumento: benchmark.deudaId,
            importePagado: benchmark.monto,
            monedaDoc: '1',
            codigoEmpresa: '998',
          },
        });
        const elapsed = Math.round(performance.now() - t0);
        benchmark.timeCheckIdempotenceMs = elapsed;

        expect(retryRes.statusCode).toBe(200);
        const retryBody = JSON.parse(retryRes.body);
        expect(retryBody.codigoRespuesta).toBe('00');
        expect(retryBody.descripcionResp).toContain('IDEMPOTENTE');

        // Además, verificar que la deuda ya no figura como la más antigua pendiente
        const listAgainRes = await app.inject({
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
        const listAgainBody = JSON.parse(listAgainRes.body);
        if (listAgainBody.codigoRespuesta === '00') {
          expect(listAgainBody.deudasPendientes[0].numDocumento).not.toBe(benchmark.deudaId);
        } else {
          expect(listAgainBody.codigoRespuesta).toBe('22');
        }

        expect(elapsed).toBeLessThan(3000);
      });

      it(`5. ReversePay: revertir el pago y restaurar el estado original en la base de datos`, async () => {
        const t0 = performance.now();
        const revRes = await app.inject({
          method: 'POST',
          url: '/api/Transactional/ReversePay',
          headers: { authorization: authToken },
          payload: {
            fechaTxn: '14092026',
            horaTxn: '150500',
            codigoBanco: '1020',
            numOperacionBanco: benchmark.numOpBanco,
            numDocumento: benchmark.deudaId,
            codigoEmpresa: '998',
          },
        });
        const elapsed = Math.round(performance.now() - t0);
        benchmark.timeReversePayMs = elapsed;

        expect(revRes.statusCode).toBe(200);
        const revBody = JSON.parse(revRes.body);
        expect(revBody.codigoRespuesta).toBe('00');

        // Confirmar restauración completa
        const verifyRestore = await app.inject({
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
        const verifyRestoreBody = JSON.parse(verifyRestore.body);
        expect(verifyRestoreBody.codigoRespuesta).toBe('00');
        expect(verifyRestoreBody.deudasPendientes[0].numDocumento).toBe(benchmark.deudaId);

        // Confirmar que el detalle bancario fue eliminado y no quedó huella
        const checkDetalle = await (await getMssqlPool()).request()
          .input('NumOpBanco', benchmark.numOpBanco)
          .query('SELECT COUNT(*) AS c FROM Ctas_Ctes.Alumno_Pago_Detalle WHERE num_documento = @NumOpBanco');
        expect(checkDetalle.recordset[0].c).toBe(0);

        // Resumen del ciclo
        benchmark.totalCycleTimeMs =
          benchmark.timeValidateMs +
          benchmark.timeListDebtMs +
          benchmark.timePayDebtMs +
          benchmark.timeCheckIdempotenceMs +
          benchmark.timeReversePayMs;

        benchmarks.push(benchmark);
      });
    });
  });
});
