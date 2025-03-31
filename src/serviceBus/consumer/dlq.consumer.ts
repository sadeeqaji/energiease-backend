import { FastifyInstance } from 'fastify';
import { NotificationService } from '@/services/notification.service';
import { ServiceBusQueues } from '@/constants/serviceBus';

export class DLQConsumer {
    constructor(
        private readonly fastify: FastifyInstance & {
            notifications: NotificationService;
            db: any; // Your database client
        }
    ) { }

    async start() {
        await this.fastify.serviceBus.startConsumer(
            'payment-dead-letter-queue',
            this.processDLQMessage.bind(this),
            { maxConcurrent: 1 } // Process sequentially
        );
    }

    private async processDLQMessage(message: any) {
        this.fastify.log.error('Processing DLQ message', {
            reference: message.originalMessage.paymentReference,
            error: message.errorDetails.message
        });

        // 1. Store for manual review
        await this.fastify.db.collection('failed_payments').insertOne({
            ...message,
            status: 'requires_manual_intervention',
            receivedAt: new Date()
        });

        // 2. Attempt automated recovery for network errors
        if (this.isRecoverable(message.errorDetails)) {
            await this.attemptRecovery(message.originalMessage);
        }
    }

    private isRecoverable(error: any): boolean {
        const recoverableErrors = [
            'ECONNRESET', 'ETIMEDOUT',
            'ENOTFOUND', '429', '503', '504'
        ];
        return recoverableErrors.some(e =>
            error.code?.includes(e) ||
            error.message?.includes(e)
        );
    }

    private async attemptRecovery(message: any) {
        try {
            const retryMessage = {
                ...message,
                _meta: { attempt: 0 }
            };

            await this.fastify.serviceBus.sendMessage(
                ServiceBusQueues.PAYMENT_EVENTS,
                retryMessage
            );

            this.fastify.log.info(`Requeued ${message.paymentReference} for recovery`);
        } catch (err) {
            this.fastify.log.error('Recovery failed', err);
        }
    }
}