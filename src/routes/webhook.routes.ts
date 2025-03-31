import { FastifyInstance } from 'fastify';
import { MonnifyWebhookController } from '@/controllers/monnify.controller';
import { PaystackWebhookController } from '@/controllers/paystack.controller';


export default async function whatsappRoutes(fastify: FastifyInstance) {
    const monnifyController = new MonnifyWebhookController(fastify);
    const paystackWebhookController = new PaystackWebhookController(fastify);

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
