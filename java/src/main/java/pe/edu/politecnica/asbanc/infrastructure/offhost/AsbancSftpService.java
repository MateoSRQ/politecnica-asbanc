package pe.edu.politecnica.asbanc.infrastructure.offhost;

import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.GenerateDebtsResponse;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.ReconciliationResult;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.SftpSyncResult;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.SftpUploadResult;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Properties;
import java.util.Vector;

@Service
public class AsbancSftpService {

    private static final Logger log = LoggerFactory.getLogger(AsbancSftpService.class);

    private final AsbancProperties properties;
    private final DebtFileGenerator debtFileGenerator;
    private final PaymentFileParser paymentFileParser;
    private final ReconciliationService reconciliationService;

    public AsbancSftpService(
        AsbancProperties properties,
        DebtFileGenerator debtFileGenerator,
        PaymentFileParser paymentFileParser,
        ReconciliationService reconciliationService
    ) {
        this.properties = properties;
        this.debtFileGenerator = debtFileGenerator;
        this.paymentFileParser = paymentFileParser;
        this.reconciliationService = reconciliationService;
    }

    public SftpUploadResult uploadDebtFile(File localFile) {
        if (!properties.isSftpEnabled()) {
            log.info("SFTP deshabilitado en configuración. Archivo preservado localmente en {}", localFile.getAbsolutePath());
            return new SftpUploadResult(
                "DISABLED",
                localFile.getName(),
                localFile.getAbsolutePath(),
                localFile.length(),
                "SFTP deshabilitado (modo almacenamiento local)"
            );
        }

        Session session = null;
        ChannelSftp sftpChannel = null;
        try {
            session = createSshSession();
            sftpChannel = (ChannelSftp) session.openChannel("sftp");
            sftpChannel.connect(15000);

            String remoteDir = properties.getSftpRemoteInboundDir();
            ensureRemoteDirectory(sftpChannel, remoteDir);

            String remotePath = remoteDir.endsWith("/") ? remoteDir + localFile.getName() : remoteDir + "/" + localFile.getName();

            try (FileInputStream fis = new FileInputStream(localFile)) {
                sftpChannel.put(fis, remotePath, ChannelSftp.OVERWRITE);
            }

            log.info("Archivo {} subido exitosamente a SFTP ASBANC: {}", localFile.getName(), remotePath);
            return new SftpUploadResult(
                "OK",
                localFile.getName(),
                remotePath,
                localFile.length(),
                "Archivo subido exitosamente a SFTP ASBANC"
            );
        } catch (Exception e) {
            log.error("Error subiendo archivo {} a SFTP ASBANC: {}", localFile.getName(), e.getMessage(), e);
            return new SftpUploadResult(
                "ERROR",
                localFile.getName(),
                "",
                0,
                "Error en transferencia SFTP: " + e.getMessage()
            );
        } finally {
            disconnect(sftpChannel, session);
        }
    }

    public SftpUploadResult generateAndUploadDebts(String tipoActualizacion, int secuencia) {
        GenerateDebtsResponse genResp = debtFileGenerator.generateDebtsFile(tipoActualizacion, secuencia);
        File file = new File(genResp.filePath());
        return uploadDebtFile(file);
    }

    public SftpSyncResult syncAndReconcile() {
        if (!properties.isSftpEnabled()) {
            log.info("SFTP deshabilitado en configuración. Omitiendo sincronización remota.");
            return new SftpSyncResult(
                "DISABLED",
                0,
                0,
                Collections.emptyList(),
                Collections.emptyList(),
                "SFTP deshabilitado (operación en modo local)"
            );
        }

        Session session = null;
        ChannelSftp sftpChannel = null;
        List<String> processedFiles = new ArrayList<>();
        List<ReconciliationResult> reconciliations = new ArrayList<>();

        try {
            session = createSshSession();
            sftpChannel = (ChannelSftp) session.openChannel("sftp");
            sftpChannel.connect(15000);

            String remoteDir = properties.getSftpRemoteOutboundDir();
            File localDir = new File(properties.getOffHostStorageDir());
            if (!localDir.exists()) {
                localDir.mkdirs();
            }

            @SuppressWarnings("unchecked")
            Vector<ChannelSftp.LsEntry> entries = sftpChannel.ls(remoteDir);
            int filesDownloaded = 0;

            for (ChannelSftp.LsEntry entry : entries) {
                String filename = entry.getFilename();
                if (entry.getAttrs().isDir() || filename.startsWith(".")) {
                    continue;
                }

                if (filename.toUpperCase().startsWith("FTRPAG")) {
                    File targetLocalFile = new File(localDir, filename);
                    String remoteFilePath = remoteDir.endsWith("/") ? remoteDir + filename : remoteDir + "/" + filename;

                    try (FileOutputStream fos = new FileOutputStream(targetLocalFile)) {
                        sftpChannel.get(remoteFilePath, fos);
                    }
                    filesDownloaded++;
                    log.info("Archivo de pagos {} descargado exitosamente desde SFTP ASBANC", filename);

                    paymentFileParser.processPaymentFile(targetLocalFile);
                    processedFiles.add(filename);

                    if (properties.isSftpAutoReconcile()) {
                        ReconciliationResult recon = reconciliationService.reconcile(targetLocalFile);
                        reconciliations.add(recon);
                    }
                }
            }

            String msg = String.format("Sincronización SFTP finalizada. Descargados: %d, Procesados: %d", filesDownloaded, processedFiles.size());
            log.info(msg);

            return new SftpSyncResult(
                "OK",
                filesDownloaded,
                processedFiles.size(),
                processedFiles,
                reconciliations,
                msg
            );
        } catch (Exception e) {
            log.error("Fallo durante la sincronización y conciliación SFTP: {}", e.getMessage(), e);
            return new SftpSyncResult(
                "ERROR",
                0,
                0,
                processedFiles,
                reconciliations,
                "Error durante sincronización SFTP: " + e.getMessage()
            );
        } finally {
            disconnect(sftpChannel, session);
        }
    }

    @Scheduled(cron = "${asbanc.sftp.cron-upload-debts:0 0 2 * * ?}")
    public void scheduledDebtUpload() {
        if (!properties.isSftpEnabled()) {
            return;
        }
        log.info("[CRON] Ejecutando generación y subida programada de deudas Off-Host (02:00 AM)...");
        generateAndUploadDebts("R", 1);
    }

    @Scheduled(cron = "${asbanc.sftp.cron-download-payments:0 0 22 * * ?}")
    public void scheduledPaymentDownloadAndReconcile() {
        if (!properties.isSftpEnabled()) {
            return;
        }
        log.info("[CRON] Ejecutando sincronización y conciliación programada de pagos Off-Host (22:00 PM)...");
        syncAndReconcile();
    }

    private Session createSshSession() throws JSchException {
        JSch jsch = new JSch();
        if (properties.getSftpPrivateKeyPath() != null && !properties.getSftpPrivateKeyPath().isBlank()) {
            jsch.addIdentity(properties.getSftpPrivateKeyPath());
        }

        Session session = jsch.getSession(
            properties.getSftpUsername(),
            properties.getSftpHost(),
            properties.getSftpPort()
        );

        if (properties.getSftpPassword() != null && !properties.getSftpPassword().isBlank()) {
            session.setPassword(properties.getSftpPassword());
        }

        Properties config = new Properties();
        config.put("StrictHostKeyChecking", "no");
        session.setConfig(config);
        session.setTimeout(15000);
        session.connect(15000);

        return session;
    }

    private void ensureRemoteDirectory(ChannelSftp sftp, String dir) {
        try {
            sftp.cd(dir);
        } catch (SftpException e) {
            try {
                sftp.mkdir(dir);
                sftp.cd(dir);
            } catch (SftpException ex) {
                log.warn("No se pudo crear/acceder al directorio remoto {}: {}", dir, ex.getMessage());
            }
        }
    }

    private void disconnect(ChannelSftp channel, Session session) {
        if (channel != null && channel.isConnected()) {
            try { channel.disconnect(); } catch (Exception ignored) {}
        }
        if (session != null && session.isConnected()) {
            try { session.disconnect(); } catch (Exception ignored) {}
        }
    }
}
