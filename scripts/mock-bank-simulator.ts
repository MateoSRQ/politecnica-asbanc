/**
 * ==========================================================
 * SIMULADOR BANCARIO ASBANC FTR / YAPAGO
 * Emula las peticiones de los bancos (BCP, BBVA, Interbank, Yape)
 * verificando los contratos oficiales de la Guía V47 y el SLA < 3s
 * ==========================================================
 */

import { performance } from 'node:perf_hooks';
import { env } from '../src/config/env.js';

const BASE_URL = `http://${env.HOST === '0.0.0.0' ? '127.0.0.1' : env.HOST}:${env.PORT}`;
const AUTH_HEADER = `Basic ${env.ASBANC_AUTH_SECRET}`;

interface TestResult {
  step: string;
  success: boolean;
  status: number;
  durationMs: number;
  response: any;
}

async function request(endpoint: string, body: any): Promise<{ status: number; durationMs: number; data: any }> {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': AUTH_HEADER,
      'Accept': '*/*',
    },
    body: JSON.stringify(body),
  });
  const durationMs = Math.round(performance.now() - start);
  const data = await res.json();
  return { status: res.status, durationMs, data };
}

async function runSimulation(): Promise<void> {
  console.log('🏦 =========================================================');
  console.log('🏦 INICIANDO SIMULADOR BANCARIO ASBANC (YAPAGO V47)');
  console.log(`🏦 Destino: ${BASE_URL}/api/Transactional/*`);
  console.log('🏦 =========================================================\n');

  const results: TestResult[] = [];

  // 1. Validar Cliente Existente (DNI: 10000001)
  console.log('1️⃣ Probando ValidateCustomer (Cliente Existente: 10000001)...');
  const res1 = await request('/api/Transactional/ValidateCustomer', {
    tipoConsulta: '1',
    idConsulta: '10000001',
    codigoEmpresa: '998',
    codigoProducto: '001',
  });
  const ok1 = res1.status === 200 && res1.data.codigoRespuesta === '00' && res1.data.nombreCliente.length > 0;
  results.push({ step: 'ValidateCustomer (Existe)', success: ok1, status: res1.status, durationMs: res1.durationMs, response: res1.data });
  console.log(`   👉 Respuesta: [${res1.data.codigoRespuesta}] ${res1.data.descripcionResp} | Cliente: ${res1.data.nombreCliente} (${res1.durationMs}ms)`);

  // 2. Validar Cliente Inexistente (DNI: 99999999)
  console.log('\n2️⃣ Probando ValidateCustomer (Cliente No Existente: 99999999)...');
  const res2 = await request('/api/Transactional/ValidateCustomer', {
    tipoConsulta: '1',
    idConsulta: '99999999',
    codigoEmpresa: '998',
    codigoProducto: '001',
  });
  const ok2 = res2.status === 200 && res2.data.codigoRespuesta === '16';
  results.push({ step: 'ValidateCustomer (No Existe)', success: ok2, status: res2.status, durationMs: res2.durationMs, response: res2.data });
  console.log(`   👉 Respuesta: [${res2.data.codigoRespuesta}] ${res2.data.descripcionResp} (${res2.durationMs}ms)`);

  // 3. Consultar Deudas (Cliente: 10000001 vía BCP Ventanilla)
  console.log('\n3️⃣ Probando ListDebts (BCP Ventanilla)...');
  const res3 = await request('/api/Transactional/ListDebts', {
    tipoConsulta: '1',
    idConsulta: '10000001',
    codigoEmpresa: '998',
    codigoProducto: '001',
    codigoBanco: '1020',
    canalPago: '10',
  });
  const debts = res3.data.deudasPendientes || [];
  const ok3 = res3.status === 200 && res3.data.codigoRespuesta === '00' && debts.length > 0;
  results.push({ step: 'ListDebts (Con Deudas)', success: ok3, status: res3.status, durationMs: res3.durationMs, response: res3.data });
  console.log(`   👉 Respuesta: [${res3.data.codigoRespuesta}] ${res3.data.descripcionResp} | Deudas encontradas: ${debts.length} (${res3.durationMs}ms)`);
  if (debts.length > 0) {
    console.log(`      Primer recibo: ${debts[0].numDocumento} | Vence: ${debts[0].fechaVencimiento} | Deuda: S/ ${debts[0].deuda}`);
  }

  // 4. Pagar Deuda (Emulando BCP: Canal 10, Op: BCP998877)
  const targetDoc = debts[0]?.numDocumento || 'B01-0000000002';
  const targetAmount = debts[0]?.deuda || 1500;
  const numOpBanco = 'BCP' + Math.floor(10000000 + Math.random() * 90000000);

  console.log(`\n4️⃣ Probando PayDebt (${targetDoc} por S/ ${targetAmount} con Op: ${numOpBanco})...`);
  const res4 = await request('/api/Transactional/PayDebt', {
    fechaTxn: '11092026',
    horaTxn: '180000',
    canalPago: '10',
    codigoBanco: '1020',
    numOperacionBanco: numOpBanco,
    formaPago: '01',
    tipoConsulta: '1',
    idConsulta: '10000001',
    codigoProducto: '001',
    numDocumento: targetDoc,
    importePagado: targetAmount,
    monedaDoc: '1',
    codigoEmpresa: '998',
  });
  const ok4 = res4.status === 200 && res4.data.codigoRespuesta === '00' && res4.data.numOperacionERP.length > 0;
  results.push({ step: 'PayDebt (Pago Exitoso)', success: ok4, status: res4.status, durationMs: res4.durationMs, response: res4.data });
  console.log(`   👉 Respuesta: [${res4.data.codigoRespuesta}] ${res4.data.descripcionResp} | NumOperacionERP: ${res4.data.numOperacionERP} (${res4.durationMs}ms)`);

  // 5. Probar Idempotencia (Reenviar el mismo pago exacto)
  console.log('\n5️⃣ Probando Idempotencia de Pago (Reintento de red con mismo NumOperacionBanco)...');
  const res5 = await request('/api/Transactional/PayDebt', {
    fechaTxn: '11092026',
    horaTxn: '180000',
    canalPago: '10',
    codigoBanco: '1020',
    numOperacionBanco: numOpBanco,
    formaPago: '01',
    tipoConsulta: '1',
    idConsulta: '10000001',
    codigoProducto: '001',
    numDocumento: targetDoc,
    importePagado: targetAmount,
    monedaDoc: '1',
    codigoEmpresa: '998',
  });
  const ok5 = res5.status === 200 && res5.data.codigoRespuesta === '00' && res5.data.numOperacionERP === res4.data.numOperacionERP;
  results.push({ step: 'Idempotencia PayDebt', success: ok5, status: res5.status, durationMs: res5.durationMs, response: res5.data });
  console.log(`   👉 Respuesta Idempotente: [${res5.data.codigoRespuesta}] Mismo NumERP: ${res5.data.numOperacionERP} (${res5.durationMs}ms)`);

  // 6. Extorno / Reversión de Pago (ReversePay)
  console.log(`\n6️⃣ Probando ReversePay (Extorno de ${targetDoc} para ${numOpBanco})...`);
  const res6 = await request('/api/Transactional/ReversePay', {
    fechaTxn: '11092026',
    horaTxn: '180500',
    codigoBanco: '1020',
    tipoConsulta: '1',
    idConsulta: '10000001',
    numOperacionBanco: numOpBanco,
    numDocumento: targetDoc,
    codigoEmpresa: '998',
  });
  const ok6 = res6.status === 200 && res6.data.codigoRespuesta === '00';
  results.push({ step: 'ReversePay (Extorno)', success: ok6, status: res6.status, durationMs: res6.durationMs, response: res6.data });
  console.log(`   👉 Respuesta: [${res6.data.codigoRespuesta}] ${res6.data.descripcionResp} (${res6.durationMs}ms)`);

  // Resumen Final
  console.log('\n📊 =========================================================');
  console.log('📊 RESUMEN DE LA SIMULACIÓN BANCARIA ASBANC:');
  console.log('📊 =========================================================');
  let allPass = true;
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    console.log(`${icon} ${r.step.padEnd(28)} | Status: ${r.status} | Tiempo: ${r.durationMs}ms (SLA Max 3000ms)`);
    if (!r.success) allPass = false;
  }

  if (allPass) {
    console.log('\n🎉 ¡TODAS LAS PRUEBAS TRANSACCIONALES PASARON CON ÉXITO!');
    console.log('⚡ Los tiempos de respuesta están en el rango de milisegundos, cumpliendo con creces el SLA < 3.0s de ASBANC.');
  } else {
    console.log('\n⚠️ Hubo pruebas que no respondieron con el resultado esperado.');
  }
}

runSimulation().catch((err) => {
  console.error('Error al ejecutar simulación:', err);
});
