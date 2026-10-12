package pe.edu.politecnica.asbanc.core.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuthTokenResponse(
    @JsonProperty("access_token")
    String accessToken,

    @JsonProperty("token_type")
    String tokenType,

    @JsonProperty("expires_in")
    Long expiresIn,

    String codigoRespuesta,
    String descripcionResp
) {
    public static AuthTokenResponse success(String token, long expiresInSeconds) {
        return new AuthTokenResponse(token, "Bearer", expiresInSeconds, "00", "OK");
    }

    public static AuthTokenResponse error(String codigoRespuesta, String descripcion) {
        return new AuthTokenResponse(null, null, null, codigoRespuesta, descripcion);
    }
}
