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
import redisPlugin from './plugins/redis.plugin';
import servicesPlugin from './plugins/services.plugin';

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
fastify.register(redisPlugin);
fastify.register(servicesPlugin)
fastify.register(import('@fastify/sensible'));
fastify.register(swaggerPlugin);
fastify.register(authenticationPlugin);
fastify.register(routesPlugin);
fastify.register(dbConnectorPlugin);

const start = async () => {
  try {
    const port = Number(process.env.PORT) || env.PORT || 8080;
    await fastify.listen({ host: '0.0.0.0', port });
    console.log(`Server running at http://0.0.0.0:${port}`);

    // Start BuyPower 15-minute wallet balance monitor
    const { WalletMonitor } = await import('./jobs/walletMonitor.job');
    const walletMonitor = new WalletMonitor(fastify);
    walletMonitor.start();

    // Start Support 15-minute customer inactivity auto-exit monitor
    const { SupportInactivityMonitor } = await import('./jobs/supportInactivity.job');
    const inactivityMonitor = new SupportInactivityMonitor(fastify);
    inactivityMonitor.start();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
