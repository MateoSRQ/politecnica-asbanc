import { env } from '../src/config/env.js';

async function viewMetrics(): Promise<void> {
  const url = `http://127.0.0.1:${env.PORT}`;

  try {
    const healthRes = await fetch(`${url}/health`);
    const health = await healthRes.json();
    console.log('\n🏥 ESTADO DEL SERVICIO (/health):');
    console.log(`   • Estado Global : ${health.status === 'UP' ? '🟢 UP' : '🔴 DOWN'}`);
    console.log(`   • Uptime        : ${Math.round(health.uptime)} segundos`);
    console.log(`   • MSSQL         : ${health.services.mssql}`);
  } catch {
    console.log('\n⚠️ El servidor no parece estar activo en http://127.0.0.1:' + env.PORT);
    console.log('   Inicia el servidor con: npm run dev\n');
    return;
  }

  try {
    const metricsRes = await fetch(`${url}/metrics`);
    const rawMetrics = await metricsRes.text();

    console.log('\n📡 TELEMETRÍA PROMETHEUS (/metrics) - RESUMEN TRANSACCIONAL:');

    // Parsear asbanc_txn_total
    const txnLines = rawMetrics.split('\n').filter((l) => l.startsWith('asbanc_txn_total{'));

    const breakdown: any[] = [];
    for (const line of txnLines) {
      const match = line.match(/method="([^"]+)",bank_code="([^"]+)",channel="([^"]+)",status_code="([^"]+)"}\s+(\d+)/);
      if (match) {
        breakdown.push({
          Metodo: match[1],
          Banco: match[2],
          Canal: match[3],
          CodigoResp: match[4],
          Total: Number(match[5]),
        });
      }
    }

    if (breakdown.length > 0) {
      console.table(breakdown.slice(0, 15));
      if (breakdown.length > 15) {
        console.log(`   (...y ${breakdown.length - 15} series más expuestas en Prometheus)`);
      }
    }

    // Alertas SLA
    const slaLine = rawMetrics.split('\n').find((l) => l.startsWith('asbanc_sla_violations_total'));
    console.log(`\n🎯 Alertas de SLA Violations (>3s) : ${slaLine ? slaLine : '0 (Sin violaciones)'}`);
    console.log(`🔗 Endpoint completo para Prometheus / Grafana: http://localhost:${env.PORT}/metrics\n`);
  } catch (error: any) {
    console.error('Error al obtener métricas:', error.message);
  }
}

viewMetrics();
