import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { BuyPowerMFBWebhookPayload } from '@/types/buypower-mfb.types';
import { REDIS_PREFIXES } from '@/constants/redisPrefix';
import { PAYMENT_RECEIVED } from '@/constants/whatsapp.flow';

export class BuyPowerMFBWebhookController {
    private readonly RATE_LIMIT = 30;
    private readonly EVENT_TTL = 86400; // 24 hours

    constructor(private readonly fastify: FastifyInstance) {}

    private async acquireWebhookLock(transactionId: string): Promise<boolean> {
        if (!this.fastify.redis) return true;
        const key = `${REDIS_PREFIXES.WEBHOOK}buypowermfb:${transactionId}`;
        const acquired = await this.fastify.redis.set(key, '1', { ttl: this.EVENT_TTL, nx: true });
        return acquired !== null;
    }

    private async checkRequestRate(ip: string): Promise<boolean> {
        if (!this.fastify.redis) return true;
        const rateLimitKey = `${REDIS_PREFIXES.RATE_LIMIT}buypowermfb:${ip}`;
        const currentCount = await this.fastify.redis.incr(rateLimitKey);

        if (currentCount === 1) {
            await this.fastify.redis.expire(rateLimitKey, 60);
        }

        return currentCount <= this.RATE_LIMIT;
    }

    private async sendPaymentReceivedNotification(
        phoneNumber: string,
        amount: number,
        reference: string
    ): Promise<void> {
        try {
            const message = PAYMENT_RECEIVED({
                to: phoneNumber,
                amount: amount.toString(),
                orderReference: reference,
            });

            await this.fastify.whatsappService.sendMessage(message as Record<string, unknown>);
            this.fastify.log.info(`[BuyPowerMFB] Sent WhatsApp payment received notification for ${phoneNumber}`);
        } catch (err: any) {
            this.fastify.log.error(`[BuyPowerMFB] Failed to send WhatsApp notification:`, err?.message);
        }
    }

    private async handleInvoicePaid(payload: BuyPowerMFBWebhookPayload): Promise<void> {
        const data = payload.data;
        // The reference associated with our order (from accountExchangeReference or transactionReference)
        const orderReference = data.accountExchangeReference || data.transactionReference;
        const amountPaid = parseFloat(data.amount);

        this.fastify.log.info(`[BuyPowerMFB] Processing invoice payment for order: ${orderReference}, amount: ₦${amountPaid}`);

        try {
            const order = await this.fastify.orderService.getOrderByReference(orderReference);
            if (!order) {
                this.fastify.log.error(`[BuyPowerMFB] Order not found for reference: ${orderReference}`);
                return;
            }

            // Fire off WhatsApp notification
            this.sendPaymentReceivedNotification(order.customerPhone, amountPaid, orderReference);

            // Confirm order payment and trigger token vending
            await this.fastify.orderService.confirmAndVendOrder(orderReference, amountPaid);

            this.fastify.log.info(`[BuyPowerMFB] Successfully processed and triggered vend for order: ${orderReference}`);
        } catch (error: any) {
            this.fastify.log.error(`[BuyPowerMFB] Error processing payment for order ${orderReference}:`, error?.message);
        }
    }

    async webhookHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        const ip = request.ip;
        const isAllowed = await this.checkRequestRate(ip);
        if (!isAllowed) {
            this.fastify.log.warn(`[BuyPowerMFB] Rate limit exceeded for IP: ${ip}`);
            return reply.status(429).send({ status: 'error', message: 'Rate limit exceeded' });
        }

        const signature = request.headers['x-buypower-signature'] as string | undefined;
        const rawBody = (request as any).rawBody || JSON.stringify(request.body);

        // Validate HMAC signature using the BuyPowerMFB service
        const isValid = this.fastify.buyPowerMFBService.verifyWebhookSignature(signature, rawBody);
        if (!isValid) {
            this.fastify.log.warn('[BuyPowerMFB] Invalid webhook signature');
            return reply.status(400).send({ status: 'error', message: 'Invalid signature' });
        }

        const payload = request.body as BuyPowerMFBWebhookPayload;
        if (!payload || !payload.event || !payload.data) {
            this.fastify.log.warn('[BuyPowerMFB] Invalid webhook payload structure');
            return reply.status(400).send({ status: 'error', message: 'Invalid payload' });
        }

        const transactionId = `${payload.data.transactionId || payload.data.transactionReference || payload.data.accountExchangeReference}`;
        const lockAcquired = await this.acquireWebhookLock(transactionId);
        if (!lockAcquired) {
            this.fastify.log.info(`[BuyPowerMFB] Duplicate webhook event ignored for transaction: ${transactionId}`);
            return reply.status(200).send({ status: 'ok', message: 'Duplicate event ignored' });
        }

        switch (payload.event) {
            case 'invoice.paid':
                await this.handleInvoicePaid(payload);
                break;
            default:
                this.fastify.log.info(`[BuyPowerMFB] Unhandled event type: ${payload.event}`);
                break;
        }

        return reply.status(200).send({ status: 'ok', message: 'Webhook received' });
    }
}
