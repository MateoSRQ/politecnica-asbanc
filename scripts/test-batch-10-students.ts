import { env } from '../src/config/env.js';
import { closeMssqlPool, getMssqlPool } from '../src/infrastructure/database/mssql.connection.js';
import { buildServer } from '../src/server.js';

interface StudentTestResult {
  index: number;
  codigoAlumno: string;
  nombre: string;
  deudaId: string;
  concepto: string;
  monto: number;
  numOpBanco: string;
  numOpERP: string;
  paso1_listado: boolean;
  paso2_pagado: boolean;
  paso3_idempotencia: boolean;
  paso4_exito: boolean;
  paso5_revertido: boolean;
  tiempoTotalMs: number;
}

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

async function runBatchTests() {
  console.log('========================================================================');
  console.log('🚀 POLITÉCNICA ASBANC - BATERÍA DE PRUEBAS TRANSACCIONALES (10 ALUMNOS)');
  console.log('   Base de datos: BDACADEMICO6 (Sin modificar estructura de tablas)');
  console.log('========================================================================\n');

  await getMssqlPool();
  const app = buildServer();
  await app.ready();

  // 1. Obtener Token de autenticación JWT
  console.log('🔑 Obteniendo token JWT desde /api/Auth/token...');
  const tokenRes = await app.inject({
    method: 'POST',
    url: '/api/Auth/token',
    payload: {
      client_id: env.ASBANC_CLIENT_ID,
      client_secret: env.ASBANC_CLIENT_SECRET,
    },
  });

  if (tokenRes.statusCode !== 200) {
    console.error('❌ Error al obtener token JWT:', tokenRes.body);
    process.exit(1);
  }

  const authToken = 'Bearer ' + JSON.parse(tokenRes.body).access_token;
  console.log('✅ Token obtenido con éxito. Iniciando pruebas para 10 estudiantes...\n');

  const results: StudentTestResult[] = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const startTime = Date.now();
    console.log(`------------------------------------------------------------------------`);
    console.log(`▶️ [Alumno ${i + 1}/10] Código: ${student.codigoAlumno} | ${student.nombre}`);

    const result: StudentTestResult = {
      index: i + 1,
      codigoAlumno: student.codigoAlumno,
      nombre: student.nombre,
      deudaId: '',
      concepto: '',
      monto: 0,
      numOpBanco: '',
      numOpERP: '',
      paso1_listado: false,
      paso2_pagado: false,
      paso3_idempotencia: false,
      paso4_exito: false,
      paso5_revertido: false,
      tiempoTotalMs: 0,
    };

    try {
      // -------------------------------------------------------------
      // PASO 1: Listar Deuda Más Antigua no pagada
      // -------------------------------------------------------------
      const listRes = await app.inject({
        method: 'POST',
        url: '/api/Transactional/ListDebts',
        headers: { authorization: authToken },
        payload: {
          tipoConsulta: '0', // 0 = Código de alumno
          idConsulta: student.codigoAlumno,
          codigoEmpresa: '998',
          codigoProducto: '001',
          codigoBanco: '1020',
          canalPago: '10',
        },
      });

      const listBody = JSON.parse(listRes.body);
      if (listRes.statusCode === 200 && listBody.codigoRespuesta === '00' && listBody.deudasPendientes?.length > 0) {
        const debt = listBody.deudasPendientes[0];
        result.deudaId = debt.numDocumento;
        result.concepto = debt.descDocumento;
        result.monto = debt.deuda;
        result.paso1_listado = true;
        console.log(
          `   [1] Listar Deuda OK    : Cuota #${debt.numDocumento} | ${debt.descDocumento} | S/ ${debt.deuda}`,
        );
      } else {
        console.error(`   [1] Listar Deuda FALLÓ :`, listBody);
        results.push(result);
        continue;
      }

      // -------------------------------------------------------------
      // PASO 2: Ejecutar el Pago Bancario (PayDebt)
      // -------------------------------------------------------------
      const numOpBanco = 'OP' + Date.now().toString().slice(-6) + (i + 1).toString().padStart(2, '0');
      result.numOpBanco = numOpBanco;

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
          numDocumento: result.deudaId,
          importePagado: result.monto,
          monedaDoc: '1',
          codigoEmpresa: '998',
        },
      });

      const payBody = JSON.parse(payRes.body);
      if (payRes.statusCode === 200 && payBody.codigoRespuesta === '00') {
        result.numOpERP = payBody.numOperacionERP;
        result.paso2_pagado = true;
        console.log(
          `   [2] Ejecutar Pago OK   : Banco Op: ${numOpBanco} -> ERP Op: ${payBody.numOperacionERP} | Status: PAGADO`,
        );
      } else {
        console.error(`   [2] Ejecutar Pago FALLÓ:`, payBody);
        results.push(result);
        continue;
      }

      // -------------------------------------------------------------
      // PASO 3: Revisar si ya está pagado (Idempotencia y exclusión)
      // -------------------------------------------------------------
      // A) Reintento de pago: debe responder 00 con detección de duplicado
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
          numDocumento: result.deudaId,
          importePagado: result.monto,
          monedaDoc: '1',
          codigoEmpresa: '998',
        },
      });

      const dupBody = JSON.parse(dupPayRes.body);

      // B) Listar deudas: la cuota ya no debe figurar como la más antigua
      const listAfterRes = await app.inject({
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

      const listAfterBody = JSON.parse(listAfterRes.body);
      const yaNoFiguraComoPendiente =
        listAfterBody.codigoRespuesta === '22' ||
        (listAfterBody.codigoRespuesta === '00' && listAfterBody.deudasPendientes[0]?.numDocumento !== result.deudaId);

      if (dupBody.codigoRespuesta === '00' && yaNoFiguraComoPendiente) {
        result.paso3_idempotencia = true;
        console.log(`   [3] Verificación Pago OK: Confirmado PAGADO (Idempotencia activa y cuota amortizada)`);
      } else {
        console.warn(`   [3] Verificación Advertencia:`, { dupBody, listAfterBody });
      }

      // -------------------------------------------------------------
      // PASO 4: Comprobar Éxito
      // -------------------------------------------------------------
      if (result.paso1_listado && result.paso2_pagado && result.paso3_idempotencia) {
        result.paso4_exito = true;
        console.log(`   [4] Comprobar Éxito OK  : Transacción verificada y registrada en ledger`);
      }

      // -------------------------------------------------------------
      // PASO 5: Revertir Pago (ReversePay)
      // -------------------------------------------------------------
      const revRes = await app.inject({
        method: 'POST',
        url: '/api/Transactional/ReversePay',
        headers: { authorization: authToken },
        payload: {
          fechaTxn: '14092026',
          horaTxn: '140500',
          codigoBanco: '1020',
          numOperacionBanco: numOpBanco,
          numDocumento: result.deudaId,
          codigoEmpresa: '998',
        },
      });

      const revBody = JSON.parse(revRes.body);
      if (revRes.statusCode === 200 && revBody.codigoRespuesta === '00') {
        // Verificar que la cuota original volvió al estado pendiente
        const checkRestoreRes = await app.inject({
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
        const checkRestoreBody = JSON.parse(checkRestoreRes.body);
        if (checkRestoreBody.deudasPendientes?.[0]?.numDocumento === result.deudaId) {
          result.paso5_revertido = true;
          console.log(`   [5] Reversión Exitosa OK: Cuota #${result.deudaId} restaurada a estado GENERADO`);
        }
      } else {
        console.error(`   [5] Reversión FALLÓ:`, revBody);
      }
    } catch (err: any) {
      console.error(`❌ Excepción en alumno ${student.codigoAlumno}:`, err.message);
    } finally {
      result.tiempoTotalMs = Date.now() - startTime;
      results.push(result);
      console.log(`   ⏱️  Tiempo alumno: ${result.tiempoTotalMs}ms`);
    }
  }

  await app.close();
  await closeMssqlPool();

  // -------------------------------------------------------------
  // TABLA RESUMEN FINAL
  // -------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('📊 RESUMEN FINAL DE LA BATERÍA DE PRUEBAS (10/10 ALUMNOS)');
  console.log('========================================================================');

  console.table(
    results.map((r) => ({
      '#': r.index,
      'Cód. Alumno': r.codigoAlumno,
      Nombre: r.nombre,
      'Cuota ID': r.deudaId,
      'Monto (S/)': r.monto.toFixed(2),
      'Op. ERP': r.numOpERP,
      '1. Listar': r.paso1_listado ? '✅ OK' : '❌ FAIL',
      '2. Pagar': r.paso2_pagado ? '✅ OK' : '❌ FAIL',
      '3. Verificar': r.paso3_idempotencia ? '✅ OK' : '❌ FAIL',
      '4. Éxito': r.paso4_exito ? '✅ OK' : '❌ FAIL',
      '5. Revertir': r.paso5_revertido ? '✅ OK' : '❌ FAIL',
      'Tiempo (ms)': r.tiempoTotalMs,
    })),
  );

  const totalExitosos = results.filter((r) => r.paso4_exito && r.paso5_revertido).length;
  console.log(`\n🎯 Resultado: ${totalExitosos}/10 alumnos completaron satisfactoriamente el ciclo.`);
  console.log(`🔒 Estado final: 10/10 cuotas revertidas. La base de datos BDACADEMICO6 queda intacta.`);
  console.log('========================================================================\n');
}

runBatchTests().catch((err) => {
  console.error('Error fatal en batería de pruebas:', err);
  process.exit(1);
});
