import { FastifyInstance } from 'fastify';
import { WhatsAppController } from '@/controllers/whatsapp.controller';

const whatsappController = new WhatsAppController();

export default async function whatsappRoutes(fastify: FastifyInstance) {
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
