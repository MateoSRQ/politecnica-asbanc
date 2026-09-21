# Politécnica ASBANC - Pasarela de Recaudación FTR / YAPAGO

Microservicio transaccional de alta disponibilidad para **Politécnica** (`politecnica.edu.pe`), integrado con la red **ASBANC FTR / YAPAGO V46-V47** para recaudación en tiempo real y conciliación con la banca peruana (BCP, BBVA, Interbank, Scotiabank, BanBif, Yape, Plin).

---

## 🧠 Memoria de Proyecto Oficial

Toda la arquitectura, diseño, especificación de contratos, bitácora (ADR) y logs de cambios se gestionan centralizadamente en:

👉 **[`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md)** *(o alias [`MEMORY.md`](./MEMORY.md))*

---

## 🛠️ Stack Tecnológico

- **Runtime & Lenguaje**: Node.js 20+ LTS / TypeScript 5.x
- **Framework Web**: Fastify 4.x (SLA interno < 30ms, latencia máxima ASBANC 3.0s)
- **Base de Datos**: Microsoft SQL Server 2019 / 2022 (`mssql` / `tedious`) con Stored Procedures transaccionales
- **Idempotencia Transaccional**: Garantizada a nivel ACID en Microsoft SQL Server mediante transacciones atómicas (`sp_Asbanc_PayDebt`) e índice único anti-replay (`UQ_Txn_Banco_Op`)
- **Seguridad & OAuth 2.0**: Motor criptográfico JWT (HS256) nativo, cabeceras `Authorization: Basic/Bearer`, Rate Limiting y Helmet
- **Validación de Esquemas**: Zod (cumplimiento estricto de la norma ASBANC V47)
- **Logs Estructurados**: Pino (JSON a `stdout` con `traceId` y latencia en ms)
- **Telemetría & Métricas**: Prometheus (`prom-client`) en `/metrics`
- **Testing & Simulación**: Vitest (11 pruebas unitarias), suite WebStorm HTTP (`asbanc-api.http`) y emulador de 10 ventanillas bancarias

---

## 🚀 Guía de Puesta en Marcha Local (Desarrollo)

### 1. Variables de Entorno
El archivo `.env` ya viene configurado para desarrollo local:
```bash
cp .env.example .env
```

### 2. Base de Datos Local
Asegúrate de tener Microsoft SQL Server corriendo en el host local (puerto 1433).

### 3. Instalar Dependencias
```bash
npm install
```

### 4. Aprovisionar y Sembrar Base de Datos de Prueba
Crea la base de datos `politecnica_asbanc`, tablas, Stored Procedures e inserta los 10 clientes con 5 deudas cada uno (requisito ASBANC pág. 29):
```bash
npm run db:init
```

### 5. Iniciar el Servidor en Modo Desarrollo
```bash
npm run dev
# Servidor escuchando en http://localhost:7300
# Métricas Prometheus en http://localhost:7300/metrics
# Healthcheck en http://localhost:7300/health
```

### 6. Ejecutar Pruebas y Simulaciones
```bash
# Pruebas unitarias
npm test

# Simulación bancaria de un ciclo completo
npm run simulate

# Inspeccionar auditorías en MSSQL
npm run audit

# Inspeccionar métricas Prometheus
npm run metrics
```

---

## 🏭 Procedimiento de Instalación y Despliegue en Producción

### 1. Requisitos Previos del Servidor
* **Sistema Operativo**: Linux x86_64 (Ubuntu Server 22.04 LTS, Debian 12 o RHEL 9).
* **Node.js**: Versión 20 LTS o 22 LTS instalada en el sistema.
* **Microsoft SQL Server**: Versión 2019 o 2022 (Instancia nativa o clúster Always On Availability Group).
* **Nginx**: Versión 1.20+ con soporte para HTTP/2 y TLS 1.2/1.3.
* **Gestor de Procesos**: PM2 o systemd.

---

### 2. Instalación de Node.js 20 LTS (si no está instalado)
En Ubuntu / Debian:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

### 3. Despliegue del Código Fuente
Ubica el proyecto en un directorio estándar de producción (ej. `/opt/politecnica-asbanc`):
```bash
sudo mkdir -p /opt/politecnica-asbanc
sudo chown -R $USER:$USER /opt/politecnica-asbanc
cd /opt/politecnica-asbanc

# Clonar repositorio o copiar archivos del proyecto
git clone <URL_DEL_REPOSITORIO> .
```

---

### 4. Instalación de Dependencias y Compilación
Instala las dependencias y compila el código TypeScript a JavaScript optimizado para producción:
```bash
# 1. Instalar dependencias completas para construir
npm ci

# 2. Compilar TypeScript a JavaScript en dist/
npm run build

# 3. (Opcional) Limpiar devDependencies para ahorrar espacio
npm prune --omit=dev
```

---

### 5. Configuración de Variables de Entorno (`.env`)
Crea el archivo `.env` en `/opt/politecnica-asbanc/.env` con las credenciales de producción:

```env
# Servidor HTTP
NODE_ENV=production
PORT=7300
HOST=127.0.0.1
LOG_LEVEL=info

# Seguridad ASBANC y OAuth 2.0 / JWT
ASBANC_AUTH_ENABLED=true
ASBANC_DEFAULT_COMPANY_CODE=998
ASBANC_CLIENT_ID=asbanc_ftr
ASBANC_CLIENT_SECRET=genera_un_secreto_robusto_para_asbanc
JWT_SECRET=genera_una_clave_criptografica_aleatoria_de_al_menos_64_caracteres
JWT_EXPIRATION_SECONDS=86400

# Base de Datos Microsoft SQL Server (Always On AG Listener o IP de producción)
DB_SERVER=ag-listener.politecnica.local
DB_PORT=1433
DB_USER=usr_asbanc_prod
DB_PASSWORD=PasswordSeguroDeProduccion!2026#
DB_NAME=politecnica_asbanc
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
DB_POOL_MIN=10
DB_POOL_MAX=50

# Observabilidad y Rate Limiting
METRICS_ENABLED=true
METRICS_ROUTE=/metrics
SLA_WARNING_THRESHOLD_MS=2500
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=10000
```

> ⚠️ **Nota de Seguridad**: Si `NODE_ENV=production`, el servicio cuenta con validación estricta Zod que impedirá el arranque si se usan contraseñas o claves JWT por defecto de desarrollo.

---

### 6. Aprovisionamiento de Base de Datos en Producción
Ejecuta el script DDL de esquemas y Stored Procedures contra el SQL Server de producción:
```bash
/opt/mssql-tools18/bin/sqlcmd -S ag-listener.politecnica.local,1433 \
  -U usr_asbanc_prod -P 'PasswordSeguroDeProduccion!2026#' -C \
  -d politecnica_asbanc -i scripts/schema.sql
```

---

### 7. Puesta en Marcha con Gestor de Procesos (Alta Disponibilidad)

#### Opción A: Despliegue con PM2 en Modo Clúster (Recomendado)
PM2 permite balancear la carga automáticamente entre todos los núcleos de CPU del servidor:

```bash
# 1. Instalar PM2 globalmente
sudo npm install -g pm2

# 2. Iniciar la aplicación usando el archivo ecosystem
pm2 start ecosystem.config.cjs

# 3. Configurar persistencia tras reinicio del servidor
pm2 save
pm2 startup
```

Comandos útiles de administración PM2:
```bash
pm2 status                       # Ver estado y consumo de memoria
pm2 logs politecnica-asbanc      # Ver logs en tiempo real
pm2 reload politecnica-asbanc    # Recarga zero-downtime
```

#### Opción B: Despliegue como Servicio Nativo `systemd`
Si prefieres administrarlo con las herramientas estándar de Linux:

```bash
# 1. Copiar plantilla de servicio
sudo cp scripts/politecnica-asbanc.service /etc/systemd/system/

# 2. Recargar demonio y activar arranque automático
sudo systemctl daemon-reload
sudo systemctl enable politecnica-asbanc

# 3. Iniciar el servicio
sudo systemctl start politecnica-asbanc

# 4. Monitorear estado y logs
sudo systemctl status politecnica-asbanc
journalctl -u politecnica-asbanc -f
```

---

### 8. Configuración de Nginx como Reverse Proxy y Terminación TLS

En un entorno de producción bancario, Nginx actúa como escudo perimetral terminando SSL/TLS 1.2/1.3 y filtrando las IPs autorizadas de ASBANC:

```bash
# 1. Copiar plantilla de configuración
sudo cp scripts/nginx-asbanc.conf /etc/nginx/sites-available/asbanc.conf

# 2. Habilitar el sitio
sudo ln -s /etc/nginx/sites-available/asbanc.conf /etc/nginx/sites-enabled/

# 3. Validar sintaxis y recargar Nginx
sudo nginx -t
sudo systemctl reload nginx
```

---

### 9. Verificación Post-Despliegue

```bash
# 1. Verificar estado de salud global
curl -k https://localhost:7300/health

# 2. Generar token JWT de prueba
curl -k -X POST https://localhost:7300/api/Auth/token \
  -H "Content-Type: application/json" \
  -d '{"client_id":"asbanc_ftr","client_secret":"asbanc_ftr_secret_2026"}'

# 3. Verificar scraping de telemetría Prometheus
curl -k https://localhost:7300/metrics
```

---

## 📌 Catálogo de Endpoints de la Pasarela

| Módulo | Método | Endpoint | Descripción |
| :--- | :---: | :--- | :--- |
| **Seguridad** | `POST` | `/api/Auth/token` | Emite tokens JWT OAuth 2.0 (Pág. 8 Guía V47) |
| **On-Host** | `POST` | `/api/Transactional/ValidateCustomer` | Valida existencia de cliente por DNI/RUC |
| **On-Host** | `POST` | `/api/Transactional/ListDebts` | Consulta de deudas y recibos pendientes |
| **On-Host** | `POST` | `/api/Transactional/PayDebt` | Confirmación y cobro con idempotencia |
| **On-Host** | `POST` | `/api/Transactional/ReversePay` | Extorno o anulación bancaria de pago |
| **Auditoría** | `GET` | `/api/Audit` | Consulta paginada y filtrada de auditorías |
| **Auditoría** | `GET` | `/api/Audit/:id` | Detalle individual de auditoría por Id |
| **Auditoría** | `GET` | `/api/Audit/export` | Descarga de auditoría en CSV o JSON |
| **Monitoreo** | `GET` | `/health` | Healthcheck (estado del servicio y MSSQL) |
| **Monitoreo** | `GET` | `/metrics` | Métricas Prometheus (latencias, SLA, contadores) |
