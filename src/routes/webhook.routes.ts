import { FastifyInstance } from 'fastify';
import { MonnifyWebhookController } from '@/controllers/monnify.controller';
import { PaystackWebhookController } from '@/controllers/paystack.controller';

const monnifyController = new MonnifyWebhookController();
const paystackWebhookController = new PaystackWebhookController();

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
    fastify.post(
        '/paystack',
        {
            config: {
                rawBody: true,
            },
        },
        paystackWebhookController.webhookHandler.bind(paystackWebhookController)
    );
}
