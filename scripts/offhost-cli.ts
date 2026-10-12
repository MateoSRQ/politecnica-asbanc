import fs from 'node:fs';
import path from 'node:path';
import { closeMssqlPool, getMssqlPool } from '../src/infrastructure/database/mssql.connection.js';
import { DebtFileGenerator } from '../src/infrastructure/off-host/debt-file.generator.js';
import { PaymentFileParser } from '../src/infrastructure/off-host/payment-file.parser.js';
import { ReconciliationService } from '../src/infrastructure/off-host/reconciliation.service.js';

async function main() {
  const action = process.argv[2] || 'debts';
  const targetDir = path.resolve(process.cwd(), 'storage/off-host');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log('================================================================');
  console.log('📦 MÓDULO OFF HOST - ASBANC FTR / YAPAGO V47');
  console.log('================================================================');

  const pool = await getMssqlPool();

  if (action === 'debts') {
    console.log('🚀 Generando archivo plano de deudas FTRCOBDDMMAAAASSS.TXT...');
    const result = await DebtFileGenerator.generate({
      tipoActualizacion: 'R',
      secuencia: 1,
      outputDir: targetDir,
    });

    console.log(`\n✅ Archivo generado: ${result.fileName}`);
    console.log(`📁 Ubicación       : ${result.filePath}`);
    console.log(`📊 Total Deudas    : ${result.totalRecords}`);
    console.log(`💰 Total Soles (S/): ${result.importeTotalSoles.toFixed(2)}`);
    console.log(`💵 Total Dólares ($): ${result.importeTotalDolares.toFixed(2)}`);
  } else if (action === 'reconcile') {
    console.log('🔍 Ejecutando conciliación diaria...');
    const files = fs.readdirSync(targetDir).filter((f) => f.toUpperCase().startsWith('FTRPAG'));
    let fileContent = '';
    let fileName = 'FTRPAG_SIMULADO.TXT';

    if (files.length > 0) {
      fileName = files[0];
      fileContent = fs.readFileSync(path.join(targetDir, fileName), 'utf-8');
      console.log(`📄 Archivo detectado: ${fileName}`);
    } else {
      console.log('ℹ️  No se encontró FTRPAG en storage/off-host. Generando lote simulado de 5 pagos...');
      const sampleRecords = [1, 2, 3, 4, 5].map((idx) => {
        return PaymentFileParser.formatPaymentRecord({
          tipoRegistro: 'DD',
          codigoSucursalCta: '000',
          codigoMoneda: '1',
          numeroCuentaAfiliada: '',
          codigoCliente: `260233530100${idx}`,
          nombreCliente: `ESTUDIANTE DEMO ${idx}`,
          codigoProducto: '001',
          numeroDocumento: `P00001072${idx}`,
          fechaVencimiento: '25092026',
          fechaTransaccion: '21092026',
          horaTransaccion: '120000',
          importePagado: 833.33,
          agencia: 'AG_CENTRAL',
          direccionAgencia: '',
          numeroOperacionBanco: `OP_SIM_${String(idx).padStart(4, '0')}`,
          canalPago: '10',
          formaPago: '01',
          fechaPagoContable: '21092026',
          tipoOperacion: 'P',
          codigoBanco: '1020',
        });
      });
      fileContent = sampleRecords.join('\r\n');
      fileName = 'FTRPAG_SIMULADO.TXT';
      fs.writeFileSync(path.join(targetDir, fileName), fileContent, 'latin1');
    }

    const report = await ReconciliationService.reconcile({
      archivoPagosNombre: fileName,
      contenidoArchivoPagos: fileContent,
    });

    console.log('\n📈 RESULTADO DE CONCILIACIÓN DIARIA:');
    console.log(`- Archivo Procesado        : ${report.archivoPagos}`);
    console.log(`- Total Operaciones Off-Host: ${report.totalOperacionesOffHost}`);
    console.log(`- Total Operaciones On-Host : ${report.totalOperacionesOnHost}`);
    console.log(`- Operaciones Coincidentes : ${report.totalCoincidentes}`);
    console.log(`- Discrepancias Detectadas : ${report.totalDiscrepancias}`);
    console.log(`- Monto Off-Host           : S/ ${report.montoTotalOffHost.toFixed(2)}`);
    console.log(`- Coincidencia Porcentual  : ${report.porcentajeCoincidencia}%`);

    if (report.discrepancias.length > 0) {
      console.log('\n⚠️  Detalle de Discrepancias:');
      console.table(
        report.discrepancias.map((d) => ({
          Tipo: d.tipo,
          'Op. Banco': d.numOperacionBanco,
          Banco: d.codigoBanco,
          'Doc.': d.numeroDocumento,
          Detalle: d.detalle,
        })),
      );
    }

    const reportPath = path.join(targetDir, `reconciliation_report_${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n💾 Reporte guardado en: ${reportPath}`);
  }

  await closeMssqlPool();
}

main().catch(async (err) => {
  console.error('Error fatal en Off-Host CLI:', err);
  await closeMssqlPool();
  process.exit(1);
});
