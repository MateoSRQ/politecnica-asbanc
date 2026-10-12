export type UpdateTypeHeader = 'R' | 'A';
export type UpdateTypeDetail = 'N' | 'A' | 'D';

export interface DebtFileHeader {
  nombreArchivo: string;
  tipoActualizacion: UpdateTypeHeader;
  codigoEmpresa: string;
  fechaTransmision: string;
  horaTransmision: string;
  numeroRegistros: number;
  importeTotalSoles: number;
  importeTotalDolares: number;
  filler?: string;
  mac?: string;
}

export interface DebtDetailRecord {
  tipoActualizacion: UpdateTypeDetail;
  codigoCliente: string;
  nombreCliente: string;
  codigoProducto: string;
  numeroDocumento: string;
  descripcionDocumento: string;
  fechaVencimiento: string;
  fechaEmision: string;
  deuda: number;
  mora: number;
  gastosAdministrativos: number;
  pagoMinimo: number;
  periodo: string;
  anio: number;
  cuota: string;
  monedaDocumento: '1' | '2';
  filler?: string;
  flagCierre?: string;
}

export interface PaymentDetailRecord {
  tipoRegistro: string;
  codigoSucursalCta: string;
  codigoMoneda: '1' | '2';
  numeroCuentaAfiliada: string;
  codigoCliente: string;
  nombreCliente: string;
  codigoProducto: string;
  numeroDocumento: string;
  fechaVencimiento: string;
  fechaTransaccion: string;
  horaTransaccion: string;
  importePagado: number;
  agencia: string;
  direccionAgencia: string;
  numeroOperacionBanco: string;
  canalPago: string;
  formaPago: string;
  fechaPagoContable: string;
  tipoOperacion: 'P' | 'A';
  codigoBanco: string;
  filler?: string;
}

export interface ProcessPaymentsResult {
  archivoProcesado: string;
  totalRegistros: number;
  pagosAplicados: number;
  extornosAplicados: number;
  errores: Array<{
    linea: number;
    numeroDocumento: string;
    numOperacionBanco: string;
    error: string;
  }>;
  montoTotalSoles: number;
  montoTotalDolares: number;
}

export interface ReconciliationDiscrepancy {
  tipo: 'SOLO_EN_OFFHOST' | 'SOLO_EN_ONHOST' | 'DIFERENCIA_MONTO' | 'ESTADO_INCONSISTENTE';
  numOperacionBanco: string;
  codigoBanco: string;
  numeroDocumento: string;
  codigoAlumno: string;
  montoOnHost?: number;
  montoOffHost?: number;
  detalle: string;
}

export interface ReconciliationReport {
  fechaConciliacion: string;
  archivoPagos: string;
  totalOperacionesOffHost: number;
  totalOperacionesOnHost: number;
  totalCoincidentes: number;
  totalDiscrepancias: number;
  montoTotalOffHost: number;
  montoTotalOnHost: number;
  porcentajeCoincidencia: number;
  discrepancias: ReconciliationDiscrepancy[];
}
