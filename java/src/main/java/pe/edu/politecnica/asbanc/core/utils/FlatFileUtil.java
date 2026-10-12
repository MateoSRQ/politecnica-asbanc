package pe.edu.politecnica.asbanc.core.utils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

public final class FlatFileUtil {

    private FlatFileUtil() {}

    public static String formatAN(String value, int length) {
        if (value == null) {
            return " ".repeat(length);
        }
        String clean = AsbancUtil.sanitizeString(value, length);
        if (clean.length() >= length) {
            return clean.substring(0, length);
        }
        return clean + " ".repeat(length - clean.length());
    }

    public static String formatN(long value, int length) {
        String str = String.valueOf(Math.abs(value));
        if (str.length() >= length) {
            return str.substring(str.length() - length);
        }
        return "0".repeat(length - str.length()) + str;
    }

    public static String formatN(BigDecimal value, int length, int decimals) {
        if (value == null) {
            return "0".repeat(length);
        }
        long longVal = value.movePointRight(decimals).setScale(0, java.math.RoundingMode.HALF_UP).longValue();
        return formatN(longVal, length);
    }

    public static String generateDebtFileName(LocalDate date, int sequence) {
        String dateStr = date.format(DateTimeFormatter.ofPattern("ddMMyyyy"));
        String seqStr = String.format("%03d", sequence % 1000);
        return "FTRCOB" + dateStr + seqStr + ".TXT";
    }

    public static String generatePaymentFileName(LocalDate date, int sequence) {
        String dateStr = date.format(DateTimeFormatter.ofPattern("ddMMyyyy"));
        String seqStr = String.format("%03d", sequence % 1000);
        return "FTRPAG" + dateStr + seqStr + ".TXT";
    }
}
