package pe.edu.politecnica.asbanc.infrastructure.security;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;

import java.util.Arrays;
import java.util.List;

@Component
public class AsbancSecurityValidator {

    private static final Logger log = LoggerFactory.getLogger(AsbancSecurityValidator.class);

    private static final List<String> WEAK_DB_PASSWORDS = Arrays.asList(
        "Politecnica2026!Asbanc#", "1Ltseosb.", "password", "123456", "admin"
    );

    private static final List<String> WEAK_JWT_SECRETS = Arrays.asList(
        "politecnica_asbanc_jwt_secret_key_2026_ftr", "secret", "changeme", "jwt_secret"
    );

    private static final List<String> WEAK_CLIENT_SECRETS = Arrays.asList(
        "asbanc_ftr_secret_2026", "secret", "password"
    );

    private final AsbancProperties properties;
    private final Environment environment;

    public AsbancSecurityValidator(AsbancProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    @PostConstruct
    public void validateSecurityConfiguration() {
        String dbPassword = environment.getProperty("DB_PASSWORD", "");
        String jwtSecret = properties.getJwtSecret();
        String clientSecret = properties.getClientSecret();

        boolean isProduction = isProductionEnvironment();

        if (isProduction) {
            if (dbPassword.isBlank() || WEAK_DB_PASSWORDS.contains(dbPassword)) {
                throw new IllegalStateException("CRÍTICO: En producción, DB_PASSWORD no puede ser una clave de desarrollo o débil.");
            }
            if (jwtSecret == null || jwtSecret.length() < 32 || WEAK_JWT_SECRETS.contains(jwtSecret)) {
                throw new IllegalStateException("CRÍTICO: En producción, JWT_SECRET debe definirse con una clave criptográfica segura de al menos 32 caracteres.");
            }
            if (clientSecret == null || clientSecret.isBlank() || WEAK_CLIENT_SECRETS.contains(clientSecret)) {
                throw new IllegalStateException("CRÍTICO: En producción, ASBANC_CLIENT_SECRET debe ser configurado formalmente.");
            }
            log.info("Validación de seguridad para entorno de producción completada con éxito.");
        } else {
            if (jwtSecret == null || jwtSecret.isBlank()) {
                throw new IllegalStateException("JWT_SECRET es requerido en el archivo de entorno .env o variables de sistema.");
            }
            log.info("Modo de desarrollo/pruebas activo. Verificación básica de seguridad superada.");
        }
    }

    private boolean isProductionEnvironment() {
        String nodeEnv = environment.getProperty("NODE_ENV", "");
        String env = environment.getProperty("ENV", "");
        List<String> activeProfiles = Arrays.asList(environment.getActiveProfiles());

        return "production".equalsIgnoreCase(nodeEnv)
            || "production".equalsIgnoreCase(env)
            || activeProfiles.contains("prod")
            || activeProfiles.contains("production");
    }
}
