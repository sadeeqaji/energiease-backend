import fp from 'fastify-plugin';
import mongoose from 'mongoose';
import { FastifyInstance } from 'fastify';
import { env } from '@/config';

async function dbConnectorPlugin(fastify: FastifyInstance) {
  try {
    await mongoose.connect(env.MONGODB_URI!, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      tlsAllowInvalidCertificates: true,
    });

    fastify.decorate('mongoose', mongoose);
    fastify.log.info('MongoDB connected');
  } catch (err) {
    fastify.log.error(err);
    throw err;
  }
}

export default fp(dbConnectorPlugin);
