import { FastifyRequest, FastifyReply } from 'fastify';
import { MonnifyConfig } from '@/config/monnify.config';
import { AppException } from '@/utils/appException.utils';
import crypto from 'crypto';
import { MonnifyEvent, SuccessfulTransactionEvent } from '@/types/monnify.types';
import orderService from '@/services/order.service';



export class MonnifyWebhookController {
    private processedEvents = new Set<string>();

    private validateSignature(request: FastifyRequest, rawBody: string | Buffer<ArrayBufferLike>
    ): boolean {
        const signature = request.headers['monnify-signature'] as string;
        if (!signature) return false;

        const computedHash = crypto
            .createHmac('sha512', MonnifyConfig.clientSecret)
            .update(rawBody)
            .digest('hex');

        return computedHash === signature;
    }

    private isWhitelistedIp(ip: string): boolean {
        const monnifyIps = [
            '52.31.139.75',
            '52.49.173.169',
            '52.214.14.220'
        ];
        return monnifyIps.includes(ip);
    }

    private handleEvent(event: MonnifyEvent): void {
        switch (event.eventType) {
            case 'SUCCESSFUL_TRANSACTION': {
                const transactionId = event.eventData.transactionReference;
                if (this.processedEvents.has(transactionId)) {
                    console.log('Duplicate transaction:', transactionId);
                    return;
                }
                this.handleSuccessfulTransaction(event);
                this.processedEvents.add(transactionId);
                break;
            }
            default:
                console.warn('Unhandled event type:', event.eventType);
        }
    }

    private async handleSuccessfulTransaction(event: SuccessfulTransactionEvent): Promise<void> {
        const vendUnit = await orderService.confirmAndVendOrder(event.eventData.paymentReference, event.eventData.amountPaid)
        console.log('vendUnit', vendUnit);
    }




    public async webhookHandler(
        request: FastifyRequest<{ Body: MonnifyEvent }>,
        reply: FastifyReply
    ): Promise<void> {
        console.log('Webhook received:', request.body);
        try {
            // 1. IP Whitelisting
            // const clientIp = request.ip ||
            //     (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
            // if (!this.isWhitelistedIp(clientIp)) {
            //     console.warn('Unauthorized IP attempt:', clientIp);
            //     throw AppException.Unauthorized('IP not whitelisted');
            // }

            const rawBody = request.rawBody!;
            if (!this.validateSignature(request, rawBody)) {
                throw AppException.Unauthorized('Invalid signature');
            }

            const event = JSON.parse(rawBody.toString()) as MonnifyEvent;
            if (!event.eventType || !event.eventData) {
                throw AppException.BadRequest('Invalid event structure');
            }

            setImmediate(() => this.handleEvent(event));

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
            } else if (error instanceof Error) {
                await reply.code(500).send({
                    error: 'Internal server error'
                });
            }
        }
    }
}