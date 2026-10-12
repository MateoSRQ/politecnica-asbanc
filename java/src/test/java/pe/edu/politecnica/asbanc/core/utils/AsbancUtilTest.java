package pe.edu.politecnica.asbanc.core.utils;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

class AsbancUtilTest {

    @Test
    @DisplayName("sanitizeString debe normalizar tildes, caracteres especiales y limitar longitud")
    void testSanitizeString() {
        String input = "María José Peña-Ríos & Co.";
        String result = AsbancUtil.sanitizeString(input, 30);
        assertEquals("MARIA JOSE PENA-RIOS CO.", result);

        String longInput = "ESTE ES UN TEXTO EXTREMADAMENTE LARGO QUE EXCEDE TREINTA CARACTERES";
        String truncated = AsbancUtil.sanitizeString(longInput, 30);
        assertTrue(truncated.length() <= 30);
        assertEquals("ESTE ES UN TEXTO EXTREMADAMENT", truncated);
    }

    @Test
    @DisplayName("formatDateAsbanc debe devolver fecha en formato DDMMAAAA")
    void testFormatDateAsbanc() {
        LocalDate date = LocalDate.of(2026, 9, 28);
        String formatted = AsbancUtil.formatDateAsbanc(date);
        assertEquals("28092026", formatted);

        LocalDateTime dateTime = LocalDateTime.of(2026, 3, 5, 14, 30, 0);
        assertEquals("05032026", AsbancUtil.formatDateAsbanc(dateTime));
    }

    @Test
    @DisplayName("parseAsbancDate debe parsear correctamente formatos AAAAMMDD y DDMMAAAA")
    void testParseAsbancDate() {
        LocalDateTime dt1 = AsbancUtil.parseAsbancDate("20260928", "110530");
        assertEquals(2026, dt1.getYear());
        assertEquals(9, dt1.getMonthValue());
        assertEquals(28, dt1.getDayOfMonth());
        assertEquals(11, dt1.getHour());
        assertEquals(5, dt1.getMinute());
        assertEquals(30, dt1.getSecond());

        LocalDateTime dt2 = AsbancUtil.parseAsbancDate("28092026", "081500");
        assertEquals(2026, dt2.getYear());
        assertEquals(9, dt2.getMonthValue());
        assertEquals(28, dt2.getDayOfMonth());
        assertEquals(8, dt2.getHour());
    }
}
