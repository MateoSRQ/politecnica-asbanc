-- ==========================================================
-- POLITECNICA ASBANC - SEED DATA PARA CERTIFICACION
-- Cumpliendo el requisito de al menos 10 identificadores
-- y al menos 5 documentos por identificador (Guía V47 pág. 29)
-- ==========================================================

USE politecnica_asbanc;
GO

-- 1. Registrar Empresa y Producto
IF NOT EXISTS (SELECT 1 FROM dbo.EmpresasServicios WHERE CodigoEmpresa = '998' AND CodigoProducto = '001')
BEGIN
    INSERT INTO dbo.EmpresasServicios (CodigoEmpresa, CodigoProducto, NombreServicio, Moneda, Activo)
    VALUES ('998', '001', 'PENSIONES Y MATRICULAS POLITECNICA', '1', 1);
END
GO

-- 2. Insertar 10 Clientes de Prueba (DNI, RUC y Códigos de Estudiante)
-- Formato exigido: Mayúsculas, sin tildes ni caracteres especiales, sin Ñ
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

-- 3. Insertar al menos 5 Deudas por cada Cliente
-- Cliente 1: 10000001 (El del ejemplo curl de la Guía V47 pág. 33-35)
DECLARE @C1 INT = (SELECT Id FROM dbo.Clientes WHERE TipoConsulta = '1' AND IdConsulta = '10000001');

IF NOT EXISTS (SELECT 1 FROM dbo.Deudas WHERE ClienteId = @C1)
BEGIN
    INSERT INTO dbo.Deudas (ClienteId, CodigoEmpresa, CodigoProducto, NumDocumento, DescDocumento, FechaEmision, FechaVencimiento, Deuda, PagoMinimo, MonedaDoc, Estado)
    VALUES 
    (@C1, '998', '001', 'B01-0000000001', 'MATRICULA 2026-1', '01012026', '20012026', 850.00, 850.00, '1', 'PENDIENTE'),
    (@C1, '998', '001', 'B01-0000000002', 'BOLETA',          '02042026', '21052026', 1500.00, 1500.00, '1', 'PENDIENTE'),
    (@C1, '998', '001', 'B01-0000000003', 'PENSION 02',       '01052026', '21062026', 1500.00, 1500.00, '1', 'PENDIENTE'),
    (@C1, '998', '001', 'B01-0000000004', 'PENSION 03',       '01062026', '21072026', 1500.00, 1500.00, '1', 'PENDIENTE'),
    (@C1, '998', '001', 'B01-0000000005', 'PENSION 04',       '01072026', '21082026', 1500.00, 1500.00, '1', 'PENDIENTE');
END

-- Cliente 2: 42271578
DECLARE @C2 INT = (SELECT Id FROM dbo.Clientes WHERE TipoConsulta = '1' AND IdConsulta = '42271578');
IF NOT EXISTS (SELECT 1 FROM dbo.Deudas WHERE ClienteId = @C2)
BEGIN
    INSERT INTO dbo.Deudas (ClienteId, CodigoEmpresa, CodigoProducto, NumDocumento, DescDocumento, FechaEmision, FechaVencimiento, Deuda, PagoMinimo, MonedaDoc, Estado)
    VALUES 
    (@C2, '998', '001', 'B02-0000000001', 'MATRICULA 2026-1', '01012026', '25012026', 800.00, 800.00, '1', 'PENDIENTE'),
    (@C2, '998', '001', 'B02-0000000002', 'CUOTA 01',         '01022026', '25022026', 1200.00, 1200.00, '1', 'PENDIENTE'),
    (@C2, '998', '001', 'B02-0000000003', 'CUOTA 02',         '01032026', '25032026', 1200.00, 1200.00, '1', 'PENDIENTE'),
    (@C2, '998', '001', 'B02-0000000004', 'CUOTA 03',         '01042026', '25042026', 1200.00, 1200.00, '1', 'PENDIENTE'),
    (@C2, '998', '001', 'B02-0000000005', 'CUOTA 04',         '01052026', '25052026', 1200.00, 1200.00, '1', 'PENDIENTE');
END

-- Insertar deudas para el resto de clientes si aún no tienen
DECLARE @c_id INT;
DECLARE cur_clientes CURSOR FOR 
    SELECT Id FROM dbo.Clientes WHERE Id NOT IN (@C1, @C2);
OPEN cur_clientes;
FETCH NEXT FROM cur_clientes INTO @c_id;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.Deudas WHERE ClienteId = @c_id)
    BEGIN
        INSERT INTO dbo.Deudas (ClienteId, CodigoEmpresa, CodigoProducto, NumDocumento, DescDocumento, FechaEmision, FechaVencimiento, Deuda, PagoMinimo, MonedaDoc, Estado)
        VALUES 
        (@c_id, '998', '001', 'REC-' + RIGHT('000000' + CAST(@c_id AS VARCHAR(6)), 6) + '-1', 'PENSION MARZO', '01032026', '28032026', 1100.00, 1100.00, '1', 'PENDIENTE'),
        (@c_id, '998', '001', 'REC-' + RIGHT('000000' + CAST(@c_id AS VARCHAR(6)), 6) + '-2', 'PENSION ABRIL', '01042026', '28042026', 1100.00, 1100.00, '1', 'PENDIENTE'),
        (@c_id, '998', '001', 'REC-' + RIGHT('000000' + CAST(@c_id AS VARCHAR(6)), 6) + '-3', 'PENSION MAYO',  '01052026', '28052026', 1100.00, 1100.00, '1', 'PENDIENTE'),
        (@c_id, '998', '001', 'REC-' + RIGHT('000000' + CAST(@c_id AS VARCHAR(6)), 6) + '-4', 'PENSION JUNIO', '01062026', '28062026', 1100.00, 1100.00, '1', 'PENDIENTE'),
        (@c_id, '998', '001', 'REC-' + RIGHT('000000' + CAST(@c_id AS VARCHAR(6)), 6) + '-5', 'PENSION JULIO', '01072026', '28072026', 1100.00, 1100.00, '1', 'PENDIENTE');
    END
    FETCH NEXT FROM cur_clientes INTO @c_id;
END

CLOSE cur_clientes;
DEALLOCATE cur_clientes;
GO

PRINT 'Seed data para ASBANC FTR insertada correctamente.';
GO
