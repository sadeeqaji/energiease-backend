import fp from 'fastify-plugin';
import { WhatsAppService } from '@/services/whatsapp.service';
import { WhatsAppConsumer } from '@/serviceBus/consumer/whatsapp.consumer.';
import { PaymentConsumer } from '@/serviceBus/consumer/payment.consumer';

declare module 'fastify' {
    interface FastifyInstance {
        whatsappConsumer: WhatsAppConsumer;
        paymentConsumer: PaymentConsumer;
    }
}

export default fp(async (fastify) => {
    const whatsappService = new WhatsAppService();


    const whatsappConsumer = new WhatsAppConsumer(fastify, whatsappService);
    const paymentConsumer = new PaymentConsumer(fastify);

    fastify.decorate('whatsappConsumer', whatsappConsumer);
    fastify.decorate('paymentConsumer', paymentConsumer);

    fastify.addHook('onReady', async () => {
        if (process.env.NODE_ENV !== 'test') {
            try {
                await Promise.all([
                    whatsappConsumer.start(),
                    paymentConsumer.start()
                ]);
                fastify.log.info('All Service Bus consumers started successfully');
            } catch (error) {
                fastify.log.error('Failed to start Service Bus consumers:', error);
                throw error;
            }
        }
    });

    fastify.addHook('onClose', async () => {
        await Promise.allSettled([
            fastify.serviceBus.close(),
            // Add any other cleanup needed for consumers
        ]);
    });
}, {
    name: 'serviceBusConsumers',
    dependencies: ['serviceBus', 'redis']
});