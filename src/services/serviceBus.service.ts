import { ServiceBusClient, ServiceBusSender } from '@azure/service-bus';
import { env } from '@/config';
import { FastifyInstance } from 'fastify';
import { AppException } from '@/utils/appException.utils';

export class ServiceBusService {
    private client: ServiceBusClient | null = null;
    private senders: Map<string, ServiceBusSender> = new Map();
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
            this.client = new ServiceBusClient(env.SERVICE_BUS_CONNECTION_STRING);
            this.isInitialized = true;
            this.fastify.log.info('Service Bus client initialized');
        } catch (error) {
            this.fastify.log.error('Failed to initialize Service Bus client:', error);
        }
    }

    private assertInitialized() {
        if (!this.isInitialized || !this.client) {
            throw AppException.InternalServerError('Service Bus is not initialized');
        }
    }

    async getSender(queueOrTopicName: string): Promise<ServiceBusSender> {
        this.assertInitialized();

        if (!this.senders.has(queueOrTopicName)) {
            const sender = this.client!.createSender(queueOrTopicName);
            this.senders.set(queueOrTopicName, sender);
        }
        return this.senders.get(queueOrTopicName)!;
    }

    async sendMessage(queueOrTopicName: string, message: any): Promise<void> {
        try {
            this.assertInitialized();

            const sender = await this.getSender(queueOrTopicName);
            await sender.sendMessages({
                body: message,
                contentType: 'application/json'
            });
            this.fastify.log.debug(`Message sent to ${queueOrTopicName}`);
        } catch (error) {
            this.fastify.log.error(`Failed to send message to ${queueOrTopicName}:`, error);
            throw AppException.InternalServerError(`Failed to send Service Bus message to ${queueOrTopicName}`);
        }
    }

    async close(): Promise<void> {
        if (!this.isInitialized || !this.client) return;

        try {
            await Promise.all(
                Array.from(this.senders.values()).map(sender => sender.close())
            );
            await this.client.close();
            this.senders.clear();
            this.isInitialized = false;
            this.client = null;
            this.fastify.log.info('Service Bus connection closed');
        } catch (error) {
            this.fastify.log.error('Error closing Service Bus connection:', error);
        }
    }
}