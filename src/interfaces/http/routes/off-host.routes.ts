import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DebtFileGenerator } from '../../../infrastructure/off-host/debt-file.generator.js';
import { PaymentFileParser } from '../../../infrastructure/off-host/payment-file.parser.js';
import { ReconciliationService } from '../../../infrastructure/off-host/reconciliation.service.js';
import { asbancAuthMiddleware } from '../middlewares/auth.middleware.js';

export async function offHostRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/OffHost/GenerateDebts',
    { preHandler: [asbancAuthMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body as any) || {};
      const tipoActualizacion = body.tipoActualizacion === 'A' ? 'A' : 'R';
      const secuencia = typeof body.secuencia === 'number' ? body.secuencia : 1;
      const download = Boolean(body.download);

      const result = await DebtFileGenerator.generate({
        tipoActualizacion,
        secuencia,
        codigoEmpresa: body.codigoEmpresa,
        outputDir: body.outputDir || 'storage/off-host',
      });

      if (download) {
        reply.header('Content-Type', 'text/plain; charset=windows-1252');
        reply.header('Content-Disposition', `attachment; filename="${result.fileName}"`);
        return reply.status(200).send(result.content);
      }

      return reply.status(200).send({
        codigoRespuesta: '00',
        descripcionResp: 'ARCHIVO DE DEUDAS GENERADO CON EXITO',
        fileName: result.fileName,
        filePath: result.filePath,
        totalRecords: result.totalRecords,
        importeTotalSoles: result.importeTotalSoles,
        importeTotalDolares: result.importeTotalDolares,
      });
    },
  );

  fastify.post(
    '/api/OffHost/ProcessPayments',
    { preHandler: [asbancAuthMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body as any) || {};
      const fileName = body.fileName || 'FTRPAG_INPUT.TXT';
      const fileContent = body.fileContent as string;

      if (!fileContent || typeof fileContent !== 'string') {
        return reply.status(400).send({
          codigoRespuesta: '99',
          descripcionResp: 'DEBE SUMINISTRAR fileContent CON EL TEXTO DEL ARCHIVO DE PAGOS',
        });
      }

      try {
        const records = PaymentFileParser.parseFile(fileContent);
        const result = await PaymentFileParser.applyPaymentsToDb(fileName, records);

        return reply.status(200).send({
          codigoRespuesta: '00',
          descripcionResp: 'ARCHIVO DE PAGOS PROCESADO CON EXITO',
          ...result,
        });
      } catch (err: any) {
        return reply.status(400).send({
          codigoRespuesta: '99',
          descripcionResp: `ERROR AL PROCESAR ARCHIVO DE PAGOS: ${err.message}`,
        });
      }
    },
  );

  fastify.post(
    '/api/OffHost/Reconcile',
    { preHandler: [asbancAuthMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body as any) || {};
      const fileName = body.fileName || 'FTRPAG_RECONCILE.TXT';
      const fileContent = body.fileContent as string;

      if (!fileContent || typeof fileContent !== 'string') {
        return reply.status(400).send({
          codigoRespuesta: '99',
          descripcionResp: 'DEBE SUMINISTRAR fileContent CON EL TEXTO DEL ARCHIVO DE PAGOS',
        });
      }

      try {
        const report = await ReconciliationService.reconcile({
          archivoPagosNombre: fileName,
          contenidoArchivoPagos: fileContent,
        });

        return reply.status(200).send({
          codigoRespuesta: '00',
          descripcionResp: 'CONCILIACION EJECUTADA CON EXITO',
          report,
        });
      } catch (err: any) {
        return reply.status(400).send({
          codigoRespuesta: '99',
          descripcionResp: `ERROR EN CONCILIACION: ${err.message}`,
        });
      }
    },
  );
}
