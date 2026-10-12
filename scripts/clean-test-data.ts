import { getMssqlPool, sql } from '../src/infrastructure/database/mssql.connection.js';
import { logger } from '../src/infrastructure/telemetry/logger.js';

export async function cleanTestData(): Promise<{ deletedDetails: number; restoredDebts: number }> {
  const pool = await getMssqlPool();

  console.log('🧹 Limpiando registros residuales de prueba en BDACADEMICO6...');

  const affectedDebtsResult = await pool.request().query(`
    SELECT DISTINCT alumno_pago_id 
    FROM Ctas_Ctes.Alumno_Pago_Detalle 
    WHERE created_by IN ('ASBANC_FTR', 'ASBANC_TEST') 
       OR tipo_pago = 'ASBANC';
  `);

  const affectedIds: number[] = affectedDebtsResult.recordset.map((r: any) => r.alumno_pago_id);

  let restoredDebts = 0;
  if (affectedIds.length > 0) {
    const tableParam = new sql.Table();
    tableParam.columns.add('id', sql.Int);
    affectedIds.forEach((id) => tableParam.rows.add(id));

    const updateResult = await pool.request().query(`
      UPDATE Ctas_Ctes.Alumno_Pago
      SET 
        param_estado_pago_id = 25,
        monto_pagado_sin_mora = 0,
        monto_pagado_con_mora = 0,
        fecha_pago = NULL,
        lugar_pago = NULL,
        modified_at = GETDATE(),
        modified_by = 'CLEAN_TEST_SCRIPT'
      WHERE id IN (
        SELECT DISTINCT alumno_pago_id 
        FROM Ctas_Ctes.Alumno_Pago_Detalle 
        WHERE created_by IN ('ASBANC_FTR', 'ASBANC_TEST') OR tipo_pago = 'ASBANC'
      );
    `);
    restoredDebts = updateResult.rowsAffected[0] || 0;
  }

  const deleteResult = await pool.request().query(`
    DELETE FROM Ctas_Ctes.Alumno_Pago_Detalle 
    WHERE created_by IN ('ASBANC_FTR', 'ASBANC_TEST') 
       OR tipo_pago = 'ASBANC';
  `);

  const deletedDetails = deleteResult.rowsAffected[0] || 0;

  console.log(`✅ Limpieza completada:`);
  console.log(`   - Comprobantes eliminados en Alumno_Pago_Detalle: ${deletedDetails}`);
  console.log(`   - Cuotas restauradas a estado 25 (Pendiente): ${restoredDebts}`);

  return { deletedDetails, restoredDebts };
}

if (process.argv[1]?.includes('clean-test-data')) {
  cleanTestData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error limpiando datos de prueba:', err);
      process.exit(1);
    });
}
