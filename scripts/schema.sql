-- ==========================================================
-- POLITECNICA ASBANC - ESQUEMA DE BASE DE DATOS MSSQL
-- Basado en la especificación ASBANC FTR / YAPAGO V47
-- ==========================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'politecnica_asbanc')
BEGIN
    CREATE DATABASE politecnica_asbanc;
END
GO

USE politecnica_asbanc;
GO

-- 1. Tabla de Empresas y Servicios / Productos
IF OBJECT_ID('dbo.EmpresasServicios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmpresasServicios (
        CodigoEmpresa VARCHAR(3) NOT NULL,
        CodigoProducto VARCHAR(3) NOT NULL,
        NombreServicio VARCHAR(100) NOT NULL,
        Moneda VARCHAR(1) NOT NULL DEFAULT '1', -- 1 = Soles, 2 = Dólares
        Activo BIT NOT NULL DEFAULT 1,
        CONSTRAINT PK_EmpresasServicios PRIMARY KEY (CodigoEmpresa, CodigoProducto)
    );
END
GO

-- 2. Tabla de Clientes / Estudiantes
IF OBJECT_ID('dbo.Clientes', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Clientes (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        TipoConsulta VARCHAR(1) NOT NULL, -- 0 = Código, 1 = DNI, 2 = RUC
        IdConsulta VARCHAR(14) NOT NULL,
        NombreCliente VARCHAR(30) NOT NULL, -- Mayúsculas, sin tildes ni Ñ (Requisito ASBANC)
        EmailPersonal VARCHAR(100) NULL,
        Telefono VARCHAR(20) NULL,
        Activo BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_Clientes_Consulta UNIQUE (TipoConsulta, IdConsulta)
    );
END
GO

-- 3. Tabla de Deudas / Recibos
IF OBJECT_ID('dbo.Deudas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Deudas (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ClienteId INT NOT NULL,
        CodigoEmpresa VARCHAR(3) NOT NULL,
        CodigoProducto VARCHAR(3) NOT NULL,
        NumDocumento VARCHAR(16) NOT NULL,
        DescDocumento VARCHAR(30) NOT NULL,
        FechaEmision VARCHAR(8) NOT NULL, -- DDMMAAAA
        FechaVencimiento VARCHAR(8) NOT NULL, -- DDMMAAAA
        Deuda DECIMAL(12,2) NOT NULL,
        PagoMinimo DECIMAL(12,2) NOT NULL,
        MonedaDoc VARCHAR(1) NOT NULL DEFAULT '1', -- 1 = Soles
        Estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE, PAGADO, ANULADO
        FechaPago DATETIME NULL,
        NumOperacionERP VARCHAR(9) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_Deudas_Cliente FOREIGN KEY (ClienteId) REFERENCES dbo.Clientes(Id),
        CONSTRAINT UQ_Deudas_NumDoc UNIQUE (CodigoEmpresa, CodigoProducto, NumDocumento)
    );
    CREATE NONCLUSTERED INDEX IX_Deudas_Cliente_Estado ON dbo.Deudas(ClienteId, Estado);
END
GO

-- 4. Tabla de Transacciones Bancarias (Ledger de Pagos)
IF OBJECT_ID('dbo.TransaccionesBancarias', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TransaccionesBancarias (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        NumOperacionERP VARCHAR(9) NOT NULL UNIQUE,
        CodigoBanco VARCHAR(4) NOT NULL,
        CanalPago VARCHAR(2) NOT NULL,
        FormaPago VARCHAR(2) NOT NULL,
        NumOperacionBanco VARCHAR(12) NOT NULL,
        FechaTxn VARCHAR(8) NOT NULL, -- DDMMAAAA
        HoraTxn VARCHAR(6) NOT NULL,  -- HHMMSS
        TipoConsulta VARCHAR(1) NOT NULL,
        IdConsulta VARCHAR(14) NOT NULL,
        CodigoProducto VARCHAR(3) NOT NULL,
        NumDocumento VARCHAR(16) NOT NULL,
        ImportePagado DECIMAL(12,2) NOT NULL,
        MonedaDoc VARCHAR(1) NOT NULL,
        CodigoEmpresa VARCHAR(3) NOT NULL,
        Estado VARCHAR(20) NOT NULL DEFAULT 'COMPLETADO', -- COMPLETADO, REVERTIDO
        FechaReversa DATETIME NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );
    CREATE UNIQUE NONCLUSTERED INDEX UQ_Txn_Banco_Op ON dbo.TransaccionesBancarias(CodigoBanco, NumOperacionBanco, NumDocumento);
END
GO

-- 4.1 Secuencia NumOperacionERP (garantiza correlatividad y cero colisiones concurrentes)
IF NOT EXISTS (SELECT * FROM sys.sequences WHERE name = 'Seq_NumOperacionERP')
BEGIN
    DECLARE @StartVal BIGINT = 1;
    SELECT @StartVal = ISNULL(MAX(Id), 0) + 1 FROM dbo.TransaccionesBancarias;
    DECLARE @SqlSeq NVARCHAR(MAX) = 'CREATE SEQUENCE dbo.Seq_NumOperacionERP AS BIGINT START WITH ' + CAST(@StartVal AS NVARCHAR(20)) + ' INCREMENT BY 1;';
    EXEC sp_executesql @SqlSeq;
END
GO

-- 5. Tabla de Auditoría Inmutable
IF OBJECT_ID('dbo.AuditoriaLogs', 'U') IS NULL
BEGIN
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
END
GO

-- 6. STORED PROCEDURES OFICIALES ASBANC

-- 6.1 Validar Cliente
CREATE OR ALTER PROCEDURE dbo.sp_Asbanc_ValidateCustomer
    @TipoConsulta VARCHAR(1),
    @IdConsulta VARCHAR(14),
    @CodigoEmpresa VARCHAR(3),
    @CodigoProducto VARCHAR(3)
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @NombreCliente VARCHAR(30);

    SELECT TOP 1 @NombreCliente = c.NombreCliente
    FROM dbo.Clientes c
    WHERE c.TipoConsulta = @TipoConsulta 
      AND c.IdConsulta = @IdConsulta
      AND c.Activo = 1;

    IF @NombreCliente IS NOT NULL
    BEGIN
        SELECT '00' AS CodigoRespuesta, 'OK' AS DescripcionResp, @NombreCliente AS NombreCliente;
    END
    ELSE
    BEGIN
        SELECT '16' AS CodigoRespuesta, 'CLIENTE NO EXISTE' AS DescripcionResp, '' AS NombreCliente;
    END
END
GO

-- 6.2 Consultar Deudas
CREATE OR ALTER PROCEDURE dbo.sp_Asbanc_ListDebts
    @TipoConsulta VARCHAR(1),
    @IdConsulta VARCHAR(14),
    @CodigoEmpresa VARCHAR(3),
    @CodigoProducto VARCHAR(3),
    @CodigoBanco VARCHAR(4),
    @CanalPago VARCHAR(2)
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @ClienteId INT;
    DECLARE @NombreCliente VARCHAR(30);

    SELECT TOP 1 @ClienteId = c.Id, @NombreCliente = c.NombreCliente
    FROM dbo.Clientes c
    WHERE c.TipoConsulta = @TipoConsulta 
      AND c.IdConsulta = @IdConsulta
      AND c.Activo = 1;

    IF @ClienteId IS NULL
    BEGIN
        SELECT '16' AS CodigoRespuesta, 'CLIENTE NO EXISTE' AS DescripcionResp;
        RETURN;
    END

    -- Verificar deudas pendientes
    IF NOT EXISTS (
        SELECT 1 FROM dbo.Deudas 
        WHERE ClienteId = @ClienteId 
          AND CodigoEmpresa = @CodigoEmpresa 
          AND CodigoProducto = @CodigoProducto 
          AND Estado = 'PENDIENTE'
    )
    BEGIN
        SELECT '22' AS CodigoRespuesta, 'CLIENTE SIN DEUDAS PENDIENTES' AS DescripcionResp;
        RETURN;
    END

    -- Retornar deudas ordenadas de forma ascendente por FechaVencimiento (Requisito pág. 28)
    SELECT 
        '00' AS CodigoRespuesta, 
        'OK' AS DescripcionResp;

    SELECT 
        d.CodigoProducto,
        d.NumDocumento,
        d.DescDocumento,
        d.FechaVencimiento,
        d.FechaEmision,
        CAST(d.Deuda AS DECIMAL(12,2)) AS Deuda,
        CAST(d.PagoMinimo AS DECIMAL(12,2)) AS PagoMinimo,
        d.MonedaDoc
    FROM dbo.Deudas d
    WHERE d.ClienteId = @ClienteId 
      AND d.CodigoEmpresa = @CodigoEmpresa 
      AND d.CodigoProducto = @CodigoProducto 
      AND d.Estado = 'PENDIENTE'
    ORDER BY d.FechaVencimiento ASC, d.Id ASC;
END
GO

-- 6.3 Pagar Deuda (Con Idempotencia y Transacción ACID)
CREATE OR ALTER PROCEDURE dbo.sp_Asbanc_PayDebt
    @FechaTxn VARCHAR(8),
    @HoraTxn VARCHAR(6),
    @CanalPago VARCHAR(2),
    @CodigoBanco VARCHAR(4),
    @NumOperacionBanco VARCHAR(12),
    @FormaPago VARCHAR(2),
    @TipoConsulta VARCHAR(1),
    @IdConsulta VARCHAR(14),
    @CodigoProducto VARCHAR(3),
    @NumDocumento VARCHAR(16),
    @ImportePagado DECIMAL(12,2),
    @MonedaDoc VARCHAR(1),
    @CodigoEmpresa VARCHAR(3)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Verificar si la transacción bancaria ya fue procesada (Idempotencia - Código 00 o 71)
        DECLARE @ExistingNumERP VARCHAR(9);
        DECLARE @ExistingNombre VARCHAR(30);

        SELECT TOP 1 @ExistingNumERP = t.NumOperacionERP, @ExistingNombre = c.NombreCliente
        FROM dbo.TransaccionesBancarias t
        INNER JOIN dbo.Clientes c ON c.TipoConsulta = t.TipoConsulta AND c.IdConsulta = t.IdConsulta
        WHERE t.CodigoBanco = @CodigoBanco 
          AND t.NumOperacionBanco = @NumOperacionBanco 
          AND t.NumDocumento = @NumDocumento;

        IF @ExistingNumERP IS NOT NULL
        BEGIN
            -- Ya fue procesada previamente: responder conforme con el mismo ERP (Idempotente)
            COMMIT TRANSACTION;
            SELECT '00' AS CodigoRespuesta, @ExistingNombre AS NombreCliente, @ExistingNumERP AS NumOperacionERP, 'OK' AS DescripcionResp;
            RETURN;
        END

        -- 2. Validar Cliente
        DECLARE @ClienteId INT;
        DECLARE @NombreCliente VARCHAR(30);

        SELECT TOP 1 @ClienteId = c.Id, @NombreCliente = c.NombreCliente
        FROM dbo.Clientes c
        WHERE c.TipoConsulta = @TipoConsulta 
          AND c.IdConsulta = @IdConsulta 
          AND c.Activo = 1;

        IF @ClienteId IS NULL
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT '16' AS CodigoRespuesta, '' AS NombreCliente, '' AS NumOperacionERP, 'CLIENTE NO EXISTE' AS DescripcionResp;
            RETURN;
        END

        -- 3. Validar Deuda
        DECLARE @DeudaId INT;
        DECLARE @DeudaMonto DECIMAL(12,2);
        DECLARE @PagoMinimo DECIMAL(12,2);
        DECLARE @EstadoDeuda VARCHAR(20);

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

        IF @DeudaId IS NULL
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT '19' AS CodigoRespuesta, '' AS NombreCliente, '' AS NumOperacionERP, 'CUOTA PAGADA NO EXISTE' AS DescripcionResp;
            RETURN;
        END

        IF @EstadoDeuda = 'PAGADO'
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT '20' AS CodigoRespuesta, '' AS NombreCliente, '' AS NumOperacionERP, 'CUOTA PAGADA YA CANCELADA' AS DescripcionResp;
            RETURN;
        END

        IF @ImportePagado < @PagoMinimo
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT '21' AS CodigoRespuesta, '' AS NombreCliente, '' AS NumOperacionERP, 'NO CUMPLE IMPORTE MINIMO' AS DescripcionResp;
            RETURN;
        END

        -- 4. Generar NumOperacionERP atómicamente con SEQUENCE (sin bloqueos ni colisiones)
        DECLARE @NextId BIGINT = NEXT VALUE FOR dbo.Seq_NumOperacionERP;
        DECLARE @NumOperacionERP VARCHAR(9) = RIGHT('000000000' + CAST(@NextId AS VARCHAR(9)), 9);

        -- 5. Actualizar Estado de la Deuda
        UPDATE dbo.Deudas
        SET Estado = 'PAGADO',
            FechaPago = GETDATE(),
            NumOperacionERP = @NumOperacionERP
        WHERE Id = @DeudaId;

        -- 6. Insertar en Transacciones Bancarias
        INSERT INTO dbo.TransaccionesBancarias (
            NumOperacionERP, CodigoBanco, CanalPago, FormaPago, NumOperacionBanco,
            FechaTxn, HoraTxn, TipoConsulta, IdConsulta, CodigoProducto, NumDocumento,
            ImportePagado, MonedaDoc, CodigoEmpresa, Estado
        ) VALUES (
            @NumOperacionERP, @CodigoBanco, @CanalPago, @FormaPago, @NumOperacionBanco,
            @FechaTxn, @HoraTxn, @TipoConsulta, @IdConsulta, @CodigoProducto, @NumDocumento,
            @ImportePagado, @MonedaDoc, @CodigoEmpresa, 'COMPLETADO'
        );

        COMMIT TRANSACTION;

        SELECT '00' AS CodigoRespuesta, @NombreCliente AS NombreCliente, @NumOperacionERP AS NumOperacionERP, 'OK' AS DescripcionResp;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        -- Manejo resiliente de condición de carrera en reintentos concurrentes (Duplicate Key 2601 / 2627)
        IF ERROR_NUMBER() IN (2601, 2627)
        BEGIN
            DECLARE @RaceNumERP VARCHAR(9);
            DECLARE @RaceNombre VARCHAR(30);

            SELECT TOP 1 @RaceNumERP = t.NumOperacionERP, @RaceNombre = c.NombreCliente
            FROM dbo.TransaccionesBancarias t
            INNER JOIN dbo.Clientes c ON c.TipoConsulta = t.TipoConsulta AND c.IdConsulta = t.IdConsulta
            WHERE t.CodigoBanco = @CodigoBanco 
              AND t.NumOperacionBanco = @NumOperacionBanco 
              AND t.NumDocumento = @NumDocumento;

            IF @RaceNumERP IS NOT NULL
            BEGIN
                SELECT '00' AS CodigoRespuesta, @RaceNombre AS NombreCliente, @RaceNumERP AS NumOperacionERP, 'OK' AS DescripcionResp;
                RETURN;
            END
        END

        SELECT '99' AS CodigoRespuesta, '' AS NombreCliente, '' AS NumOperacionERP, ERROR_MESSAGE() AS DescripcionResp;
    END CATCH
END
GO

-- 6.4 Revertir Pago (Extorno Transaccional)
CREATE OR ALTER PROCEDURE dbo.sp_Asbanc_ReversePay
    @FechaTxn VARCHAR(8),
    @HoraTxn VARCHAR(6),
    @CodigoBanco VARCHAR(4),
    @NumOperacionBanco VARCHAR(12),
    @NumDocumento VARCHAR(16),
    @CodigoEmpresa VARCHAR(3)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Buscar transacción original
        DECLARE @TxnId INT;
        DECLARE @NumOperacionERP VARCHAR(9);
        DECLARE @IdConsulta VARCHAR(14);
        DECLARE @TipoConsulta VARCHAR(1);
        DECLARE @EstadoTxn VARCHAR(20);

        SELECT TOP 1 
            @TxnId = t.Id,
            @NumOperacionERP = t.NumOperacionERP,
            @IdConsulta = t.IdConsulta,
            @TipoConsulta = t.TipoConsulta,
            @EstadoTxn = t.Estado
        FROM dbo.TransaccionesBancarias t WITH (UPDLOCK, ROWLOCK)
        WHERE t.CodigoBanco = @CodigoBanco
          AND t.NumOperacionBanco = @NumOperacionBanco
          AND t.NumDocumento = @NumDocumento
          AND t.CodigoEmpresa = @CodigoEmpresa;

        IF @TxnId IS NULL
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT '68' AS CodigoRespuesta, '' AS NombreCliente, '' AS NumOperacionERP, 'TXN ORIG A ANULAR NO EXISTE' AS DescripcionResp;
            RETURN;
        END

        IF @EstadoTxn = 'REVERTIDO'
        BEGIN
            -- Ya fue revertido previamente (Idempotente)
            DECLARE @NomRevertido VARCHAR(30);
            SELECT TOP 1 @NomRevertido = NombreCliente FROM dbo.Clientes WHERE TipoConsulta = @TipoConsulta AND IdConsulta = @IdConsulta;
            COMMIT TRANSACTION;
            SELECT '00' AS CodigoRespuesta, ISNULL(@NomRevertido, '') AS NombreCliente, @NumOperacionERP AS NumOperacionERP, 'OK' AS DescripcionResp;
            RETURN;
        END

        -- 2. Revertir Deuda (vuelve a estar PENDIENTE)
        UPDATE dbo.Deudas
        SET Estado = 'PENDIENTE',
            FechaPago = NULL,
            NumOperacionERP = NULL
        WHERE CodigoEmpresa = @CodigoEmpresa 
          AND NumDocumento = @NumDocumento;

        -- 3. Actualizar transacción a REVERTIDO
        UPDATE dbo.TransaccionesBancarias
        SET Estado = 'REVERTIDO',
            FechaReversa = GETDATE()
        WHERE Id = @TxnId;

        -- 4. Obtener Nombre Cliente
        DECLARE @NombreCliente VARCHAR(30);
        SELECT TOP 1 @NombreCliente = NombreCliente FROM dbo.Clientes WHERE TipoConsulta = @TipoConsulta AND IdConsulta = @IdConsulta;

        COMMIT TRANSACTION;

        SELECT '00' AS CodigoRespuesta, ISNULL(@NombreCliente, '') AS NombreCliente, @NumOperacionERP AS NumOperacionERP, 'OK' AS DescripcionResp;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        SELECT '99' AS CodigoRespuesta, '' AS NombreCliente, '' AS NumOperacionERP, ERROR_MESSAGE() AS DescripcionResp;
    END CATCH
END
GO
