import OrderModel from '@/models/order.model';
import { BuyPowerProvider } from './providers/buypower';
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

            if (order.status !== 'pending_payment') {
                throw AppException.BadRequest('Order already processed');
            }

            // Check circuit breaker state
            if (!this.shouldAttemptRequest()) {
                throw AppException.InternalServerError(
                    'Service temporarily unavailable due to high error rate',
                    { nextAttempt: this.circuitBreaker.nextAttempt }
                );
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
                        return this.markOrderSuccess(order, provider.name, result.orderId);
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

    private async markOrderSuccess(order: Order, provider: string, providerOrderId?: string): Promise<Order | null> {
        return OrderModel.findByIdAndUpdate(
            order._id,
            {
                status: 'success',
                provider,
                providerOrderId,
                providerResponse: { success: true },
                $inc: { retries: 0 }
            },
            { new: true }
        );
    }

    private async markOrderFailed(order: Order, errorMessage: string): Promise<Order | null> {
        await this.notifications.vendFailure({
            reference: order.reference,
            amount: order.amount,
            error: new Error(errorMessage),
            provider: order.provider || 'none',
            metadata: {
                status: order.status,
            }
        });
        return OrderModel.findByIdAndUpdate(
            order._id,
            {
                status: 'failed',
                provider: 'none',
                providerResponse: {
                    error: errorMessage,
                    stack: process.env.NODE_ENV === 'development' ? new Error().stack : undefined
                },
                $inc: { retries: 1 }
            },
            { new: true }
        );
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