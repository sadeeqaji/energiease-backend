import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { OrderService } from '@/services/order.service';
import { MeterService } from '@/services/meter.service';
import { NotificationService } from '@/services/notification.service';
import { BuyPowerProvider } from '@/services/providers/buypower';
import { PaymentService } from '@/services/payment.service';
import { MonnifyService } from '@/services/monnify.service';
import { PaystackService } from '@/services/paystack.service';
import { BuyPowerMFBService } from '@/services/buypower-mfb.service';
import { UserService } from '@/services/user.service';
import { WhatsAppService } from '@/services/whatsapp.service';

declare module 'fastify' {
    interface FastifyInstance {
        userService: UserService;
        orderService: OrderService;
        meterService: MeterService;
        notificationService: NotificationService;
        paymentService: PaymentService;
        monnifyService: MonnifyService;
        paystackService: PaystackService;
        buyPowerMFBService: BuyPowerMFBService;
        whatsappService: WhatsAppService;
        discoHealthService?: any;
    }
}

const servicesPlugin: FastifyPluginAsync = async (fastify) => {
    // Initialize providers
    const providers = [new BuyPowerProvider()].sort((a, b) => a.priority - b.priority);

    // Initialize services with dependencies
    const userService = new UserService();
    const notificationService = new NotificationService();
    const meterService = new MeterService(fastify);
    const monnifyService = new MonnifyService(fastify);
    const paystackService = new PaystackService(fastify);
    const buyPowerMFBService = new BuyPowerMFBService(fastify);
    const paymentService = new PaymentService(fastify);
    const whatsappService = new WhatsAppService();

    const orderService = new OrderService(
        fastify,
        providers,
        notificationService,
    );

    fastify.decorate('userService', userService);
    fastify.decorate('orderService', orderService);
    fastify.decorate('meterService', meterService);
    fastify.decorate('notificationService', notificationService);
    fastify.decorate('paymentService', paymentService);
    fastify.decorate('monnifyService', monnifyService);
    fastify.decorate('paystackService', paystackService);
    fastify.decorate('buyPowerMFBService', buyPowerMFBService);
    fastify.decorate('whatsappService', whatsappService);

    fastify.log.info('Services plugin registered');
};


export default fp(servicesPlugin);


