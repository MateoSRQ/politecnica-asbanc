import { z } from 'zod';

// Regex de caracteres permitidos según especificación ASBANC V47
// "No soporta caracteres especiales ni espacios en blanco, solo números y letras sin ningún tipo de acentuación. También se excluye la Ñ."
const alphanumericRegex = /^[a-zA-Z0-9-]+$/;
const dateRegex = /^\d{8}$/; // DDMMAAAA
const timeRegex = /^\d{6}$/; // HHMMSS

// 1. Validar Cliente
export const validateCustomerSchema = z.object({
  tipoConsulta: z.string().min(1).max(1),
  idConsulta: z.string().min(1).max(14).regex(alphanumericRegex, {
    message: 'idConsulta solo admite valores alfanuméricos sin espacios ni caracteres especiales',
  }),
  codigoEmpresa: z.string().min(1).max(3),
  codigoProducto: z.string().min(1).max(3),
});

// 2. Consultar Deudas
export const listDebtsSchema = z.object({
  tipoConsulta: z.string().min(1).max(1),
  idConsulta: z.string().min(1).max(14).regex(alphanumericRegex),
  codigoEmpresa: z.string().min(1).max(3),
  codigoProducto: z.string().min(1).max(3),
  codigoBanco: z.string().min(1).max(4),
  canalPago: z.string().min(1).max(2),
});

// 3. Pagar Deuda
export const payDebtSchema = z.object({
  fechaTxn: z.string().regex(dateRegex, { message: 'fechaTxn debe tener formato DDMMAAAA' }),
  horaTxn: z.string().regex(timeRegex, { message: 'horaTxn debe tener formato HHMMSS' }),
  canalPago: z.string().min(1).max(2),
  codigoBanco: z.string().min(1).max(4),
  numOperacionBanco: z.string().min(1).max(12),
  formaPago: z.string().min(1).max(2),
  tipoConsulta: z.string().min(1).max(1),
  idConsulta: z.string().min(1).max(14).regex(alphanumericRegex),
  codigoProducto: z.string().min(1).max(3),
  numDocumento: z.string().min(1).max(16),
  importePagado: z.coerce.number().positive(),
  monedaDoc: z.string().min(1).max(1).default('1'),
  codigoEmpresa: z.string().min(1).max(3),
});

// 4. Revertir Pago
export const reversePaySchema = z.object({
  fechaTxn: z.string().regex(dateRegex, { message: 'fechaTxn debe tener formato DDMMAAAA' }),
  horaTxn: z.string().regex(timeRegex, { message: 'horaTxn debe tener formato HHMMSS' }),
  codigoBanco: z.string().min(1).max(4),
  tipoConsulta: z.string().min(1).max(1).optional(),
  idConsulta: z.string().min(1).max(14).regex(alphanumericRegex).optional(),
  numOperacionBanco: z.string().min(1).max(12),
  numDocumento: z.string().min(1).max(16),
  codigoEmpresa: z.string().min(1).max(3),
});

export type ValidateCustomerInput = z.infer<typeof validateCustomerSchema>;
export type ListDebtsInput = z.infer<typeof listDebtsSchema>;
export type PayDebtInput = z.infer<typeof payDebtSchema>;
export type ReversePayInput = z.infer<typeof reversePaySchema>;
