import { FastifyInstance } from 'fastify';
import { MonnifyWebhookController } from '@/controllers/monnify.controller';
import { PaystackWebhookController } from '@/controllers/paystack.controller';
import { BuyPowerMFBWebhookController } from '@/controllers/buypower-mfb.controller';


export default async function webhookRoutes(fastify: FastifyInstance) {
    const monnifyController = new MonnifyWebhookController(fastify);
    const paystackWebhookController = new PaystackWebhookController(fastify);
    const buyPowerMFBController = new BuyPowerMFBWebhookController(fastify);

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
    fastify.post(
        '/buypower-mfb',
        {
            config: {
                rawBody: true,
            },
        },
        buyPowerMFBController.webhookHandler.bind(buyPowerMFBController)
    );
}
