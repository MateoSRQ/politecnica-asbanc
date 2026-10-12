package pe.edu.politecnica.asbanc.interfaces.rest;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.politecnica.asbanc.core.model.AuthTokenRequest;
import pe.edu.politecnica.asbanc.core.model.AuthTokenResponse;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;
import pe.edu.politecnica.asbanc.infrastructure.security.JwtTokenService;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

@RestController
public class AuthController {

    private final AsbancProperties properties;
    private final JwtTokenService jwtTokenService;

    public AuthController(AsbancProperties properties, JwtTokenService jwtTokenService) {
        this.properties = properties;
        this.jwtTokenService = jwtTokenService;
    }

    private boolean timingSafeEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    @PostMapping(value = {"/api/Auth/token", "/api/auth/token"})
    public ResponseEntity<AuthTokenResponse> generateToken(
        @RequestBody(required = false) AuthTokenRequest body,
        @RequestHeader(value = "Authorization", required = false) String authHeader,
        HttpServletRequest request
    ) {
        String clientId = null;
        String clientSecret = null;

        if (authHeader != null && authHeader.startsWith("Basic ")) {
            try {
                String base64Credentials = authHeader.substring(6).trim();
                byte[] credDecoded = Base64.getDecoder().decode(base64Credentials);
                String credentials = new String(credDecoded, StandardCharsets.UTF_8);
                String[] values = credentials.split(":", 2);
                if (values.length == 2) {
                    clientId = values[0].trim();
                    clientSecret = values[1].trim();
                }
            } catch (Exception ignored) {}
        }

        if (clientId == null && body != null) {
            clientId = body.clientId();
            clientSecret = body.clientSecret();
        }

        if (clientId == null || clientSecret == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(AuthTokenResponse.error("99", "Credenciales client_id y client_secret requeridas"));
        }

        boolean validId = timingSafeEquals(clientId, properties.getClientId());
        boolean validSecret = timingSafeEquals(clientSecret, properties.getClientSecret());

        if (!validId || !validSecret) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(AuthTokenResponse.error("99", "Credenciales inválidas"));
        }

        String token = jwtTokenService.generateToken(clientId);
        long expiresIn = properties.getJwtExpirationSeconds();

        AuthTokenResponse response = AuthTokenResponse.success(token, expiresIn);
        request.setAttribute("ASBANC_RESPONSE", response);
        request.setAttribute("ASBANC_STATUS_CODE", "00");

        return ResponseEntity.ok(response);
    }
}
