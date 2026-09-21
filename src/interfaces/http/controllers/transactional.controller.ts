import { FastifyReply, FastifyRequest } from 'fastify';
import {
  listDebtsSchema,
  payDebtSchema,
  reversePaySchema,
  validateCustomerSchema,
} from '../../../core/schemas/asbanc.schemas.js';
import { webhookService } from '../../../core/services/webhook.service.js';
import {
  DebtItem,
  ListDebtsResponse,
  PayDebtResponse,
  ReversePayResponse,
  ValidateCustomerResponse,
} from '../../../core/types/asbanc.types.js';
import { formatDateAsbanc, parseAsbancDate, sanitizeAsbancString } from '../../../core/utils/asbanc.util.js';
import { getMssqlPool, sql } from '../../../infrastructure/database/mssql.connection.js';
import { logger } from '../../../infrastructure/telemetry/logger.js';

export class TransactionalController {
  /**
   * POST /api/Transactional/ValidateCustomer
   * Valida la existencia de un estudiante o cliente por Código de Alumno, DNI o RUC.
   * Consulta prioritariamente la base de datos académica (BDACADEMICO6).
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

      // 1. Búsqueda en BDACADEMICO6 (Academico.Alumno + General.Persona)
      const academicStudent = await pool.request()
        .input('TipoConsulta', sql.VarChar(1), tipoConsulta)
        .input('IdConsulta', sql.VarChar(14), idConsulta)
        .query(`
          SELECT TOP 1 
            alu.id AS alumno_id,
            alu.codigo_alumno,
            per.nro_documento,
            LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo
          FROM Academico.Alumno alu
          JOIN General.Persona per ON alu.persona_id = per.id
          WHERE 
            (@TipoConsulta = '0' AND (alu.codigo_alumno = @IdConsulta OR per.nro_documento = @IdConsulta))
            OR (@TipoConsulta IN ('1', '2') AND (per.nro_documento = @IdConsulta OR alu.codigo_alumno = @IdConsulta))
            OR (alu.codigo_alumno = @IdConsulta OR per.nro_documento = @IdConsulta);
        `);

      if (academicStudent.recordset.length > 0) {
        const student = academicStudent.recordset[0];
        const response: ValidateCustomerResponse = {
          codigoRespuesta: '00',
          descripcionResp: 'OK',
          nombreCliente: sanitizeAsbancString(student.nombre_completo, 30),
        };
        (reply as any).payloadData = response;
        return reply.status(200).send(response);
      }

      // 2. Fallback de compatibilidad para homologación (politecnica_asbanc.dbo.Clientes)
      try {
        const fallbackClient = await pool.request()
          .input('TipoConsulta', sql.VarChar(1), tipoConsulta)
          .input('IdConsulta', sql.VarChar(14), idConsulta)
          .query(`
            SELECT TOP 1 NombreCliente
            FROM politecnica_asbanc.dbo.Clientes
            WHERE (TipoConsulta = @TipoConsulta AND IdConsulta = @IdConsulta)
               OR (IdConsulta = @IdConsulta);
          `);

        if (fallbackClient.recordset.length > 0) {
          const response: ValidateCustomerResponse = {
            codigoRespuesta: '00',
            descripcionResp: 'OK',
            nombreCliente: sanitizeAsbancString(fallbackClient.recordset[0].NombreCliente, 30),
          };
          (reply as any).payloadData = response;
          return reply.status(200).send(response);
        }
      } catch (fbErr: any) {
        // Ignorar si politecnica_asbanc no está disponible en este host
      }

      // 3. Si no existe en ningún origen
      const response: ValidateCustomerResponse = {
        codigoRespuesta: '16',
        descripcionResp: 'CLIENTE NO EXISTE',
        nombreCliente: '',
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
   * Retorna la deuda / concepto más antiguo no pagado para el estudiante indicado.
   * Criterio de orden estricto:
   * 1. Periodo académico más antiguo (p.fecha_inicio ASC, p.id ASC)
   * 2. Concepto / Número de cuota más antiguo (ap.num_cuota ASC: 0=Matrícula, 1..n=Pensiones)
   * 3. Fecha de vencimiento más antigua (ap.fecha_vencimiento ASC)
   * 4. Identificador de cuota (ap.id ASC)
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

      // 1. Buscar al estudiante en BDACADEMICO6
      const studentResult = await pool.request()
        .input('TipoConsulta', sql.VarChar(1), tipoConsulta)
        .input('IdConsulta', sql.VarChar(14), idConsulta)
        .query(`
          SELECT TOP 1 
            alu.id AS alumno_id,
            alu.codigo_alumno,
            per.nro_documento,
            LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo
          FROM Academico.Alumno alu
          JOIN General.Persona per ON alu.persona_id = per.id
          WHERE 
            (@TipoConsulta = '0' AND (alu.codigo_alumno = @IdConsulta OR per.nro_documento = @IdConsulta))
            OR (@TipoConsulta IN ('1', '2') AND (per.nro_documento = @IdConsulta OR alu.codigo_alumno = @IdConsulta))
            OR (alu.codigo_alumno = @IdConsulta OR per.nro_documento = @IdConsulta);
        `);

      if (studentResult.recordset.length > 0) {
        const student = studentResult.recordset[0];

        // 2. Consultar la deuda MÁS ANTIGUA no pagada (param_estado_pago_id = 25: GENERADO)
        // Ordenada por Periodo, Concepto/Cuota, Vencimiento e ID
        const oldestDebtResult = await pool.request()
          .input('AlumnoId', sql.Int, student.alumno_id)
          .query(`
            SELECT TOP 1
              ap.id AS pago_id,
              ap.alumno_id,
              ap.num_cuota,
              ap.monto AS deuda,
              ap.fecha_vencimiento,
              ap.fecha_generacion,
              ap.created_at,
              ap.param_estado_pago_id,
              -- Concepto
              ISNULL(ac.descripcion, ISNULL(apc.descripcion, CASE WHEN ap.num_cuota = 0 THEN 'MATRICULA' ELSE 'PENSION CUOTA ' + CAST(ap.num_cuota AS VARCHAR) END)) AS concepto,
              ac.concepto_pago_id,
              -- Periodo Académico
              p.id AS periodo_id,
              p.nombre AS periodo_nombre,
              p.fecha_inicio AS periodo_fecha_inicio
            FROM Ctas_Ctes.Alumno_Pago ap
            LEFT JOIN Ctas_Ctes.Alumno_Pago_Cuota apc ON ap.id = apc.alumno_pago_id
            LEFT JOIN Ctas_Ctes.Alumno_Cuota ac ON apc.alumno_cuota_id = ac.id
            LEFT JOIN Carga_Academica.Carga_Academica_Sede cas ON ap.carga_academica_sede_id = cas.id
            LEFT JOIN Carga_Academica.Carga_Academica ca ON cas.carga_academica_id = ca.id
            LEFT JOIN General.Periodo p ON ca.periodo_id = p.id
            WHERE ap.alumno_id = @AlumnoId
              AND ap.param_estado_pago_id = 25 -- SOL_EST_GENERADO (pendiente de pago)
            ORDER BY 
              ISNULL(p.fecha_inicio, '1900-01-01') ASC,
              ISNULL(p.id, 0) ASC,
              ap.num_cuota ASC,
              ap.fecha_vencimiento ASC,
              ap.id ASC;
          `);

        if (oldestDebtResult.recordset.length === 0) {
          // El alumno existe pero no tiene deudas pendientes
          const response: ListDebtsResponse = {
            codigoRespuesta: '22',
            descripcionResp: 'CLIENTE SIN DEUDAS PENDIENTES',
            deudasPendientes: [],
          };
          (reply as any).payloadData = response;
          return reply.status(200).send(response);
        }

        const debtRow = oldestDebtResult.recordset[0];
        const conceptoDesc = debtRow.concepto || (debtRow.num_cuota === 0 ? 'MATRICULA' : `PENSION C${debtRow.num_cuota}`);
        const periodoStr = debtRow.periodo_nombre ? ` ${debtRow.periodo_nombre}` : '';
        const descDocumento = sanitizeAsbancString(`${conceptoDesc}${periodoStr}`, 30);

        const deudasPendientes: DebtItem[] = [
          {
            codigoProducto: codigoProducto || '001',
            numDocumento: String(debtRow.pago_id),
            descDocumento,
            fechaVencimiento: formatDateAsbanc(debtRow.fecha_vencimiento),
            fechaEmision: formatDateAsbanc(debtRow.fecha_generacion || debtRow.created_at || debtRow.periodo_fecha_inicio),
            deuda: Number(debtRow.deuda),
            pagoMinimo: Number(debtRow.deuda),
            monedaDoc: '1',
          },
        ];

        const response: ListDebtsResponse = {
          codigoRespuesta: '00',
          descripcionResp: 'OK',
          deudasPendientes,
        };
        (reply as any).payloadData = response;
        return reply.status(200).send(response);
      }

      // 3. Fallback de compatibilidad con politecnica_asbanc (para tests/homologación bancaria)
      try {
        const fallbackDebts = await pool.request()
          .input('TipoConsulta', sql.VarChar(1), tipoConsulta)
          .input('IdConsulta', sql.VarChar(14), idConsulta)
          .query(`
            SELECT TOP 1
              d.CodigoProducto,
              d.NumDocumento,
              d.DescDocumento,
              d.FechaVencimiento,
              d.FechaEmision,
              d.Deuda,
              d.PagoMinimo,
              d.MonedaDoc
            FROM politecnica_asbanc.dbo.Deudas d
            JOIN politecnica_asbanc.dbo.Clientes c ON d.ClienteId = c.Id
            WHERE (c.TipoConsulta = @TipoConsulta AND c.IdConsulta = @IdConsulta)
               OR (c.IdConsulta = @IdConsulta)
              AND d.Estado = 'PENDIENTE'
            ORDER BY d.FechaVencimiento ASC, d.Id ASC;
          `);

        if (fallbackDebts.recordset.length > 0) {
          const d = fallbackDebts.recordset[0];
          const response: ListDebtsResponse = {
            codigoRespuesta: '00',
            descripcionResp: 'OK',
            deudasPendientes: [
              {
                codigoProducto: d.CodigoProducto,
                numDocumento: d.NumDocumento,
                descDocumento: d.DescDocumento,
                fechaVencimiento: d.FechaVencimiento,
                fechaEmision: d.FechaEmision,
                deuda: Number(d.Deuda),
                pagoMinimo: Number(d.PagoMinimo),
                monedaDoc: d.MonedaDoc,
              },
            ],
          };
          (reply as any).payloadData = response;
          return reply.status(200).send(response);
        }
      } catch (fbErr: any) {
        // Ignorar si politecnica_asbanc no está disponible
      }

      // 4. Si no se encontró el estudiante
      const response: ListDebtsResponse = {
        codigoRespuesta: '16',
        descripcionResp: 'CLIENTE NO EXISTE',
        deudasPendientes: [],
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
   * Aplica y marca como pagada la cuota universitaria en BDACADEMICO6.
   * Dispara el placeholder de webhook para notificaciones externas en tiempo real.
   * Sin modificar la estructura de la base de datos.
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
      const pagoId = parseInt(data.numDocumento, 10);

      // 1. Si numDocumento es numérico, verificar en Ctas_Ctes.Alumno_Pago de BDACADEMICO6
      if (!isNaN(pagoId)) {
        const debtCheck = await pool.request()
          .input('PagoId', sql.Int, pagoId)
          .query(`
            SELECT 
              ap.id AS pago_id,
              ap.alumno_id,
              ap.num_cuota,
              ap.monto,
              ap.param_estado_pago_id,
              ap.fecha_pago,
              alu.codigo_alumno,
              per.nro_documento,
              LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo,
              ISNULL(ac.descripcion, ISNULL(apc.descripcion, 'CUOTA ' + CAST(ap.num_cuota AS VARCHAR))) AS concepto,
              p.nombre AS periodo_nombre
            FROM Ctas_Ctes.Alumno_Pago ap
            JOIN Academico.Alumno alu ON ap.alumno_id = alu.id
            JOIN General.Persona per ON alu.persona_id = per.id
            LEFT JOIN Ctas_Ctes.Alumno_Pago_Cuota apc ON ap.id = apc.alumno_pago_id
            LEFT JOIN Ctas_Ctes.Alumno_Cuota ac ON apc.alumno_cuota_id = ac.id
            LEFT JOIN Carga_Academica.Carga_Academica_Sede cas ON ap.carga_academica_sede_id = cas.id
            LEFT JOIN Carga_Academica.Carga_Academica ca ON cas.carga_academica_id = ca.id
            LEFT JOIN General.Periodo p ON ca.periodo_id = p.id
            WHERE ap.id = @PagoId;
          `);

        if (debtCheck.recordset.length > 0) {
          const debt = debtCheck.recordset[0];
          const nombreClienteSaneado = sanitizeAsbancString(debt.nombre_completo, 30);
          const numOperacionERP = String(debt.pago_id).padStart(9, '0');

          // Control de idempotencia: ¿Ya estaba pagada con la misma operación bancaria?
          if (debt.param_estado_pago_id === 16) {
            // Verificar si el detalle bancario ya existe
            const dupCheck = await pool.request()
              .input('PagoId', sql.Int, pagoId)
              .input('NumOperacionBanco', sql.VarChar(20), data.numOperacionBanco)
              .query(`
                SELECT TOP 1 id 
                FROM Ctas_Ctes.Alumno_Pago_Detalle 
                WHERE alumno_pago_id = @PagoId AND num_documento = @NumOperacionBanco;
              `);

            if (dupCheck.recordset.length > 0) {
              const response: PayDebtResponse = {
                codigoRespuesta: '00',
                nombreCliente: nombreClienteSaneado,
                numOperacionERP,
                descripcionResp: 'PAGO PREVIAMENTE REGISTRADO (IDEMPOTENTE)',
              };
              (reply as any).payloadData = response;
              return reply.status(200).send(response);
            } else {
              const response: PayDebtResponse = {
                codigoRespuesta: '22',
                nombreCliente: nombreClienteSaneado,
                numOperacionERP,
                descripcionResp: 'DEUDA YA SE ENCUENTRA CANCELADA',
              };
              (reply as any).payloadData = response;
              return reply.status(200).send(response);
            }
          }

          // Aplicar el pago: Marcar como PAGADO (param_estado_pago_id = 16) e insertar detalle
          const fechaPagoDate = parseAsbancDate(data.fechaTxn, data.horaTxn);

          const txn = new sql.Transaction(pool);
          await txn.begin();

          try {
            // 1. Actualizar Ctas_Ctes.Alumno_Pago
            await new sql.Request(txn)
              .input('PagoId', sql.Int, pagoId)
              .input('ImportePagado', sql.Decimal(12, 2), data.importePagado)
              .input('FechaPago', sql.DateTime, fechaPagoDate)
              .input('CanalPago', sql.VarChar(20), 'BANCOS')
              .query(`
                UPDATE Ctas_Ctes.Alumno_Pago
                SET 
                  param_estado_pago_id = 16, -- SOL_EST_PAGADO
                  monto_pagado_sin_mora = @ImportePagado,
                  monto_pagado_con_mora = @ImportePagado,
                  fecha_pago = @FechaPago,
                  lugar_pago = @CanalPago,
                  modified_at = GETDATE(),
                  modified_by = 'ASBANC_FTR'
                WHERE id = @PagoId;
              `);

            // 2. Insertar en Ctas_Ctes.Alumno_Pago_Detalle
            await new sql.Request(txn)
              .input('PagoId', sql.Int, pagoId)
              .input('FechaPago', sql.DateTime, fechaPagoDate)
              .input('CanalPago', sql.VarChar(20), 'BANCOS')
              .input('NumOperacionBanco', sql.VarChar(20), data.numOperacionBanco)
              .input('ImportePagado', sql.Decimal(12, 2), data.importePagado)
              .input('NumCuota', sql.Int, debt.num_cuota)
              .query(`
                INSERT INTO Ctas_Ctes.Alumno_Pago_Detalle (
                  alumno_pago_id, fecha_pago, lugar_pago, param_estado_pago_id,
                  tipo_pago, serie, num_documento, monto, estado_auditoria,
                  created_at, created_by, num_cuota
                ) VALUES (
                  @PagoId, @FechaPago, @CanalPago, 16,
                  'ASBANC', 'FTR', @NumOperacionBanco, @ImportePagado, 1,
                  GETDATE(), 'ASBANC_FTR', @NumCuota
                );
              `);

            await txn.commit();
          } catch (txErr) {
            await txn.rollback();
            throw txErr;
          }

          // 3. PLACEHOLDER DE WEBHOOK: Notificar asíncronamente el evento de pago
          webhookService.dispatchPaymentWebhook({
            event: 'debt.payment.confirmed',
            timestamp: new Date().toISOString(),
            pagoId: debt.pago_id,
            alumnoId: debt.alumno_id,
            codigoAlumno: debt.codigo_alumno,
            numeroDocumento: debt.nro_documento,
            nombreCliente: nombreClienteSaneado,
            concepto: debt.concepto,
            periodoNombre: debt.periodo_nombre,
            numCuota: debt.num_cuota,
            importePagado: data.importePagado,
            codigoBanco: data.codigoBanco,
            numOperacionBanco: data.numOperacionBanco,
            numOperacionERP,
            fechaTxn: data.fechaTxn,
            horaTxn: data.horaTxn,
            canalPago: data.canalPago,
            formaPago: data.formaPago,
          }).catch((whErr) => {
            logger.error({ error: whErr.message }, 'Error capturado en despacho de webhook');
          });

          const response: PayDebtResponse = {
            codigoRespuesta: '00',
            nombreCliente: nombreClienteSaneado,
            numOperacionERP,
            descripcionResp: 'OK',
          };
          (reply as any).payloadData = response;
          return reply.status(200).send(response);
        } else {
          // El pagoId no existe en BDACADEMICO6. Verificar si el alumno existe en BDACADEMICO6
          const checkStudent = await pool.request()
            .input('IdConsulta', sql.VarChar(50), data.idConsulta)
            .query(`
              SELECT TOP 1 
                alu.id,
                LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) AS nombre_completo
              FROM Academico.Alumno alu
              JOIN General.Persona per ON alu.persona_id = per.id
              WHERE alu.codigo_alumno = @IdConsulta OR per.nro_documento = @IdConsulta;
            `);

          if (checkStudent.recordset.length > 0) {
            const student = checkStudent.recordset[0];
            const response: PayDebtResponse = {
              codigoRespuesta: '99',
              nombreCliente: sanitizeAsbancString(student.nombre_completo, 30),
              numOperacionERP: '',
              descripcionResp: `DOCUMENTO DE DEUDA ${data.numDocumento} NO ENCONTRADO EN BDACADEMICO6`,
            };
            (reply as any).payloadData = response;
            return reply.status(200).send(response);
          }
        }
      }

      // 2. Fallback de compatibilidad para ambiente de pruebas / certificación (politecnica_asbanc)
      try {
        const fallbackResult = await pool.request()
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
          .execute('politecnica_asbanc.dbo.sp_Asbanc_PayDebt');

        const row = fallbackResult.recordset[0];
        if (row) {
          const response: PayDebtResponse = {
            codigoRespuesta: row.CodigoRespuesta,
            nombreCliente: row.NombreCliente || '',
            numOperacionERP: row.NumOperacionERP || '',
            descripcionResp: row.DescripcionResp || 'OK',
          };
          (reply as any).payloadData = response;
          return reply.status(200).send(response);
        }
      } catch (fbErr: any) {
        // Fallback falló o no existe
      }

      const response: PayDebtResponse = {
        codigoRespuesta: '99',
        nombreCliente: '',
        numOperacionERP: '',
        descripcionResp: 'DOCUMENTO DE DEUDA NO ENCONTRADO',
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
      const pagoId = parseInt(data.numDocumento, 10);

      if (!isNaN(pagoId)) {
        const debtCheck = await pool.request()
          .input('PagoId', sql.Int, pagoId)
          .query(`
            SELECT 
              ap.id AS pago_id,
              ap.param_estado_pago_id,
              alu.codigo_alumno,
              per.nro_documento,
              LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo
            FROM Ctas_Ctes.Alumno_Pago ap
            JOIN Academico.Alumno alu ON ap.alumno_id = alu.id
            JOIN General.Persona per ON alu.persona_id = per.id
            WHERE ap.id = @PagoId;
          `);

        if (debtCheck.recordset.length > 0) {
          const debt = debtCheck.recordset[0];
          const nombreClienteSaneado = sanitizeAsbancString(debt.nombre_completo, 30);
          const numOperacionERP = String(debt.pago_id).padStart(9, '0');

          if (debt.param_estado_pago_id === 16) {
            // Revertir atómicamente a estado pendiente (GENERADO = 25) y eliminar comprobante bancario
            const revTxn = new sql.Transaction(pool);
            await revTxn.begin();

            try {
              // 1. Restaurar cabecera de cuota a pendiente
              await new sql.Request(revTxn)
                .input('PagoId', sql.Int, pagoId)
                .query(`
                  UPDATE Ctas_Ctes.Alumno_Pago
                  SET 
                    param_estado_pago_id = 25, -- SOL_EST_GENERADO
                    monto_pagado_sin_mora = 0,
                    monto_pagado_con_mora = 0,
                    fecha_pago = NULL,
                    modified_at = GETDATE(),
                    modified_by = 'ASBANC_REVERSA'
                  WHERE id = @PagoId;
                `);

              // 2. Eliminar comprobante bancario en Ctas_Ctes.Alumno_Pago_Detalle
              await new sql.Request(revTxn)
                .input('PagoId', sql.Int, pagoId)
                .input('NumOperacionBanco', sql.VarChar(20), data.numOperacionBanco)
                .query(`
                  DELETE FROM Ctas_Ctes.Alumno_Pago_Detalle
                  WHERE alumno_pago_id = @PagoId 
                    AND (num_documento = @NumOperacionBanco OR created_by = 'ASBANC_FTR');
                `);

              await revTxn.commit();
            } catch (revErr) {
              await revTxn.rollback();
              throw revErr;
            }

            // Notificar webhook de extorno
            webhookService.dispatchPaymentWebhook({
              event: 'debt.payment.reversed',
              timestamp: new Date().toISOString(),
              pagoId: debt.pago_id,
              alumnoId: 0,
              codigoAlumno: debt.codigo_alumno,
              numeroDocumento: debt.nro_documento,
              nombreCliente: nombreClienteSaneado,
              concepto: 'EXTORNO DE PAGO',
              numCuota: 0,
              importePagado: 0,
              codigoBanco: data.codigoBanco,
              numOperacionBanco: data.numOperacionBanco,
              numOperacionERP,
              fechaTxn: data.fechaTxn,
              horaTxn: data.horaTxn,
              canalPago: '',
            }).catch(() => {});

            const response: ReversePayResponse = {
              codigoRespuesta: '00',
              nombreCliente: nombreClienteSaneado,
              numOperacionERP,
              descripcionResp: 'OK',
            };
            (reply as any).payloadData = response;
            return reply.status(200).send(response);
          }
        } else {
          // El pagoId no existe en BDACADEMICO6. Verificar si el alumno existe en BDACADEMICO6
          const checkStudent = await pool.request()
            .input('IdConsulta', sql.VarChar(50), data.idConsulta)
            .query(`
              SELECT TOP 1 
                alu.id,
                LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) AS nombre_completo
              FROM Academico.Alumno alu
              JOIN General.Persona per ON alu.persona_id = per.id
              WHERE alu.codigo_alumno = @IdConsulta OR per.nro_documento = @IdConsulta;
            `);

          if (checkStudent.recordset.length > 0) {
            const student = checkStudent.recordset[0];
            const response: ReversePayResponse = {
              codigoRespuesta: '99',
              nombreCliente: sanitizeAsbancString(student.nombre_completo, 30),
              numOperacionERP: '',
              descripcionResp: `DOCUMENTO DE DEUDA ${data.numDocumento} NO ENCONTRADO EN BDACADEMICO6`,
            };
            (reply as any).payloadData = response;
            return reply.status(200).send(response);
          }
        }
      }

      // Fallback con politecnica_asbanc
      try {
        const result = await pool.request()
          .input('FechaTxn', sql.VarChar(8), data.fechaTxn)
          .input('HoraTxn', sql.VarChar(6), data.horaTxn)
          .input('CodigoBanco', sql.VarChar(4), data.codigoBanco)
          .input('NumOperacionBanco', sql.VarChar(12), data.numOperacionBanco)
          .input('NumDocumento', sql.VarChar(16), data.numDocumento)
          .input('CodigoEmpresa', sql.VarChar(3), data.codigoEmpresa)
          .execute('politecnica_asbanc.dbo.sp_Asbanc_ReversePay');

        const row = result.recordset[0];
        if (row) {
          const response: ReversePayResponse = {
            codigoRespuesta: row.CodigoRespuesta,
            nombreCliente: row.NombreCliente || '',
            numOperacionERP: row.NumOperacionERP || '',
            descripcionResp: row.DescripcionResp || 'OK',
          };
          (reply as any).payloadData = response;
          return reply.status(200).send(response);
        }
      } catch (fbErr: any) {
        // Ignorar
      }

      const response: ReversePayResponse = {
        codigoRespuesta: '99',
        nombreCliente: '',
        numOperacionERP: '',
        descripcionResp: 'ERROR DESCONOCIDO',
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
