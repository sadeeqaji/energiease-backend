import {
    ServiceBusClient,
    ServiceBusSender,
    ServiceBusReceiver,
    ProcessErrorArgs,
    ServiceBusReceivedMessage,
    ServiceBusMessage,
    ServiceBusError,
    isServiceBusError
} from '@azure/service-bus';
import { env } from '@/config';
import { FastifyInstance } from 'fastify';
import { AppException } from '@/utils/appException.utils';

type MessageHandler<T = any> = (
    message: T,
    context: {
        complete: () => Promise<void>;
        deadLetter: (reason: string, errorDescription?: string) => Promise<void>;
        abandon: () => Promise<void>;
    }
) => Promise<void>;

export class ServiceBusService {
    public readonly supportsDelayedMessages = true;
    private client: ServiceBusClient | null = null;
    private senders: Map<string, ServiceBusSender> = new Map();
    private receivers: Map<string, ServiceBusReceiver> = new Map();
    public isInitialized = false;

    constructor(private readonly fastify: FastifyInstance) {
        this.initialize();
    }

    private initialize() {
        if (!env.SERVICE_BUS_CONNECTION_STRING) {
            this.fastify.log.info('Service Bus connection string not configured. Service Bus is disabled.');
            return;
        }

        try {
            this.client = new ServiceBusClient(env.SERVICE_BUS_CONNECTION_STRING, {
                retryOptions: {
                    maxRetries: 3,
                    retryDelayInMs: 1000
                }
            });
            this.isInitialized = true;
            this.fastify.log.info('Service Bus client initialized');
        } catch (error) {
            this.fastify.log.error('Failed to initialize Service Bus client:', this.safeStringifyError(error));
            this.isInitialized = false;
        }
    }

    private safeStringifyError(error: any): string {
        try {
            return JSON.stringify({
                name: error.name,
                message: error.message,
                code: (error as ServiceBusError).code,
                stack: error.stack
            });
        } catch {
            return `Non-serializable error: ${error.message}`;
        }
    }

    private assertInitialized() {
        if (!this.isInitialized || !this.client) {
            throw AppException.InternalServerError('Service Bus is not initialized');
        }
    }

    public async getReceiver(queueName: string): Promise<ServiceBusReceiver> {
        this.assertInitialized();

        if (!this.receivers.has(queueName)) {
            const receiver = this.client!.createReceiver(queueName, {
                receiveMode: 'peekLock',
                skipParsingBodyAsJson: true
            });
            this.receivers.set(queueName, receiver);
        }

        return this.receivers.get(queueName)!;
    }

    async getSender(queueName: string): Promise<ServiceBusSender> {
        this.assertInitialized();

        if (!this.senders.has(queueName)) {
            const sender = this.client!.createSender(queueName);
            this.senders.set(queueName, sender);
        }

        return this.senders.get(queueName)!;
    }

    async sendMessage<T>(
        queueName: string,
        message: T,
        options?: {
            delay?: number;
            messageId?: string;
            timeToLive?: number;
        }
    ): Promise<void> {
        if (!this.isInitialized || !this.client) {
            this.fastify.log.info(`Service Bus not initialized, skipping queue ${queueName} and running direct handling`);
            if (queueName === 'whatsapp-notifications') {
                try {
                    const { WhatsAppService } = await import('@/services/whatsapp.service');
                    const whatsappService = new WhatsAppService();
                    await whatsappService.sendMessage(message as Record<string, unknown>);
                } catch (fallbackErr: any) {
                    this.fastify.log.error('Direct WhatsApp fallback error:', fallbackErr.message);
                }
            } else if (queueName === 'payment-events') {
                try {
                    const payload = message as any;
                    if (payload.paymentReference && payload.amount) {
                        this.fastify.log.info(`Direct Payment fallback: Confirming and vending order for ${payload.paymentReference}`);
                        await this.fastify.orderService.confirmAndVendOrder(payload.paymentReference, payload.amount);
                    }
                } catch (fallbackErr: any) {
                    this.fastify.log.error('Direct Payment fallback error:', fallbackErr.message);
                }
            }
            return;
        }

        const sender = await this.getSender(queueName);

        try {
            const serviceBusMessage: ServiceBusMessage = {
                body: message,
                contentType: 'application/json',
                messageId: options?.messageId,
                timeToLive: options?.timeToLive
            };

            if (options?.delay) {
                const scheduleTime = new Date(Date.now() + options.delay);
                await sender.scheduleMessages(serviceBusMessage, scheduleTime);
            } else {
                await sender.sendMessages(serviceBusMessage);
            }
        } catch (error: any) {
            this.fastify.log.error(`Failed to send message to ${queueName}:`, this.safeStringifyError(error));
            if (queueName === 'whatsapp-notifications') {
                try {
                    const { WhatsAppService } = await import('@/services/whatsapp.service');
                    const whatsappService = new WhatsAppService();
                    this.fastify.log.info('Fallback: Sending WhatsApp message directly via Cloud API...');
                    await whatsappService.sendMessage(message as Record<string, unknown>);
                    return;
                } catch (fallbackErr: any) {
                    this.fastify.log.error('Direct WhatsApp fallback error:', fallbackErr.message);
                }
            } else if (queueName === 'payment-events') {
                try {
                    const payload = message as any;
                    if (payload.paymentReference && payload.amount) {
                        this.fastify.log.info(`Fallback: Confirming and vending order for ${payload.paymentReference}`);
                        await this.fastify.orderService.confirmAndVendOrder(payload.paymentReference, payload.amount);
                        return;
                    }
                } catch (fallbackErr: any) {
                    this.fastify.log.error('Direct Payment fallback error:', fallbackErr.message);
                }
            }
            throw AppException.InternalServerError(`Failed to send message: ${error.message}`);
        }
    }

    async startConsumer<T>(
        queueName: string,
        handler: MessageHandler<T>,
        options: {
            maxConcurrent?: number;
        } = { maxConcurrent: 1 }
    ) {
        if (!this.isInitialized || !this.client) {
            this.fastify.log.info(`Service Bus not initialized, skipping consumer for ${queueName}`);
            return;
        }

        if (this.receivers.has(queueName)) {
            this.fastify.log.warn(`Consumer for ${queueName} already exists`);
            return;
        }

        const receiver = this.client!.createReceiver(queueName, {
            receiveMode: 'peekLock',
            skipParsingBodyAsJson: true
        });

        this.receivers.set(queueName, receiver);

        receiver.subscribe({
            processMessage: async (message) => {
                try {
                    await handler(message.body as T, {
                        complete: () => receiver.completeMessage(message),
                        deadLetter: (reason, errorDescription) =>
                            receiver.deadLetterMessage(message, {
                                deadLetterReason: reason,
                                deadLetterErrorDescription: errorDescription ?? ''
                            }),
                        abandon: () => receiver.abandonMessage(message)
                    });
                } catch (error) {
                    this.fastify.log.error(
                        `Message processing failed for ${message.messageId}:`,
                        this.safeStringifyError(error)
                    );
                    await receiver.abandonMessage(message);
                }
            },
            // Update the processError handler in startConsumer:
            processError: async (args: ProcessErrorArgs) => {
                if (env.NODE_ENV === 'development') {
                    const now = Date.now();
                    const lastLog = (this as any)[`lastErr_${queueName}`] || 0;
                    if (now - lastLog > 60000) {
                        (this as any)[`lastErr_${queueName}`] = now;
                        this.fastify.log.warn(`Service Bus queue "${queueName}" unavailable in local dev: ${args.error.message || 'Connection error'} (suppressing repeats)`);
                    }
                    return;
                }

                this.fastify.log.error(
                    `Error in queue ${queueName}:`,
                    this.safeStringifyError(args.error)
                );

                if (isServiceBusError(args.error)) {
                    this.receivers.delete(queueName);
                    await new Promise(resolve => setTimeout(resolve, 30000));
                    await this.startConsumer(queueName, handler, options);
                }
            }

        }, { maxConcurrentCalls: options.maxConcurrent });

        this.fastify.log.info(`Started consumer for ${queueName}`);
    }

    async close(): Promise<void> {
        if (!this.isInitialized || !this.client) return;

        try {
            await Promise.all([
                ...Array.from(this.receivers.values()).map(r => r.close()),
                ...Array.from(this.senders.values()).map(s => s.close())
            ]);

            await this.client.close();

            this.receivers.clear();
            this.senders.clear();
            this.isInitialized = false;
            this.client = null;

            this.fastify.log.info('Service Bus connection closed');
        } catch (error) {
            this.fastify.log.error('Error closing Service Bus:', this.safeStringifyError(error));
        }
    }
}