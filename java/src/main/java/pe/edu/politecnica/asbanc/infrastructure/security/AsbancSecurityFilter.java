package pe.edu.politecnica.asbanc.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import pe.edu.politecnica.asbanc.infrastructure.config.AsbancProperties;

import java.io.IOException;

@Component
@Order(1)
public class AsbancSecurityFilter extends OncePerRequestFilter {

    private final JwtTokenService jwtTokenService;
    private final AsbancProperties properties;

    public AsbancSecurityFilter(JwtTokenService jwtTokenService, AsbancProperties properties) {
        this.jwtTokenService = jwtTokenService;
        this.properties = properties;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String uri = request.getRequestURI().toLowerCase();

        if (uri.startsWith("/api/auth") || uri.equals("/health") || uri.equals("/actuator/health")) {
            filterChain.doFilter(request, response);
            return;
        }

        if (uri.startsWith("/api/transactional") || uri.startsWith("/api/audit") || uri.startsWith("/api/offhost") || uri.equals("/metrics") || uri.startsWith("/actuator")) {
            String authHeader = request.getHeader("Authorization");

            if (authHeader == null || (!authHeader.startsWith("Bearer ") && !authHeader.startsWith("Basic ") && !authHeader.startsWith("bearer ") && !authHeader.startsWith("basic "))) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"codigoRespuesta\":\"99\",\"descripcionResp\":\"AUTORIZACION REQUERIDA (CABECERA BASIC AUTH / TOKEN AUSENTE)\"}");
                return;
            }

            String token = authHeader.replaceFirst("^(?i)(Bearer|Basic)\\s+", "").trim();
            boolean isValid = jwtTokenService.validateToken(token) || token.equals(properties.getClientSecret());

            if (!isValid) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"codigoRespuesta\":\"99\",\"descripcionResp\":\"TOKEN ASBANC INVALIDO O EXPIRADO\"}");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }
}
