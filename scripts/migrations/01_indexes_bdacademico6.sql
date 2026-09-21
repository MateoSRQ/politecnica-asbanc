-- ============================================================================
-- SCRIPT DDL: OPTIMIZACIÓN FASE 1 - ÍNDICES ESTRATÉGICOS PARA BDACADEMICO6
-- PROYECTO: POLITÉCNICA ASBANC (FTR / YAPAGO)
-- AMBIENTES: DESARROLLO / HOMOLOGACIÓN / PRODUCCIÓN
-- PROPÓSITO: Eliminar Table Scans en consultas de deudas y validación bancaria,
--            reduciendo la latencia de ~250 ms a < 25 ms por transacción.
-- ============================================================================

USE BDACADEMICO6;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

PRINT '>>> INICIANDO APLICACIÓN DE ÍNDICES ESTRATÉGICOS EN BDACADEMICO6...';
GO

-- ----------------------------------------------------------------------------
-- 1. ÍNDICE EN Academico.Alumno (codigo_alumno)
--    Propósito: Búsqueda inmediata de estudiantes por código en ValidateCustomer y ListDebts.
--    Elimina Table Scan en 4,879 registros.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_Alumno_CodigoAlumno' 
      AND object_id = OBJECT_ID('Academico.Alumno')
)
BEGIN
    PRINT 'Creando índice IX_Alumno_CodigoAlumno en Academico.Alumno...';
    CREATE NONCLUSTERED INDEX IX_Alumno_CodigoAlumno
    ON Academico.Alumno (codigo_alumno)
    INCLUDE (id, persona_id);
    PRINT '✅ IX_Alumno_CodigoAlumno creado con éxito.';
END
ELSE
BEGIN
    PRINT 'ℹ️  IX_Alumno_CodigoAlumno ya existe.';
END
GO

-- ----------------------------------------------------------------------------
-- 2. ÍNDICE EN Academico.Alumno (persona_id)
--    Propósito: Búsqueda rápida de estudiantes por DNI (JOIN con General.Persona).
-- ----------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_Alumno_PersonaId' 
      AND object_id = OBJECT_ID('Academico.Alumno')
)
BEGIN
    PRINT 'Creando índice IX_Alumno_PersonaId en Academico.Alumno...';
    CREATE NONCLUSTERED INDEX IX_Alumno_PersonaId
    ON Academico.Alumno (persona_id)
    INCLUDE (id, codigo_alumno);
    PRINT '✅ IX_Alumno_PersonaId creado con éxito.';
END
ELSE
BEGIN
    PRINT 'ℹ️  IX_Alumno_PersonaId ya existe.';
END
GO

-- ----------------------------------------------------------------------------
-- 3. ÍNDICE COMPUESTO CUBIERTO EN Ctas_Ctes.Alumno_Pago (alumno_id, param_estado_pago_id)
--    Propósito: Filtrar directamente cuotas pendientes (param_estado_pago_id = 25)
--               por alumno sin escanear 28,000 registros y eliminando Sort Operator.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_AlumnoPago_Alumno_Estado' 
      AND object_id = OBJECT_ID('Ctas_Ctes.Alumno_Pago')
)
BEGIN
    PRINT 'Creando índice IX_AlumnoPago_Alumno_Estado en Ctas_Ctes.Alumno_Pago...';
    CREATE NONCLUSTERED INDEX IX_AlumnoPago_Alumno_Estado
    ON Ctas_Ctes.Alumno_Pago (alumno_id, param_estado_pago_id)
    INCLUDE (num_cuota, fecha_vencimiento, monto, fecha_generacion, carga_academica_sede_id, created_at);
    PRINT '✅ IX_AlumnoPago_Alumno_Estado creado con éxito.';
END
ELSE
BEGIN
    PRINT 'ℹ️  IX_AlumnoPago_Alumno_Estado ya existe.';
END
GO

-- ----------------------------------------------------------------------------
-- 4. ÍNDICE EN Ctas_Ctes.Alumno_Pago_Detalle (num_documento, alumno_pago_id)
--    Propósito: Verificación instantánea de idempotencia bancaria y extornos limpios
--               en PayDebt y ReversePay.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_AlumnoPagoDetalle_PagoId_NumDoc' 
      AND object_id = OBJECT_ID('Ctas_Ctes.Alumno_Pago_Detalle')
)
BEGIN
    PRINT 'Creando índice IX_AlumnoPagoDetalle_PagoId_NumDoc en Ctas_Ctes.Alumno_Pago_Detalle...';
    CREATE NONCLUSTERED INDEX IX_AlumnoPagoDetalle_PagoId_NumDoc
    ON Ctas_Ctes.Alumno_Pago_Detalle (alumno_pago_id, num_documento)
    INCLUDE (monto, tipo_pago, created_by, created_at);
    PRINT '✅ IX_AlumnoPagoDetalle_PagoId_NumDoc creado con éxito.';
END
ELSE
BEGIN
    PRINT 'ℹ️  IX_AlumnoPagoDetalle_PagoId_NumDoc ya existe.';
END
GO

PRINT '>>> APLICACIÓN DE ÍNDICES ESTRATÉGICOS FASE 1 COMPLETADA CON ÉXITO.';
GO
