require('dotenv').config();
const fastify = require('fastify')({ logger: true });

fastify.register(require('@fastify/postgres'), {
  connectionString: process.env.DATABASE_URL
});
fastify.register(require('@fastify/cors'), { origin: true });
fastify.register(require('./routes/hydrants'));

fastify.get('/health', async () => ({ status: 'ok' }));

fastify
  .listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
