import { FastifyInstance } from 'fastify';
import { MonnifyWebhookController } from '@/controllers/monnify.controller';

const monnifyController = new MonnifyWebhookController();
export default async function whatsappRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/monnify',
        {
            config: {
                rawBody: true,
            },
        },
        monnifyController.webhookHandler.bind(monnifyController)
    );
}
