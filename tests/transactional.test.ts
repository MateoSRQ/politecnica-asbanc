import { describe, expect, it } from 'vitest';
import {
  listDebtsSchema,
  payDebtSchema,
  reversePaySchema,
  validateCustomerSchema,
} from '../src/core/schemas/asbanc.schemas.js';

describe('Pruebas de Esquemas ASBANC FTR V47 (Zod)', () => {
  describe('ValidateCustomer Schema', () => {
    it('debe validar un payload correcto de cliente', () => {
      const valid = {
        tipoConsulta: '1',
        idConsulta: '10000001',
        codigoEmpresa: '998',
        codigoProducto: '001',
      };
      const result = validateCustomerSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('debe rechazar caracteres especiales o espacios intermedios en idConsulta', () => {
      const invalid = {
        tipoConsulta: '1',
        idConsulta: '1000 0001$',
        codigoEmpresa: '998',
        codigoProducto: '001',
      };
      const result = validateCustomerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('debe sanitizar automáticamente espacios en los extremos y convertir a mayúsculas', () => {
      const input = {
        tipoConsulta: ' 0 ',
        idConsulta: ' 2602335301a ',
        codigoEmpresa: ' 998 ',
        codigoProducto: ' 001 ',
      };
      const result = validateCustomerSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tipoConsulta).toBe('0');
        expect(result.data.idConsulta).toBe('2602335301A');
        expect(result.data.codigoEmpresa).toBe('998');
        expect(result.data.codigoProducto).toBe('001');
      }
    });
  });

  describe('ListDebts Schema', () => {
    it('debe validar una consulta de deudas con banco y canal', () => {
      const valid = {
        tipoConsulta: '1',
        idConsulta: '10000001',
        codigoEmpresa: '998',
        codigoProducto: '001',
        codigoBanco: '1020',
        canalPago: '10',
      };
      const result = listDebtsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('PayDebt Schema', () => {
    it('debe validar un payload de pago completo conforme', () => {
      const valid = {
        fechaTxn: '24052026',
        horaTxn: '153105',
        canalPago: '10',
        codigoBanco: '1020',
        numOperacionBanco: 'A05478452120',
        formaPago: '01',
        tipoConsulta: '1',
        idConsulta: '10000001',
        codigoProducto: '001',
        numDocumento: 'B01-0000000002',
        importePagado: 1500,
        monedaDoc: '1',
        codigoEmpresa: '998',
      };
      const result = payDebtSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('debe rechazar formatos de fecha u hora incorrectos', () => {
      const invalid = {
        fechaTxn: '2026-05-24', // Formato no permitido (debe ser DDMMAAAA)
        horaTxn: '15:31', // Debe ser HHMMSS
        canalPago: '10',
        codigoBanco: '1020',
        numOperacionBanco: 'A05478452120',
        formaPago: '01',
        tipoConsulta: '1',
        idConsulta: '10000001',
        codigoProducto: '001',
        numDocumento: 'B01-0000000002',
        importePagado: 1500,
        monedaDoc: '1',
        codigoEmpresa: '998',
      };
      const result = payDebtSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('debe rechazar importes negativos o iguales a cero', () => {
      const invalid = {
        fechaTxn: '24052026',
        horaTxn: '153105',
        canalPago: '10',
        codigoBanco: '1020',
        numOperacionBanco: 'A05478452120',
        formaPago: '01',
        tipoConsulta: '1',
        idConsulta: '10000001',
        codigoProducto: '001',
        numDocumento: 'B01-0000000002',
        importePagado: -50,
        monedaDoc: '1',
        codigoEmpresa: '998',
      };
      const result = payDebtSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('ReversePay Schema', () => {
    it('debe validar un payload de extorno de pago', () => {
      const valid = {
        fechaTxn: '24052026',
        horaTxn: '153205',
        codigoBanco: '1020',
        tipoConsulta: '1',
        idConsulta: '10000001',
        numOperacionBanco: 'A05478452120',
        numDocumento: 'B01-0000000002',
        codigoEmpresa: '998',
      };
      const result = reversePaySchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });
});
