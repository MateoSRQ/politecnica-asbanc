import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import pactum from 'pactum';
import { testConfig } from './config.js';
import { pactumRunner } from './pactum-runner.js';

export function buildTestServer() {
  const server = Fastify({
    logger: {
      level: 'info',
    },
  });

  const htmlPath = path.resolve(process.cwd(), 'test/public/index.html');

  server.get('/', async (req, reply) => {
    try {
      const html = fs.readFileSync(htmlPath, 'utf8');
      return reply.type('text/html').send(html);
    } catch (err: any) {
      return reply.status(500).send(`Error cargando UI: ${err.message}`);
    }
  });

  server.get('/api/config', async () => {
    return {
      targetUrl: testConfig.targetUrl,
      appPort: testConfig.appPort,
      clientId: testConfig.clientId,
      companyCode: testConfig.companyCode,
    };
  });

  server.get('/api/healthcheck', async (req) => {
    const query = req.query as any;
    const targetUrl = query?.targetUrl || testConfig.targetUrl;

    const start = performance.now();
    try {
      const res = await pactum.spec().get(`${targetUrl}/health`).toss();
      const timeMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        ok: res.statusCode === 200,
        status: res.statusCode,
        timeMs,
        serviceStatus: res.body?.status || 'UP',
        services: res.body?.services,
      };
    } catch (err: any) {
      const timeMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        ok: false,
        status: 500,
        timeMs,
        error: err.message || 'No se pudo conectar con el servidor destino',
      };
    }
  });

  server.post('/api/run-batch', async (req, reply) => {
    const body = (req.body || {}) as any;
    const count = parseInt(body.count, 10) || 10;
    const targetUrl = body.targetUrl || testConfig.targetUrl;
    const customCode = body.customCode ? String(body.customCode).trim() : undefined;
    const concurrency = body.concurrency || 5;

    try {
      const result = await pactumRunner.runBatch({
        targetUrl,
        count,
        customCode,
        concurrency,
      });

      return {
        ok: true,
        summary: result.summary,
        transactions: result.transactions,
      };
    } catch (err: any) {
      return reply.status(500).send({
        ok: false,
        error: err.message,
      });
    }
  });

  server.post('/api/reverse', async (req, reply) => {
    const body = (req.body || {}) as any;

    if (!body.codigoBanco || !body.numOperacionBanco || !body.numDocumento) {
      return reply.status(400).send({
        ok: false,
        error: 'Faltan parámetros obligatorios (codigoBanco, numOperacionBanco, numDocumento)',
      });
    }

    try {
      const targetUrl = body.targetUrl || testConfig.targetUrl;
      const res = await pactumRunner.revertTransaction({
        targetUrl,
        codigoBanco: body.codigoBanco,
        numOperacionBanco: body.numOperacionBanco,
        numDocumento: body.numDocumento,
        codigoEmpresa: body.codigoEmpresa || testConfig.companyCode,
        fechaTxn: body.fechaTxn,
        horaTxn: body.horaTxn,
        tipoConsulta: body.tipoConsulta,
        idConsulta: body.idConsulta,
      });

      const bodyRes = res.body || {};
      const isSuccess = res.httpStatus === 200 && (bodyRes.codigoRespuesta === '00' || bodyRes.codigoRespuesta === '0');

      return {
        ok: isSuccess,
        httpStatus: res.httpStatus,
        responseTimeMs: res.responseTimeMs,
        codigoRespuesta: bodyRes.codigoRespuesta || '99',
        descripcionResp: bodyRes.descripcionResp || (isSuccess ? 'OK' : 'ERROR'),
        numOperacionERP: bodyRes.numOperacionERP,
      };
    } catch (err: any) {
      return reply.status(500).send({
        ok: false,
        error: err.message,
      });
    }
  });

  return server;
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const port = testConfig.appPort;
  const server = buildTestServer();

  server.listen({ port, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      console.error('❌ Error iniciando el servidor de pruebas Pactum:', err);
      process.exit(1);
    }
    console.log(`\n========================================================================`);
    console.log(`🚀 SUITE DE PRUEBAS HTTP PACTUMJS INICIADA CON ÉXITO`);
    console.log(`========================================================================`);
    console.log(`🌐 Dashboard Interactivo: ${address}`);
    console.log(`🎯 API Destino (.env)   : ${testConfig.targetUrl}`);
    console.log(`📊 Conectores Bancarios : BCP, BBVA, Interbank, Scotiabank, BanBif`);
    console.log(`⚡ Baterías soportadas  : 10, 100, N (concurrente con pool JSON)`);
    console.log(`🎯 Código en Texto      : Alumnos BDACADEMICO6 y sintéticos`);
    console.log(`↩  Reversión            : Individual por botón y manual a mano`);
    console.log(`========================================================================\n`);
  });
}
