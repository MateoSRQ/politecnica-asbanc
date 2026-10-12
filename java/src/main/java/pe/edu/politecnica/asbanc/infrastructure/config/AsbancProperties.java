package pe.edu.politecnica.asbanc.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "asbanc")
public class AsbancProperties {

    private boolean testMode = false;
    private String clientId = "asbanc_ftr";
    private String clientSecret = "";
    private String jwtSecret = "";
    private long jwtExpirationSeconds = 86400;
    private String companyCode = "001";
    private long slaWarningThresholdMs = 2500;
    private String corsOrigin = "*";
    private String webhookUrl = "";
    private String offHostStorageDir = "./storage/off-host";

    private boolean sftpEnabled = false;
    private String sftpHost = "";
    private int sftpPort = 22;
    private String sftpUsername = "";
    private String sftpPassword = "";
    private String sftpPrivateKeyPath = "";
    private String sftpRemoteInboundDir = "/inbound";
    private String sftpRemoteOutboundDir = "/outbound";
    private boolean sftpAutoReconcile = true;

    public boolean isTestMode() { return testMode; }
    public void setTestMode(boolean testMode) { this.testMode = testMode; }

    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }

    public String getClientSecret() { return clientSecret; }
    public void setClientSecret(String clientSecret) { this.clientSecret = clientSecret; }

    public String getJwtSecret() { return jwtSecret; }
    public void setJwtSecret(String jwtSecret) { this.jwtSecret = jwtSecret; }

    public long getJwtExpirationSeconds() { return jwtExpirationSeconds; }
    public void setJwtExpirationSeconds(long jwtExpirationSeconds) { this.jwtExpirationSeconds = jwtExpirationSeconds; }

    public String getCompanyCode() { return companyCode; }
    public void setCompanyCode(String companyCode) { this.companyCode = companyCode; }

    public long getSlaWarningThresholdMs() { return slaWarningThresholdMs; }
    public void setSlaWarningThresholdMs(long slaWarningThresholdMs) { this.slaWarningThresholdMs = slaWarningThresholdMs; }

    public String getCorsOrigin() { return corsOrigin; }
    public void setCorsOrigin(String corsOrigin) { this.corsOrigin = corsOrigin; }

    public String getWebhookUrl() { return webhookUrl; }
    public void setWebhookUrl(String webhookUrl) { this.webhookUrl = webhookUrl; }

    public String getOffHostStorageDir() { return offHostStorageDir; }
    public void setOffHostStorageDir(String offHostStorageDir) { this.offHostStorageDir = offHostStorageDir; }

    public boolean isSftpEnabled() { return sftpEnabled; }
    public void setSftpEnabled(boolean sftpEnabled) { this.sftpEnabled = sftpEnabled; }

    public String getSftpHost() { return sftpHost; }
    public void setSftpHost(String sftpHost) { this.sftpHost = sftpHost; }

    public int getSftpPort() { return sftpPort; }
    public void setSftpPort(int sftpPort) { this.sftpPort = sftpPort; }

    public String getSftpUsername() { return sftpUsername; }
    public void setSftpUsername(String sftpUsername) { this.sftpUsername = sftpUsername; }

    public String getSftpPassword() { return sftpPassword; }
    public void setSftpPassword(String sftpPassword) { this.sftpPassword = sftpPassword; }

    public String getSftpPrivateKeyPath() { return sftpPrivateKeyPath; }
    public void setSftpPrivateKeyPath(String sftpPrivateKeyPath) { this.sftpPrivateKeyPath = sftpPrivateKeyPath; }

    public String getSftpRemoteInboundDir() { return sftpRemoteInboundDir; }
    public void setSftpRemoteInboundDir(String sftpRemoteInboundDir) { this.sftpRemoteInboundDir = sftpRemoteInboundDir; }

    public String getSftpRemoteOutboundDir() { return sftpRemoteOutboundDir; }
    public void setSftpRemoteOutboundDir(String sftpRemoteOutboundDir) { this.sftpRemoteOutboundDir = sftpRemoteOutboundDir; }

    public boolean isSftpAutoReconcile() { return sftpAutoReconcile; }
    public void setSftpAutoReconcile(boolean sftpAutoReconcile) { this.sftpAutoReconcile = sftpAutoReconcile; }
}
