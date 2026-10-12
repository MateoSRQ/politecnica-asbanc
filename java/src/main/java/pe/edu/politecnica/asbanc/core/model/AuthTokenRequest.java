package pe.edu.politecnica.asbanc.core.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

public record AuthTokenRequest(
    @JsonProperty("client_id")
    @NotBlank(message = "client_id es obligatorio")
    String clientId,

    @JsonProperty("client_secret")
    @NotBlank(message = "client_secret es obligatorio")
    String clientSecret
) {
    public AuthTokenRequest {
        if (clientId != null) clientId = clientId.trim();
        if (clientSecret != null) clientSecret = clientSecret.trim();
    }
}
