export interface TransactionMetrics {
  responseTimeMs: number;
  executionTimeMs: number;
  unit: string;
}

export interface ValidateCustomerResponse {
  codigoRespuesta: string;
  descripcionResp: string;
  nombreCliente: string;
  metrics?: TransactionMetrics;
  responseTimeMs?: number;
}

export interface DebtItem {
  codigoProducto: string;
  numDocumento: string;
  descDocumento: string;
  fechaVencimiento: string; // DDMMAAAA
  fechaEmision: string; // DDMMAAAA
  deuda: number;
  pagoMinimo: number;
  monedaDoc: string;
}

export interface ListDebtsResponse {
  codigoRespuesta: string;
  descripcionResp: string;
  deudasPendientes: DebtItem[];
  metrics?: TransactionMetrics;
  responseTimeMs?: number;
}

export interface PayDebtResponse {
  codigoRespuesta: string;
  nombreCliente: string;
  numOperacionERP: string;
  descripcionResp: string;
  metrics?: TransactionMetrics;
  responseTimeMs?: number;
}

export interface ReversePayResponse {
  codigoRespuesta: string;
  nombreCliente: string;
  numOperacionERP: string;
  descripcionResp: string;
  metrics?: TransactionMetrics;
  responseTimeMs?: number;
}
