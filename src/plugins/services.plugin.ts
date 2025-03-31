import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { OrderService } from '@/services/order.service';
import { MeterService } from '@/services/meter.service';
import { NotificationService } from '@/services/notification.service';
import { BuyPowerProvider } from '@/services/providers/buypower';
import { PaymentService } from '@/services/payment.service';

declare module 'fastify' {
    interface FastifyInstance {
        orderService: OrderService;
        meterService: MeterService;
        notificationService: NotificationService;
        paymentService: PaymentService;
    }
}

const servicesPlugin: FastifyPluginAsync = async (fastify) => {
    // Initialize providers
    const providers = [new BuyPowerProvider()].sort((a, b) => a.priority - b.priority);

    // Initialize services with dependencies
    const notificationService = new NotificationService();
    const meterService = new MeterService(fastify);
    const paymentService = new PaymentService(fastify);

    const orderService = new OrderService(
        fastify,
        providers,
        notificationService,
    );

    fastify.decorate('orderService', orderService);
    fastify.decorate('meterService', meterService);
    fastify.decorate('notificationService', notificationService);
    fastify.decorate('paymentService', paymentService);

    fastify.log.info('Services plugin registered');
};


export default fp(servicesPlugin);


