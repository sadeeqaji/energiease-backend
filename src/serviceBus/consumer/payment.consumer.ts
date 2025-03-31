import { FastifyInstance } from "fastify";
import { isServiceBusError } from "@azure/service-bus";
// import orderService from "@/services/order.service";

interface PaymentMessage {
    paymentReference: string;
    amount: number;
    currency: string;
    _meta?: {
        attempt?: number;
        lastError?: string;
        nextRetryAt?: string;
    };
}

export class PaymentConsumer {
    private readonly queueName = 'payment-events';
    private readonly maxAttempts = 3;
    private readonly retryDelays = [5000, 15000, 45000];

    constructor(private readonly fastify: FastifyInstance) { }

    async start() {
        await this.fastify.serviceBus.startConsumer<PaymentMessage>(
            this.queueName,
            async (rawMessage, context) => {
                const parsedMessage: PaymentMessage = JSON.parse(rawMessage as unknown as string);
                await this.processMessage(parsedMessage, context);
            },
            { maxConcurrent: 3 }
        );
    }

    private async processMessage(
        message: PaymentMessage,
        context: {
            complete: () => Promise<void>;
            deadLetter: (reason: string, description?: string) => Promise<void>;
            abandon: () => Promise<void>;
        }
    ) {
        try {
            await this.handlePayment(message);
            await context.complete();
        } catch (error: any) {
            if (isServiceBusError(error)) {
                await this.handleServiceBusError(error);
            }
            await this.handleError(message, error, context);
        }
    }

    private async handleServiceBusError(error: Error & { code?: string }) {
        switch (error.code) {
            case 'MessageLockLost':
            case 'MessageNotFound':
            case 'MessageSizeExceeded':
            case 'MessagingEntityAlreadyExists':
                this.fastify.log.error(`Service Bus error (${error.code}): ${error.message}`);
                await this.fastify.serviceBus.startConsumer(
                    this.queueName,
                    this.processMessage.bind(this),
                    { maxConcurrent: 3 }
                );
                break;
            default:
                this.fastify.log.error(`Unhandled Service Bus error (${error.code}): ${error.message}`);
        }
    }

    private async handlePayment(message: PaymentMessage) {
        await this.fastify.orderService.confirmAndVendOrder(message.paymentReference, message.amount)
        this.fastify.log.info(`Processing payment ${message.paymentReference}`);
    }

    private async handleError(
        message: PaymentMessage,
        error: Error,
        context: {
            deadLetter: (reason: string, description?: string) => Promise<void>;
            abandon: () => Promise<void>;
        }
    ) {
        const attempt = message._meta?.attempt || 1;

        if (attempt >= this.maxAttempts) {
            await context.deadLetter(
                'MaxRetriesExceeded',
                JSON.stringify({
                    error: error.message,
                    stack: error.stack,
                    attempts: attempt,
                    paymentId: message.paymentReference
                })
            );
            this.fastify.log.error(`Payment ${message.paymentReference} dead-lettered after ${attempt} attempts`);
        } else {
            await this.scheduleRetry(message, attempt, error, { ...context, complete: async () => { } });
        }
    }

    private async scheduleRetry(
        message: PaymentMessage,
        attempt: number,
        error: Error,
        context: { abandon: () => Promise<void>, complete: () => Promise<void> }
    ) {
        try {
            const delay = this.retryDelays[attempt - 1] || 60000;
            await this.fastify.serviceBus.sendMessage(this.queueName, {
                ...message,
                _meta: {
                    attempt: attempt + 1,
                    lastError: error.message,
                    nextRetryAt: new Date(Date.now() + delay).toISOString()
                }
            }, { delay });

            await context.complete();
            this.fastify.log.info(`Scheduled retry ${attempt + 1} for payment ${message.paymentReference} in ${delay}ms`);
        } catch (retryError) {
            const errorMessage = retryError instanceof Error ? retryError.message : 'Unknown error';
            this.fastify.log.error(`Failed to schedule retry for payment ${message.paymentReference}: ${errorMessage}`);
            await context.abandon();
        }
    }

    async close(): Promise<void> {
        if (!this.fastify.serviceBus) return;
        try {
            await this.fastify.serviceBus.close();
            this.fastify.log.info(`Stopped consumer for ${this.queueName}`);
        } catch (error: any) {
            this.fastify.log.error(`Error closing consumer: ${error.message}`);
        }
    }
}