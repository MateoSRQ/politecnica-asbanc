package pe.edu.politecnica.asbanc.interfaces.rest;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.politecnica.asbanc.core.model.ListDebtsRequest;
import pe.edu.politecnica.asbanc.core.model.ListDebtsResponse;
import pe.edu.politecnica.asbanc.core.model.PayDebtRequest;
import pe.edu.politecnica.asbanc.core.model.PayDebtResponse;
import pe.edu.politecnica.asbanc.core.model.ReversePayRequest;
import pe.edu.politecnica.asbanc.core.model.ReversePayResponse;
import pe.edu.politecnica.asbanc.core.model.TransactionMetrics;
import pe.edu.politecnica.asbanc.core.model.ValidateCustomerRequest;
import pe.edu.politecnica.asbanc.core.model.ValidateCustomerResponse;
import pe.edu.politecnica.asbanc.core.services.CustomerService;
import pe.edu.politecnica.asbanc.core.services.DebtService;
import pe.edu.politecnica.asbanc.core.services.PaymentService;
import pe.edu.politecnica.asbanc.core.services.ReversePaymentService;

@RestController
public class TransactionalController {

    private final CustomerService customerService;
    private final DebtService debtService;
    private final PaymentService paymentService;
    private final ReversePaymentService reversePaymentService;

    public TransactionalController(
        CustomerService customerService,
        DebtService debtService,
        PaymentService paymentService,
        ReversePaymentService reversePaymentService
    ) {
        this.customerService = customerService;
        this.debtService = debtService;
        this.paymentService = paymentService;
        this.reversePaymentService = reversePaymentService;
    }

    private boolean hasMetricsRequested(HttpServletRequest req) {
        String metricsParam = req.getParameter("metrics");
        return metricsParam != null && !metricsParam.equalsIgnoreCase("false") && !metricsParam.equals("0");
    }

    private int computeLatencyMs(HttpServletRequest req) {
        Long start = (Long) req.getAttribute("ASBANC_START_TIME");
        if (start != null) {
            return Math.max(1, (int) (System.currentTimeMillis() - start));
        }
        return 1;
    }

    @PostMapping(value = {"/api/Transactional/ValidateCustomer", "/api/transactional/validatecustomer"})
    public ResponseEntity<ValidateCustomerResponse> validateCustomer(
        @Valid @RequestBody ValidateCustomerRequest request,
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        ValidateCustomerResponse resp = customerService.validateCustomer(request);
        httpRequest.setAttribute("ASBANC_RESPONSE", resp);
        httpRequest.setAttribute("ASBANC_STATUS_CODE", resp.codigoRespuesta());

        if (hasMetricsRequested(httpRequest)) {
            int duration = computeLatencyMs(httpRequest);
            httpResponse.setHeader("X-Response-Time-Ms", String.valueOf(duration));
            resp = new ValidateCustomerResponse(
                resp.codigoRespuesta(),
                resp.descripcionResp(),
                resp.nombreCliente(),
                new TransactionMetrics(duration, duration, "ms"),
                duration
            );
        }

        return ResponseEntity.ok(resp);
    }

    @PostMapping(value = {"/api/Transactional/ListDebts", "/api/transactional/listdebts"})
    public ResponseEntity<ListDebtsResponse> listDebts(
        @Valid @RequestBody ListDebtsRequest request,
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        ListDebtsResponse resp = debtService.listDebts(request);
        httpRequest.setAttribute("ASBANC_RESPONSE", resp);
        httpRequest.setAttribute("ASBANC_STATUS_CODE", resp.codigoRespuesta());

        if (hasMetricsRequested(httpRequest)) {
            int duration = computeLatencyMs(httpRequest);
            httpResponse.setHeader("X-Response-Time-Ms", String.valueOf(duration));
            resp = new ListDebtsResponse(
                resp.codigoRespuesta(),
                resp.descripcionResp(),
                resp.deudasPendientes(),
                new TransactionMetrics(duration, duration, "ms"),
                duration
            );
        }

        return ResponseEntity.ok(resp);
    }

    @PostMapping(value = {"/api/Transactional/PayDebt", "/api/transactional/paydebt"})
    public ResponseEntity<PayDebtResponse> payDebt(
        @Valid @RequestBody PayDebtRequest request,
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        httpRequest.setAttribute("ASBANC_BANK_CODE", request.codigoBanco());
        httpRequest.setAttribute("ASBANC_CHANNEL", request.canalPago());
        httpRequest.setAttribute("ASBANC_ID_CONSULTA", request.idConsulta());
        httpRequest.setAttribute("ASBANC_NUM_OP_BANCO", request.numOperacionBanco());

        PayDebtResponse resp = paymentService.payDebt(request);
        httpRequest.setAttribute("ASBANC_RESPONSE", resp);
        httpRequest.setAttribute("ASBANC_STATUS_CODE", resp.codigoRespuesta());

        if (hasMetricsRequested(httpRequest)) {
            int duration = computeLatencyMs(httpRequest);
            httpResponse.setHeader("X-Response-Time-Ms", String.valueOf(duration));
            resp = new PayDebtResponse(
                resp.codigoRespuesta(),
                resp.nombreCliente(),
                resp.numOperacionERP(),
                resp.descripcionResp(),
                new TransactionMetrics(duration, duration, "ms"),
                duration
            );
        }

        return ResponseEntity.ok(resp);
    }

    @PostMapping(value = {"/api/Transactional/ReversePay", "/api/transactional/reversepay"})
    public ResponseEntity<ReversePayResponse> reversePay(
        @Valid @RequestBody ReversePayRequest request,
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        httpRequest.setAttribute("ASBANC_BANK_CODE", request.codigoBanco());
        httpRequest.setAttribute("ASBANC_NUM_OP_BANCO", request.numOperacionBanco());

        ReversePayResponse resp = reversePaymentService.reversePay(request);
        httpRequest.setAttribute("ASBANC_RESPONSE", resp);
        httpRequest.setAttribute("ASBANC_STATUS_CODE", resp.codigoRespuesta());

        if (hasMetricsRequested(httpRequest)) {
            int duration = computeLatencyMs(httpRequest);
            httpResponse.setHeader("X-Response-Time-Ms", String.valueOf(duration));
            resp = new ReversePayResponse(
                resp.codigoRespuesta(),
                resp.nombreCliente(),
                resp.numOperacionERP(),
                resp.descripcionResp(),
                new TransactionMetrics(duration, duration, "ms"),
                duration
            );
        }

        return ResponseEntity.ok(resp);
    }
}
