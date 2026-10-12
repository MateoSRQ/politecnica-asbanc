import { testConfig } from './config.js';
import { pactumRunner } from './pactum-runner.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        options[key] = next;
        i++;
      } else {
        options[key] = 'true';
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        options[key] = next;
        i++;
      } else {
        options[key] = 'true';
      }
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  const count = parseInt(options.count || options.n || '10', 10);
  const targetUrl = options.url || testConfig.targetUrl;
  const customCode = options.code;
  const isReverseMode = options.reverse === 'true';

  console.log('========================================================================');
  console.log('🚀 PACTUMJS CLI - EJECUTOR DE PRUEBAS TRANSACCIONALES ASBANC');
  console.log('========================================================================');
  console.log(`🎯 URL Destino  : ${targetUrl}`);

  const health = await pactumRunner.checkHealth(targetUrl);
  if (!health.ok) {
    console.error('\n❌ ERROR DE CONEXIÓN CON EL SERVIDOR DESTINO (ECONNREFUSED):');
    console.error(`   No se pudo establecer conexión con ${targetUrl}`);
    console.error(`   Detalle: ${health.error || 'El servidor no responde o está apagado'}\n`);
    console.error('💡 ¿CÓMO RESOLVERLO?:');
    console.error('   1. Si vas a probar en este servidor local, inicia primero el API en otra terminal:');
    console.error('      $ npm run dev\n');
    console.error('   2. O si estás probando un servidor remoto o en otro puerto, usa el flag --url:');
    console.error('      $ npm run test:pactum -- --url http://127.0.0.1:7300 --count 100\n');
    process.exit(1);
  }
  console.log(`📡 Estado Enlace: Conectado (HTTP ${health.status} /health OK)`);

  if (isReverseMode) {
    const bank = options.bank || '1020';
    const op = options.op || options.operation;
    const doc = options.doc || options.documento || '10726';

    if (!op) {
      console.error('❌ Para revertir debes especificar: --op <numOperacionBanco> [--bank 1020] [--doc 10726]');
      process.exit(1);
    }

    console.log(`↩ Ejecutando reversión manual de ${op} (Banco: ${bank}, Doc: ${doc})...`);
    const start = performance.now();
    const result = await pactumRunner.revertTransaction({
      targetUrl,
      codigoBanco: bank,
      numOperacionBanco: op,
      numDocumento: doc,
    });
    const timeMs = Math.round((performance.now() - start) * 100) / 100;

    console.log(`⏱ Tiempo de reversión: ${timeMs} ms`);
    console.log(`HTTP Status: ${result.httpStatus}`);
    console.log(`Respuesta ASBANC:`, result.body);
    return;
  }

  console.log(`⚡ Batería      : ${count} transacciones`);
  if (customCode) {
    console.log(`🎯 Código Texto : ${customCode}`);
  } else {
    console.log(`📦 Origen Datos : Pool variado de JSON (BCP, BBVA, Interbank, Scotiabank, BanBif)`);
  }
  console.log('------------------------------------------------------------------------');

  console.log(`Iniciando ejecución con PactumJS...\n`);

  const isVerbose = options.verbose === 'true' || options.v === 'true' || options.showRequest === 'true';

  const { summary, transactions } = await pactumRunner.runBatch({
    targetUrl,
    count,
    customCode,
    concurrency: 5,
    onProgress: (tx) => {
      const mark = tx.status === 'SUCCESS' ? '✅' : '❌';
      console.log(
        ` ${mark} [#${tx.index.toString().padStart(3, ' ')}] ${tx.bancoNombre.padEnd(10, ' ')} | Op: ${tx.numOperacionBanco.padEnd(12, ' ')} | Código: ${tx.idConsulta.padEnd(14, ' ')} | ASBANC: ${tx.codigoRespuesta} | ⏱ ${tx.responseTimeMs.toFixed(1)} ms`,
      );
      if (isVerbose && tx.requestDetails) {
        console.log(`      ➡️ [HTTP REQUEST] ${tx.requestDetails.method} ${tx.requestDetails.url}`);
        console.log(`         Headers:`, JSON.stringify(tx.requestDetails.headers));
        console.log(
          `         Parámetros Body:`,
          JSON.stringify(tx.requestDetails.body, null, 2).replace(/\n/g, '\n         '),
        );
        console.log(`      ⬅️ [HTTP RESPONSE ${tx.httpStatus}]:`, JSON.stringify(tx.responseDetails?.body));
        console.log('');
      }
    },
  });

  console.log('\n========================================================================');
  console.log('📊 RESUMEN EJECUTIVO DE LA BATERÍA (PACTUMJS)');
  console.log('========================================================================');
  console.log(`Total Transacciones  : ${summary.total}`);
  console.log(`Exitosas (00)        : ${summary.successCount}`);
  console.log(`Errores / Otros      : ${summary.errorCount}`);
  console.log(`Duración Total Lote  : ${(summary.totalDurationMs / 1000).toFixed(2)} s`);
  console.log(`Tiempo Promedio      : ${summary.avgTimeMs.toFixed(1)} ms`);
  console.log(`Tiempo Mín / Máx     : ${summary.minTimeMs.toFixed(1)} ms / ${summary.maxTimeMs.toFixed(1)} ms`);
  console.log(`Percentil 95 (P95)   : ${summary.p95TimeMs.toFixed(1)} ms`);
  console.log(`Cumplimiento SLA <3s : ${summary.slaCompliancePercent}%`);
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
