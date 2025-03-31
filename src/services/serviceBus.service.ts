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
    private isInitialized = false;

    constructor(private readonly fastify: FastifyInstance) {
        this.initialize();
    }

    private initialize() {
        if (!env.SERVICE_BUS_CONNECTION_STRING) {
            this.fastify.log.warn('Service Bus connection string not configured');
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
            throw AppException.InternalServerError('Failed to initialize Service Bus');
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
        this.assertInitialized();

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
                this.fastify.log.error(
                    `Error in queue ${queueName}:`,
                    this.safeStringifyError(args.error)
                );

                if (isServiceBusError(args.error)) {
                    this.receivers.delete(queueName);
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