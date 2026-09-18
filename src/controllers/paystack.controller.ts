import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { PaystackConfig } from '@/config/paystack.config';
import { AppException } from '@/utils/appException.utils';
import crypto from 'crypto';
import { PaystackEvent, SuccessfulChargeEvent } from '@/types/paystack.types';
import { ServiceBusQueues } from '@/constants/serviceBus';
import { REDIS_PREFIXES } from '@/constants/redisPrefix';
import { PAYMENT_RECEIVED } from '@/constants/whatsapp.flow';

export class PaystackWebhookController {
    private readonly fastify: FastifyInstance;
    private readonly EVENT_TTL = 86400;

    constructor(fastify: FastifyInstance) {
        this.fastify = fastify;
    }

    private validateSignature(request: FastifyRequest, rawBody: string | Buffer): boolean {
        const signature = request.headers['x-paystack-signature'] as string;
        if (!signature) return false;

        const computedHash = crypto
            .createHmac('sha512', PaystackConfig.secretKey)
            .update(rawBody)
            .digest('hex');

        return computedHash === signature;
    }

    private isWhitelistedIp(ip: string): boolean {
        const paystackIps = [
            '52.31.139.75',
            '52.49.173.169',
            '52.214.14.220'
        ];
        return paystackIps.includes(ip);
    }

    private async handleEvent(event: PaystackEvent): Promise<void> {
        switch (event.event) {
            case 'charge.success': {
                const transactionReference = event.data.reference;
                const lockKey = `${REDIS_PREFIXES.WEBHOOK}paystack:${transactionReference}`;
                const isNew = await this.fastify.redis.set(lockKey, '1', { ttl: this.EVENT_TTL, nx: true });
                if (!isNew) {
                    this.fastify.log.info(`Duplicate Paystack transaction skipped: ${transactionReference}`);
                    return;
                }
                await this.handleSuccessfulCharge(event as SuccessfulChargeEvent);
                break;
            }
            default:
                this.fastify.log.warn(`Unhandled Paystack event type: ${event.event}`);
        }
    }

    private async handleSuccessfulCharge(event: SuccessfulChargeEvent): Promise<void> {
        const amountPaid = event.data.amount / 100;
        const paymentReference = event?.data?.metadata?.reference || event.data.reference;

        try {
            let order = await this.fastify.orderService.getOrderByReference(paymentReference);
            if (!order) {
                this.fastify.log.error(`Order not found for reference: ${paymentReference}`);
                return;
            }
            this.sendPaymentReceivedNotification(order.customerPhone, amountPaid, paymentReference)
                .catch(err => {
                    this.fastify.log.error(`Failed to send WhatsApp notification:`, err);
                });

            await this.fastify.serviceBus.sendMessage(ServiceBusQueues.PAYMENT_EVENTS, {
                eventType: 'SUCCESSFUL_TRANSACTION',
                transactionId: event.data.reference,
                paymentReference,
                amount: amountPaid,
                rawEvent: event,
                customerPhone: order.customerPhone
            });

            this.fastify.log.info(`Processed transaction ${paymentReference} for ${order.customerPhone}`);
        } catch (error) {
            this.fastify.log.error(`Error processing payment ${paymentReference}:`, error);
        }
    }

    private async sendPaymentReceivedNotification(
        phoneNumber: string,
        amount: number,
        reference: string
    ): Promise<void> {
        const message = PAYMENT_RECEIVED({
            to: phoneNumber,
            amount: amount.toString(),
            orderReference: reference
        });

        await this.fastify.serviceBus.sendMessage('whatsapp-notifications', message);
        this.fastify.log.info(`Queued WhatsApp notification for ${phoneNumber}`);
    }

    public async webhookHandler(
        request: FastifyRequest<{ Body: PaystackEvent }>,
        reply: FastifyReply
    ): Promise<void> {
        console.log('Webhook received:', request.body);
        try {
            // 1. IP Whitelisting
            const clientIp = request.ip ||
                (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
            // if (!this.isWhitelistedIp(clientIp)) {
            //     console.warn('Unauthorized IP attempt:', clientIp);
            //     throw AppException.Unauthorized('IP not whitelisted');
            // }

            // 2. Signature Validation
            const rawBody = request.rawBody!;
            if (!this.validateSignature(request, rawBody)) {
                throw AppException.Unauthorized('Invalid signature');
            }

            // 3. Parse and Validate Event
            const event = JSON.parse(rawBody.toString()) as PaystackEvent;
            if (!event.event || !event.data) {
                throw AppException.BadRequest('Invalid event structure');
            }

            // 4. Async Event Processing
            setImmediate(() => this.handleEvent(event));

            // 5. Immediate Response
            await reply.code(200).send({
                status: 'success',
                message: 'Webhook received'
            });

        } catch (error) {
            console.error('Webhook error:', error);

            if (error instanceof AppException) {
                await reply.code(error.statusCode).send({
                    error: error.message
                });
            } else {
                await reply.code(500).send({
                    error: 'Internal server error'
                });
            }
        }
    }
}