import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { MonnifyConfig } from '@/config/monnify.config';
import { AppException } from '@/utils/appException.utils';
import crypto from 'crypto';
import { MonnifyEvent, SuccessfulTransactionEvent } from '@/types/monnify.types';
import { REDIS_PREFIXES } from '@/constants/redisPrefix';
import { ServiceBusQueues } from '@/constants/serviceBus';
import { PAYMENT_RECEIVED } from '@/constants/whatsapp.flow';

export class MonnifyWebhookController {
    private readonly MONNIFY_IPS = ['35.242.133.146'];
    private readonly RATE_LIMIT = 30;
    private readonly EVENT_TTL = 86400;

    constructor(private readonly fastify: FastifyInstance) { }

    private validateSignature(request: FastifyRequest, rawBody: string | Buffer): boolean {
        const signature = request.headers['monnify-signature'] as string;
        if (!signature) {
            this.fastify.log.warn('Missing Monnify signature header');
            return false;
        }

        const computedHash = crypto
            .createHmac('sha512', MonnifyConfig.clientSecret)
            .update(rawBody)
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(computedHash),
            Buffer.from(signature)
        );
    }

    private async isWhitelistedIp(ip: string): Promise<boolean> {
        const key = `${REDIS_PREFIXES.IP_WHITELIST}monnify`;

        // Try to get from cache first
        const cachedIps = await this.fastify.redis.get(key);
        if (cachedIps) {
            return JSON.parse(cachedIps).includes(ip);
        }

        // Cache the IP list with TTL
        await this.fastify.redis.set(
            key,
            JSON.stringify(this.MONNIFY_IPS),
            { ttl: 3600 } // 1 hour cache
        );

        return this.MONNIFY_IPS.includes(ip);
    }

    private async acquireWebhookLock(transactionId: string): Promise<boolean> {
        const key = `${REDIS_PREFIXES.WEBHOOK}${transactionId}`;
        const acquired = await this.fastify.redis.set(key, '1', { ttl: this.EVENT_TTL, nx: true });
        return acquired !== null;
    }

    private async checkRequestRate(ip: string): Promise<boolean> {
        const rateLimitKey = `${REDIS_PREFIXES.RATE_LIMIT}${ip}`;
        const currentCount = await this.fastify.redis.incr(rateLimitKey);

        if (currentCount === 1) {
            await this.fastify.redis.expire(rateLimitKey, 60);
        }

        return currentCount <= this.RATE_LIMIT;
    }

    private async handleSuccessfulTransaction(event: SuccessfulTransactionEvent): Promise<void> {
        const paymentReference = event.eventData.paymentReference
        const amountPaid = event.eventData.amountPaid

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
                transactionId: event.eventData.transactionReference,
                paymentReference: event.eventData.paymentReference,
                amount: event.eventData.amountPaid,
                rawEvent: event
            });

            this.fastify.log.info(`Processed transaction ${paymentReference} for ${order.customerPhone}`);
        } catch (error) {
            this.fastify.log.error(`Error processing payment ${paymentReference}:`, error);
        }






        this.fastify.log.info(`Successfully processed transaction: ${event.eventData.paymentReference}`);
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

    private async handleEvent(event: MonnifyEvent): Promise<void> {
        console.log(event, 'event received');
        switch (event.eventType) {
            case 'SUCCESSFUL_TRANSACTION': {
                const transactionId = event.eventData.transactionReference;

                const isNewEvent = await this.acquireWebhookLock(transactionId);
                if (!isNewEvent) {
                    this.fastify.log.info(`Duplicate transaction skipped (already processing/processed): ${transactionId}`);
                    return;
                }

                try {
                    await this.handleSuccessfulTransaction(event);
                } catch (error) {
                    this.fastify.log.error(`Transaction processing failed: ${transactionId}`, error);
                    throw error; // Will be caught by the global handler
                }
                break;
            }
            case 'MANDATE_UPDATE': {
                await this.fastify.userService.update(
                    { 'mandates.mandateReference': event.eventData.externalMandateReference },
                    {
                        $set: {
                            'mandates.$[elem].status': event.eventData.mandateStatus.toLowerCase(),
                            'mandates.$[elem].expiryDate': new Date(event.eventData.endDate),
                            'mandates.$[elem].updatedAt': new Date()
                        }
                    },
                    {
                        arrayFilters: [{ 'elem.mandateCode': event.eventData.mandateCode }],
                        returnDocument: 'after'
                    } as any
                );


            }

            default:
                this.fastify.log.warn(`Unhandled event type received: ${event.eventType}`);
        }
    }

    public async webhookHandler(
        request: FastifyRequest<{ Body: MonnifyEvent }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            // 1. IP Whitelist Verification
            const clientIp = request.ip || (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
            // if (!await this.isWhitelistedIp(clientIp)) {
            //     this.fastify.log.warn(`Unauthorized IP attempt: ${clientIp}`);
            //     throw AppException.Unauthorized('IP not whitelisted');
            // }

            // 2. Rate Limiting
            // if (!await this.checkRequestRate(clientIp)) {
            //     this.fastify.log.warn(`Rate limit exceeded for IP: ${clientIp}`);
            //     throw AppException.BadRequest('Too many requests');
            // }

            // 3. Signature Validation
            const rawBody = request.rawBody!;
            if (!this.validateSignature(request, rawBody)) {
                this.fastify.log.warn('Invalid signature received');
                throw AppException.Unauthorized('Invalid signature');
            }

            // 4. Event Validation
            const event = JSON.parse(rawBody.toString()) as MonnifyEvent;
            if (!event.eventType || !event.eventData) {
                this.fastify.log.warn('Invalid event structure received');
                throw AppException.BadRequest('Invalid event structure');
            }

            // 5. Async Processing (fire-and-forget)
            setImmediate(() => {
                this.handleEvent(event)
                    .catch(error => this.fastify.log.error('Async processing failed:', error));
            });

            // 6. Immediate Success Response
            await reply.code(200).send({
                status: 'success',
                message: 'Webhook received and processing'
            });

        } catch (error) {
            this.fastify.log.error('Webhook processing error:', error);

            if (error instanceof AppException) {
                await reply.code(error.statusCode).send({
                    error: error.message,
                    code: error.statusCode
                });
            } else {
                await reply.code(500).send({
                    error: 'Internal server error',
                    code: 'INTERNAL_ERROR'
                });
            }
        }
    }
}