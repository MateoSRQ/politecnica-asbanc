import { env } from '../../config/env.js';
import { logger } from '../../infrastructure/telemetry/logger.js';

export interface PaymentWebhookPayload {
  event: 'debt.payment.confirmed' | 'debt.payment.reversed';
  timestamp: string;
  pagoId: number;
  alumnoId: number;
  codigoAlumno: string;
  numeroDocumento: string;
  nombreCliente: string;
  concepto: string;
  periodoNombre?: string;
  numCuota: number;
  importePagado: number;
  codigoBanco: string;
  numOperacionBanco: string;
  numOperacionERP: string;
  fechaTxn: string;
  horaTxn: string;
  canalPago: string;
  formaPago?: string;
}

export class WebhookService {
  private webhookUrl?: string;

  constructor() {
    this.webhookUrl = env.PAYMENT_WEBHOOK_URL || process.env.PAYMENT_WEBHOOK_URL || process.env.WEBHOOK_URL;
  }

  async dispatchPaymentWebhook(payload: PaymentWebhookPayload): Promise<void> {
    logger.info(
      {
        webhookEvent: payload.event,
        pagoId: payload.pagoId,
        codigoAlumno: payload.codigoAlumno,
        numOperacionERP: payload.numOperacionERP,
        numOperacionBanco: payload.numOperacionBanco,
        monto: payload.importePagado,
        concepto: payload.concepto,
      },
      `[WEBHOOK PLACEHOLDER] Evento de pago ${payload.event} emitido para alumno ${payload.codigoAlumno} (Pago ID: ${payload.pagoId})`,
    );

    if (this.webhookUrl) {
      try {
        logger.debug({ url: this.webhookUrl }, 'Enviando webhook a endpoint externo...');
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Politecnica-Event': payload.event,
            'X-Politecnica-Delivery': new Date().toISOString(),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          logger.warn(
            { status: response.status, statusText: response.statusText },
            'Respuesta no exitosa al despachar webhook de pago',
          );
        } else {
          logger.info({ status: response.status }, 'Webhook de pago despachado exitosamente');
        }
      } catch (err: any) {
        logger.error({ error: err.message }, 'Fallo en la comunicación del webhook de pago externo');
      }
    } else {
      logger.info(
        { pagoId: payload.pagoId, numOperacionERP: payload.numOperacionERP },
        '[WEBHOOK PLACEHOLDER] No se ha configurado PAYMENT_WEBHOOK_URL en .env. Evento registrado localmente.',
      );
    }
  }
}

export const webhookService = new WebhookService();
