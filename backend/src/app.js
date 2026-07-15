const fastify = require('fastify');

function buildApp(opts = {}) {
  const app = fastify({ logger: opts.logger ?? true });

  app.register(require('@fastify/postgres'), {
    connectionString: opts.connectionString || process.env.DATABASE_URL
  });
  app.register(require('@fastify/cors'), { origin: true });
  app.register(require('./routes/hydrants'));

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

module.exports = { buildApp };
