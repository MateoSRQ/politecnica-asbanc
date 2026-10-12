package pe.edu.politecnica.asbanc.infrastructure.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Date;

@Service
public class JwtTokenService {

    private final AsbancProperties properties;
    private final SecretKey signingKey;

    public JwtTokenService(AsbancProperties properties) {
        this.properties = properties;
        this.signingKey = deriveKey(properties.getJwtSecret());
    }

    private SecretKey deriveKey(String secret) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(secret.getBytes(StandardCharsets.UTF_8));
            return Keys.hmacShaKeyFor(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("Error derivando clave HMAC-SHA256", e);
        }
    }

    public String generateToken(String clientId) {
        long now = System.currentTimeMillis();
        long expirationMs = properties.getJwtExpirationSeconds() * 1000L;

        return Jwts.builder()
            .subject(clientId)
            .issuer("Politecnica ASBANC Gateway")
            .issuedAt(new Date(now))
            .expiration(new Date(now + expirationMs))
            .signWith(signingKey)
            .compact();
    }

    public boolean validateToken(String token) {
        try {
            Claims claims = Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

            return claims.getExpiration() == null || claims.getExpiration().after(new Date());
        } catch (Exception e) {
            return false;
        }
    }
}
