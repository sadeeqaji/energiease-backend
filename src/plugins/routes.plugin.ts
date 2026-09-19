import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';

async function routesPlugin(fastify: FastifyInstance) {
  fastify.register(import('@/routes/whatsapp.routes'), { prefix: '/whatsapp' });
  fastify.register(import('@/routes/auth.routes'), { prefix: '/auth' });
  fastify.register(import('@/routes/webhook.routes'), { prefix: '/webhook' });
  fastify.register(import('@/routes/order.routes'), { prefix: '/orders' });
  fastify.register(import('@/routes/admin.routes'), { prefix: '/admin' });
}

export default fp(routesPlugin);
