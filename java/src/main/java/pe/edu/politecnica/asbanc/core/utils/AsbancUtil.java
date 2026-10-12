package pe.edu.politecnica.asbanc.core.utils;

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public final class AsbancUtil {

    private static final DateTimeFormatter DDMMAAAA_FORMATTER = DateTimeFormatter.ofPattern("ddMMyyyy");
    private static final DateTimeFormatter YYYYMMDD_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMdd");

    private AsbancUtil() {}

    public static String sanitizeString(String text, int maxLength) {
        if (text == null) {
            return "";
        }
        String normalized = Normalizer.normalize(text.trim(), Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .replaceAll("[^a-zA-Z0-9 ./_-]", " ")
            .replaceAll("\\s+", " ")
            .trim()
            .toUpperCase();

        if (normalized.length() > maxLength) {
            return normalized.substring(0, maxLength).trim();
        }
        return normalized;
    }

    public static String formatDateAsbanc(LocalDateTime dateTime) {
        if (dateTime == null) {
            return "01011900";
        }
        return dateTime.format(DDMMAAAA_FORMATTER);
    }

    public static String formatDateAsbanc(LocalDate date) {
        if (date == null) {
            return "01011900";
        }
        return date.format(DDMMAAAA_FORMATTER);
    }

    public static LocalDateTime parseAsbancDate(String fechaTxn, String horaTxn) {
        if (fechaTxn == null || fechaTxn.trim().isEmpty()) {
            return LocalDateTime.now();
        }

        String cleanedDate = fechaTxn.trim();
        String cleanedTime = (horaTxn == null || horaTxn.trim().isEmpty()) ? "000000" : horaTxn.trim();
        if (cleanedTime.length() < 6) {
            cleanedTime = String.format("%-6s", cleanedTime).replace(' ', '0');
        }

        int hour = Integer.parseInt(cleanedTime.substring(0, 2));
        int minute = Integer.parseInt(cleanedTime.substring(2, 4));
        int second = Integer.parseInt(cleanedTime.substring(4, 6));

        try {
            LocalDate date;
            String last4 = cleanedDate.length() >= 8 ? cleanedDate.substring(4, 8) : "";
            if (last4.startsWith("19") || last4.startsWith("20")) {
                try {
                    date = LocalDate.parse(cleanedDate, DDMMAAAA_FORMATTER);
                } catch (Exception ex) {
                    date = LocalDate.parse(cleanedDate, YYYYMMDD_FORMATTER);
                }
            } else {
                try {
                    date = LocalDate.parse(cleanedDate, YYYYMMDD_FORMATTER);
                } catch (Exception ex) {
                    date = LocalDate.parse(cleanedDate, DDMMAAAA_FORMATTER);
                }
            }
            return date.atTime(hour, minute, second);
        } catch (Exception e) {
            return LocalDateTime.now();
        }
    }
}
