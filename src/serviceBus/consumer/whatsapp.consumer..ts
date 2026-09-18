import { FastifyInstance } from 'fastify';
import { WhatsAppService } from '../../services/whatsapp.service';

interface WhatsAppMessage {
    to: string;
    type: string;
    text?: { body: string };
    template?: any;
    _meta?: {
        attempt?: number;
        lastError?: string;
        nextRetryAt?: string;
    };
}

export class WhatsAppConsumer {
    private readonly queueName = 'whatsapp-notifications';
    private readonly deadLetterQueue = `${this.queueName}-deadletter`;
    private readonly maxAttempts = 3;
    private readonly retryDelays = [5000, 15000, 45000]; // 5s, 15s, 45s

    constructor(
        private readonly fastify: FastifyInstance,
        private readonly whatsappService: WhatsAppService
    ) { }

    async start() {
        await this.fastify.serviceBus.startConsumer<WhatsAppMessage>(
            this.queueName,
            async (message, context) => {
                await this.processMessage(message, context);
            },
            {
                maxConcurrent: 5,
            }
        );
        this.fastify.log.info(`WhatsApp consumer started for queue ${this.queueName}`);
    }

    private async processMessage(
        message: any,
        context: {
            complete: () => Promise<void>;
            deadLetter: (reason: string, description?: string) => Promise<void>;
            abandon: () => Promise<void>;
        }
    ) {
        const { to, _meta = { attempt: 0 } } = message;

        try {
            // Apply delay for retries
            if ((_meta.attempt ?? 0) > 0) {
                const delay = this.retryDelays[(_meta.attempt ?? 0) - 1] || 0;
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            const result = await this.whatsappService.sendMessage(message);

            this.fastify.log.info(`Successfully sent WhatsApp to ${to}`, {
                messageId: result?.id,
                attempt: _meta.attempt
            });

            await context.complete();
        } catch (error: any) {
            await this.handleError(message, error, context);
        }
    }

    private async handleError(
        message: WhatsAppMessage,
        error: Error,
        context: {
            deadLetter: (reason: string, description?: string) => Promise<void>;
            abandon: () => Promise<void>;
            complete: () => Promise<void>;
        }
    ) {
        const attempt = message._meta?.attempt || 0;
        const nextAttempt = attempt + 1;

        if (error && (error as any).code) {
            this.fastify.log.error(`Queue error: ${(error as any).code} - ${error.message}`);
        }

        if (nextAttempt >= this.maxAttempts) {
            await this.moveToDeadLetter(message, error, context);
        } else {
            await this.scheduleRetry(message, nextAttempt, error, context);
        }
    }

    private async moveToDeadLetter(
        message: WhatsAppMessage,
        error: Error,
        context: { deadLetter: (reason: string, description?: string) => Promise<void> }
    ) {
        try {
            await context.deadLetter(
                'MaxRetriesExceeded',
                JSON.stringify({
                    recipient: message.to,
                    error: error.message,
                    attempts: message._meta?.attempt || 0,
                    lastAttempt: new Date().toISOString()
                })
            );
            this.fastify.log.error(`Message to ${message.to} moved to dead-letter queue`);
        } catch (dlqError) {
            this.fastify.log.error(`Failed to move message to DLQ: ${dlqError instanceof Error ? dlqError.message : 'Unknown error'}`);
        }
    }

    private async scheduleRetry(
        message: WhatsAppMessage,
        nextAttempt: number,
        error: Error,
        context: { complete: () => Promise<void> }
    ) {
        const delay = this.retryDelays[nextAttempt - 1] || 60000;

        try {
            await this.fastify.serviceBus.sendMessage(
                this.queueName,
                {
                    ...message,
                    _meta: {
                        attempt: nextAttempt,
                        lastError: error.message,
                        nextRetryAt: new Date(Date.now() + delay).toISOString()
                    }
                },
                { delay }
            );

            await context.complete();
            this.fastify.log.warn(`Scheduled retry ${nextAttempt} for ${message.to} in ${delay}ms`);
        } catch (retryError) {
            this.fastify.log.error(`Failed to schedule retry: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
        }
    }

    async startDeadLetterConsumer() {
        await this.fastify.serviceBus.startConsumer(
            this.deadLetterQueue,
            async (message) => {
                this.fastify.log.error('Dead-letter message:', message);
                // Add your dead-letter handling logic here
            },
            { maxConcurrent: 1 }
        );
    }

    async close() {
        try {
            await this.fastify.serviceBus.close();
            this.fastify.log.info(`WhatsApp consumer stopped`);
        } catch (error) {
            this.fastify.log.error(`Error closing consumer: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}