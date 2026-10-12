package pe.edu.politecnica.asbanc.infrastructure.offhost;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.DebtDetailRecord;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.DebtFileHeader;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.GenerateDebtsResponse;
import pe.edu.politecnica.asbanc.core.utils.FlatFileUtil;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class DebtFileGenerator {

    private static final Logger log = LoggerFactory.getLogger(DebtFileGenerator.class);

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final AsbancProperties properties;

    public DebtFileGenerator(NamedParameterJdbcTemplate jdbcTemplate, AsbancProperties properties) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
    }

    public static String formatHeader(DebtFileHeader h) {
        String line = FlatFileUtil.formatAN(h.nombreArchivo(), 21) +
            FlatFileUtil.formatAN(h.tipoActualizacion(), 1) +
            FlatFileUtil.formatAN(h.codigoEmpresa(), 7) +
            FlatFileUtil.formatAN(h.fechaTransmision(), 8) +
            FlatFileUtil.formatAN(h.horaTransmision(), 6) +
            FlatFileUtil.formatN(h.numeroRegistros(), 9) +
            FlatFileUtil.formatN(h.importeTotalSoles(), 15, 2) +
            FlatFileUtil.formatN(h.importeTotalDolares(), 15, 2) +
            FlatFileUtil.formatAN(h.filler() != null ? h.filler() : "", 120) +
            FlatFileUtil.formatN(h.mac(), 8);

        if (line.length() != 210) {
            throw new IllegalStateException("Cabecera FTRCOB debe medir exactamente 210 caracteres (actual: " + line.length() + ")");
        }
        return line;
    }

    public static String formatDetail(DebtDetailRecord d) {
        String line = FlatFileUtil.formatAN(d.tipoActualizacion(), 1) +
            FlatFileUtil.formatAN(d.codigoCliente(), 14) +
            FlatFileUtil.formatAN(d.nombreCliente(), 30) +
            FlatFileUtil.formatAN(d.codigoProducto(), 3) +
            FlatFileUtil.formatAN(d.numDocumento(), 16) +
            FlatFileUtil.formatAN(d.descripcion(), 20) +
            FlatFileUtil.formatAN(d.fechaVencimiento(), 8) +
            FlatFileUtil.formatAN(d.fechaEmision(), 8) +
            FlatFileUtil.formatN(d.deuda(), 12, 2) +
            FlatFileUtil.formatN(d.mora(), 12, 2) +
            FlatFileUtil.formatN(d.gastosAdm(), 12, 2) +
            FlatFileUtil.formatN(d.pagoMinimo(), 12, 2) +
            FlatFileUtil.formatAN(d.periodo(), 2) +
            FlatFileUtil.formatAN(d.anio(), 4) +
            FlatFileUtil.formatAN(d.cuota(), 2) +
            FlatFileUtil.formatAN(d.moneda(), 1) +
            FlatFileUtil.formatAN(d.filler() != null ? d.filler() : "", 20) +
            "F";

        if (line.length() != 178) {
            throw new IllegalStateException("Detalle FTRCOB debe medir exactamente 178 caracteres (actual: " + line.length() + ")");
        }
        return line;
    }

    public GenerateDebtsResponse generateDebtsFile(String tipoAct, Integer secuencia) {
        String tipoActualizacion = (tipoAct != null && !tipoAct.isBlank()) ? tipoAct : "R";
        int seq = (secuencia != null) ? secuencia : 1;
        LocalDate now = LocalDate.now();
        LocalTime timeNow = LocalTime.now();

        String fileName = FlatFileUtil.generateDebtFileName(now, seq);
        String storageDir = properties.getOffHostStorageDir();
        File dir = new File(storageDir);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        File targetFile = new File(dir, fileName);

        String sql = """
            SELECT 
              ap.id AS pago_id,
              alu.codigo_alumno,
              per.nro_documento,
              LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo,
              ap.num_cuota,
              ROUND(ISNULL(Ctas_Ctes.ObtieneMontoPago(ap.id), ap.monto), 2) AS deuda,
              ap.fecha_vencimiento,
              ap.fecha_generacion,
              ap.created_at,
              CASE WHEN ap.num_cuota = 0 THEN 'MATRICULA' ELSE 'CUOTA ' + CAST(ap.num_cuota AS VARCHAR) END AS concepto,
              p.nombre AS periodo_nombre
            FROM Ctas_Ctes.Alumno_Pago ap
            JOIN Academico.Alumno alu ON ap.alumno_id = alu.id
            JOIN General.Persona per ON alu.persona_id = per.id
            LEFT JOIN Ctas_Ctes.Alumno_Pago_Cuota apc ON ap.id = apc.alumno_pago_id
            LEFT JOIN Ctas_Ctes.Alumno_Cuota ac ON apc.alumno_cuota_id = ac.id
            LEFT JOIN Carga_Academica.Carga_Academica_Sede cas ON ap.carga_academica_sede_id = cas.id
            LEFT JOIN Carga_Academica.Carga_Academica ca ON cas.carga_academica_id = ca.id
            LEFT JOIN General.Periodo p ON ca.periodo_id = p.id
            WHERE ap.param_estado_pago_id = 25
            ORDER BY ap.id ASC
        """;

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, Map.of());
        List<DebtDetailRecord> details = new ArrayList<>();
        BigDecimal totalSoles = BigDecimal.ZERO;
        BigDecimal totalDolares = BigDecimal.ZERO;

        for (Map<String, Object> r : rows) {
            String codAlumno = (String) r.get("codigo_alumno");
            if (codAlumno == null) codAlumno = (String) r.get("nro_documento");
            String nombre = (String) r.get("nombre_completo");
            Long pagoId = ((Number) r.get("pago_id")).longValue();
            String concepto = (String) r.get("concepto");
            BigDecimal deuda = (BigDecimal) r.get("deuda");
            if (deuda == null) deuda = BigDecimal.ZERO;

            Object vencObj = r.get("fecha_vencimiento");
            Object genObj = r.get("fecha_generacion");
            if (genObj == null) genObj = r.get("created_at");

            String fechaVenc = FlatFileUtil.formatAN(convertToLocalDateTime(vencObj).format(DateTimeFormatter.ofPattern("ddMMyyyy")), 8);
            String fechaEmi = FlatFileUtil.formatAN(convertToLocalDateTime(genObj).format(DateTimeFormatter.ofPattern("ddMMyyyy")), 8);

            Integer numCuota = (Integer) r.get("num_cuota");
            String cuotaStr = numCuota != null ? String.format("%02d", numCuota) : "01";

            DebtDetailRecord det = new DebtDetailRecord(
                "N",
                codAlumno,
                nombre,
                "001",
                String.valueOf(pagoId),
                concepto,
                fechaVenc,
                fechaEmi,
                deuda,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                deuda,
                "01",
                String.valueOf(now.getYear()),
                cuotaStr,
                "1",
                ""
            );

            details.add(det);
            totalSoles = totalSoles.add(deuda);
        }

        DebtFileHeader header = new DebtFileHeader(
            fileName,
            tipoActualizacion,
            properties.getCompanyCode(),
            now.format(DateTimeFormatter.ofPattern("ddMMyyyy")),
            timeNow.format(DateTimeFormatter.ofPattern("HHmmss")),
            details.size(),
            totalSoles,
            totalDolares,
            "",
            0L
        );

        try (BufferedWriter writer = new BufferedWriter(new FileWriter(targetFile))) {
            writer.write(formatHeader(header));
            writer.write("\r\n");
            for (DebtDetailRecord d : details) {
                writer.write(formatDetail(d));
                writer.write("\r\n");
            }
        } catch (Exception e) {
            throw new RuntimeException("Error escribiendo archivo plano de deudas: " + e.getMessage(), e);
        }

        log.info("Archivo plano de deudas generado exitosamente: {} ({} registros)", targetFile.getAbsolutePath(), details.size());
        return new GenerateDebtsResponse(fileName, targetFile.getAbsolutePath(), details.size(), totalSoles, totalDolares, "Archivo generado exitosamente");
    }

    private LocalDateTime convertToLocalDateTime(Object dateObj) {
        if (dateObj == null) return LocalDateTime.now();
        if (dateObj instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        if (dateObj instanceof java.sql.Date d) return d.toLocalDate().atStartOfDay();
        if (dateObj instanceof java.time.LocalDateTime ldt) return ldt;
        if (dateObj instanceof java.time.LocalDate ld) return ld.atStartOfDay();
        if (dateObj instanceof java.util.Date ud) return new java.sql.Timestamp(ud.getTime()).toLocalDateTime();
        return LocalDateTime.now();
    }
}
