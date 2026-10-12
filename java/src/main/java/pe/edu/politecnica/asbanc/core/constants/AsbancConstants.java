package pe.edu.politecnica.asbanc.core.constants;

import java.util.Map;

public final class AsbancConstants {

    private AsbancConstants() {}

    public static final class ResponseCodes {
        public static final String OK = "00";
        public static final String OUT_OF_HOURS = "05";
        public static final String AFFILIATION_NOT_FOUND = "13";
        public static final String AFFILIATION_INACTIVE = "14";
        public static final String CUSTOMER_NOT_FOUND = "16";
        public static final String DEBT_NOT_FOUND = "19";
        public static final String DEBT_ALREADY_PAID = "20";
        public static final String BELOW_MINIMUM_AMOUNT = "21";
        public static final String CUSTOMER_NO_DEBTS = "22";
        public static final String NOT_ALLOWED_BY_COMPANY = "23";
        public static final String INVALID_PAYMENT_AMOUNT = "25";
        public static final String ORIGINAL_TXN_NOT_FOUND = "68";
        public static final String AMOUNT_LESS_THAN_TOTAL = "70";
        public static final String DUPLICATE_TRACE = "71";
        public static final String REVERSAL_TIMEOUT_EXCEEDED = "72";
        public static final String PAYMENT_MUST_BE_TOTAL = "74";
        public static final String PAY_OLDER_DEBTS_FIRST = "75";
        public static final String INVALID_CURRENCY = "81";
        public static final String INVALID_BANK_CODE = "82";
        public static final String UNKNOWN_ERROR = "99";
    }

    public static final Map<String, String> RESPONSE_DESCRIPTIONS = Map.ofEntries(
        Map.entry(ResponseCodes.OK, "OK"),
        Map.entry(ResponseCodes.OUT_OF_HOURS, "FUERA DE HORARIO DE ATENCION"),
        Map.entry(ResponseCodes.AFFILIATION_NOT_FOUND, "AFIL. EMPR.-SERVICIO NO EXISTE"),
        Map.entry(ResponseCodes.AFFILIATION_INACTIVE, "AFIL. EMPR.-SERVICIO NO ACTIVO"),
        Map.entry(ResponseCodes.CUSTOMER_NOT_FOUND, "CLIENTE NO EXISTE"),
        Map.entry(ResponseCodes.DEBT_NOT_FOUND, "CUOTA PAGADA NO EXISTE"),
        Map.entry(ResponseCodes.DEBT_ALREADY_PAID, "CUOTA PAGADA YA CANCELADA"),
        Map.entry(ResponseCodes.BELOW_MINIMUM_AMOUNT, "NO CUMPLE IMPORTE MINIMO"),
        Map.entry(ResponseCodes.CUSTOMER_NO_DEBTS, "CLIENTE SIN DEUDAS PENDIENTES"),
        Map.entry(ResponseCodes.NOT_ALLOWED_BY_COMPANY, "NO PROCEDE X IND. EMPRESA"),
        Map.entry(ResponseCodes.INVALID_PAYMENT_AMOUNT, "MONTO DE PAGO INVALIDO"),
        Map.entry(ResponseCodes.ORIGINAL_TXN_NOT_FOUND, "TXN ORIG. A ANULAR NO EXISTE"),
        Map.entry(ResponseCodes.AMOUNT_LESS_THAN_TOTAL, "IMP. PAGADO MENOR PAGO TOTAL"),
        Map.entry(ResponseCodes.DUPLICATE_TRACE, "TRACE DUPLICADO X FECHA/CANAL"),
        Map.entry(ResponseCodes.REVERSAL_TIMEOUT_EXCEEDED, "TIEMPO EXTORNO/ANULA. EXCEDIDO"),
        Map.entry(ResponseCodes.PAYMENT_MUST_BE_TOTAL, "EL PAGO DEBE SER TOTAL"),
        Map.entry(ResponseCodes.PAY_OLDER_DEBTS_FIRST, "PAGAR ANTES CTAS. ANTERIORES"),
        Map.entry(ResponseCodes.INVALID_CURRENCY, "MONEDA DE PAGO INVALIDO"),
        Map.entry(ResponseCodes.INVALID_BANK_CODE, "CODIGO DE BANCO INVALIDO"),
        Map.entry(ResponseCodes.UNKNOWN_ERROR, "ERROR DESCONOCIDO")
    );

    public static final class Banks {
        public static final String BCP = "1020";
        public static final String BANBIF = "1021";
        public static final String INTERBANK = "1022";
        public static final String BBVA = "1023";
        public static final String SCOTIABANK = "1024";
        public static final String COMERCIO = "1026";
    }

    public static final class Channels {
        public static final String VENTANILLA = "10";
        public static final String ATM = "20";
        public static final String AGENTE = "30";
        public static final String KIOSKO = "50";
        public static final String INTERNET_BANKING = "60";
        public static final String IVR = "70";
        public static final String BANCA_CELULAR = "80";
        public static final String YAPE = "81";
        public static final String PLIN = "82";
        public static final String OTROS = "99";
    }
}
