package pe.edu.politecnica.asbanc.infrastructure.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;

import static org.junit.jupiter.api.Assertions.*;

class JwtTokenServiceTest {

    private JwtTokenService tokenService;
    private AsbancProperties properties;

    @BeforeEach
    void setUp() {
        properties = new AsbancProperties();
        properties.setJwtSecret("test_jwt_secret_key_super_secure_2026_asbanc");
        properties.setJwtExpirationSeconds(3600);
        tokenService = new JwtTokenService(properties);
    }

    @Test
    @DisplayName("Debe generar token JWT válido y verificar su autenticidad")
    void testGenerateAndValidateToken() {
        String token = tokenService.generateToken("test_client");
        assertNotNull(token);
        assertFalse(token.isBlank());

        assertTrue(tokenService.validateToken(token));
    }

    @Test
    @DisplayName("Debe rechazar tokens corruptos o malformados")
    void testInvalidToken() {
        assertFalse(tokenService.validateToken("token.invalido.corrupto"));
        assertFalse(tokenService.validateToken(""));
        assertFalse(tokenService.validateToken(null));
    }
}
