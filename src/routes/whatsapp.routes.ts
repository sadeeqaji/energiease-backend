import { FastifyInstance } from 'fastify';
import { WhatsAppController } from '@/controllers/whatsapp.controller';

export default async function whatsappRoutes(fastify: FastifyInstance) {
  const whatsappController = new WhatsAppController(fastify);

  fastify.get('/webhook', whatsappController.verifyWebhook);
  fastify.post('/webhook', whatsappController.handleWebhook);
  fastify.get('/flow', async () => ({ status: 'active' }));
  fastify.post(
    '/flow',
    {
      config: {
        rawBody: true,
      },
    },
    whatsappController.handleFlowWebhook,
  );
  fastify.post(
    '/flow-webhook',
    {
      config: {
        rawBody: true,
      },
    },
    whatsappController.handleFlowWebhook,
  );
}