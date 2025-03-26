import fp from 'fastify-plugin';
import { ServiceBusService } from '@/services/serviceBus.service';

declare module 'fastify' {
    interface FastifyInstance {
        serviceBus: ServiceBusService;
    }
}

export default fp(async (fastify) => {
    const serviceBusService = new ServiceBusService(fastify);
    fastify.decorate('serviceBus', serviceBusService);

    fastify.addHook('onClose', async () => {
        await serviceBusService.close();
    });
}, {
    name: 'serviceBus',
});