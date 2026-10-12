package pe.edu.politecnica.asbanc.core.utils;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class FlatFileUtilTest {

    @Test
    @DisplayName("formatAN debe justificar a la izquierda con espacios a la derecha")
    void testFormatAN() {
        String res = FlatFileUtil.formatAN("BCP", 6);
        assertEquals("BCP   ", res);
        assertEquals(6, res.length());

        String truncated = FlatFileUtil.formatAN("NOMBRE DEMASIADO LARGO", 5);
        assertEquals("NOMBR", truncated);
        assertEquals(5, truncated.length());
    }

    @Test
    @DisplayName("formatN debe rellenar con ceros a la izquierda")
    void testFormatN() {
        assertEquals("000000123", FlatFileUtil.formatN(123, 9));
        assertEquals("000000000", FlatFileUtil.formatN(0, 9));

        BigDecimal amount = new BigDecimal("833.33");
        assertEquals("0000000083333", FlatFileUtil.formatN(amount, 13, 2));
    }

    @Test
    @DisplayName("generateDebtFileName debe generar formato FTRCOBDDMMAAAASSS.TXT")
    void testGenerateDebtFileName() {
        LocalDate date = LocalDate.of(2026, 9, 28);
        String name = FlatFileUtil.generateDebtFileName(date, 5);
        assertEquals("FTRCOB28092026005.TXT", name);
    }

    @Test
    @DisplayName("generatePaymentFileName debe generar formato FTRPAGDDMMAAAASSS.TXT")
    void testGeneratePaymentFileName() {
        LocalDate date = LocalDate.of(2026, 9, 28);
        String name = FlatFileUtil.generatePaymentFileName(date, 12);
        assertEquals("FTRPAG28092026012.TXT", name);
    }
}
