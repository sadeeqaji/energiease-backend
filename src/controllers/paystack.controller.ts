import { FastifyRequest, FastifyReply } from 'fastify';
import { PaystackConfig } from '@/config/paystack.config';
import { AppException } from '@/utils/appException.utils';
import crypto from 'crypto';
import { PaystackEvent, SuccessfulChargeEvent } from '@/types/paystack.types';
import orderService from '@/services/order.service';

export class PaystackWebhookController {
    private processedEvents = new Set<string>();

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

    private handleEvent(event: PaystackEvent): void {
        switch (event.event) {
            case 'charge.success': {
                const transactionReference = event.data.reference;
                if (this.processedEvents.has(transactionReference)) {
                    console.log('Duplicate transaction:', transactionReference);
                    return;
                }
                this.handleSuccessfulCharge(event as SuccessfulChargeEvent);
                this.processedEvents.add(transactionReference);
                break;
            }
            default:
                console.warn('Unhandled event type:', event.event);
        }
    }

    private async handleSuccessfulCharge(event: SuccessfulChargeEvent): Promise<void> {
        // Convert amount from kobo to Naira
        const amountPaid = event.data.amount / 100;
        // Extract payment reference from metadata (adjust based on your implementation)
        const paymentReference = event.data.metadata?.paymentReference || event.data.reference;

        const vendUnit = await orderService.confirmAndVendOrder(paymentReference, amountPaid);
        console.log('vendUnit', vendUnit);
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