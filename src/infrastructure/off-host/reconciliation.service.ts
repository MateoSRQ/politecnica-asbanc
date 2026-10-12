import {
  PaymentDetailRecord,
  ReconciliationDiscrepancy,
  ReconciliationReport,
} from '../../core/types/off-host.types.js';
import { getMssqlPool, sql } from '../database/mssql.connection.js';
import { logger } from '../telemetry/logger.js';
import { PaymentFileParser } from './payment-file.parser.js';

export interface ReconcileOptions {
  archivoPagosNombre: string;
  contenidoArchivoPagos?: string;
  registrosPagos?: PaymentDetailRecord[];
  fechaDesde?: string;
  fechaHasta?: string;
}

export class ReconciliationService {
  public static async reconcile(options: ReconcileOptions): Promise<ReconciliationReport> {
    const records = options.registrosPagos
      ? options.registrosPagos
      : options.contenidoArchivoPagos
        ? PaymentFileParser.parseFile(options.contenidoArchivoPagos)
        : [];

    const pool = await getMssqlPool();
    const discrepancias: ReconciliationDiscrepancy[] = [];

    let onHostTxns: Array<{
      numOperacionBanco: string;
      codigoBanco: string;
      idConsulta: string;
      codigoRespuesta: string;
      monto: number;
      metodo: string;
      createdAt: Date;
    }> = [];

    try {
      let tableName = 'dbo.AuditoriaLogs';
      try {
        const check = await pool.request().query("SELECT OBJECT_ID('dbo.AuditoriaLogs', 'U') AS tblId;");
        if (!check.recordset[0]?.tblId) {
          tableName = 'politecnica_asbanc.dbo.AuditoriaLogs';
        }
      } catch {
        tableName = 'politecnica_asbanc.dbo.AuditoriaLogs';
      }

      const auditResult = await pool.request().query(`
        SELECT
          NumOperacionBanco AS numOperacionBanco,
          CodigoBanco AS codigoBanco,
          IdConsulta AS idConsulta,
          CodigoRespuesta AS codigoRespuesta,
          Metodo AS metodo,
          CreatedAt AS createdAt,
          RequestPayload AS requestPayload
        FROM ${tableName} WITH (NOLOCK)
        WHERE NumOperacionBanco IS NOT NULL
          AND Metodo LIKE '%PayDebt%'
          AND CodigoRespuesta = '00'
        ORDER BY CreatedAt DESC;
      `);

      for (const row of auditResult.recordset) {
        let monto = 0;
        try {
          const parsed = JSON.parse(row.requestPayload || '{}');
          monto = Number(parsed.importePagado || 0);
        } catch {}

        onHostTxns.push({
          numOperacionBanco: String(row.numOperacionBanco).trim(),
          codigoBanco: String(row.codigoBanco || '').trim(),
          idConsulta: String(row.idConsulta || '').trim(),
          codigoRespuesta: String(row.codigoRespuesta || '').trim(),
          monto,
          metodo: String(row.metodo || '').trim(),
          createdAt: row.createdAt,
        });
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'No se pudo leer AuditoriaLogs para conciliación.');
    }

    const onHostMap = new Map<string, (typeof onHostTxns)[0]>();
    for (const txn of onHostTxns) {
      const key = `${txn.codigoBanco}_${txn.numOperacionBanco}`;
      onHostMap.set(key, txn);
    }

    let totalCoincidentes = 0;
    let montoTotalOffHost = 0;
    let montoTotalOnHost = 0;
    const offHostMatchedKeys = new Set<string>();

    for (const off of records) {
      montoTotalOffHost += off.importePagado;
      const key = `${off.codigoBanco}_${off.numeroOperacionBanco}`;
      const onMatch = onHostMap.get(key);

      if (onMatch) {
        offHostMatchedKeys.add(key);
        montoTotalOnHost += onMatch.monto;

        if (Math.abs(off.importePagado - onMatch.monto) > 0.01 && onMatch.monto > 0) {
          discrepancias.push({
            tipo: 'DIFERENCIA_MONTO',
            numOperacionBanco: off.numeroOperacionBanco,
            codigoBanco: off.codigoBanco,
            numeroDocumento: off.numeroDocumento,
            codigoAlumno: off.codigoCliente,
            montoOffHost: off.importePagado,
            montoOnHost: onMatch.monto,
            detalle: `Discrepancia de monto: Off-Host reporta ${off.importePagado}, On-Host registró ${onMatch.monto}`,
          });
        } else {
          totalCoincidentes++;
        }
      } else {
        discrepancias.push({
          tipo: 'SOLO_EN_OFFHOST',
          numOperacionBanco: off.numeroOperacionBanco,
          codigoBanco: off.codigoBanco,
          numeroDocumento: off.numeroDocumento,
          codigoAlumno: off.codigoCliente,
          montoOffHost: off.importePagado,
          detalle: 'Operación presente en archivo Off-Host pero no registrada en On-Host (Pago diferido o Stand-In)',
        });
      }
    }

    const totalOperacionesOffHost = records.length;
    const totalOperacionesOnHost = onHostTxns.length;
    const totalDiscrepancias = discrepancias.length;
    const porcentajeCoincidencia =
      totalOperacionesOffHost > 0 ? Math.round((totalCoincidentes / totalOperacionesOffHost) * 1000) / 10 : 100;

    return {
      fechaConciliacion: new Date().toISOString(),
      archivoPagos: options.archivoPagosNombre,
      totalOperacionesOffHost,
      totalOperacionesOnHost,
      totalCoincidentes,
      totalDiscrepancias,
      montoTotalOffHost: Math.round(montoTotalOffHost * 100) / 100,
      montoTotalOnHost: Math.round(montoTotalOnHost * 100) / 100,
      porcentajeCoincidencia,
      discrepancias,
    };
  }
}
