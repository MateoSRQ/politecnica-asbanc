# 🧪 Suite de Pruebas HTTP con PactumJS - Politécnica ASBANC

Esta aplicación reside en el subdirectorio `/test` y utiliza la librería **[PactumJS](https://pactumjs.github.io/)** para realizar pruebas de APIs transaccionales HTTP, benchmarking de tiempos de respuesta por transacción, baterías concurrentes desde un pool de JSON y reversiones transaccionales (individuales o hechas a mano).

---

## 🚀 Características Principales

1. **Configuración vía `.env`**:
   - Lee `TEST_TARGET_URL` (por defecto `http://localhost:7300`).
   - Lee credenciales OAuth 2.0 (`ASBANC_CLIENT_ID`, `ASBANC_CLIENT_SECRET`).
   - Permite sobreescribir la URL destino dinámicamente desde el Dashboard Web o por argumentos de línea de comandos.

2. **Baterías con Pool de JSON (10, 100, N)**:
   - Contiene un pool de payloads JSON (`test/pool/payloads.json`) con transacciones representativas de los 5 bancos principales (**BCP**, **BBVA**, **Interbank**, **Scotiabank**, **BanBif**) y múltiples canales (**Ventanilla**, **ATM**, **Banca por Internet**, **Billeteras Yape/Plin**).
   - Botones rápidos para **10 transacciones**, **100 transacciones** o un número arbitrario **N**.

3. **Prueba con Código en Texto**:
   - Permite introducir cualquier código de estudiante institucional (por ejemplo `26023353010012`), DNI (`74202604`) o código sintético (`10000001`) para ejecutar transacciones específicas sobre él.

4. **Reversión Transaccional (Extornos)**:
   - **Botón individual en tabla**: Cada transacción completada dispone de su propio botón `[↩ Revertir]` que invoca a `POST /api/Transactional/ReversePay` a través de PactumJS y reporta el tiempo de reversión en milisegundos.
   - **Reversión manual ("hechas a mano")**: Formulario dedicado para introducir Banco, Nro Operación Banco, Nro Documento y Código Empresa y revertir cualquier transacción generada manualmente.
   - **Reversión masiva**: Botón `[🔄 Revertir Todas]` para limpiar deudas de prueba y dejar la BD intacta.

5. **Tiempos de Respuesta por Transacción**:
   - Cada fila de la tabla muestra la latencia exacta en milisegundos (`responseTimeMs`).
   - Semáforo de latencias:
     - 🟢 `< 100 ms`: Ultrarrápido
     - 🔵 `< 500 ms`: Óptimo
     - 🟡 `< 3000 ms`: Dentro de SLA ASBANC
     - 🔴 `> 3000 ms`: Violación de SLA
   - Resumen ejecutivo con promedio, mín, máx, P95 y porcentaje de cumplimiento del SLA (< 3s).

---

## 💻 Instrucciones de Uso

### Opción 1: Iniciar el Dashboard Web Interactivo
Inicia el servidor web en el puerto `7400` (configurable con `TEST_APP_PORT`):

```bash
npm run test:app
```
Luego abre en tu navegador:
👉 **`http://localhost:7400`**

---

### Opción 2: Ejecutar desde Línea de Comandos (CLI)

```bash
# Ejecutar batería de 10 transacciones con el pool JSON
npm run test:pactum -- --count 10

# Ejecutar batería de 100 transacciones contra una URL específica
npm run test:pactum -- --count 100 --url http://localhost:7300

# Ejecutar 5 transacciones sobre un código de alumno específico
npm run test:pactum -- --count 5 --code 26023353010012

# Revertir una transacción hecha a mano
npm run test:pactum -- --reverse --op OPTEST-99001 --bank 1020 --doc 10726
```

---

## 📁 Estructura del Subdirectorio `/test`

```
test/
├── config.ts              # Carga de variables de entorno (.env)
├── pactum-runner.ts       # Motor transaccional con PactumJS y cálculo de latencias
├── server.ts              # Servidor Fastify que expone la UI y los endpoints REST
├── cli.ts                 # CLI para ejecución directa en consola
├── pool/
│   ├── students.json      # Alumnos reales de BDACADEMICO6 y sintéticos
│   └── payloads.json      # Pool de 120+ transacciones multicanal y multibanco
├── public/
│   └── index.html         # Dashboard web interactivo moderno
└── README.md              # Documentación de la suite
```
