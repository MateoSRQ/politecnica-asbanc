import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { DebtDetailRecord, PaymentDetailRecord } from '../src/core/types/off-host.types.js';
import { DebtFileGenerator } from '../src/infrastructure/off-host/debt-file.generator.js';
import { PaymentFileParser } from '../src/infrastructure/off-host/payment-file.parser.js';
import { ReconciliationService } from '../src/infrastructure/off-host/reconciliation.service.js';
import { buildServer } from '../src/server.js';

describe('Módulo OFF HOST - Especificación ASBANC FTR / YAPAGO V47', () => {
  let server: any;
  const authHeader = `Basic ${env.ASBANC_AUTH_SECRET}`;

  beforeAll(async () => {
    server = buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('1. Formateo y Validación Posicional Estricta', () => {
    it('Debe formatear la cabecera de deudas con EXACTAMENTE 210 caracteres', () => {
      const headerLine = DebtFileGenerator.formatHeader({
        nombreArchivo: 'FTRCOB21092026001.TXT',
        tipoActualizacion: 'R',
        codigoEmpresa: '998',
        fechaTransmision: '21092026',
        horaTransmision: '120000',
        numeroRegistros: 10,
        importeTotalSoles: 12500.5,
        importeTotalDolares: 0,
      });

      expect(headerLine).toHaveLength(210);
      expect(headerLine.substring(0, 21)).toBe('FTRCOB21092026001.TXT');
      expect(headerLine.substring(21, 22)).toBe('R');
      expect(headerLine.substring(22, 29)).toBe('998    ');
      expect(headerLine.substring(29, 37)).toBe('21092026');
      expect(headerLine.substring(37, 43)).toBe('120000');
      expect(headerLine.substring(43, 52)).toBe('000000010');
      expect(headerLine.substring(52, 67)).toBe('000000001250050');
    });

    it('Debe formatear el detalle de deudas con EXACTAMENTE 178 caracteres y flag de cierre F', () => {
      const detailLine = DebtFileGenerator.formatDetail({
        tipoActualizacion: 'N',
        codigoCliente: '26023353010012',
        nombreCliente: 'PEREZ JUAN CARLOS',
        codigoProducto: '001',
        numeroDocumento: 'P000010726',
        descripcionDocumento: 'CUOTA 01 PENSION',
        fechaVencimiento: '25092026',
        fechaEmision: '01092026',
        deuda: 833.33,
        mora: 0,
        gastosAdministrativos: 0,
        pagoMinimo: 833.33,
        periodo: '01',
        anio: 2026,
        cuota: '01',
        monedaDocumento: '1',
      });

      expect(detailLine).toHaveLength(178);
      expect(detailLine.substring(0, 1)).toBe('N');
      expect(detailLine.substring(1, 15)).toBe('26023353010012');
      expect(detailLine.substring(15, 45)).toBe('PEREZ JUAN CARLOS             ');
      expect(detailLine.substring(45, 48)).toBe('001');
      expect(detailLine.substring(48, 64)).toBe('P000010726      ');
      expect(detailLine.charAt(177)).toBe('F');
    });

    it('Debe formatear el registro de pago con EXACTAMENTE 240 caracteres y prefijo DD', () => {
      const paymentLine = PaymentFileParser.formatPaymentRecord({
        tipoRegistro: 'DD',
        codigoSucursalCta: '000',
        codigoMoneda: '1',
        numeroCuentaAfiliada: '00110000123456789012',
        codigoCliente: '26023353010012',
        nombreCliente: 'PEREZ JUAN CARLOS',
        codigoProducto: '001',
        numeroDocumento: 'P000010726',
        fechaVencimiento: '25092026',
        fechaTransaccion: '21092026',
        horaTransaccion: '153000',
        importePagado: 833.33,
        agencia: 'AG_MIRAFLORES',
        direccionAgencia: 'AV LARCO 123',
        numeroOperacionBanco: 'OP12345678',
        canalPago: '10',
        formaPago: '01',
        fechaPagoContable: '21092026',
        tipoOperacion: 'P',
        codigoBanco: '1020',
      });

      expect(paymentLine).toHaveLength(240);
      expect(paymentLine.substring(0, 2)).toBe('DD');
      expect(paymentLine.substring(2, 5)).toBe('000');
      expect(paymentLine.substring(5, 6)).toBe('1');
      expect(paymentLine.substring(181, 193)).toBe('OP12345678  ');
      expect(paymentLine.substring(193, 195)).toBe('10');
      expect(paymentLine.substring(205, 206)).toBe('P');
      expect(paymentLine.substring(206, 210)).toBe('1020');
    });
  });

  describe('2. Generador y Parser de Archivos Planos', () => {
    it('Debe parsear correctamente un registro de pago generado', () => {
      const original: PaymentDetailRecord = {
        tipoRegistro: 'DD',
        codigoSucursalCta: '000',
        codigoMoneda: '1',
        numeroCuentaAfiliada: '19198765432100000000',
        codigoCliente: '26023353010012',
        nombreCliente: 'ALUMNO TEST',
        codigoProducto: '001',
        numeroDocumento: 'P000010726',
        fechaVencimiento: '28092026',
        fechaTransaccion: '21092026',
        horaTransaccion: '141030',
        importePagado: 500.25,
        agencia: 'AGENCIA_01',
        direccionAgencia: 'CALLE PRINCIPAL 456',
        numeroOperacionBanco: 'OP99887766',
        canalPago: '60',
        formaPago: '02',
        fechaPagoContable: '21092026',
        tipoOperacion: 'P',
        codigoBanco: '1023',
      };

      const rawLine = PaymentFileParser.formatPaymentRecord(original);
      const parsed = PaymentFileParser.parsePaymentRecord(rawLine);

      expect(parsed.tipoRegistro).toBe('DD');
      expect(parsed.codigoCliente).toBe('26023353010012');
      expect(parsed.numeroDocumento).toBe('P000010726');
      expect(parsed.importePagado).toBe(500.25);
      expect(parsed.numeroOperacionBanco).toBe('OP99887766');
      expect(parsed.canalPago).toBe('60');
      expect(parsed.tipoOperacion).toBe('P');
      expect(parsed.codigoBanco).toBe('1023');
    });

    it('Debe generar un archivo de deudas en memoria con cabecera y registros', async () => {
      const customRecords: DebtDetailRecord[] = [
        {
          tipoActualizacion: 'N',
          codigoCliente: 'ALU001',
          nombreCliente: 'ESTUDIANTE UNO',
          codigoProducto: '001',
          numeroDocumento: 'DOC001',
          descripcionDocumento: 'PENSION MARZO',
          fechaVencimiento: '31032026',
          fechaEmision: '01032026',
          deuda: 750,
          mora: 0,
          gastosAdministrativos: 0,
          pagoMinimo: 750,
          periodo: '01',
          anio: 2026,
          cuota: '01',
          monedaDocumento: '1',
        },
        {
          tipoActualizacion: 'N',
          codigoCliente: 'ALU002',
          nombreCliente: 'ESTUDIANTE DOS',
          codigoProducto: '001',
          numeroDocumento: 'DOC002',
          descripcionDocumento: 'PENSION MARZO',
          fechaVencimiento: '31032026',
          fechaEmision: '01032026',
          deuda: 850,
          mora: 0,
          gastosAdministrativos: 0,
          pagoMinimo: 850,
          periodo: '01',
          anio: 2026,
          cuota: '01',
          monedaDocumento: '1',
        },
      ];

      const result = await DebtFileGenerator.generate({
        customRecords,
        secuencia: 1,
      });

      expect(result.fileName).toMatch(/^FTRCOB\d{8}001\.TXT$/);
      expect(result.totalRecords).toBe(2);
      expect(result.importeTotalSoles).toBe(1600);

      const lines = result.content.split('\r\n').filter((l) => l.length > 0);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toHaveLength(210);
      expect(lines[1]).toHaveLength(178);
      expect(lines[2]).toHaveLength(178);
    });
  });

  describe('3. Conciliación Diaria (ReconciliationService)', () => {
    it('Debe identificar coincidencias y registrar discrepancias adecuadamente', async () => {
      const records: PaymentDetailRecord[] = [
        {
          tipoRegistro: 'DD',
          codigoSucursalCta: '000',
          codigoMoneda: '1',
          numeroCuentaAfiliada: '',
          codigoCliente: 'ALU_CONC_01',
          nombreCliente: 'CLIENTE CONCILIADO',
          codigoProducto: '001',
          numeroDocumento: 'P10001',
          fechaVencimiento: '30092026',
          fechaTransaccion: '21092026',
          horaTransaccion: '100000',
          importePagado: 500,
          agencia: 'AG_CENTRAL',
          direccionAgencia: '',
          numeroOperacionBanco: 'OP_NO_EXISTE_ONHOST',
          canalPago: '10',
          formaPago: '01',
          fechaPagoContable: '21092026',
          tipoOperacion: 'P',
          codigoBanco: '1020',
        },
      ];

      const report = await ReconciliationService.reconcile({
        archivoPagosNombre: 'FTRPAG21092026001.TXT',
        registrosPagos: records,
      });

      expect(report.archivoPagos).toBe('FTRPAG21092026001.TXT');
      expect(report.totalOperacionesOffHost).toBe(1);
      expect(report.totalDiscrepancias).toBe(1);
      expect(report.discrepancias[0].tipo).toBe('SOLO_EN_OFFHOST');
      expect(report.discrepancias[0].numOperacionBanco).toBe('OP_NO_EXISTE_ONHOST');
    });
  });

  describe('4. Endpoints HTTP Off-Host (/api/OffHost)', () => {
    it('POST /api/OffHost/GenerateDebts debe generar el padrón de deudas', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/OffHost/GenerateDebts',
        headers: { Authorization: authHeader },
        payload: {
          tipoActualizacion: 'R',
          secuencia: 1,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.codigoRespuesta).toBe('00');
      expect(data.fileName).toMatch(/^FTRCOB/);
      expect(typeof data.totalRecords).toBe('number');
    });

    it('POST /api/OffHost/ProcessPayments debe procesar un payload plano válido', async () => {
      const samplePayment = PaymentFileParser.formatPaymentRecord({
        tipoRegistro: 'DD',
        codigoSucursalCta: '000',
        codigoMoneda: '1',
        numeroCuentaAfiliada: '',
        codigoCliente: '26023353010012',
        nombreCliente: 'ALUMNO PRUEBA',
        codigoProducto: '001',
        numeroDocumento: 'P99999999',
        fechaVencimiento: '25092026',
        fechaTransaccion: '21092026',
        horaTransaccion: '110000',
        importePagado: 250,
        agencia: 'AG_TEST',
        direccionAgencia: '',
        numeroOperacionBanco: 'OP_TEST_OFFHOST',
        canalPago: '10',
        formaPago: '01',
        fechaPagoContable: '21092026',
        tipoOperacion: 'P',
        codigoBanco: '1020',
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/OffHost/ProcessPayments',
        headers: { Authorization: authHeader },
        payload: {
          fileName: 'FTRPAG21092026001.TXT',
          fileContent: samplePayment,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.codigoRespuesta).toBe('00');
      expect(data.totalRegistros).toBe(1);
    });

    it('POST /api/OffHost/Reconcile debe ejecutar conciliación cruzada', async () => {
      const samplePayment = PaymentFileParser.formatPaymentRecord({
        tipoRegistro: 'DD',
        codigoSucursalCta: '000',
        codigoMoneda: '1',
        numeroCuentaAfiliada: '',
        codigoCliente: '26023353010012',
        nombreCliente: 'ALUMNO PRUEBA',
        codigoProducto: '001',
        numeroDocumento: 'P000010726',
        fechaVencimiento: '25092026',
        fechaTransaccion: '21092026',
        horaTransaccion: '110000',
        importePagado: 833.33,
        agencia: 'AG_TEST',
        direccionAgencia: '',
        numeroOperacionBanco: 'OP_RECONCILE_01',
        canalPago: '10',
        formaPago: '01',
        fechaPagoContable: '21092026',
        tipoOperacion: 'P',
        codigoBanco: '1020',
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/OffHost/Reconcile',
        headers: { Authorization: authHeader },
        payload: {
          fileName: 'FTRPAG21092026001.TXT',
          fileContent: samplePayment,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.codigoRespuesta).toBe('00');
      expect(data.report).toBeDefined();
      expect(data.report.totalOperacionesOffHost).toBe(1);
    });
  });
});
