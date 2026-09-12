import { FastifyReply, FastifyRequest } from 'fastify';
import {
  listDebtsSchema,
  payDebtSchema,
  reversePaySchema,
  validateCustomerSchema,
} from '../../../core/schemas/asbanc.schemas.js';
import {
  DebtItem,
  ListDebtsResponse,
  PayDebtResponse,
  ReversePayResponse,
  ValidateCustomerResponse,
} from '../../../core/types/asbanc.types.js';
import { getMssqlPool, sql } from '../../../infrastructure/database/mssql.connection.js';
import { logger } from '../../../infrastructure/telemetry/logger.js';

export class TransactionalController {
  /**
   * POST /api/Transactional/ValidateCustomer
   * Valida la existencia de un cliente/estudiante por DNI, RUC o Código
   */
  async validateCustomer(request: FastifyRequest, reply: FastifyReply): Promise<ValidateCustomerResponse> {
    const parseResult = validateCustomerSchema.safeParse(request.body);
    if (!parseResult.success) {
      const response: ValidateCustomerResponse = {
        codigoRespuesta: '99',
        descripcionResp: 'DATOS DE ENTRADA INVALIDOS: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        nombreCliente: '',
      };
      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    }

    const { tipoConsulta, idConsulta, codigoEmpresa, codigoProducto } = parseResult.data;

    try {
      const pool = await getMssqlPool();
      const result = await pool.request()
        .input('TipoConsulta', sql.VarChar(1), tipoConsulta)
        .input('IdConsulta', sql.VarChar(14), idConsulta)
        .input('CodigoEmpresa', sql.VarChar(3), codigoEmpresa)
        .input('CodigoProducto', sql.VarChar(3), codigoProducto)
        .execute('dbo.sp_Asbanc_ValidateCustomer');

      const row = result.recordset[0] || {
        CodigoRespuesta: '16',
        DescripcionResp: 'CLIENTE NO EXISTE',
        NombreCliente: '',
      };

      const response: ValidateCustomerResponse = {
        codigoRespuesta: row.CodigoRespuesta,
        descripcionResp: row.DescripcionResp,
        nombreCliente: row.NombreCliente || '',
      };

      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    } catch (error: any) {
      logger.error({ error: error.message, traceId: request.traceId }, 'Error en ValidateCustomer');
      const response: ValidateCustomerResponse = {
        codigoRespuesta: '99',
        descripcionResp: 'ERROR DESCONOCIDO',
        nombreCliente: '',
      };
      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    }
  }

  /**
   * POST /api/Transactional/ListDebts
   * Retorna el listado de recibos o cuotas pendientes de pago ordenados ascendentemente
   */
  async listDebts(request: FastifyRequest, reply: FastifyReply): Promise<ListDebtsResponse> {
    const parseResult = listDebtsSchema.safeParse(request.body);
    if (!parseResult.success) {
      const response: ListDebtsResponse = {
        codigoRespuesta: '99',
        descripcionResp: 'DATOS DE ENTRADA INVALIDOS',
        deudasPendientes: [],
      };
      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    }

    const { tipoConsulta, idConsulta, codigoEmpresa, codigoProducto, codigoBanco, canalPago } = parseResult.data;

    try {
      const pool = await getMssqlPool();
      const result = await pool.request()
        .input('TipoConsulta', sql.VarChar(1), tipoConsulta)
        .input('IdConsulta', sql.VarChar(14), idConsulta)
        .input('CodigoEmpresa', sql.VarChar(3), codigoEmpresa)
        .input('CodigoProducto', sql.VarChar(3), codigoProducto)
        .input('CodigoBanco', sql.VarChar(4), codigoBanco)
        .input('CanalPago', sql.VarChar(2), canalPago)
        .execute('dbo.sp_Asbanc_ListDebts');

      // El SP devuelve 2 recordsets cuando es exitoso:
      // Recordset[0]: Encabezado con CodigoRespuesta y DescripcionResp
      // Recordset[1]: Lista de deudas pendientes
      const recordsets = result.recordsets as any[];
      const header = recordsets[0]?.[0] || { CodigoRespuesta: '99', DescripcionResp: 'ERROR DESCONOCIDO' };
      const debtsRows = recordsets[1] || [];

      if (header.CodigoRespuesta !== '00') {
        const response: ListDebtsResponse = {
          codigoRespuesta: header.CodigoRespuesta,
          descripcionResp: header.DescripcionResp,
          deudasPendientes: [],
        };
        (reply as any).payloadData = response;
        return reply.status(200).send(response);
      }

      const deudasPendientes: DebtItem[] = debtsRows.map((d: any) => ({
        codigoProducto: d.CodigoProducto,
        numDocumento: d.NumDocumento,
        descDocumento: d.DescDocumento,
        fechaVencimiento: d.FechaVencimiento,
        fechaEmision: d.FechaEmision,
        deuda: Number(d.Deuda),
        pagoMinimo: Number(d.PagoMinimo),
        monedaDoc: d.MonedaDoc,
      }));

      const response: ListDebtsResponse = {
        codigoRespuesta: '00',
        descripcionResp: 'OK',
        deudasPendientes,
      };

      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    } catch (error: any) {
      logger.error({ error: error.message, traceId: request.traceId }, 'Error en ListDebts');
      const response: ListDebtsResponse = {
        codigoRespuesta: '99',
        descripcionResp: 'ERROR DESCONOCIDO',
        deudasPendientes: [],
      };
      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    }
  }

  /**
   * POST /api/Transactional/PayDebt
   * Procesa la notificación y aplicación del pago bancario con idempotencia estricta
   */
  async payDebt(request: FastifyRequest, reply: FastifyReply): Promise<PayDebtResponse> {
    const parseResult = payDebtSchema.safeParse(request.body);
    if (!parseResult.success) {
      const response: PayDebtResponse = {
        codigoRespuesta: '99',
        nombreCliente: '',
        numOperacionERP: '',
        descripcionResp: 'DATOS DE ENTRADA INVALIDOS: ' + parseResult.error.errors.map((e) => e.message).join(', '),
      };
      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    }

    const data = parseResult.data;

    try {
      const pool = await getMssqlPool();
      const result = await pool.request()
        .input('FechaTxn', sql.VarChar(8), data.fechaTxn)
        .input('HoraTxn', sql.VarChar(6), data.horaTxn)
        .input('CanalPago', sql.VarChar(2), data.canalPago)
        .input('CodigoBanco', sql.VarChar(4), data.codigoBanco)
        .input('NumOperacionBanco', sql.VarChar(12), data.numOperacionBanco)
        .input('FormaPago', sql.VarChar(2), data.formaPago)
        .input('TipoConsulta', sql.VarChar(1), data.tipoConsulta)
        .input('IdConsulta', sql.VarChar(14), data.idConsulta)
        .input('CodigoProducto', sql.VarChar(3), data.codigoProducto)
        .input('NumDocumento', sql.VarChar(16), data.numDocumento)
        .input('ImportePagado', sql.Decimal(12, 2), data.importePagado)
        .input('MonedaDoc', sql.VarChar(1), data.monedaDoc)
        .input('CodigoEmpresa', sql.VarChar(3), data.codigoEmpresa)
        .execute('dbo.sp_Asbanc_PayDebt');

      const row = result.recordset[0] || {
        CodigoRespuesta: '99',
        NombreCliente: '',
        NumOperacionERP: '',
        DescripcionResp: 'ERROR DESCONOCIDO',
      };

      const response: PayDebtResponse = {
        codigoRespuesta: row.CodigoRespuesta,
        nombreCliente: row.NombreCliente || '',
        numOperacionERP: row.NumOperacionERP || '',
        descripcionResp: row.DescripcionResp || 'OK',
      };

      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    } catch (error: any) {
      logger.error({ error: error.message, traceId: request.traceId }, 'Error en PayDebt');
      const response: PayDebtResponse = {
        codigoRespuesta: '99',
        nombreCliente: '',
        numOperacionERP: '',
        descripcionResp: 'ERROR DESCONOCIDO',
      };
      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    }
  }

  /**
   * POST /api/Transactional/ReversePay
   * Procesa el extorno o anulación transaccional de un pago previo
   */
  async reversePay(request: FastifyRequest, reply: FastifyReply): Promise<ReversePayResponse> {
    const parseResult = reversePaySchema.safeParse(request.body);
    if (!parseResult.success) {
      const response: ReversePayResponse = {
        codigoRespuesta: '99',
        nombreCliente: '',
        numOperacionERP: '',
        descripcionResp: 'DATOS DE ENTRADA INVALIDOS',
      };
      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    }

    const data = parseResult.data;

    try {
      const pool = await getMssqlPool();
      const result = await pool.request()
        .input('FechaTxn', sql.VarChar(8), data.fechaTxn)
        .input('HoraTxn', sql.VarChar(6), data.horaTxn)
        .input('CodigoBanco', sql.VarChar(4), data.codigoBanco)
        .input('NumOperacionBanco', sql.VarChar(12), data.numOperacionBanco)
        .input('NumDocumento', sql.VarChar(16), data.numDocumento)
        .input('CodigoEmpresa', sql.VarChar(3), data.codigoEmpresa)
        .execute('dbo.sp_Asbanc_ReversePay');

      const row = result.recordset[0] || {
        CodigoRespuesta: '99',
        NombreCliente: '',
        NumOperacionERP: '',
        DescripcionResp: 'ERROR DESCONOCIDO',
      };

      const response: ReversePayResponse = {
        codigoRespuesta: row.CodigoRespuesta,
        nombreCliente: row.NombreCliente || '',
        numOperacionERP: row.NumOperacionERP || '',
        descripcionResp: row.DescripcionResp || 'OK',
      };

      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    } catch (error: any) {
      logger.error({ error: error.message, traceId: request.traceId }, 'Error en ReversePay');
      const response: ReversePayResponse = {
        codigoRespuesta: '99',
        nombreCliente: '',
        numOperacionERP: '',
        descripcionResp: 'ERROR DESCONOCIDO',
      };
      (reply as any).payloadData = response;
      return reply.status(200).send(response);
    }
  }
}

export const transactionalController = new TransactionalController();
