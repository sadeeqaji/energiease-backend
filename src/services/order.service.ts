import OrderModel from '@/models/order.model';
import { BuyPowerProvider } from './providers/buypower';
import buyPowerService from './buypower.service';
import telegramService from './telegram.service';
import { AppException } from '@/utils/appException.utils';
import { Order } from '@/types/order.types';
import { BillProvider, BillType, ElectricityDetails } from '@/types/bill.types';
import crypto from "crypto";
import { serviceFee } from '@/constants/serviceFee';
import { NotificationService } from './notification.service';
import { REDIS_PREFIXES } from '@/constants/redisPrefix';
import { FastifyInstance } from 'fastify';

interface CircuitBreakerState {
    failures: number;
    lastFailure: Date;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    nextAttempt: Date;
}

export class OrderService {
    // private providers: BillProvider[];
    // private readonly notifications: NotificationService;
    private circuitBreaker!: CircuitBreakerState;
    // private readonly fastify: FastifyInstance;

    private readonly circuitBreakerConfig = {
        failureThreshold: 3,      // After 3 failures, trip the circuit
        successThreshold: 2,     // Need 2 successes to close again
        openTimeout: 30000,      // Stay open for 30 seconds
    };

    constructor(
        private readonly fastify: FastifyInstance,
        private readonly providers: BillProvider[],
        private readonly notifications: NotificationService,
    ) {
        this.providers = [new BuyPowerProvider()].sort((a, b) => a.priority - b.priority);
        this.notifications = new NotificationService();
        this.fastify = fastify;
        this.resetCircuitBreaker();
    }

    private resetCircuitBreaker() {
        this.circuitBreaker = {
            failures: 0,
            lastFailure: new Date(0),
            state: 'CLOSED',
            nextAttempt: new Date(0),
        };
    }

    private trackFailure() {
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailure = new Date();

        if (this.circuitBreaker.failures >= this.circuitBreakerConfig.failureThreshold) {
            this.circuitBreaker.state = 'OPEN';
            this.circuitBreaker.nextAttempt = new Date(
                Date.now() + this.circuitBreakerConfig.openTimeout
            );
            console.warn('Circuit breaker tripped to OPEN state');
        }
    }

    private trackSuccess() {
        if (this.circuitBreaker.state === 'HALF_OPEN') {
            this.circuitBreaker.failures--;

            if (this.circuitBreaker.failures <= 0) {
                this.resetCircuitBreaker();
                this.fastify.log.info('Circuit breaker reset to CLOSED state');
            }
        }
    }

    private shouldAttemptRequest(): boolean {
        if (this.circuitBreaker.state === 'CLOSED') return true;

        const now = new Date();
        if (this.circuitBreaker.state === 'OPEN' &&
            now >= this.circuitBreaker.nextAttempt) {
            this.circuitBreaker.state = 'HALF_OPEN';
            this.fastify.log.info('Circuit breaker trying HALF_OPEN state');
            return true;
        }

        return false;
    }

    /**
     * Create a pending order before payment confirmation
     */
    async createOrder(orderData: {
        type: BillType;
        details: Record<string, any>;
        amount: number;
        customerPhone: string;
    }): Promise<Order> {
        try {
            const totalAmount = Number(orderData.amount) + Number(serviceFee);
            return OrderModel.create({
                ...orderData,
                amount: totalAmount,
                serviceFee,
                status: 'pending_payment',
                reference: this.generateOrderReference(),
                retries: 0,
                provider: 'none',
                providerResponse: {}
            });
        } catch (error) {
            throw this.handleServiceError(error);
        }
    }

    /**
     * Confirm payment and execute the vending process
     */
    async confirmAndVendOrder(reference: string, amount: number): Promise<Order | null> {
        try {
            const order = await OrderModel.findOne({ reference });
            if (!order) {
                throw AppException.NotFound('Order not found');
            }

            if (order.status !== 'pending_payment' && order.status !== 'processing') {
                throw AppException.BadRequest('Order already processed');
            }

            // Check circuit breaker state
            if (!this.shouldAttemptRequest()) {
                throw AppException.InternalServerError(
                    'Service temporarily unavailable due to high error rate',
                    { nextAttempt: this.circuitBreaker.nextAttempt }
                );
            }

            // Check provider reliability before vending
            const electricityDetails = order.details as any;
            const disco = electricityDetails?.disco;
            if (disco) {
                const reliability = await buyPowerService.getDiscoReliability(disco);
                if (!reliability.isOnline) {
                    this.fastify.log.warn({ reference, disco }, 'Provider is offline. Queuing order for provider recovery.');
                    return this.queueOrderForProviderRecovery(order, `${disco} is currently offline on the national network`);
                }
            }

            const supportedProviders = this.providers.filter(p =>
                p.supportedBillTypes.includes(order.type)
            );

            if (supportedProviders.length === 0) {
                return this.markOrderFailed(order, 'No providers available for this bill type');
            }

            let lastError: Error | null = null;

            for (const provider of supportedProviders) {
                try {
                    if (provider.validate) {
                        await provider.validate(order.details);
                    }

                    const providerAmount = amount - order.serviceFee;
                    const result = await provider.vend({
                        amount: providerAmount,
                        billType: order.type,
                        orderReference: order.reference,
                        details: order.details,
                        userInfo: { phone: order.customerPhone }
                    });

                    if (result.success) {
                        this.trackSuccess();
                        await this.handleMeterCreation(order);
                        return this.markOrderSuccess(order, provider.name, result.orderId, result);
                    }
                } catch (error: any) {
                    this.trackFailure();
                    lastError = error;
                    console.error(`[${provider.name}] Vending failed:`, error);

                    // In half-open state, a single failure should re-open the circuit
                    if (this.circuitBreaker.state === 'HALF_OPEN') {
                        this.circuitBreaker.state = 'OPEN';
                        this.circuitBreaker.nextAttempt = new Date(
                            Date.now() + this.circuitBreakerConfig.openTimeout
                        );
                        break;
                    }
                    order.provider = provider.name as 'buypower' | 'none' | 'vtpass';
                    return this.markOrderFailed(order, lastError?.message || 'All providers failed');

                }
            }

            return this.markOrderFailed(order, lastError?.message || 'All providers failed');
        } catch (error) {
            throw this.handleServiceError(error);
        }
    }

    private async handleMeterCreation(order: Order) {
        if (order.type !== BillType.ELECTRICITY) return;

        const electricityDetails = order.details as ElectricityDetails;
        const existingMeter = await this.fastify.meterService.getMeter(
            { phoneNumber: order.customerPhone }
        );

        if (!existingMeter) {
            await this.fastify.meterService.saveMeter({
                address: electricityDetails.meterAddress!,
                discoCode: electricityDetails.disco,
                meterNumber: electricityDetails.meterNumber,
                name: electricityDetails.meterName!,
                phoneNumber: order.customerPhone,
                user: order.user?.toString(),
                vendType: electricityDetails.vendType
            });
            console.log(`New meter saved: ${electricityDetails.meterNumber}`);
        }
    }

    /**
     * Get order by ID with population
     */
    async getOrderById(orderId: string): Promise<Order | null> {
        return this._getOrderQuery()
            .where({ _id: orderId })
            .exec();
    }

    /**
     * Get order by payment reference
     */
    async getOrderByReference(reference: string): Promise<Order | null> {
        // 1. Try Redis cache first
        const cacheKey = `${REDIS_PREFIXES.PAYMENT_CACHE}${reference}`;
        const cachedData = await this.fastify.redis.get(cacheKey);

        if (cachedData) {
            this.fastify.log.info(`Cache hit for order ${reference}`);
            return JSON.parse(cachedData);
        }

        // 2. Fallback to database
        this.fastify.log.info(`Cache miss for order ${reference}, querying DB`);
        const order = await this._getOrderQuery()
            .where({ reference })
            .exec();

        if (order) {
            // 3. Cache the result
            await this.fastify.redis.set(
                cacheKey,
                JSON.stringify(order),
                { ttl: 3600 } // Cache for 1 hour
            );
        }

        return order;
    }

    private _getOrderQuery() {
        return OrderModel
            .findOne()
            .populate('user', 'phone')
            .lean();
    }

    private async markOrderSuccess(order: Order, provider: string, providerOrderId?: string, vendData?: any): Promise<Order | null> {
        return OrderModel.findByIdAndUpdate(
            order._id,
            {
                status: 'success',
                provider,
                providerOrderId,
                requiresManualIntervention: false,
                fulfillmentFailureReason: undefined,
                paymentConfirmedAt: order.paymentConfirmedAt || new Date(),
                providerResponse: {
                    success: true,
                    token: vendData?.token,
                    units: vendData?.units,
                    amount: vendData?.amount,
                    orderId: providerOrderId,
                    ...(vendData?.raw || {}),
                },
                $inc: { retries: 0 }
            },
            { new: true }
        );
    }

    private async queueOrderForProviderRecovery(order: Order, reason: string): Promise<Order | null> {
        const electricityDetails = order.details as any;
        const meterNumber = electricityDetails?.meterNumber || 'your meter';
        const disco = electricityDetails?.disco || 'Provider';

        // Notify customer on WhatsApp that their order is securely queued
        if (order.customerPhone) {
            try {
                const { WhatsAppService } = await import('@/services/whatsapp.service');
                const cleanPhone = order.customerPhone.replace(/[^0-9]/g, '');

                await new WhatsAppService().sendMessage({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: cleanPhone,
                    type: 'text',
                    text: {
                        body:
                            `⚡ *Payment Received - Token Queued*\n\n` +
                            `We have confirmed your payment of *₦${order.amount.toLocaleString()}* for Meter *${meterNumber}* (${disco}).\n\n` +
                            `⚠️ *Notice:* ${disco}'s server is temporarily offline across all networks. Your order has been securely queued (Ref: \`${order.reference}\`).\n\n` +
                            `Our automated system will generate your token and deliver it directly to this chat the moment ${disco} comes back online.\n\n` +
                            `*You do not need to do anything or pay again.*`,
                    },
                });
            } catch (notifyErr: any) {
                this.fastify.log.warn({ notifyErr }, 'Could not send customer token queue notification');
            }
        }

        // Notify Ops on Telegram
        try {
            const alertMsg =
                `⏳ <b>Order Queued: Provider Offline</b>\n\n` +
                `📋 <b>Ref:</b> <code>${order.reference}</code>\n` +
                `🏢 <b>DISCO:</b> ${disco}\n` +
                `🔢 <b>Meter:</b> <code>${meterNumber}</code>\n` +
                `💰 <b>Amount:</b> ₦${order.amount.toLocaleString()}\n` +
                `📱 <b>Customer:</b> ${order.customerPhone}\n\n` +
                `<i>System will automatically retry and vend when ${disco} recovers.</i>`;
            await telegramService.sendAlert(alertMsg);
        } catch (tgErr: any) {
            this.fastify.log.warn({ tgErr }, 'Could not send telegram queue alert');
        }

        return OrderModel.findByIdAndUpdate(
            order._id,
            {
                status: 'processing',
                provider: 'none',
                requiresManualIntervention: false,
                fulfillmentFailureReason: `PROVIDER_OFFLINE: ${reason}`,
                paymentConfirmedAt: order.paymentConfirmedAt || new Date(),
                providerResponse: {
                    error: reason,
                    queuedForProviderRecovery: true,
                },
                $inc: { retries: 1 }
            },
            { new: true }
        );
    }

    private async markOrderFailed(order: Order, errorMessage: string): Promise<Order | null> {
        const isWalletOrProviderIssue =
            errorMessage.toLowerCase().includes('insufficient') ||
            errorMessage.toLowerCase().includes('wallet') ||
            errorMessage.toLowerCase().includes('balance') ||
            errorMessage.toLowerCase().includes('timeout') ||
            errorMessage.toLowerCase().includes('gateway') ||
            errorMessage.toLowerCase().includes('busy');

        const status = isWalletOrProviderIssue ? 'processing' : 'failed';

        this.fastify.log.warn(
            { reference: order.reference, errorMessage, isWalletOrProviderIssue },
            isWalletOrProviderIssue
                ? '⚠️ Vending delayed due to provider/wallet balance. Flagged for manual intervention/wallet top-up.'
                : '❌ Order vending failed permanently.'
        );

        const electricityDetails = order.details as any;
        const meterNumber = electricityDetails?.meterNumber || 'your meter';
        const disco = electricityDetails?.disco || '';

        // Notify customer on WhatsApp that payment is safely confirmed and token generation is queued
        if (isWalletOrProviderIssue && order.customerPhone) {
            try {
                const { WhatsAppService } = await import('@/services/whatsapp.service');
                const cleanPhone = order.customerPhone.replace(/[^0-9]/g, '');

                await new WhatsAppService().sendMessage({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: cleanPhone,
                    type: 'text',
                    text: {
                        body:
                            `⚡ *Payment Received - Token Generation in Progress*\n\n` +
                            `We have confirmed your payment of *₦${order.amount.toLocaleString()}* for Meter *${meterNumber}* (Ref: \`${order.reference}\`).\n\n` +
                            `⏳ Our system is currently finalizing token delivery with your distribution company. Your payment is 100% safe, and your token will be delivered right here in this chat shortly.\n\n` +
                            `*You do not need to make another payment.*`,
                    },
                });
            } catch (notifyErr: any) {
                this.fastify.log.warn({ notifyErr }, 'Could not send customer token delay notification');
            }
        }

        await this.notifications.vendFailure({
            reference: order.reference,
            amount: order.amount,
            error: new Error(errorMessage),
            provider: order.provider || 'none',
            metadata: {
                status,
                disco,
                meterNumber,
                customerPhone: order.customerPhone || 'N/A',
                requiresManualIntervention: String(isWalletOrProviderIssue),
            }
        });

        return OrderModel.findByIdAndUpdate(
            order._id,
            {
                status,
                provider: 'none',
                requiresManualIntervention: isWalletOrProviderIssue,
                fulfillmentFailureReason: errorMessage,
                paymentConfirmedAt: order.paymentConfirmedAt || new Date(),
                providerResponse: {
                    error: errorMessage,
                    requiresManualIntervention: isWalletOrProviderIssue,
                    stack: process.env.NODE_ENV === 'development' ? new Error().stack : undefined
                },
                $inc: { retries: 1 }
            },
            { new: true }
        );
    }

    /**
     * Get all orders that require manual fulfillment or wallet top-up retry
     */
    async getPendingFulfillmentOrders() {
        return OrderModel.find({
            $or: [
                { requiresManualIntervention: true },
                { status: 'processing', paymentConfirmedAt: { $exists: true } },
                { 'providerResponse.error': /insufficient|wallet|balance/i },
                { fulfillmentFailureReason: /insufficient|wallet|balance/i }
            ]
        }).sort({ createdAt: -1 });
    }

    /**
     * Retry vending an order after wallet top-up or operational resolution
     */
    async retryVendOrder(reference: string): Promise<{ success: boolean; message: string; order?: Order | null }> {
        const order = await OrderModel.findOne({ reference });
        if (!order) {
            return { success: false, message: `Order not found with reference: ${reference}` };
        }

        if (order.status === 'success') {
            return { success: false, message: `Order ${reference} is already completed successfully.` };
        }

        try {
            const updatedOrder = await this.confirmAndVendOrder(reference, order.amount);
            if (updatedOrder?.status === 'success') {
                return { success: true, message: `Successfully vended order ${reference}`, order: updatedOrder };
            }
            return {
                success: false,
                message: `Retry attempted but order is in status '${updatedOrder?.status}'. Error: ${updatedOrder?.fulfillmentFailureReason || 'Unknown error'}`,
                order: updatedOrder
            };
        } catch (err: any) {
            return { success: false, message: err?.message || 'Error during retry' };
        }
    }

    private generateOrderReference(): string {
        const timestamp = Date.now().toString().slice(-6);
        const randomString = crypto.randomBytes(3).toString("hex").toUpperCase();
        return `EE-${timestamp}-${randomString}`;
    }

    private handleServiceError(error: unknown): Error {
        if (error instanceof AppException) {
            return error;
        }

        console.error('Unexpected service error:', error);
        return AppException.InternalServerError('Internal server error');
    }

    // For monitoring purposes
    public getCircuitBreakerState() {
        return {
            state: this.circuitBreaker.state,
            failures: this.circuitBreaker.failures,
            lastFailure: this.circuitBreaker.lastFailure,
            nextAttempt: this.circuitBreaker.nextAttempt
        };
    }

    // For manual intervention
    public resetCircuitBreakerManually(): void {
        this.resetCircuitBreaker();
        this.fastify.log.info('Circuit breaker manually reset');
    }
}


// export const initializeOrderService = (fastify: FastifyInstance) => {
//     fastify.decorate('orderService', new OrderService(fastify));
// };

// export default new OrderService();