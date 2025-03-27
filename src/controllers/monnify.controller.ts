import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { MonnifyConfig } from '@/config/monnify.config';
import { AppException } from '@/utils/appException.utils';
import crypto from 'crypto';
import { MonnifyEvent, SuccessfulTransactionEvent } from '@/types/monnify.types';
import orderService from '@/services/order.service';
import { REDIS_PREFIXES } from '@/constants/redisPrefix';

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
        const key = `${REDIS_PREFIXES.IP_WHITELIST_PREFIX}monnify`;

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

    private async isEventProcessed(transactionId: string): Promise<boolean> {
        const key = `${REDIS_PREFIXES.WEBHOOK_PREFIX}${transactionId}`;
        return await this.fastify.redis.exists(key) === true;
    }

    private async markEventAsProcessed(transactionId: string): Promise<void> {
        const key = `${REDIS_PREFIXES.WEBHOOK_PREFIX}${transactionId}`;
        await this.fastify.redis.set(key, '1', { ttl: this.EVENT_TTL });
    }

    private async checkRequestRate(ip: string): Promise<boolean> {
        const rateLimitKey = `${REDIS_PREFIXES.RATE_LIMIT_PREFIX}${ip}`;
        const currentCount = await this.fastify.redis.incr(rateLimitKey);

        if (currentCount === 1) {
            await this.fastify.redis.expire(rateLimitKey, 60);
        }

        return currentCount <= this.RATE_LIMIT;
    }

    private async handleSuccessfulTransaction(event: SuccessfulTransactionEvent): Promise<void> {
        const cacheKey = `${REDIS_PREFIXES.WEBHOOK_EVENT_PREFIX}${event.eventData.paymentReference}`;

        // Check for existing successful processing
        const cachedResult = await this.fastify.redis.get(cacheKey);
        if (cachedResult) {
            this.fastify.log.info(`Skipping already processed transaction: ${event.eventData.paymentReference}`);
            return;
        }

        // Process the transaction
        const vendUnit = await orderService.confirmAndVendOrder(
            event.eventData.paymentReference,
            event.eventData.amountPaid
        );

        // Cache successful processing
        await this.fastify.redis.set(
            cacheKey,
            JSON.stringify({
                status: 'success',
                amount: event.eventData.amountPaid,
                timestamp: new Date().toISOString(),
                reference: event.eventData.paymentReference
            }),
            { ttl: this.EVENT_TTL }
        );

        this.fastify.log.info(`Successfully processed transaction: ${event.eventData.paymentReference}`);
    }

    private async handleEvent(event: MonnifyEvent): Promise<void> {
        switch (event.eventType) {
            case 'SUCCESSFUL_TRANSACTION': {
                const transactionId = event.eventData.transactionReference;

                if (await this.isEventProcessed(transactionId)) {
                    this.fastify.log.info(`Duplicate transaction skipped: ${transactionId}`);
                    return;
                }

                try {
                    await this.handleSuccessfulTransaction(event);
                    await this.markEventAsProcessed(transactionId);
                } catch (error) {
                    this.fastify.log.error(`Transaction processing failed: ${transactionId}`, error);
                    throw error; // Will be caught by the global handler
                }
                break;
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