# 📚 Catálogo Integral de Sentencias SQL - Politécnica ASBANC

> **Proyecto:** Politécnica ASBANC (`politecnica-asbanc`)  
> **Especificación:** ASBANC FTR / YAPAGO V46-V47  
> **Motor de Base de Datos:** Microsoft SQL Server 2019 / 2022 (`mssql`)  
> **Fecha de Elaboración:** 2026-09-16  
> **Ubicación:** `docs/catalogo_sentencias_sql.md`  

---

## 📌 Contexto de Motores y Esquemas

La pasarela opera contra dos entornos de datos dentro de Microsoft SQL Server:
1. **`BDACADEMICO6` (Core / ERP Académico)**: Base de datos corporativa central donde residen los estudiantes reales (`Academico.Alumno`, `General.Persona`), las cuotas académicas (`Ctas_Ctes.Alumno_Pago`), los periodos (`General.Periodo`) y el detalle de comprobantes (`Ctas_Ctes.Alumno_Pago_Detalle`).
2. **`politecnica_asbanc` (Esquema Transaccional de Certificación)**: Base de datos transaccional con tablas nativas (`Clientes`, `Deudas`, `TransaccionesBancarias`, `AuditoriaLogs`) y Stored Procedures oficiales para pruebas de homologación bancaria FTR.

---

## 📑 Índice de Contenidos
1. [Sentencias SQL para Listar Deudas / Pagos (ListDebts)](#1-sentencias-sql-para-listar-deudas--pagos-listdebts)
2. [Sentencias SQL para Procesar Pagos (PayDebt)](#2-sentencias-sql-para-procesar-pagos-paydebt)
3. [Sentencias SQL para Extorno / Reversión de Pagos (ReversePay)](#3-sentencias-sql-para-extorno--reversión-de-pagos-reversepay)
4. [Sentencias SQL de Validación de Clientes (ValidateCustomer)](#4-sentencias-sql-de-validación-de-clientes-validatecustomer)
5. [Sentencias SQL del Módulo de Auditoría Forense](#5-sentencias-sql-del-módulo-de-auditoría-forense)
6. [DDL: Esquema, Tablas, Secuencias y Procedimientos (politecnica_asbanc)](#6-ddl-esquema-tablas-secuencias-y-procedimientos-politecnica_asbanc)
7. [DDL: Índices Estratégicos de Optimización (BDACADEMICO6)](#7-ddl-índices-estratégicos-de-optimización-bdacademico6)
8. [DML: Carga de Datos Iniciales y Pruebas (seed.sql)](#8-dml-carga-de-datos-iniciales-y-pruebas-seedsql)
9. [Sentencias SQL para Benchmarks, Diagnóstico e Integridad](#9-sentencias-sql-para-benchmarks-diagnóstico-e-integridad)

---

## 1. Sentencias SQL para Listar Deudas / Pagos (ListDebts)

Archivo fuente: [`src/interfaces/http/controllers/transactional.controller.ts`](file:///home/mateo/projects/politecnica-asbanc/src/interfaces/http/controllers/transactional.controller.ts)

### 1.1 Identificación del Estudiante en `BDACADEMICO6`
Busca al alumno a través del código institucional o documento de identidad (DNI / RUC):
```sql
SELECT TOP 1 
  alu.id AS alumno_id,
  alu.codigo_alumno,
  per.nro_documento,
  LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo
FROM Academico.Alumno alu
JOIN General.Persona per ON alu.persona_id = per.id
WHERE 
  (@TipoConsulta = '0' AND (alu.codigo_alumno = @IdConsulta OR per.nro_documento = @IdConsulta))
  OR (@TipoConsulta IN ('1', '2') AND (per.nro_documento = @IdConsulta OR alu.codigo_alumno = @IdConsulta))
  OR (alu.codigo_alumno = @IdConsulta OR per.nro_documento = @IdConsulta);
```

### 1.2 Obtención de la Deuda Más Antigua Pendiente en `BDACADEMICO6`
Aplica orden de prelación bancaria estricto: periodo académico cronológico, cuota/concepto ascendente, vencimiento ascendente e identificador único:
```sql
SELECT TOP 1
  ap.id AS pago_id,
  ap.alumno_id,
  ap.num_cuota,
  ap.monto AS deuda,
  ap.fecha_vencimiento,
  ap.fecha_generacion,
  ap.created_at,
  ap.param_estado_pago_id,
  -- Concepto
  ISNULL(ac.descripcion, ISNULL(apc.descripcion, CASE WHEN ap.num_cuota = 0 THEN 'MATRICULA' ELSE 'PENSION CUOTA ' + CAST(ap.num_cuota AS VARCHAR) END)) AS concepto,
  ac.concepto_pago_id,
  -- Periodo Académico
  p.id AS periodo_id,
  p.nombre AS periodo_nombre,
  p.fecha_inicio AS periodo_fecha_inicio
FROM Ctas_Ctes.Alumno_Pago ap
LEFT JOIN Ctas_Ctes.Alumno_Pago_Cuota apc ON ap.id = apc.alumno_pago_id
LEFT JOIN Ctas_Ctes.Alumno_Cuota ac ON apc.alumno_cuota_id = ac.id
LEFT JOIN Carga_Academica.Carga_Academica_Sede cas ON ap.carga_academica_sede_id = cas.id
LEFT JOIN Carga_Academica.Carga_Academica ca ON cas.carga_academica_id = ca.id
LEFT JOIN General.Periodo p ON ca.periodo_id = p.id
WHERE ap.alumno_id = @AlumnoId
  AND ap.param_estado_pago_id = 25 -- SOL_EST_GENERADO (pendiente de pago)
ORDER BY 
  ISNULL(p.fecha_inicio, '1900-01-01') ASC,
  ISNULL(p.id, 0) ASC,
  ap.num_cuota ASC,
  ap.fecha_vencimiento ASC,
  ap.id ASC;
```

### 1.3 Fallback de Deudas en `politecnica_asbanc.dbo.Deudas`
```sql
SELECT TOP 1
  d.CodigoProducto,
  d.NumDocumento,
  d.DescDocumento,
  d.FechaVencimiento,
  d.FechaEmision,
  d.Deuda,
  d.PagoMinimo,
  d.MonedaDoc
FROM politecnica_asbanc.dbo.Deudas d
JOIN politecnica_asbanc.dbo.Clientes c ON d.ClienteId = c.Id
WHERE (c.TipoConsulta = @TipoConsulta AND c.IdConsulta = @IdConsulta)
   OR (c.IdConsulta = @IdConsulta)
  AND d.Estado = 'PENDIENTE'
ORDER BY d.FechaVencimiento ASC, d.Id ASC;
```

---

## 2. Sentencias SQL para Procesar Pagos (PayDebt)

Archivo fuente: [`src/interfaces/http/controllers/transactional.controller.ts`](file:///home/mateo/projects/politecnica-asbanc/src/interfaces/http/controllers/transactional.controller.ts)

### 2.1 Verificación Previa del Documento en `BDACADEMICO6`
```sql
SELECT 
  ap.id AS pago_id,
  ap.alumno_id,
  ap.num_cuota,
  ap.monto,
  ap.param_estado_pago_id,
  ap.fecha_pago,
  alu.codigo_alumno,
  per.nro_documento,
  LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo,
  ISNULL(ac.descripcion, ISNULL(apc.descripcion, 'CUOTA ' + CAST(ap.num_cuota AS VARCHAR))) AS concepto,
  p.nombre AS periodo_nombre
FROM Ctas_Ctes.Alumno_Pago ap
JOIN Academico.Alumno alu ON ap.alumno_id = alu.id
JOIN General.Persona per ON alu.persona_id = per.id
LEFT JOIN Ctas_Ctes.Alumno_Pago_Cuota apc ON ap.id = apc.alumno_pago_id
LEFT JOIN Ctas_Ctes.Alumno_Cuota ac ON apc.alumno_cuota_id = ac.id
LEFT JOIN Carga_Academica.Carga_Academica_Sede cas ON ap.carga_academica_sede_id = cas.id
LEFT JOIN Carga_Academica.Carga_Academica ca ON cas.carga_academica_id = ca.id
LEFT JOIN General.Periodo p ON ca.periodo_id = p.id
WHERE ap.id = @PagoId;
```

### 2.2 Control de Idempotencia Bancaria en `BDACADEMICO6`
Si la cuota ya está cancelada (`param_estado_pago_id = 16`), comprueba si corresponde al mismo número de operación del banco:
```sql
SELECT TOP 1 id 
FROM Ctas_Ctes.Alumno_Pago_Detalle 
WHERE alumno_pago_id = @PagoId AND num_documento = @NumOperacionBanco;
```

### 2.3 Transacción Atómica de Pago en `BDACADEMICO6`
Ejecutado bajo `BEGIN TRANSACTION` con reversión automática en caso de fallo (`ROLLBACK`):
```sql
-- Paso 1: Actualizar cabecera de la cuota a PAGADO (16)
UPDATE Ctas_Ctes.Alumno_Pago
SET 
  param_estado_pago_id = 16, -- SOL_EST_PAGADO
  monto_pagado_sin_mora = @ImportePagado,
  monto_pagado_con_mora = @ImportePagado,
  fecha_pago = @FechaPago,
  lugar_pago = @CanalPago,
  modified_at = GETDATE(),
  modified_by = 'ASBANC_FTR'
WHERE id = @PagoId;

-- Paso 2: Registrar comprobante bancario en el detalle
INSERT INTO Ctas_Ctes.Alumno_Pago_Detalle (
  alumno_pago_id, fecha_pago, lugar_pago, param_estado_pago_id,
  tipo_pago, serie, num_documento, monto, estado_auditoria,
  created_at, created_by, num_cuota
) VALUES (
  @PagoId, @FechaPago, @CanalPago, 16,
  'ASBANC', 'FTR', @NumOperacionBanco, @ImportePagado, 1,
  GETDATE(), 'ASBANC_FTR', @NumCuota
);
```

### 2.4 Procesamiento mediante Stored Procedure en `politecnica_asbanc`
Invocación: `EXEC politecnica_asbanc.dbo.sp_Asbanc_PayDebt ...`  
Lógica interna del SP (extracto central):
```sql
-- 1. Idempotencia en TransaccionesBancarias
SELECT TOP 1 @ExistingNumERP = t.NumOperacionERP, @ExistingNombre = c.NombreCliente
FROM dbo.TransaccionesBancarias t
INNER JOIN dbo.Clientes c ON c.TipoConsulta = t.TipoConsulta AND c.IdConsulta = t.IdConsulta
WHERE t.CodigoBanco = @CodigoBanco 
  AND t.NumOperacionBanco = @NumOperacionBanco 
  AND t.NumDocumento = @NumDocumento;

-- 2. Bloqueo con UPDLOCK, ROWLOCK en la deuda
SELECT TOP 1 
    @DeudaId = d.Id, 
    @DeudaMonto = d.Deuda, 
    @PagoMinimo = d.PagoMinimo, 
    @EstadoDeuda = d.Estado
FROM dbo.Deudas d WITH (UPDLOCK, ROWLOCK)
WHERE d.ClienteId = @ClienteId
  AND d.CodigoEmpresa = @CodigoEmpresa
  AND d.CodigoProducto = @CodigoProducto
  AND d.NumDocumento = @NumDocumento;

-- 3. Generación correlativa atómica sin colisiones
DECLARE @NextId BIGINT = NEXT VALUE FOR dbo.Seq_NumOperacionERP;
DECLARE @NumOperacionERP VARCHAR(9) = RIGHT('000000000' + CAST(@NextId AS VARCHAR(9)), 9);

-- 4. Actualización de Deuda
UPDATE dbo.Deudas
SET Estado = 'PAGADO',
    FechaPago = GETDATE(),
    NumOperacionERP = @NumOperacionERP
WHERE Id = @DeudaId;

-- 5. Registro en Libro Transaccional Bancario
INSERT INTO dbo.TransaccionesBancarias (
    NumOperacionERP, CodigoBanco, CanalPago, FormaPago, NumOperacionBanco,
    FechaTxn, HoraTxn, TipoConsulta, IdConsulta, CodigoProducto, NumDocumento,
    ImportePagado, MonedaDoc, CodigoEmpresa, Estado
) VALUES (
    @NumOperacionERP, @CodigoBanco, @CanalPago, @FormaPago, @NumOperacionBanco,
    @FechaTxn, @HoraTxn, @TipoConsulta, @IdConsulta, @CodigoProducto, @NumDocumento,
    @ImportePagado, @MonedaDoc, @CodigoEmpresa, 'COMPLETADO'
);
```

---

## 3. Sentencias SQL para Extorno / Reversión de Pagos (ReversePay)

Archivo fuente: [`src/interfaces/http/controllers/transactional.controller.ts`](file:///home/mateo/projects/politecnica-asbanc/src/interfaces/http/controllers/transactional.controller.ts)

### 3.1 Consulta de Estado en `BDACADEMICO6`
```sql
SELECT 
  ap.id AS pago_id,
  ap.param_estado_pago_id,
  alu.codigo_alumno,
  per.nro_documento,
  LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo
FROM Ctas_Ctes.Alumno_Pago ap
JOIN Academico.Alumno alu ON ap.alumno_id = alu.id
JOIN General.Persona per ON alu.persona_id = per.id
WHERE ap.id = @PagoId;
```

### 3.2 Transacción Atómica de Reversión en `BDACADEMICO6`
Restaura la cuota a su estado original no pagado y elimina de forma limpia el comprobante bancario residual:
```sql
-- Paso 1: Restaurar estado de la cuota a GENERADO (25)
UPDATE Ctas_Ctes.Alumno_Pago
SET 
  param_estado_pago_id = 25, -- SOL_EST_GENERADO
  monto_pagado_sin_mora = 0,
  monto_pagado_con_mora = 0,
  fecha_pago = NULL,
  modified_at = GETDATE(),
  modified_by = 'ASBANC_REVERSA'
WHERE id = @PagoId;

-- Paso 2: Eliminar comprobante bancario
DELETE FROM Ctas_Ctes.Alumno_Pago_Detalle
WHERE alumno_pago_id = @PagoId 
  AND (num_documento = @NumOperacionBanco OR created_by = 'ASBANC_FTR');
```

### 3.3 Extorno en `politecnica_asbanc` (`sp_Asbanc_ReversePay`)
```sql
-- 1. Actualizar estado de la deuda a PENDIENTE
UPDATE dbo.Deudas
SET Estado = 'PENDIENTE',
    FechaPago = NULL,
    NumOperacionERP = NULL
WHERE CodigoEmpresa = @CodigoEmpresa 
  AND NumDocumento = @NumDocumento;

-- 2. Marcar transacción bancaria como REVERTIDO
UPDATE dbo.TransaccionesBancarias
SET Estado = 'REVERTIDO',
    FechaReversa = GETDATE()
WHERE Id = @TxnId;
```

---

## 4. Sentencias SQL de Validación de Clientes (ValidateCustomer)

### 4.1 Búsqueda Principal en `BDACADEMICO6`
```sql
SELECT TOP 1 
  alu.id AS alumno_id,
  alu.codigo_alumno,
  per.nro_documento,
  LTRIM(RTRIM(per.nombre)) + ' ' + LTRIM(RTRIM(per.apellido_paterno)) + ' ' + ISNULL(LTRIM(RTRIM(per.apellido_materno)), '') AS nombre_completo
FROM Academico.Alumno alu
JOIN General.Persona per ON alu.persona_id = per.id
WHERE 
  (@TipoConsulta = '0' AND (alu.codigo_alumno = @IdConsulta OR per.nro_documento = @IdConsulta))
  OR (@TipoConsulta IN ('1', '2') AND (per.nro_documento = @IdConsulta OR alu.codigo_alumno = @IdConsulta))
  OR (alu.codigo_alumno = @IdConsulta OR per.nro_documento = @IdConsulta);
```

### 4.2 Fallback en `politecnica_asbanc.dbo.Clientes`
```sql
SELECT TOP 1 NombreCliente
FROM politecnica_asbanc.dbo.Clientes
WHERE (TipoConsulta = @TipoConsulta AND IdConsulta = @IdConsulta)
   OR (IdConsulta = @IdConsulta);
```

---

## 5. Sentencias SQL del Módulo de Auditoría Forense

Archivos fuente:
- [`src/interfaces/http/middlewares/audit.middleware.ts`](file:///home/mateo/projects/politecnica-asbanc/src/interfaces/http/middlewares/audit.middleware.ts)
- [`src/interfaces/http/controllers/audit.controller.ts`](file:///home/mateo/projects/politecnica-asbanc/src/interfaces/http/controllers/audit.controller.ts)
- [`scripts/view-audit.ts`](file:///home/mateo/projects/politecnica-asbanc/scripts/view-audit.ts)

### 5.1 Registro Asíncrono de Auditoría (Middleware)
```sql
IF OBJECT_ID('dbo.AuditoriaLogs', 'U') IS NOT NULL
BEGIN
  INSERT INTO dbo.AuditoriaLogs (
    TraceId, Metodo, Endpoint, ClientIp, CodigoBanco, IdConsulta,
    NumOperacionBanco, CodigoRespuesta, ExecutionTimeMs, RequestPayload, ResponsePayload
  ) VALUES (
    @TraceId, @Metodo, @Endpoint, @ClientIp, @CodigoBanco, @IdConsulta,
    @NumOperacionBanco, @CodigoRespuesta, @ExecutionTimeMs, @RequestPayload, @ResponsePayload
  );
END
ELSE
BEGIN
  INSERT INTO politecnica_asbanc.dbo.AuditoriaLogs (
    TraceId, Metodo, Endpoint, ClientIp, CodigoBanco, IdConsulta,
    NumOperacionBanco, CodigoRespuesta, ExecutionTimeMs, RequestPayload, ResponsePayload
  ) VALUES (
    @TraceId, @Metodo, @Endpoint, @ClientIp, @CodigoBanco, @IdConsulta,
    @NumOperacionBanco, @CodigoRespuesta, @ExecutionTimeMs, @RequestPayload, @ResponsePayload
  );
END
```

### 5.2 Consulta Paginada de Auditoría (`GET /api/Audit`)
```sql
-- Conteo de registros según filtros dinámicos
SELECT COUNT(*) AS Total
FROM dbo.AuditoriaLogs
WHERE [Filtros: CodigoBanco, IdConsulta, Metodo, CodigoRespuesta, TraceId, Fechas];

-- Obtención paginada de registros
SELECT 
  Id, TraceId, Metodo, Endpoint, ClientIp, CodigoBanco, IdConsulta,
  NumOperacionBanco, CodigoRespuesta, ExecutionTimeMs, RequestPayload, ResponsePayload, CreatedAt
FROM dbo.AuditoriaLogs
WHERE [Filtros]
ORDER BY Id DESC
OFFSET @Offset ROWS
FETCH NEXT @PageSize ROWS ONLY;
```

### 5.3 Consulta de Detalle por ID (`GET /api/Audit/:id`)
```sql
SELECT TOP 1 *
FROM dbo.AuditoriaLogs
WHERE Id = @Id;
```

### 5.4 Exportación de Auditoría (`GET /api/Audit/export`)
```sql
SELECT TOP (@Limit)
  Id,
  TraceId,
  FORMAT(CreatedAt, 'yyyy-MM-dd HH:mm:ss') AS FechaHora,
  Metodo,
  Endpoint,
  ISNULL(ClientIp, '') AS ClientIp,
  ISNULL(CodigoBanco, '') AS CodigoBanco,
  ISNULL(IdConsulta, '') AS IdConsulta,
  ISNULL(NumOperacionBanco, '') AS NumOperacionBanco,
  ISNULL(CodigoRespuesta, '') AS CodigoRespuesta,
  ExecutionTimeMs,
  ISNULL(RequestPayload, '') AS RequestPayload,
  ISNULL(ResponsePayload, '') AS ResponsePayload
FROM dbo.AuditoriaLogs
WHERE [Filtros]
ORDER BY Id DESC;
```

### 5.5 Resumen Estadístico CLI (`npm run audit`)
```sql
SELECT 
  COUNT(*) AS TotalAuditorias,
  AVG(ExecutionTimeMs) AS LatenciaPromedioMs,
  MAX(ExecutionTimeMs) AS LatenciaMaximaMs
FROM dbo.AuditoriaLogs;
```

---

## 6. DDL: Esquema, Tablas, Secuencias y Procedimientos (politecnica_asbanc)

Archivo fuente: [`scripts/schema.sql`](file:///home/mateo/projects/politecnica-asbanc/scripts/schema.sql)

### 6.1 Base de Datos y Tablas
```sql
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'politecnica_asbanc')
BEGIN
    CREATE DATABASE politecnica_asbanc;
END
GO

USE politecnica_asbanc;
GO

-- 1. Catálogo de Servicios
CREATE TABLE dbo.EmpresasServicios (
    CodigoEmpresa VARCHAR(3) NOT NULL,
    CodigoProducto VARCHAR(3) NOT NULL,
    NombreServicio VARCHAR(100) NOT NULL,
    Moneda VARCHAR(1) NOT NULL DEFAULT '1',
    Activo BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_EmpresasServicios PRIMARY KEY (CodigoEmpresa, CodigoProducto)
);

-- 2. Clientes / Alumnos
CREATE TABLE dbo.Clientes (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    TipoConsulta VARCHAR(1) NOT NULL,
    IdConsulta VARCHAR(14) NOT NULL,
    NombreCliente VARCHAR(30) NOT NULL,
    EmailPersonal VARCHAR(100) NULL,
    Telefono VARCHAR(20) NULL,
    Activo BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_Clientes_Consulta UNIQUE (TipoConsulta, IdConsulta)
);

-- 3. Deudas / Cuotas
CREATE TABLE dbo.Deudas (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    ClienteId INT NOT NULL,
    CodigoEmpresa VARCHAR(3) NOT NULL,
    CodigoProducto VARCHAR(3) NOT NULL,
    NumDocumento VARCHAR(16) NOT NULL,
    DescDocumento VARCHAR(30) NOT NULL,
    FechaEmision VARCHAR(8) NOT NULL,
    FechaVencimiento VARCHAR(8) NOT NULL,
    Deuda DECIMAL(12,2) NOT NULL,
    PagoMinimo DECIMAL(12,2) NOT NULL,
    MonedaDoc VARCHAR(1) NOT NULL DEFAULT '1',
    Estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    FechaPago DATETIME NULL,
    NumOperacionERP VARCHAR(9) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Deudas_Cliente FOREIGN KEY (ClienteId) REFERENCES dbo.Clientes(Id),
    CONSTRAINT UQ_Deudas_NumDoc UNIQUE (CodigoEmpresa, CodigoProducto, NumDocumento)
);
CREATE NONCLUSTERED INDEX IX_Deudas_Cliente_Estado ON dbo.Deudas(ClienteId, Estado);

-- 4. Transacciones Bancarias (Ledger)
CREATE TABLE dbo.TransaccionesBancarias (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    NumOperacionERP VARCHAR(9) NOT NULL UNIQUE,
    CodigoBanco VARCHAR(4) NOT NULL,
    CanalPago VARCHAR(2) NOT NULL,
    FormaPago VARCHAR(2) NOT NULL,
    NumOperacionBanco VARCHAR(12) NOT NULL,
    FechaTxn VARCHAR(8) NOT NULL,
    HoraTxn VARCHAR(6) NOT NULL,
    TipoConsulta VARCHAR(1) NOT NULL,
    IdConsulta VARCHAR(14) NOT NULL,
    CodigoProducto VARCHAR(3) NOT NULL,
    NumDocumento VARCHAR(16) NOT NULL,
    ImportePagado DECIMAL(12,2) NOT NULL,
    MonedaDoc VARCHAR(1) NOT NULL,
    CodigoEmpresa VARCHAR(3) NOT NULL,
    Estado VARCHAR(20) NOT NULL DEFAULT 'COMPLETADO',
    FechaReversa DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
);
CREATE UNIQUE NONCLUSTERED INDEX UQ_Txn_Banco_Op ON dbo.TransaccionesBancarias(CodigoBanco, NumOperacionBanco, NumDocumento);

-- 5. Secuencia de Operación ERP
CREATE SEQUENCE dbo.Seq_NumOperacionERP AS BIGINT START WITH 1 INCREMENT BY 1;

-- 6. Auditoría Forense Inmutable
CREATE TABLE dbo.AuditoriaLogs (
    Id BIGINT IDENTITY(1,1) PRIMARY KEY,
    TraceId VARCHAR(50) NOT NULL,
    Metodo VARCHAR(50) NOT NULL,
    Endpoint VARCHAR(100) NOT NULL,
    ClientIp VARCHAR(50) NULL,
    CodigoBanco VARCHAR(4) NULL,
    IdConsulta VARCHAR(14) NULL,
    NumOperacionBanco VARCHAR(12) NULL,
    CodigoRespuesta VARCHAR(10) NULL,
    ExecutionTimeMs INT NOT NULL,
    RequestPayload NVARCHAR(MAX) NULL,
    ResponsePayload NVARCHAR(MAX) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
);
CREATE NONCLUSTERED INDEX IX_Audit_Trace ON dbo.AuditoriaLogs(TraceId);
CREATE NONCLUSTERED INDEX IX_Audit_Banco_Op ON dbo.AuditoriaLogs(CodigoBanco, NumOperacionBanco) INCLUDE (CodigoRespuesta, ExecutionTimeMs, CreatedAt);
CREATE NONCLUSTERED INDEX IX_Audit_CreatedAt ON dbo.AuditoriaLogs(CreatedAt DESC);
```

---

## 7. DDL: Índices Estratégicos de Optimización (BDACADEMICO6)

Archivos fuente:
- [`scripts/migrations/01_indexes_bdacademico6.sql`](file:///home/mateo/projects/politecnica-asbanc/scripts/migrations/01_indexes_bdacademico6.sql)
- [`scripts/apply-phase1-indexes.ts`](file:///home/mateo/projects/politecnica-asbanc/scripts/apply-phase1-indexes.ts)

```sql
USE BDACADEMICO6;
GO

-- 1. Búsqueda directa por Código de Alumno
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Alumno_CodigoAlumno' AND object_id = OBJECT_ID('Academico.Alumno'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Alumno_CodigoAlumno
    ON Academico.Alumno (codigo_alumno)
    INCLUDE (id, persona_id);
END
GO

-- 2. Búsqueda por Persona (DNI / RUC)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Alumno_PersonaId' AND object_id = OBJECT_ID('Academico.Alumno'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Alumno_PersonaId
    ON Academico.Alumno (persona_id)
    INCLUDE (id, codigo_alumno);
END
GO

-- 3. Filtrado directo de cuotas pendientes sin Table Scan
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AlumnoPago_Alumno_Estado' AND object_id = OBJECT_ID('Ctas_Ctes.Alumno_Pago'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AlumnoPago_Alumno_Estado
    ON Ctas_Ctes.Alumno_Pago (alumno_id, param_estado_pago_id)
    INCLUDE (num_cuota, fecha_vencimiento, monto, fecha_generacion, carga_academica_sede_id, created_at);
END
GO

-- 4. Idempotencia y eliminación rápida de comprobantes bancarios
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AlumnoPagoDetalle_PagoId_NumDoc' AND object_id = OBJECT_ID('Ctas_Ctes.Alumno_Pago_Detalle'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AlumnoPagoDetalle_PagoId_NumDoc
    ON Ctas_Ctes.Alumno_Pago_Detalle (alumno_pago_id, num_documento)
    INCLUDE (monto, tipo_pago, created_by, created_at);
END
GO
```

---

## 8. DML: Carga de Datos Iniciales y Pruebas (seed.sql)

Archivo fuente: [`scripts/seed.sql`](file:///home/mateo/projects/politecnica-asbanc/scripts/seed.sql)

```sql
USE politecnica_asbanc;
GO

-- Registrar Empresa y Producto
IF NOT EXISTS (SELECT 1 FROM dbo.EmpresasServicios WHERE CodigoEmpresa = '998' AND CodigoProducto = '001')
BEGIN
    INSERT INTO dbo.EmpresasServicios (CodigoEmpresa, CodigoProducto, NombreServicio, Moneda, Activo)
    VALUES ('998', '001', 'PENSIONES Y MATRICULAS POLITECNICA', '1', 1);
END
GO

-- Inserción / Merge de 10 clientes oficiales para certificación
MERGE dbo.Clientes AS target
USING (VALUES 
    ('1', '10000001', 'JUAN PEREZ ROJAS', 'juan.perez@politecnica.edu.pe', '987654321'),
    ('1', '42271578', 'CARLOS MENDOZA DIAZ', 'carlos.mendoza@politecnica.edu.pe', '987654322'),
    ('1', '07854856', 'MARIA TORRES VEGA', 'maria.torres@politecnica.edu.pe', '987654323'),
    ('1', '78478457', 'ANA RAMOS QUISPE', 'ana.ramos@politecnica.edu.pe', '987654324'),
    ('1', '45896321', 'LUIS FLORES CASTRO', 'luis.flores@politecnica.edu.pe', '987654325'),
    ('0', '202610001', 'DIEGO SANCHEZ PAZ', 'diego.sanchez@politecnica.edu.pe', '987654326'),
    ('0', '202610002', 'LUCIA GOMEZ SOTO', 'lucia.gomez@politecnica.edu.pe', '987654327'),
    ('0', '202610003', 'MATEO VARGAS LUNA', 'mateo.vargas@politecnica.edu.pe', '987654328'),
    ('2', '20103040501', 'ASOCIACION BANCARIA PERU', 'contacto@asbanc.pe', '987654329'),
    ('2', '20324578596', 'BANCO FINANCIERO SA', 'tesoreria@banco.pe', '987654330')
) AS source (TipoConsulta, IdConsulta, NombreCliente, EmailPersonal, Telefono)
ON target.TipoConsulta = source.TipoConsulta AND target.IdConsulta = source.IdConsulta
WHEN NOT MATCHED THEN
    INSERT (TipoConsulta, IdConsulta, NombreCliente, EmailPersonal, Telefono, Activo)
    VALUES (source.TipoConsulta, source.IdConsulta, source.NombreCliente, source.EmailPersonal, source.Telefono, 1);
GO

-- Inserción de 50 Deudas asociadas (mínimo 5 por cada cliente)
-- Véase detalle completo en scripts/seed.sql
```

---

## 9. Sentencias SQL para Benchmarks, Diagnóstico e Integridad

Archivo fuente: [`scripts/benchmark-scale.ts`](file:///home/mateo/projects/politecnica-asbanc/scripts/benchmark-scale.ts)

### 9.1 Selección de Padrón Dinámico con Deudas Pendientes
```sql
SELECT TOP 1200 
  alu.codigo_alumno
FROM Ctas_Ctes.Alumno_Pago ap WITH (NOLOCK)
JOIN Academico.Alumno alu WITH (NOLOCK) ON ap.alumno_id = alu.id
WHERE ap.param_estado_pago_id = 25 AND ap.monto > 0;
```

### 9.2 Verificación de Integridad de BD Intacta Post-Pruebas
Garantiza que no existan cuotas residuales modificadas ni comprobantes espurios tras ejecutar reversiones masivas:
```sql
-- Verificar comprobantes creados por la pasarela FTR
SELECT COUNT(*) AS residuales
FROM Ctas_Ctes.Alumno_Pago_Detalle
WHERE created_by = 'ASBANC_FTR';

-- Verificar que no queden cuotas marcadas como pagadas residuales
SELECT COUNT(*) AS cuotas_pagadas_residuales
FROM Ctas_Ctes.Alumno_Pago
WHERE param_estado_pago_id = 16 
  AND modified_by IN ('ASBANC_FTR', 'ASBANC_REVERSA');
```
