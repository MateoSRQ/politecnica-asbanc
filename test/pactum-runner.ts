import pactum from 'pactum';
import fs from 'node:fs';
import path from 'node:path';
import { testConfig } from './config.js';

pactum.settings.setLogLevel('SILENT');

export interface TransactionRecord {
  id: string;
  index: number;
  timestamp: string;
  targetUrl: string;
  codigoBanco: string;
  bancoNombre: string;
  canalPago: string;
  tipoConsulta: string;
  idConsulta: string;
  studentName?: string;
  numOperacionBanco: string;
  numDocumento: string;
  importePagado: number;
  codigoEmpresa: string;
  fechaTxn: string;
  horaTxn: string;
  httpStatus: number;
  codigoRespuesta: string;
  descripcionResp: string;
  numOperacionERP?: string;
  responseTimeMs: number;
  status: 'SUCCESS' | 'ERROR' | 'REVERTED' | 'NOT_APPLICABLE';
  revertable: boolean;
  reversalTimeMs?: number;
  reversalResponseCode?: string;
  requestDetails?: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: any;
  };
  responseDetails?: {
    statusCode: number;
    body: any;
  };
  details?: {
    validationTimeMs?: number;
    listDebtsTimeMs?: number;
    payDebtTimeMs?: number;
  };
}

export interface BatchSummary {
  total: number;
  successCount: number;
  errorCount: number;
  revertedCount: number;
  slaCompliancePercent: number;
  totalDurationMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  p95TimeMs: number;
}

const poolPath = path.resolve(process.cwd(), 'test/pool/payloads.json');
const studentsPath = path.resolve(process.cwd(), 'test/pool/students.json');

let payloadsPool: any[] = [];
let studentsPool: any[] = [];

try {
  payloadsPool = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
} catch {
  payloadsPool = [];
}

try {
  studentsPool = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
} catch {
  studentsPool = [];
}

export function getAsbancDateTime() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const secs = String(now.getSeconds()).padStart(2, '0');

  return {
    fechaTxn: `${day}${month}${year}`,
    horaTxn: `${hours}${mins}${secs}`,
  };
}

export function generateNumOperacionBanco(index: number = 0): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  const tail = (Date.now() % 1000000).toString().padStart(6, '0');
  return `PAC${tail}${rand}`.slice(0, 12);
}

export class PactumRunner {
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  async checkHealth(
    targetUrl: string = testConfig.targetUrl,
  ): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const res = await fetch(`${targetUrl}/health`, {
        signal: AbortSignal.timeout(2500),
      });
      return { ok: res.status === 200, status: res.status };
    } catch (err: any) {
      return { ok: false, error: err.cause?.code || err.code || err.message };
    }
  }

  async obtainToken(targetUrl: string = testConfig.targetUrl): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiry) {
      return this.cachedToken;
    }

    try {
      const spec = pactum.spec();
      const res = await spec
        .post(`${targetUrl}/api/Auth/token`)
        .withHeaders('Content-Type', 'application/json')
        .withJson({
          grant_type: 'client_credentials',
          client_id: testConfig.clientId,
          client_secret: testConfig.clientSecret,
        })
        .toss();

      if (res.statusCode === 200 && res.body?.access_token) {
        this.cachedToken = res.body.access_token;
        this.tokenExpiry = Date.now() + 23 * 3600 * 1000;
        return this.cachedToken;
      }
    } catch {
    }

    return testConfig.authSecret || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NDgxMjEyMDMsImlzcyI6Imlz';
  }

  async validateCustomer(targetUrl: string, token: string, idConsulta: string, tipoConsulta: string = '1') {
    const spec = pactum.spec();
    const start = performance.now();
    try {
      const res = await spec
        .post(`${targetUrl}/api/Transactional/ValidateCustomer`)
        .withHeaders('Authorization', `Bearer ${token}`)
        .withHeaders('Content-Type', 'application/json')
        .withJson({
          tipoConsulta,
          idConsulta,
          codigoEmpresa: testConfig.companyCode,
          codigoProducto: '001',
        })
        .toss();

      const elapsed = Math.round((performance.now() - start) * 100) / 100;
      return {
        httpStatus: res.statusCode,
        responseTimeMs: elapsed,
        body: res.body,
      };
    } catch (err: any) {
      return {
        httpStatus: 500,
        responseTimeMs: Math.round((performance.now() - start) * 100) / 100,
        error: err.message,
      };
    }
  }

  async listDebts(
    targetUrl: string,
    token: string,
    idConsulta: string,
    codigoBanco: string = '1020',
    canalPago: string = '10',
    tipoConsulta: string = '1',
  ) {
    const spec = pactum.spec();
    const start = performance.now();
    try {
      const res = await spec
        .post(`${targetUrl}/api/Transactional/ListDebts`)
        .withHeaders('Authorization', `Bearer ${token}`)
        .withHeaders('Content-Type', 'application/json')
        .withJson({
          tipoConsulta,
          idConsulta,
          codigoEmpresa: testConfig.companyCode,
          codigoProducto: '001',
          codigoBanco,
          canalPago,
        })
        .toss();

      const elapsed = Math.round((performance.now() - start) * 100) / 100;
      return {
        httpStatus: res.statusCode,
        responseTimeMs: elapsed,
        body: res.body,
      };
    } catch (err: any) {
      return {
        httpStatus: 500,
        responseTimeMs: Math.round((performance.now() - start) * 100) / 100,
        error: err.message,
      };
    }
  }

  async payDebt(targetUrl: string, token: string, payload: any) {
    const spec = pactum.spec();
    const start = performance.now();
    try {
      const res = await spec
        .post(`${targetUrl}/api/Transactional/PayDebt`)
        .withHeaders('Authorization', `Bearer ${token}`)
        .withHeaders('Content-Type', 'application/json')
        .withJson(payload)
        .toss();

      const elapsed = Math.round((performance.now() - start) * 100) / 100;
      return {
        httpStatus: res.statusCode,
        responseTimeMs: elapsed,
        body: res.body,
      };
    } catch (err: any) {
      return {
        httpStatus: 500,
        responseTimeMs: Math.round((performance.now() - start) * 100) / 100,
        error: err.message,
      };
    }
  }

  async reversePay(targetUrl: string, token: string, payload: any) {
    const spec = pactum.spec();
    const start = performance.now();
    try {
      const res = await spec
        .post(`${targetUrl}/api/Transactional/ReversePay`)
        .withHeaders('Authorization', `Bearer ${token}`)
        .withHeaders('Content-Type', 'application/json')
        .withJson(payload)
        .toss();

      const elapsed = Math.round((performance.now() - start) * 100) / 100;
      return {
        httpStatus: res.statusCode,
        responseTimeMs: elapsed,
        body: res.body,
      };
    } catch (err: any) {
      return {
        httpStatus: 500,
        responseTimeMs: Math.round((performance.now() - start) * 100) / 100,
        error: err.message,
      };
    }
  }

  async executeTransaction(options: {
    targetUrl?: string;
    index?: number;
    customCode?: string;
    poolPayload?: any;
  }): Promise<TransactionRecord> {
    const targetUrl = options.targetUrl || testConfig.targetUrl;
    const token = await this.obtainToken(targetUrl);
    const index = options.index ?? 1;

    let idConsulta = options.customCode?.trim();
    let tipoConsulta = '1';
    let codigoBanco = '1020';
    let bancoNombre = 'BCP';
    let canalPago = '10';
    let formaPago = '01';
    let studentName = 'CLIENTE PRUEBA';
    let numDocumento = '10726';
    let importe = 500.0;

    if (idConsulta) {
      tipoConsulta = idConsulta.length > 8 ? '0' : '1';
      const foundStudent = studentsPool.find((s) => s.codigoAlumno === idConsulta || s.dni === idConsulta);
      if (foundStudent) {
        studentName = foundStudent.nombre;
        if (foundStudent.numDocumentoDefault) numDocumento = foundStudent.numDocumentoDefault;
        if (foundStudent.importeDefault) importe = foundStudent.importeDefault;
      }
    } else if (options.poolPayload) {
      const p = options.poolPayload;
      idConsulta = p.idConsulta;
      tipoConsulta = p.tipoConsulta;
      codigoBanco = p.codigoBanco;
      bancoNombre = p.bancoNombre;
      canalPago = p.canalPago;
      formaPago = p.formaPago;
      studentName = p.studentName || 'ALUMNO POOL';
      numDocumento = p.numDocumento || '10726';
      importe = p.importe || 500.0;
    } else {
      idConsulta = '26023353010012';
      tipoConsulta = '0';
    }

    const { fechaTxn, horaTxn } = getAsbancDateTime();
    const numOperacionBanco = generateNumOperacionBanco(index);

    let validationTimeMs = 0;
    let listDebtsTimeMs = 0;

    const listRes = await this.listDebts(targetUrl, token, idConsulta, codigoBanco, canalPago, tipoConsulta);
    listDebtsTimeMs = listRes.responseTimeMs;
    if (
      listRes.httpStatus === 200 &&
      listRes.body?.codigoRespuesta === '00' &&
      listRes.body?.deudasPendientes?.length > 0
    ) {
      const firstDebt = listRes.body.deudasPendientes[0];
      numDocumento = String(firstDebt.numDocumento);
      importe = Number(firstDebt.deuda || firstDebt.pagoMinimo || importe);
    }

    const payPayload = {
      fechaTxn,
      horaTxn,
      canalPago,
      codigoBanco,
      numOperacionBanco,
      formaPago,
      tipoConsulta,
      idConsulta,
      codigoProducto: '001',
      numDocumento,
      importePagado: importe,
      monedaDoc: '1',
      codigoEmpresa: testConfig.companyCode,
    };

    const payRes = await this.payDebt(targetUrl, token, payPayload);
    const payDebtTimeMs = payRes.responseTimeMs;

    const httpStatus = payRes.httpStatus;
    const body = payRes.body || {};
    const codigoRespuesta = body.codigoRespuesta || (httpStatus === 200 ? '00' : '99');
    const descripcionResp = body.descripcionResp || (httpStatus === 200 ? 'OK' : 'ERROR HTTP');
    const numOperacionERP = body.numOperacionERP || '';
    if (body.nombreCliente) {
      studentName = body.nombreCliente;
    }

    const isSuccess = httpStatus === 200 && codigoRespuesta === '00';
    const status: TransactionRecord['status'] = isSuccess ? 'SUCCESS' : 'ERROR';
    const revertable = isSuccess;

    const record: TransactionRecord = {
      id: `TXN-${Date.now()}-${index}`,
      index,
      timestamp: new Date().toISOString(),
      targetUrl,
      codigoBanco,
      bancoNombre,
      canalPago,
      tipoConsulta,
      idConsulta,
      studentName,
      numOperacionBanco,
      numDocumento,
      importePagado: importe,
      codigoEmpresa: testConfig.companyCode,
      fechaTxn,
      horaTxn,
      httpStatus,
      codigoRespuesta,
      descripcionResp,
      numOperacionERP,
      responseTimeMs: payDebtTimeMs,
      status,
      revertable,
      requestDetails: {
        url: `${targetUrl}/api/Transactional/PayDebt`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.slice(0, 20)}...`,
          'Content-Type': 'application/json',
        },
        body: payPayload,
      },
      responseDetails: {
        statusCode: httpStatus,
        body,
      },
      details: {
        validationTimeMs,
        listDebtsTimeMs,
        payDebtTimeMs,
      },
    };

    return record;
  }

  async runBatch(options: {
    targetUrl?: string;
    count: number;
    customCode?: string;
    concurrency?: number;
    onProgress?: (record: TransactionRecord) => void;
  }): Promise<{ summary: BatchSummary; transactions: TransactionRecord[] }> {
    const targetUrl = options.targetUrl || testConfig.targetUrl;
    const count = Math.max(1, options.count);
    const concurrency = Math.min(count, options.concurrency || 5);
    const transactions: TransactionRecord[] = [];

    const startTime = performance.now();

    let completed = 0;
    const poolSize = payloadsPool.length || 1;

    for (let i = 0; i < count; i += concurrency) {
      const batchChunk = [];
      const currentBatchSize = Math.min(concurrency, count - i);

      for (let j = 0; j < currentBatchSize; j++) {
        const itemIndex = i + j + 1;
        const poolIndex = (i + j) % poolSize;
        const poolPayload = payloadsPool[poolIndex];

        batchChunk.push(
          this.executeTransaction({
            targetUrl,
            index: itemIndex,
            customCode: options.customCode,
            poolPayload,
          }).then((record) => {
            transactions.push(record);
            completed++;
            if (options.onProgress) {
              options.onProgress(record);
            }
            return record;
          }),
        );
      }

      await Promise.all(batchChunk);
    }

    const totalDurationMs = Math.round((performance.now() - startTime) * 100) / 100;

    const latencies = transactions.map((t) => t.responseTimeMs).sort((a, b) => a - b);
    const successCount = transactions.filter((t) => t.status === 'SUCCESS').length;
    const errorCount = transactions.filter((t) => t.status === 'ERROR').length;
    const slaPassCount = transactions.filter((t) => t.responseTimeMs <= 3000).length;

    const minTimeMs = latencies.length ? latencies[0] : 0;
    const maxTimeMs = latencies.length ? latencies[latencies.length - 1] : 0;
    const avgTimeMs = latencies.length
      ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100) / 100
      : 0;
    const p95Index = Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95));
    const p95TimeMs = latencies.length ? latencies[p95Index] : 0;
    const slaCompliancePercent = count ? Math.round((slaPassCount / count) * 1000) / 10 : 100;

    const summary: BatchSummary = {
      total: transactions.length,
      successCount,
      errorCount,
      revertedCount: 0,
      slaCompliancePercent,
      totalDurationMs,
      avgTimeMs,
      minTimeMs,
      maxTimeMs,
      p95TimeMs,
    };

    return { summary, transactions };
  }

  async revertTransaction(options: {
    targetUrl?: string;
    codigoBanco: string;
    numOperacionBanco: string;
    numDocumento: string;
    codigoEmpresa?: string;
    fechaTxn?: string;
    horaTxn?: string;
    tipoConsulta?: string;
    idConsulta?: string;
  }) {
    const targetUrl = options.targetUrl || testConfig.targetUrl;
    const token = await this.obtainToken(targetUrl);
    const { fechaTxn: defaultFecha, horaTxn: defaultHora } = getAsbancDateTime();

    const payload = {
      fechaTxn: options.fechaTxn || defaultFecha,
      horaTxn: options.horaTxn || defaultHora,
      codigoBanco: options.codigoBanco,
      numOperacionBanco: options.numOperacionBanco,
      numDocumento: options.numDocumento,
      codigoEmpresa: options.codigoEmpresa || testConfig.companyCode,
      tipoConsulta: options.tipoConsulta,
      idConsulta: options.idConsulta,
    };

    const res = await this.reversePay(targetUrl, token, payload);
    return res;
  }
}

export const pactumRunner = new PactumRunner();
