package pe.edu.politecnica.asbanc.interfaces.rest;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.GenerateDebtsResponse;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.ProcessPaymentsResponse;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.ReconciliationResult;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.SftpSyncResult;
import pe.edu.politecnica.asbanc.core.model.OffHostModels.SftpUploadResult;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;
import pe.edu.politecnica.asbanc.infrastructure.offhost.AsbancSftpService;
import pe.edu.politecnica.asbanc.infrastructure.offhost.DebtFileGenerator;
import pe.edu.politecnica.asbanc.infrastructure.offhost.PaymentFileParser;
import pe.edu.politecnica.asbanc.infrastructure.offhost.ReconciliationService;

import java.io.File;
import java.util.Map;

@RestController
public class OffHostController {

    private final DebtFileGenerator debtFileGenerator;
    private final PaymentFileParser paymentFileParser;
    private final ReconciliationService reconciliationService;
    private final AsbancSftpService sftpService;
    private final AsbancProperties properties;

    public OffHostController(
        DebtFileGenerator debtFileGenerator,
        PaymentFileParser paymentFileParser,
        ReconciliationService reconciliationService,
        AsbancSftpService sftpService,
        AsbancProperties properties
    ) {
        this.debtFileGenerator = debtFileGenerator;
        this.paymentFileParser = paymentFileParser;
        this.reconciliationService = reconciliationService;
        this.sftpService = sftpService;
        this.properties = properties;
    }

    @PostMapping(value = {"/api/OffHost/GenerateDebts", "/api/offhost/generatedebts"})
    public ResponseEntity<GenerateDebtsResponse> generateDebts(@RequestBody(required = false) Map<String, Object> body) {
        String tipoAct = body != null ? (String) body.get("tipoActualizacion") : "R";
        Integer secuencia = body != null && body.get("secuencia") != null ? ((Number) body.get("secuencia")).intValue() : 1;
        GenerateDebtsResponse resp = debtFileGenerator.generateDebtsFile(tipoAct, secuencia);
        return ResponseEntity.ok(resp);
    }

    @PostMapping(value = {"/api/OffHost/ProcessPayments", "/api/offhost/processpayments"})
    public ResponseEntity<ProcessPaymentsResponse> processPayments(@RequestBody Map<String, Object> body) {
        String rawFileName = (String) body.get("fileName");
        if (rawFileName == null || rawFileName.isBlank()) {
            throw new IllegalArgumentException("Parámetro fileName es requerido");
        }

        String safeFileName = new File(rawFileName).getName();
        File file = new File(properties.getOffHostStorageDir(), safeFileName);

        ProcessPaymentsResponse resp = paymentFileParser.processPaymentFile(file);
        return ResponseEntity.ok(resp);
    }

    @PostMapping(value = {"/api/OffHost/Reconcile", "/api/offhost/reconcile"})
    public ResponseEntity<ReconciliationResult> reconcile(@RequestBody Map<String, Object> body) {
        String rawFileName = (String) body.get("fileName");
        if (rawFileName == null || rawFileName.isBlank()) {
            throw new IllegalArgumentException("Parámetro fileName es requerido");
        }

        String safeFileName = new File(rawFileName).getName();
        File file = new File(properties.getOffHostStorageDir(), safeFileName);

        ReconciliationResult resp = reconciliationService.reconcile(file);
        return ResponseEntity.ok(resp);
    }

    @PostMapping(value = {"/api/OffHost/SftpSync", "/api/offhost/sftpsync"})
    public ResponseEntity<SftpSyncResult> sftpSync() {
        SftpSyncResult result = sftpService.syncAndReconcile();
        return ResponseEntity.ok(result);
    }

    @PostMapping(value = {"/api/OffHost/SftpUploadDebts", "/api/offhost/sftpuploaddebts"})
    public ResponseEntity<SftpUploadResult> sftpUploadDebts(@RequestBody(required = false) Map<String, Object> body) {
        String tipoAct = body != null ? (String) body.get("tipoActualizacion") : "R";
        Integer secuencia = body != null && body.get("secuencia") != null ? ((Number) body.get("secuencia")).intValue() : 1;
        SftpUploadResult result = sftpService.generateAndUploadDebts(tipoAct, secuencia);
        return ResponseEntity.ok(result);
    }
}
