import { FastifyInstance } from 'fastify';
import { WhatsAppController } from '@/controllers/whatsapp.controller';

export default async function whatsappRoutes(fastify: FastifyInstance) {
  const whatsappController = new WhatsAppController(fastify);

  fastify.get('/webhook', whatsappController.verifyWebhook);
  fastify.post('/webhook', whatsappController.handleWebhook);
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