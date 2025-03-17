import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';

async function swaggerPlugin(fastify: FastifyInstance) {
  fastify.register(import('@fastify/swagger'), {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Sales count',
        description: 'Energiease backend documentation',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [
        {
          BearerAuth: [],
        },
      ],
    },
  });
  fastify.register(import('@fastify/swagger-ui'), {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
    },
  });
}

export default fp(swaggerPlugin);
