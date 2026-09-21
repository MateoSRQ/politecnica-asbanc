import { FastifyReply, FastifyRequest } from 'fastify';
import { getMssqlPool, sql } from '../../../infrastructure/database/mssql.connection.js';
import { logger } from '../../../infrastructure/telemetry/logger.js';

interface AuditQueryFilter {
  page?: string;
  limit?: string;
  codigoBanco?: string;
  codigoRespuesta?: string;
  metodo?: string;
  idConsulta?: string;
  numOperacionBanco?: string;
  traceId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  format?: 'csv' | 'json';
}

export class AuditController {
  /**
   * GET /api/Audit
   * Consulta paginada con filtros de auditoría forense
   */
  async getAudits(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const query = (request.query || {}) as AuditQueryFilter;
      const {
        page = '1',
        limit = '20',
        codigoBanco,
        codigoRespuesta,
        metodo,
        idConsulta,
        numOperacionBanco,
        traceId,
        fechaDesde,
        fechaHasta,
      } = query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.min(500, Math.max(1, parseInt(limit, 10) || 20));
      const offset = (pageNum - 1) * pageSize;

      const pool = await getMssqlPool();
      const req = pool.request();

      let whereConditions: string[] = ['1=1'];

      if (codigoBanco) {
        req.input('CodigoBanco', sql.VarChar(4), codigoBanco);
        whereConditions.push('CodigoBanco = @CodigoBanco');
      }
      if (codigoRespuesta) {
        req.input('CodigoRespuesta', sql.VarChar(10), codigoRespuesta);
        whereConditions.push('CodigoRespuesta = @CodigoRespuesta');
      }
      if (metodo) {
        req.input('Metodo', sql.VarChar(50), `%${metodo}%`);
        whereConditions.push('Metodo LIKE @Metodo');
      }
      if (idConsulta) {
        req.input('IdConsulta', sql.VarChar(14), idConsulta);
        whereConditions.push('IdConsulta = @IdConsulta');
      }
      if (numOperacionBanco) {
        req.input('NumOperacionBanco', sql.VarChar(12), numOperacionBanco);
        whereConditions.push('NumOperacionBanco = @NumOperacionBanco');
      }
      if (traceId) {
        req.input('TraceId', sql.VarChar(50), traceId);
        whereConditions.push('TraceId = @TraceId');
      }
      if (fechaDesde) {
        req.input('FechaDesde', sql.VarChar(30), fechaDesde);
        whereConditions.push('CreatedAt >= @FechaDesde');
      }
      if (fechaHasta) {
        req.input('FechaHasta', sql.VarChar(30), fechaHasta);
        whereConditions.push('CreatedAt <= @FechaHasta');
      }

      const whereClause = whereConditions.join(' AND ');

      const auditTable = await this.getAuditTableName(pool);

      // Total count
      const countResult = await req.query(`
        SELECT COUNT(*) AS Total
        FROM ${auditTable}
        WHERE ${whereClause};
      `);
      const total = countResult.recordset[0].Total;

      // Paged records
      req.input('Offset', sql.Int, offset);
      req.input('PageSize', sql.Int, pageSize);

      const recordsResult = await req.query(`
        SELECT 
          Id,
          TraceId,
          Metodo,
          Endpoint,
          ClientIp,
          CodigoBanco,
          IdConsulta,
          NumOperacionBanco,
          CodigoRespuesta,
          ExecutionTimeMs,
          RequestPayload,
          ResponsePayload,
          CreatedAt
        FROM ${auditTable}
        WHERE ${whereClause}
        ORDER BY Id DESC
        OFFSET @Offset ROWS
        FETCH NEXT @PageSize ROWS ONLY;
      `);

      const items = recordsResult.recordset.map((row) => ({
        id: row.Id,
        traceId: row.TraceId,
        metodo: row.Metodo,
        endpoint: row.Endpoint,
        clientIp: row.ClientIp,
        codigoBanco: row.CodigoBanco,
        idConsulta: row.IdConsulta,
        numOperacionBanco: row.NumOperacionBanco,
        codigoRespuesta: row.CodigoRespuesta,
        executionTimeMs: row.ExecutionTimeMs,
        requestPayload: this.safeParseJson(row.RequestPayload),
        responsePayload: this.safeParseJson(row.ResponsePayload),
        createdAt: row.CreatedAt,
      }));

      const totalPages = Math.ceil(total / pageSize);

      reply.send({
        total,
        page: pageNum,
        limit: pageSize,
        totalPages,
        data: items,
      });
    } catch (error: any) {
      logger.error({ err: error.message }, 'Error al consultar auditorías');
      reply.status(500).send({
        codigoRespuesta: '99',
        descripcionResp: 'ERROR CONSULTANDO REGISTROS DE AUDITORIA',
      });
    }
  }

  /**
   * GET /api/Audit/:id
   * Obtener un registro de auditoría individual por ID
   */
  async getAuditById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const params = (request.params || {}) as { id: string };
      const id = parseInt(params.id, 10);
      if (isNaN(id)) {
        reply.status(400).send({
          codigoRespuesta: '99',
          descripcionResp: 'ID DE AUDITORIA INVALIDO',
        });
        return;
      }

      const pool = await getMssqlPool();
      const auditTable = await this.getAuditTableName(pool);
      const result = await pool.request().input('Id', sql.BigInt, id).query(`
          SELECT TOP 1 *
          FROM ${auditTable}
          WHERE Id = @Id;
        `);

      if (result.recordset.length === 0) {
        reply.status(404).send({
          codigoRespuesta: '99',
          descripcionResp: 'REGISTRO DE AUDITORIA NO ENCONTRADO',
        });
        return;
      }

      const row = result.recordset[0];
      reply.send({
        id: row.Id,
        traceId: row.TraceId,
        metodo: row.Metodo,
        endpoint: row.Endpoint,
        clientIp: row.ClientIp,
        codigoBanco: row.CodigoBanco,
        idConsulta: row.IdConsulta,
        numOperacionBanco: row.NumOperacionBanco,
        codigoRespuesta: row.CodigoRespuesta,
        executionTimeMs: row.ExecutionTimeMs,
        requestPayload: this.safeParseJson(row.RequestPayload),
        responsePayload: this.safeParseJson(row.ResponsePayload),
        createdAt: row.CreatedAt,
      });
    } catch (error: any) {
      logger.error({ err: error.message }, 'Error al consultar auditoría por ID');
      reply.status(500).send({
        codigoRespuesta: '99',
        descripcionResp: 'ERROR AL RECUPERAR AUDITORIA',
      });
    }
  }

  /**
   * GET /api/Audit/export
   * Descarga o exportación de auditorías en CSV o JSON
   */
  async exportAudits(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const query = (request.query || {}) as AuditQueryFilter;
      const {
        format = 'csv',
        limit = '1000',
        codigoBanco,
        codigoRespuesta,
        metodo,
        idConsulta,
        numOperacionBanco,
        traceId,
        fechaDesde,
        fechaHasta,
      } = query;

      const maxLimit = Math.min(10000, Math.max(1, parseInt(limit, 10) || 1000));
      const pool = await getMssqlPool();
      const auditTable = await this.getAuditTableName(pool);
      const req = pool.request();

      let whereConditions: string[] = ['1=1'];

      if (codigoBanco) {
        req.input('CodigoBanco', sql.VarChar(4), codigoBanco);
        whereConditions.push('CodigoBanco = @CodigoBanco');
      }
      if (codigoRespuesta) {
        req.input('CodigoRespuesta', sql.VarChar(10), codigoRespuesta);
        whereConditions.push('CodigoRespuesta = @CodigoRespuesta');
      }
      if (metodo) {
        req.input('Metodo', sql.VarChar(50), `%${metodo}%`);
        whereConditions.push('Metodo LIKE @Metodo');
      }
      if (idConsulta) {
        req.input('IdConsulta', sql.VarChar(14), idConsulta);
        whereConditions.push('IdConsulta = @IdConsulta');
      }
      if (numOperacionBanco) {
        req.input('NumOperacionBanco', sql.VarChar(12), numOperacionBanco);
        whereConditions.push('NumOperacionBanco = @NumOperacionBanco');
      }
      if (traceId) {
        req.input('TraceId', sql.VarChar(50), traceId);
        whereConditions.push('TraceId = @TraceId');
      }
      if (fechaDesde) {
        req.input('FechaDesde', sql.VarChar(30), fechaDesde);
        whereConditions.push('CreatedAt >= @FechaDesde');
      }
      if (fechaHasta) {
        req.input('FechaHasta', sql.VarChar(30), fechaHasta);
        whereConditions.push('CreatedAt <= @FechaHasta');
      }

      req.input('Limit', sql.Int, maxLimit);

      const result = await req.query(`
        SELECT TOP (@Limit)
          Id,
          TraceId,
          FORMAT(CreatedAt, 'yyyy-MM-dd HH:mm:ss') AS FechaHora,
          Metodo,
          Endpoint,
          ISNULL(ClientIp, '') AS ClientIp,
          ISNULL(CodigoBanco, '') AS CodigoBanco,
          ISNULL(IdConsulta, '') AS IdConsulta,
          ISNULL(NumOperacionBanco, '') AS NumOperacionBanco,
          ISNULL(CodigoRespuesta, '') AS CodigoRespuesta,
          ExecutionTimeMs,
          ISNULL(RequestPayload, '') AS RequestPayload,
          ISNULL(ResponsePayload, '') AS ResponsePayload
        FROM ${auditTable}
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY Id DESC;
      `);

      const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

      if (format.toLowerCase() === 'json') {
        const jsonData = result.recordset.map((row) => ({
          ...row,
          RequestPayload: this.safeParseJson(row.RequestPayload),
          ResponsePayload: this.safeParseJson(row.ResponsePayload),
        }));

        reply
          .header('Content-Type', 'application/json; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="auditoria_asbanc_${timestamp}.json"`)
          .send(jsonData);
        return;
      }

      // Formato CSV por defecto (RFC 4180 y mitigación de inyección de fórmulas)
      const headers = [
        'Id',
        'TraceId',
        'FechaHora',
        'Metodo',
        'Endpoint',
        'ClientIp',
        'CodigoBanco',
        'IdConsulta',
        'NumOperacionBanco',
        'CodigoRespuesta',
        'ExecutionTimeMs',
      ];

      const csvRows = [headers.join(',')];

      for (const row of result.recordset) {
        const values = [
          row.Id,
          this.formatCsvCell(row.TraceId),
          this.formatCsvCell(row.FechaHora),
          this.formatCsvCell(row.Metodo),
          this.formatCsvCell(row.Endpoint),
          this.formatCsvCell(row.ClientIp),
          this.formatCsvCell(row.CodigoBanco),
          this.formatCsvCell(row.IdConsulta),
          this.formatCsvCell(row.NumOperacionBanco),
          this.formatCsvCell(row.CodigoRespuesta),
          row.ExecutionTimeMs,
        ];
        csvRows.push(values.join(','));
      }

      const csvContent = csvRows.join('\r\n');

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="auditoria_asbanc_${timestamp}.csv"`)
        .send(csvContent);
    } catch (error: any) {
      logger.error({ err: error.message }, 'Error al exportar registros de auditoría');
      reply.status(500).send({
        codigoRespuesta: '99',
        descripcionResp: 'ERROR AL EXPORTAR AUDITORIAS',
      });
    }
  }

  private formatCsvCell(val: any): string {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    // Mitigar CSV Formula Injection (=, +, -, @)
    if (/^[=+\-@]/.test(str)) {
      str = "'" + str;
    }
    // Escapar comillas dobles según RFC 4180
    return `"${str.replace(/"/g, '""')}"`;
  }

  private safeParseJson(value: string | null): any {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private cachedAuditTableName: string | null = null;

  private async getAuditTableName(pool: any): Promise<string> {
    if (this.cachedAuditTableName) {
      return this.cachedAuditTableName;
    }
    try {
      const check = await pool.request().query("SELECT OBJECT_ID('dbo.AuditoriaLogs', 'U') AS tblId;");
      if (check.recordset[0]?.tblId) {
        this.cachedAuditTableName = 'dbo.AuditoriaLogs';
      } else {
        this.cachedAuditTableName = 'politecnica_asbanc.dbo.AuditoriaLogs';
      }
    } catch {
      this.cachedAuditTableName = 'politecnica_asbanc.dbo.AuditoriaLogs';
    }
    return this.cachedAuditTableName;
  }
}

export const auditController = new AuditController();
