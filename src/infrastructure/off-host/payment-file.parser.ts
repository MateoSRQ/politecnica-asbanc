import { PaymentDetailRecord, ProcessPaymentsResult } from '../../core/types/off-host.types.js';
import { formatAN, formatN, parseAN, parseN } from '../../core/utils/flat-file.util.js';
import { getMssqlPool, sql } from '../database/mssql.connection.js';
import { logger } from '../telemetry/logger.js';

export class PaymentFileParser {
  public static formatPaymentRecord(r: PaymentDetailRecord): string {
    const p1_tipoReg = formatAN(r.tipoRegistro || 'DD', 2);
    const p2_codSuc = formatAN(r.codigoSucursalCta || '000', 3);
    const p3_moneda = formatN(r.codigoMoneda === '2' ? 2 : 1, 1);
    const p4_cta = formatAN(r.numeroCuentaAfiliada || '', 20);
    const p5_codCli = formatAN(r.codigoCliente, 14);
    const p6_nomCli = formatAN(r.nombreCliente, 30);
    const p7_codProd = formatAN(r.codigoProducto || '001', 3);
    const p8_numDoc = formatAN(r.numeroDocumento, 16);
    const p9_fecVenc = formatAN(r.fechaVencimiento, 8);
    const p10_fecTxn = formatAN(r.fechaTransaccion, 8);
    const p11_horaTxn = formatAN(r.horaTransaccion, 6);
    const p12_importe = formatN(r.importePagado, 15, 2);
    const p13_agencia = formatAN(r.agencia || '', 15);
    const p14_dirAgencia = formatAN(r.direccionAgencia || '', 40);
    const p15_numOp = formatAN(r.numeroOperacionBanco, 12);
    const p16_canal = formatAN(r.canalPago || '10', 2);
    const p17_forma = formatAN(r.formaPago || '01', 2);
    const p18_fecCont = formatN(r.fechaPagoContable, 8);
    const p19_tipoOp = formatAN(r.tipoOperacion || 'P', 1);
    const p20_banco = formatN(r.codigoBanco || 1020, 4);
    const p21_filler = formatAN(r.filler || '', 30);

    const line = `${p1_tipoReg}${p2_codSuc}${p3_moneda}${p4_cta}${p5_codCli}${p6_nomCli}${p7_codProd}${p8_numDoc}${p9_fecVenc}${p10_fecTxn}${p11_horaTxn}${p12_importe}${p13_agencia}${p14_dirAgencia}${p15_numOp}${p16_canal}${p17_forma}${p18_fecCont}${p19_tipoOp}${p20_banco}${p21_filler}`;

    if (line.length !== 240) {
      throw new Error(`Longitud inválida en registro de pago: ${line.length} (debe ser 240 caracteres).`);
    }
    return line;
  }

  public static parsePaymentRecord(line: string): PaymentDetailRecord {
    const cleanLine = line.replace(/[\r\n]/g, '');
    if (cleanLine.length !== 240) {
      throw new Error(`La línea no cumple la longitud de 240 caracteres (longitud detectada: ${cleanLine.length}).`);
    }

    const tipoRegistro = parseAN(cleanLine, 1, 2);
    if (tipoRegistro !== 'DD') {
      throw new Error(`Tipo de registro inválido: '${tipoRegistro}'. Se esperaba 'DD'.`);
    }

    const codigoMonedaRaw = parseN(cleanLine, 6, 1);
    const tipoOpRaw = parseAN(cleanLine, 206, 1);

    return {
      tipoRegistro,
      codigoSucursalCta: parseAN(cleanLine, 3, 3),
      codigoMoneda: codigoMonedaRaw === 2 ? '2' : '1',
      numeroCuentaAfiliada: parseAN(cleanLine, 7, 20),
      codigoCliente: parseAN(cleanLine, 27, 14),
      nombreCliente: parseAN(cleanLine, 41, 30),
      codigoProducto: parseAN(cleanLine, 71, 3),
      numeroDocumento: parseAN(cleanLine, 74, 16),
      fechaVencimiento: parseAN(cleanLine, 90, 8),
      fechaTransaccion: parseAN(cleanLine, 98, 8),
      horaTransaccion: parseAN(cleanLine, 106, 6),
      importePagado: parseN(cleanLine, 112, 15, 2),
      agencia: parseAN(cleanLine, 127, 15),
      direccionAgencia: parseAN(cleanLine, 142, 40),
      numeroOperacionBanco: parseAN(cleanLine, 182, 12),
      canalPago: parseAN(cleanLine, 194, 2),
      formaPago: parseAN(cleanLine, 196, 2),
      fechaPagoContable: parseAN(cleanLine, 198, 8),
      tipoOperacion: tipoOpRaw === 'A' ? 'A' : 'P',
      codigoBanco: String(parseN(cleanLine, 207, 4)),
      filler: parseAN(cleanLine, 211, 30),
    };
  }

  public static parseFile(content: string): PaymentDetailRecord[] {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.map((line, idx) => {
      try {
        return this.parsePaymentRecord(line);
      } catch (err: any) {
        throw new Error(`Error en línea ${idx + 1}: ${err.message}`);
      }
    });
  }

  public static async applyPaymentsToDb(
    fileName: string,
    records: PaymentDetailRecord[],
  ): Promise<ProcessPaymentsResult> {
    const pool = await getMssqlPool();
    let pagosAplicados = 0;
    let extornosAplicados = 0;
    let totalSoles = 0;
    let totalDolares = 0;
    const errores: Array<{ linea: number; numeroDocumento: string; numOperacionBanco: string; error: string }> = [];

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const linea = i + 1;

      if (rec.codigoMoneda === '2') {
        totalDolares += rec.importePagado;
      } else {
        totalSoles += rec.importePagado;
      }

      const numericDocMatch = rec.numeroDocumento.replace(/^P/i, '').match(/^\d+$/);
      const pagoId = numericDocMatch ? parseInt(numericDocMatch[0], 10) : null;

      try {
        if (rec.tipoOperacion === 'P') {
          if (pagoId) {
            const checkQuery = await pool
              .request()
              .input('PagoId', sql.Int, pagoId)
              .query('SELECT param_estado_pago_id FROM Ctas_Ctes.Alumno_Pago WITH (NOLOCK) WHERE id = @PagoId;');

            if (checkQuery.recordset.length > 0) {
              const currentStatus = checkQuery.recordset[0].param_estado_pago_id;
              if (currentStatus === 25) {
                await pool
                  .request()
                  .input('PagoId', sql.Int, pagoId)
                  .input('LugarPago', sql.VarChar(50), `OFFHOST_${rec.codigoBanco}`).query(`
                    UPDATE Ctas_Ctes.Alumno_Pago
                    SET param_estado_pago_id = 16,
                        fecha_pago = GETDATE(),
                        lugar_pago = @LugarPago
                    WHERE id = @PagoId;
                  `);

                await pool
                  .request()
                  .input('PagoId', sql.Int, pagoId)
                  .input('NumDocumento', sql.VarChar(50), rec.numeroOperacionBanco)
                  .input('Monto', sql.Decimal(10, 2), rec.importePagado).query(`
                    INSERT INTO Ctas_Ctes.Alumno_Pago_Detalle (
                      alumno_pago_id, item, param_tipo_comprobante_id, serie, num_documento,
                      fecha_emision, monto, param_estado_pago_detalle_id, created_at
                    ) VALUES (
                      @PagoId, 1, 1, 'ASB', @NumDocumento, GETDATE(), @Monto, 1, GETDATE()
                    );
                  `);
                pagosAplicados++;
              } else if (currentStatus === 16) {
                pagosAplicados++;
              } else {
                errores.push({
                  linea,
                  numeroDocumento: rec.numeroDocumento,
                  numOperacionBanco: rec.numeroOperacionBanco,
                  error: `Estado de cuota incompatible: ${currentStatus}`,
                });
              }
            } else {
              errores.push({
                linea,
                numeroDocumento: rec.numeroDocumento,
                numOperacionBanco: rec.numeroOperacionBanco,
                error: 'Documento no encontrado en BDACADEMICO6',
              });
            }
          } else {
            pagosAplicados++;
          }
        } else if (rec.tipoOperacion === 'A') {
          if (pagoId) {
            await pool
              .request()
              .input('PagoId', sql.Int, pagoId)
              .input('NumOpBanco', sql.VarChar(50), rec.numeroOperacionBanco).query(`
                UPDATE Ctas_Ctes.Alumno_Pago
                SET param_estado_pago_id = 25,
                    fecha_pago = NULL,
                    lugar_pago = NULL
                WHERE id = @PagoId;

                DELETE FROM Ctas_Ctes.Alumno_Pago_Detalle
                WHERE alumno_pago_id = @PagoId
                  AND num_documento = @NumOpBanco;
              `);
            extornosAplicados++;
          } else {
            extornosAplicados++;
          }
        }
      } catch (err: any) {
        errores.push({
          linea,
          numeroDocumento: rec.numeroDocumento,
          numOperacionBanco: rec.numeroOperacionBanco,
          error: err.message,
        });
      }
    }

    return {
      archivoProcesado: fileName,
      totalRegistros: records.length,
      pagosAplicados,
      extornosAplicados,
      errores,
      montoTotalSoles: Math.round(totalSoles * 100) / 100,
      montoTotalDolares: Math.round(totalDolares * 100) / 100,
    };
  }
}
