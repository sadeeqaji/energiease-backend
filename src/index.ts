import Fastify from 'fastify';
import 'dotenv/config';
import { dbConnectorPlugin, routesPlugin, swaggerPlugin } from './plugins';
import cors from "@fastify/cors";
import fastifyRawBody from 'fastify-raw-body';
import { errorHandler } from './plugins/error.plugin';
import authenticationPlugin from './plugins/authentication.plugin';
import successResponsePlugin from './plugins/successResponse.plugin';
import { corsOptions } from './constants/cor';
import { env } from './config';

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});
fastify.get('/', async () => {
  return { message: 'Hello, Energiease API!' };
});

fastify.register(fastifyRawBody, {
  field: 'rawBody',
  global: true,
  encoding: 'utf8',
});


fastify.setErrorHandler(errorHandler);
fastify.register(successResponsePlugin);
fastify.register(cors, corsOptions);

fastify.register(import('@fastify/sensible'));
fastify.register(swaggerPlugin);
fastify.register(authenticationPlugin);
fastify.register(routesPlugin);
fastify.register(dbConnectorPlugin);

const start = async () => {
  try {
    await fastify.listen({ port: env.PORT });
    console.log(`Server running at http://localhost:${env.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
