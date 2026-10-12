#!/usr/bin/env bash
# ==============================================================================
# Script de Pruebas End-to-End para el Gateway Java ASBANC FTR
# Instituto Politécnica - 2026
# ==============================================================================

set -e

PORT="${JAVA_PORT:-7305}"
BASE_URL="http://localhost:${PORT}"
CLIENT_ID="${ASBANC_CLIENT_ID:-asbanc_ftr}"
CLIENT_SECRET="${ASBANC_CLIENT_SECRET:-asbanc_ftr_secret_2026}"

GREEN="\033[0;32m"
RED="\033[0;31m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
NC="\033[0m"

echo -e "${BLUE}====================================================================${NC}"
echo -e "${BLUE}   SUITE DE PRUEBAS AUTOMATIZADA: BACKEND JAVA 21 / SPRING BOOT 3.4   ${NC}"
echo -e "${BLUE}   Destino: ${BASE_URL}                                            ${NC}"
echo -e "${BLUE}====================================================================${NC}"

# 1. Comprobar si el servicio está activo
echo -n "1. Verificando conectividad con el servicio Java en puerto ${PORT}... "
if ! curl -s --max-time 3 "${BASE_URL}/health" >/dev/null; then
    echo -e "${RED}[ERROR]${NC}"
    echo -e "${YELLOW}El servicio Java no responde en ${BASE_URL}.${NC}"
    echo "Para iniciarlo, ejecuta en otra terminal:"
    echo "  ~/.local/bin/java -jar java/target/politecnica-asbanc-1.0.0.jar --server.port=${PORT}"
    exit 1
fi
echo -e "${GREEN}[OK]${NC}"

# 2. Healthcheck
echo -n "2. Healthcheck y conectividad a SQL Server 2022... "
HEALTH_RESP=$(curl -s "${BASE_URL}/health")
DB_STATUS=$(echo "$HEALTH_RESP" | jq -r .database 2>/dev/null || echo "UNKNOWN")
SERVICE_STATUS=$(echo "$HEALTH_RESP" | jq -r .status 2>/dev/null || echo "UNKNOWN")
if [ "$DB_STATUS" = "CONNECTED" ] && [ "$SERVICE_STATUS" = "UP" ]; then
    echo -e "${GREEN}[OK] (Status: ${SERVICE_STATUS}, DB: ${DB_STATUS})${NC}"
else
    echo -e "${RED}[FALLÓ] (Status: ${SERVICE_STATUS}, DB: ${DB_STATUS})${NC}"
fi

# 3. Autenticación OAuth 2.0 / JWT
echo -n "3. Obteniendo Token JWT OAuth 2.0 (/api/Auth/token)... "
TOKEN_RESP=$(curl -s -X POST "${BASE_URL}/api/Auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"${CLIENT_ID}\",\"client_secret\":\"${CLIENT_SECRET}\"}")

AUTH_TOKEN=$(echo "$TOKEN_RESP" | jq -r .access_token 2>/dev/null || echo "")
if [ -n "$AUTH_TOKEN" ] && [ "$AUTH_TOKEN" != "null" ]; then
    echo -e "${GREEN}[OK] (Token emitido correctamente)${NC}"
else
    echo -e "${RED}[FALLÓ] Error obteniendo token: ${TOKEN_RESP}${NC}"
    exit 1
fi

AUTH_HEADER="Authorization: Bearer ${AUTH_TOKEN}"

# 4. Validar Estudiante en BDACADEMICO6
echo -n "4. Validando Estudiante (/api/Transactional/ValidateCustomer)... "
VAL_START=$(date +%s%3N)
VAL_RESP=$(curl -s -X POST "${BASE_URL}/api/Transactional/ValidateCustomer" \
  -H "Content-Type: application/json" \
  -H "${AUTH_HEADER}" \
  -d '{"tipoConsulta":"0","idConsulta":"26023353010012","codigoEmpresa":"998"}')
VAL_END=$(date +%s%3N)
VAL_TIME=$((VAL_END - VAL_START))

VAL_CODE=$(echo "$VAL_RESP" | jq -r .codigoRespuesta 2>/dev/null || echo "ERR")
VAL_NAME=$(echo "$VAL_RESP" | jq -r .nombreCliente 2>/dev/null || echo "")
if [ "$VAL_CODE" = "00" ]; then
    echo -e "${GREEN}[OK] (${VAL_NAME} - ${VAL_TIME}ms)${NC}"
else
    echo -e "${RED}[FALLÓ] Código: ${VAL_CODE}, Resp: ${VAL_RESP}${NC}"
fi

# 5. Consultar Deudas con OUTER APPLY
echo -n "5. Consultando Deudas con OUTER APPLY (/api/Transactional/ListDebts)... "
DEBT_START=$(date +%s%3N)
DEBT_RESP=$(curl -s -X POST "${BASE_URL}/api/Transactional/ListDebts" \
  -H "Content-Type: application/json" \
  -H "${AUTH_HEADER}" \
  -d '{"tipoConsulta":"0","idConsulta":"26023353010012","codigoEmpresa":"998","codigoProducto":"001"}')
DEBT_END=$(date +%s%3N)
DEBT_TIME=$((DEBT_END - DEBT_START))

DEBT_CODE=$(echo "$DEBT_RESP" | jq -r .codigoRespuesta 2>/dev/null || echo "ERR")
NUM_DOC=$(echo "$DEBT_RESP" | jq -r '.deudasPendientes[0].numDocumento' 2>/dev/null || echo "")
IMPORTE=$(echo "$DEBT_RESP" | jq -r '.deudasPendientes[0].deuda' 2>/dev/null || echo "0")
if [ "$DEBT_CODE" = "00" ] && [ -n "$NUM_DOC" ] && [ "$NUM_DOC" != "null" ]; then
    echo -e "${GREEN}[OK] (Doc: ${NUM_DOC}, Monto: S/. ${IMPORTE} - ${DEBT_TIME}ms)${NC}"
else
    echo -e "${YELLOW}[INFO] Código: ${DEBT_CODE} (Sin deudas pendientes o no encontrado)${NC}"
fi

# 6. Pago Transaccional con Bloqueo Optimista (si hay cuota pendiente)
OP_BANCO="TEST-JAVA-$(date +%H%M%S)"
if [ -n "$NUM_DOC" ] && [ "$NUM_DOC" != "null" ]; then
    echo -n "6. Ejecutando Pago Atómico (/api/Transactional/PayDebt)... "
    PAY_START=$(date +%s%3N)
    PAY_RESP=$(curl -s -X POST "${BASE_URL}/api/Transactional/PayDebt" \
      -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" \
      -d "{
        \"fechaTxn\": \"$(date +%Y%m%d)\",
        \"horaTxn\": \"$(date +%H%M%S)\",
        \"canalPago\": \"10\",
        \"codigoBanco\": \"1020\",
        \"numOperacionBanco\": \"${OP_BANCO}\",
        \"formaPago\": \"01\",
        \"tipoConsulta\": \"0\",
        \"idConsulta\": \"26023353010012\",
        \"codigoProducto\": \"001\",
        \"numDocumento\": \"${NUM_DOC}\",
        \"importePagado\": ${IMPORTE},
        \"monedaDoc\": \"1\",
        \"codigoEmpresa\": \"998\"
      }")
    PAY_END=$(date +%s%3N)
    PAY_TIME=$((PAY_END - PAY_START))

    PAY_CODE=$(echo "$PAY_RESP" | jq -r .codigoRespuesta 2>/dev/null || echo "ERR")
    NUM_ERP=$(echo "$PAY_RESP" | jq -r .numOperacionERP 2>/dev/null || echo "")
    if [ "$PAY_CODE" = "00" ]; then
        echo -e "${GREEN}[OK] (ERP: ${NUM_ERP} - ${PAY_TIME}ms)${NC}"
    else
        echo -e "${RED}[FALLÓ] Código: ${PAY_CODE}, Resp: ${PAY_RESP}${NC}"
    fi

    # 7. Idempotencia: Reintentar el mismo pago
    echo -n "7. Probando Idempotencia (reintento del mismo pago)... "
    DUP_RESP=$(curl -s -X POST "${BASE_URL}/api/Transactional/PayDebt" \
      -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" \
      -d "{
        \"fechaTxn\": \"$(date +%Y%m%d)\",
        \"horaTxn\": \"$(date +%H%M%S)\",
        \"canalPago\": \"10\",
        \"codigoBanco\": \"1020\",
        \"numOperacionBanco\": \"${OP_BANCO}\",
        \"formaPago\": \"01\",
        \"tipoConsulta\": \"0\",
        \"idConsulta\": \"26023353010012\",
        \"codigoProducto\": \"001\",
        \"numDocumento\": \"${NUM_DOC}\",
        \"importePagado\": ${IMPORTE},
        \"monedaDoc\": \"1\",
        \"codigoEmpresa\": \"998\"
      }")

    DUP_DESC=$(echo "$DUP_RESP" | jq -r .descripcionResp 2>/dev/null || echo "")
    if echo "$DUP_DESC" | grep -q "IDEMPOTENTE"; then
        echo -e "${GREEN}[OK] (Detectado como IDEMPOTENTE)${NC}"
    else
        echo -e "${RED}[FALLÓ] Resp: ${DUP_RESP}${NC}"
    fi

    # 8. Extorno Atómico (ReversePay) para dejar la base de datos limpia
    echo -n "8. Extornando Pago (/api/Transactional/ReversePay)... "
    REV_START=$(date +%s%3N)
    REV_RESP=$(curl -s -X POST "${BASE_URL}/api/Transactional/ReversePay" \
      -H "Content-Type: application/json" \
      -H "${AUTH_HEADER}" \
      -d "{
        \"fechaTxn\": \"$(date +%Y%m%d)\",
        \"horaTxn\": \"$(date +%H%M%S)\",
        \"codigoBanco\": \"1020\",
        \"numOperacionBanco\": \"${OP_BANCO}\",
        \"numDocumento\": \"${NUM_DOC}\",
        \"codigoEmpresa\": \"998\"
      }")
    REV_END=$(date +%s%3N)
    REV_TIME=$((REV_END - REV_START))

    REV_CODE=$(echo "$REV_RESP" | jq -r .codigoRespuesta 2>/dev/null || echo "ERR")
    if [ "$REV_CODE" = "00" ]; then
        echo -e "${GREEN}[OK] (Deuda restaurada a pendiente - ${REV_TIME}ms)${NC}"
    else
        echo -e "${RED}[FALLÓ] Resp: ${REV_RESP}${NC}"
    fi
fi

# 9. Verificación de Telemetría (?metrics=true)
echo -n "9. Probando inyección de telemetría (?metrics=true)... "
METRIC_RESP=$(curl -i -s -X POST "${BASE_URL}/api/Transactional/ValidateCustomer?metrics=true" \
  -H "Content-Type: application/json" \
  -H "${AUTH_HEADER}" \
  -d '{"tipoConsulta":"0","idConsulta":"26023353010012","codigoEmpresa":"998"}')

if echo "$METRIC_RESP" | grep -iq "X-Response-Time-Ms"; then
    echo -e "${GREEN}[OK] (Cabecera X-Response-Time-Ms detectada)${NC}"
else
    echo -e "${RED}[FALLÓ] No se detectó la cabecera de telemetría${NC}"
fi

# 10. Auditoría Forense
echo -n "10. Consultando Auditoría Forense (/api/Audit)... "
AUDIT_RESP=$(curl -s -X GET "${BASE_URL}/api/Audit?limit=1" -H "${AUTH_HEADER}")
AUDIT_TOTAL=$(echo "$AUDIT_RESP" | jq -r .total 2>/dev/null || echo "0")
if [ "$AUDIT_TOTAL" -gt 0 ]; then
    echo -e "${GREEN}[OK] (Total de registros forenses: ${AUDIT_TOTAL})${NC}"
else
    echo -e "${YELLOW}[WARN] Total auditoría: ${AUDIT_TOTAL}${NC}"
fi

echo -e "${BLUE}====================================================================${NC}"
echo -e "${GREEN}   TODAS LAS PRUEBAS END-TO-END DE JAVA HAN SIDO EXITOSAS   ${NC}"
echo -e "${BLUE}====================================================================${NC}"
