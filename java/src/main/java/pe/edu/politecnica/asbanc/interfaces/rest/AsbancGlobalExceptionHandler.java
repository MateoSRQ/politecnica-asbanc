package pe.edu.politecnica.asbanc.interfaces.rest;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import pe.edu.politecnica.asbanc.core.constants.AsbancConstants;
import pe.edu.politecnica.asbanc.core.model.ListDebtsResponse;
import pe.edu.politecnica.asbanc.core.model.PayDebtResponse;
import pe.edu.politecnica.asbanc.core.model.ReversePayResponse;
import pe.edu.politecnica.asbanc.core.model.ValidateCustomerResponse;

import java.util.Collections;
import java.util.stream.Collectors;

@RestControllerAdvice
public class AsbancGlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(AsbancGlobalExceptionHandler.class);

    private ResponseEntity<?> buildErrorResponse(HttpServletRequest request, String errorMsg) {
        String uri = request != null && request.getRequestURI() != null ? request.getRequestURI().toLowerCase() : "";
        Object resp;
        if (uri.contains("/listdebts")) {
            resp = new ListDebtsResponse(AsbancConstants.ResponseCodes.UNKNOWN_ERROR, errorMsg, Collections.emptyList());
        } else if (uri.contains("/paydebt")) {
            resp = new PayDebtResponse(AsbancConstants.ResponseCodes.UNKNOWN_ERROR, "", "", errorMsg);
        } else if (uri.contains("/reversepay")) {
            resp = new ReversePayResponse(AsbancConstants.ResponseCodes.UNKNOWN_ERROR, "", "", errorMsg);
        } else {
            resp = new ValidateCustomerResponse(AsbancConstants.ResponseCodes.UNKNOWN_ERROR, errorMsg, "");
        }

        if (request != null) {
            request.setAttribute("ASBANC_RESPONSE", resp);
            request.setAttribute("ASBANC_STATUS_CODE", AsbancConstants.ResponseCodes.UNKNOWN_ERROR);
        }

        return ResponseEntity.ok(resp);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.OK)
    public ResponseEntity<?> handleValidationException(
        MethodArgumentNotValidException ex,
        HttpServletRequest request
    ) {
        String errors = ex.getBindingResult().getFieldErrors().stream()
            .map(FieldError::getDefaultMessage)
            .collect(Collectors.joining(", "));

        String msg = "DATOS DE ENTRADA INVALIDOS: " + errors;
        log.warn("Fallo de validación en {}: {}", request != null ? request.getRequestURI() : "N/A", msg);

        return buildErrorResponse(request, msg);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.OK)
    public ResponseEntity<?> handleJsonParseException(
        HttpMessageNotReadableException ex,
        HttpServletRequest request
    ) {
        log.warn("Payload JSON inválido en {}: {}", request != null ? request.getRequestURI() : "N/A", ex.getMessage());
        return buildErrorResponse(request, "DATOS DE ENTRADA INVALIDOS: Formato JSON incorrecto");
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.OK)
    public ResponseEntity<?> handleGenericException(
        Exception ex,
        HttpServletRequest request
    ) {
        log.error("Excepción no controlada en {}: {}", request != null ? request.getRequestURI() : "N/A", ex.getMessage(), ex);
        return buildErrorResponse(request, "ERROR DESCONOCIDO");
    }
}
