import fp from 'fastify-plugin';
import mongoose from 'mongoose';
import { FastifyInstance } from 'fastify';
import { env } from '@/config';

async function dbConnectorPlugin(fastify: FastifyInstance) {
  try {
    const poolSize = Number(process.env.MONGODB_MAX_POOL_SIZE || 50);
    await mongoose.connect(env.MONGODB_URI!, {
      maxPoolSize: poolSize,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    fastify.decorate('mongoose', mongoose);
    fastify.log.info('MongoDB connected');
  } catch (err) {
    fastify.log.error(err);
    throw err;
  }
}

export default fp(dbConnectorPlugin);
