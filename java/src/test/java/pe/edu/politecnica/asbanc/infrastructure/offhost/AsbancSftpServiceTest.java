package pe.edu.politecnica.asbanc.infrastructure.offhost;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.SftpSyncResult;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.SftpUploadResult;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;

import java.io.File;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class AsbancSftpServiceTest {

    private AsbancProperties properties;
    private DebtFileGenerator debtFileGenerator;
    private PaymentFileParser paymentFileParser;
    private ReconciliationService reconciliationService;
    private AsbancSftpService sftpService;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        properties = new AsbancProperties();
        properties.setSftpEnabled(false);
        debtFileGenerator = mock(DebtFileGenerator.class);
        paymentFileParser = mock(PaymentFileParser.class);
        reconciliationService = mock(ReconciliationService.class);

        sftpService = new AsbancSftpService(
            properties,
            debtFileGenerator,
            paymentFileParser,
            reconciliationService
        );
    }

    @Test
    @DisplayName("uploadDebtFile con sftpEnabled=false debe retornar DISABLED y no lanzar excepción")
    void testUploadDebtFileDisabled() throws Exception {
        File dummyFile = tempDir.resolve("FTRCOB_DUMMY.TXT").toFile();
        dummyFile.createNewFile();

        SftpUploadResult result = sftpService.uploadDebtFile(dummyFile);

        assertNotNull(result);
        assertEquals("DISABLED", result.status());
        assertEquals("FTRCOB_DUMMY.TXT", result.fileName());
    }

    @Test
    @DisplayName("syncAndReconcile con sftpEnabled=false debe retornar DISABLED y no lanzar excepción")
    void testSyncAndReconcileDisabled() {
        SftpSyncResult result = sftpService.syncAndReconcile();

        assertNotNull(result);
        assertEquals("DISABLED", result.status());
        assertEquals(0, result.filesDownloaded());
        assertEquals(0, result.filesProcessed());
    }

    @Test
    @DisplayName("Cron jobs con SFTP deshabilitado deben ejecutarse sin error")
    void testCronJobsDisabled() {
        assertDoesNotThrow(() -> sftpService.scheduledDebtUpload());
        assertDoesNotThrow(() -> sftpService.scheduledPaymentDownloadAndReconcile());
    }
}
