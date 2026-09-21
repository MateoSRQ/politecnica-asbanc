import { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { env } from '../../../config/env.js';
import { getMssqlPool, sql } from '../../../infrastructure/database/mssql.connection.js';
import { logger } from '../../../infrastructure/telemetry/logger.js';
import { slaViolationsCounter, txnCounter, txnDurationHistogram } from '../../../infrastructure/telemetry/metrics.js';

declare module 'fastify' {
  interface FastifyRequest {
    traceId: string;
    startTime: number;
  }
}

export function registerAuditHooks(fastify: any): void {
  // 1. Hook onRequest: Asignar TraceId y timestamp
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    request.traceId = (request.headers['x-request-id'] as string) || randomUUID();
    request.startTime = performance.now();
  });

  // 2. Hook preSerialization: Inyectar métricas de tiempo de respuesta si el parámetro GET 'metrics' está presente
  fastify.addHook('preSerialization', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    const query = (request.query || {}) as Record<string, any>;
    const metricsKey = Object.keys(query).find((k) => k.toLowerCase() === 'metrics');
    const hasMetricsParam =
      (metricsKey !== undefined && query[metricsKey] !== 'false' && query[metricsKey] !== '0') ||
      request.url.includes('?metrics') ||
      request.url.includes('&metrics');

    if (hasMetricsParam && payload && typeof payload === 'object') {
      const durationMs = Math.max(1, Math.round(performance.now() - (request.startTime || performance.now())));
      reply.header('X-Response-Time-Ms', durationMs.toString());

      const metricsObj = {
        responseTimeMs: durationMs,
        executionTimeMs: durationMs,
        unit: 'ms',
      };

      if (Array.isArray(payload)) {
        return {
          data: payload,
          metrics: metricsObj,
          responseTimeMs: durationMs,
        };
      }

      const modifiedPayload = {
        ...payload,
        metrics: metricsObj,
        responseTimeMs: durationMs,
      };

      (reply as any).payloadData = modifiedPayload;
      return modifiedPayload;
    }

    return payload;
  });

  // 2. Hook onResponse: Medir tiempo, registrar métricas y logs estructurados
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const durationMs = Math.round(performance.now() - request.startTime);
    const durationSec = durationMs / 1000;
    const body = request.body as any;

    // Normalizar método para métricas con cardinalidad acotada
    const routeUrl = request.routeOptions?.url || request.url.split('?')[0];
    const method = routeUrl.split('/').pop() || routeUrl;
    const rawBank = String(body?.codigoBanco || '').trim();
    const bankCode = /^[0-9]{1,4}$/.test(rawBank) ? rawBank : 'N/A';
    const rawChannel = String(body?.canalPago || '').trim();
    const channel = /^[0-9]{1,2}$/.test(rawChannel) ? rawChannel : 'N/A';
    const responsePayload = (reply as any).payloadData || {};
    const statusCode = responsePayload.codigoRespuesta || reply.statusCode.toString();

    // Registrar métricas Prometheus
    txnDurationHistogram.observe({ method, bank_code: bankCode, channel, status_code: statusCode }, durationSec);

    txnCounter.inc({
      method,
      bank_code: bankCode,
      channel,
      status_code: statusCode,
    });

    // Alerta de SLA (> 2.5s)
    if (durationMs > env.SLA_WARNING_THRESHOLD_MS) {
      slaViolationsCounter.inc({ method, bank_code: bankCode });
      logger.warn(
        {
          traceId: request.traceId,
          method,
          bankCode,
          durationMs,
          threshold: env.SLA_WARNING_THRESHOLD_MS,
        },
        'ALERTA SLA: Transacción superó el umbral de advertencia',
      );
    }

    // Log estructurado JSON con Pino
    logger.info(
      {
        traceId: request.traceId,
        url: request.url,
        method: request.method,
        bankCode,
        channel,
        idConsulta: body?.idConsulta,
        numOperacionBanco: body?.numOperacionBanco,
        numOperacionERP: responsePayload.numOperacionERP,
        codigoRespuesta: statusCode,
        durationMs,
        httpStatus: reply.statusCode,
        ip: request.ip,
      },
      `Transacción ASBANC procesada en ${durationMs}ms`,
    );

    // Inserción asíncrona no bloqueante en dbo.AuditoriaLogs de MSSQL
    if (request.url.toLowerCase().startsWith('/api/transactional')) {
      saveAuditLogAsync(request, reply, durationMs, statusCode, responsePayload).catch((err) => {
        logger.error({ err: err.message }, 'Fallo al guardar log de auditoría en MSSQL');
      });
    }
  });
}

let cachedAuditTableName: string | null = null;

async function resolveAuditTableName(pool: any): Promise<string> {
  if (cachedAuditTableName) return cachedAuditTableName;
  try {
    const check = await pool.request().query("SELECT OBJECT_ID('dbo.AuditoriaLogs', 'U') AS tblId;");
    if (check.recordset[0]?.tblId) {
      cachedAuditTableName = 'dbo.AuditoriaLogs';
    } else {
      cachedAuditTableName = 'politecnica_asbanc.dbo.AuditoriaLogs';
    }
  } catch {
    cachedAuditTableName = 'dbo.AuditoriaLogs';
  }
  return cachedAuditTableName;
}

async function saveAuditLogAsync(
  request: FastifyRequest,
  reply: FastifyReply,
  durationMs: number,
  codigoRespuesta: string,
  responsePayload: any,
): Promise<void> {
  try {
    const pool = await getMssqlPool();
    if (!pool || !pool.connected) return;
    const body = request.body as any;
    const tableName = await resolveAuditTableName(pool);

    await pool
      .request()
      .input('TraceId', sql.VarChar(50), request.traceId)
      .input('Metodo', sql.VarChar(50), request.routeOptions?.url || request.url)
      .input('Endpoint', sql.VarChar(100), request.url)
      .input('ClientIp', sql.VarChar(50), request.ip)
      .input('CodigoBanco', sql.VarChar(4), body?.codigoBanco || null)
      .input('IdConsulta', sql.VarChar(14), body?.idConsulta || null)
      .input('NumOperacionBanco', sql.VarChar(12), body?.numOperacionBanco || null)
      .input('CodigoRespuesta', sql.VarChar(10), codigoRespuesta)
      .input('ExecutionTimeMs', sql.Int, durationMs)
      .input('RequestPayload', sql.NVarChar(sql.MAX), JSON.stringify(body || {}))
      .input('ResponsePayload', sql.NVarChar(sql.MAX), JSON.stringify(responsePayload || {})).query(`
        INSERT INTO ${tableName} (
          TraceId, Metodo, Endpoint, ClientIp, CodigoBanco, IdConsulta,
          NumOperacionBanco, CodigoRespuesta, ExecutionTimeMs, RequestPayload, ResponsePayload
        ) VALUES (
          @TraceId, @Metodo, @Endpoint, @ClientIp, @CodigoBanco, @IdConsulta,
          @NumOperacionBanco, @CodigoRespuesta, @ExecutionTimeMs, @RequestPayload, @ResponsePayload
        );
      `);
  } catch (error: any) {
    logger.warn({ err: error.message }, 'No se pudo persistir el registro de auditoría en MSSQL (ignorado)');
  }
}
