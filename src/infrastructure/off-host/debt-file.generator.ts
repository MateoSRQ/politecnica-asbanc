import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';
import { DebtDetailRecord, DebtFileHeader, UpdateTypeHeader } from '../../core/types/off-host.types.js';
import {
  formatAN,
  formatDateDDMMAAAA,
  formatN,
  formatTimeHHMMSS,
  generateDebtFileName,
} from '../../core/utils/flat-file.util.js';
import { getMssqlPool } from '../database/mssql.connection.js';
import { logger } from '../telemetry/logger.js';

export interface GenerateDebtFileOptions {
  tipoActualizacion?: UpdateTypeHeader;
  codigoEmpresa?: string;
  fecha?: Date;
  secuencia?: number;
  outputDir?: string;
  customRecords?: DebtDetailRecord[];
}

export interface GenerateDebtFileResult {
  fileName: string;
  filePath?: string;
  totalRecords: number;
  importeTotalSoles: number;
  importeTotalDolares: number;
  content: string;
}

export class DebtFileGenerator {
  public static formatHeader(header: DebtFileHeader): string {
    const p1_nombre = formatAN(header.nombreArchivo, 21);
    const p2_tipoAct = formatAN(header.tipoActualizacion, 1);
    const p3_empresa = formatAN(header.codigoEmpresa, 7);
    const p4_fecha = formatAN(header.fechaTransmision, 8);
    const p5_hora = formatAN(header.horaTransmision, 6);
    const p6_numReg = formatN(header.numeroRegistros, 9);
    const p7_impSoles = formatN(header.importeTotalSoles, 15, 2);
    const p8_impDolares = formatN(header.importeTotalDolares, 15, 2);
    const p9_filler = formatAN(header.filler || '', 120);
    const p10_mac = formatN(header.mac || 0, 8);

    const line = `${p1_nombre}${p2_tipoAct}${p3_empresa}${p4_fecha}${p5_hora}${p6_numReg}${p7_impSoles}${p8_impDolares}${p9_filler}${p10_mac}`;
    if (line.length !== 210) {
      throw new Error(`Longitud inválida en cabecera de deudas: ${line.length} (debe ser 210 caracteres).`);
    }
    return line;
  }

  public static formatDetail(record: DebtDetailRecord): string {
    const p1_tipoAct = formatAN(record.tipoActualizacion, 1);
    const p2_codCli = formatAN(record.codigoCliente, 14);
    const p3_nomCli = formatAN(record.nombreCliente, 30);
    const p4_codProd = formatAN(record.codigoProducto, 3);
    const p5_numDoc = formatAN(record.numeroDocumento, 16);
    const p6_descDoc = formatAN(record.descripcionDocumento, 20);
    const p7_fecVenc = formatAN(record.fechaVencimiento, 8);
    const p8_fecEmis = formatAN(record.fechaEmision, 8);
    const p9_deuda = formatN(record.deuda, 12, 2);
    const p10_mora = formatN(record.mora, 12, 2);
    const p11_gastos = formatN(record.gastosAdministrativos, 12, 2);
    const p12_pagoMin = formatN(record.pagoMinimo, 12, 2);
    const p13_periodo = formatAN(record.periodo, 2);
    const p14_anio = formatN(record.anio, 4);
    const p15_cuota = formatAN(record.cuota, 2);
    const p16_moneda = formatAN(record.monedaDocumento, 1);
    const p17_filler = formatAN(record.filler || '', 20);
    const p18_flag = 'F';

    const line = `${p1_tipoAct}${p2_codCli}${p3_nomCli}${p4_codProd}${p5_numDoc}${p6_descDoc}${p7_fecVenc}${p8_fecEmis}${p9_deuda}${p10_mora}${p11_gastos}${p12_pagoMin}${p13_periodo}${p14_anio}${p15_cuota}${p16_moneda}${p17_filler}${p18_flag}`;
    if (line.length !== 178) {
      throw new Error(`Longitud inválida en detalle de deuda: ${line.length} (debe ser 178 caracteres).`);
    }
    return line;
  }

  public static async fetchPendingDebtsFromDb(): Promise<DebtDetailRecord[]> {
    const pool = await getMssqlPool();
    const records: DebtDetailRecord[] = [];

    try {
      const result = await pool.request().query(`
        SELECT TOP 5000
          ap.id AS pago_id,
          alu.codigo_alumno AS codigo_alumno,
          LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_cliente,
          ROUND(ISNULL(Ctas_Ctes.ObtieneMontoPago(ap.id), ap.monto), 2) AS deuda,
          0 AS mora,
          ap.fecha_vencimiento,
          ISNULL(ap.fecha_generacion, ap.created_at) AS fecha_emision,
          ap.num_cuota,
          ap.param_estado_pago_id,
          CASE WHEN ap.num_cuota = 0 THEN 'MATRICULA' ELSE 'CUOTA ' + CAST(ap.num_cuota AS VARCHAR) END AS concepto_nombre,
          p.nombre AS periodo_nombre,
          p.fecha_inicio AS periodo_inicio
        FROM Ctas_Ctes.Alumno_Pago ap WITH (NOLOCK)
        INNER JOIN Academico.Alumno alu WITH (NOLOCK) ON ap.alumno_id = alu.id
        INNER JOIN General.Persona per WITH (NOLOCK) ON alu.persona_id = per.id
        LEFT JOIN Ctas_Ctes.Alumno_Pago_Cuota apc WITH (NOLOCK) ON ap.id = apc.alumno_pago_id
        LEFT JOIN Ctas_Ctes.Alumno_Cuota ac WITH (NOLOCK) ON apc.alumno_cuota_id = ac.id
        LEFT JOIN Carga_Academica.Carga_Academica_Sede cas WITH (NOLOCK) ON ap.carga_academica_sede_id = cas.id
        LEFT JOIN Carga_Academica.Carga_Academica ca WITH (NOLOCK) ON cas.carga_academica_id = ca.id
        LEFT JOIN General.Periodo p WITH (NOLOCK) ON ca.periodo_id = p.id
        WHERE ap.param_estado_pago_id = 25 -- Pendiente
        ORDER BY alu.codigo_alumno ASC, ap.fecha_vencimiento ASC;
      `);

      if (result.recordset && result.recordset.length > 0) {
        for (const row of result.recordset) {
          const fVenc = row.fecha_vencimiento ? formatDateDDMMAAAA(new Date(row.fecha_vencimiento)) : '01012027';
          const fEmis = row.fecha_emision ? formatDateDDMMAAAA(new Date(row.fecha_emision)) : fVenc;
          const anio = row.periodo_inicio ? new Date(row.periodo_inicio).getFullYear() : new Date().getFullYear();
          const cuotaStr = String(row.num_cuota || '1').padStart(2, '0');
          const totalDeuda = Number(row.deuda || 0) + Number(row.mora || 0);

          records.push({
            tipoActualizacion: 'N',
            codigoCliente: String(row.codigo_alumno || '').trim(),
            nombreCliente: String(row.nombre_cliente || '').trim(),
            codigoProducto: '001',
            numeroDocumento: `P${String(row.pago_id).padStart(9, '0')}`,
            descripcionDocumento: String(row.concepto_nombre || `CUOTA ${cuotaStr}`).trim(),
            fechaVencimiento: fVenc,
            fechaEmision: fEmis,
            deuda: Number(row.deuda || 0),
            mora: Number(row.mora || 0),
            gastosAdministrativos: 0,
            pagoMinimo: totalDeuda,
            periodo: '01',
            anio,
            cuota: cuotaStr,
            monedaDocumento: '1',
          });
        }
        return records;
      }
    } catch (err: any) {
      logger.info(
        { err: err.message },
        'BDACADEMICO6 no contiene tablas de cuotas o no accesible, buscando en politecnica_asbanc.dbo.Deudas...',
      );
    }

    if (env.TEST_MODE) {
      try {
        const fallbackResult = await pool.request().query(`
          SELECT
            d.IdDeuda,
            c.IdConsulta AS codigo_cliente,
            c.NombreCliente AS nombre_cliente,
            d.CodigoProducto,
            d.NumDocumento,
            d.Descripcion,
            d.FechaVencimiento,
            d.ImporteTotal,
            d.Mora,
            d.Moneda,
            d.Periodo,
            d.Anio,
            d.Cuota
          FROM dbo.Deudas d WITH (NOLOCK)
          INNER JOIN dbo.Clientes c WITH (NOLOCK) ON d.IdConsulta = c.IdConsulta
          WHERE d.Estado = 'PENDIENTE';
        `);

        for (const row of fallbackResult.recordset) {
          records.push({
            tipoActualizacion: 'N',
            codigoCliente: String(row.codigo_cliente).trim(),
            nombreCliente: String(row.nombre_cliente).trim(),
            codigoProducto: String(row.CodigoProducto || '001').trim(),
            numeroDocumento: String(row.NumDocumento).trim(),
            descripcionDocumento: String(row.Descripcion || 'PAGO DEUDA').trim(),
            fechaVencimiento: String(row.FechaVencimiento || '01012027'),
            fechaEmision: String(row.FechaVencimiento || '01012027'),
            deuda: Number(row.ImporteTotal || 0),
            mora: Number(row.Mora || 0),
            gastosAdministrativos: 0,
            pagoMinimo: Number(row.ImporteTotal || 0) + Number(row.Mora || 0),
            periodo: String(row.Periodo || '01').padStart(2, '0'),
            anio: Number(row.Anio || new Date().getFullYear()),
            cuota: String(row.Cuota || '01').padStart(2, '0'),
            monedaDocumento: row.Moneda === '2' ? '2' : '1',
          });
        }
      } catch (e: any) {
        logger.warn({ err: e.message }, 'No se pudo obtener deudas de fallback.');
      }
    }

    return records;
  }

  public static async generate(options: GenerateDebtFileOptions = {}): Promise<GenerateDebtFileResult> {
    const fecha = options.fecha || new Date();
    const secuencia = options.secuencia || 1;
    const tipoActualizacion = options.tipoActualizacion || 'R';
    const codigoEmpresa = options.codigoEmpresa || env.ASBANC_DEFAULT_COMPANY_CODE || '998';
    const fileName = generateDebtFileName(fecha, secuencia);

    const records = options.customRecords ? options.customRecords : await this.fetchPendingDebtsFromDb();

    let totalSoles = 0;
    let totalDolares = 0;
    for (const r of records) {
      const montoTotal = r.deuda + (r.mora || 0) + (r.gastosAdministrativos || 0);
      if (r.monedaDocumento === '2') {
        totalDolares += montoTotal;
      } else {
        totalSoles += montoTotal;
      }
    }

    const header: DebtFileHeader = {
      nombreArchivo: fileName,
      tipoActualizacion,
      codigoEmpresa,
      fechaTransmision: formatDateDDMMAAAA(fecha),
      horaTransmision: formatTimeHHMMSS(fecha),
      numeroRegistros: records.length,
      importeTotalSoles: Math.round(totalSoles * 100) / 100,
      importeTotalDolares: Math.round(totalDolares * 100) / 100,
      filler: '',
      mac: '00000000',
    };

    const headerLine = this.formatHeader(header);
    const detailLines = records.map((r) => this.formatDetail(r));

    const fileContent = [headerLine, ...detailLines, ''].join('\r\n');

    let filePath: string | undefined;
    if (options.outputDir) {
      if (!fs.existsSync(options.outputDir)) {
        fs.mkdirSync(options.outputDir, { recursive: true });
      }
      filePath = path.join(options.outputDir, fileName);
      fs.writeFileSync(filePath, fileContent, { encoding: 'latin1' });
      logger.info(
        { fileName, filePath, totalRecords: records.length },
        'Archivo Off-Host de deudas generado con éxito',
      );
    }

    return {
      fileName,
      filePath,
      totalRecords: records.length,
      importeTotalSoles: header.importeTotalSoles,
      importeTotalDolares: header.importeTotalDolares,
      content: fileContent,
    };
  }
}
