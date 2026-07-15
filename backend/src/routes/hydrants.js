const BBOX_SCHEMA = {
  querystring: {
    type: 'object',
    required: ['minLat', 'minLon', 'maxLat', 'maxLon'],
    properties: {
      minLat: { type: 'number' },
      minLon: { type: 'number' },
      maxLat: { type: 'number' },
      maxLon: { type: 'number' }
    }
  }
};

const NEARBY_SCHEMA = {
  querystring: {
    type: 'object',
    required: ['lat', 'lon'],
    properties: {
      lat: { type: 'number' },
      lon: { type: 'number' },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 5 }
    }
  }
};

async function hydrantRoutes(fastify) {
  // Hydrants within a map viewport, so clients don't fetch the whole country at once.
  fastify.get('/hydrants', { schema: BBOX_SCHEMA }, async (req) => {
    const { minLat, minLon, maxLat, maxLon } = req.query;
    const { rows } = await fastify.pg.query(
      `SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, properties
       FROM hydrants
       WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography`,
      [minLon, minLat, maxLon, maxLat]
    );
    return rows;
  });

  // Nearest hydrants to a point, ordered via the GIST index (<->) instead of scanning in JS.
  fastify.get('/hydrants/nearby', { schema: NEARBY_SCHEMA }, async (req) => {
    const { lat, lon, limit = 5 } = req.query;
    const { rows } = await fastify.pg.query(
      `SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, properties,
              ST_Distance(geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance
       FROM hydrants
       ORDER BY geom <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
       LIMIT $3`,
      [lat, lon, limit]
    );
    return rows;
  });

  fastify.get('/hydrants/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return reply.code(400).send({ error: 'invalid id' });
    }
    const { rows } = await fastify.pg.query(
      `SELECT id, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon, properties
       FROM hydrants WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'not found' });
    return rows[0];
  });
}

module.exports = hydrantRoutes;
