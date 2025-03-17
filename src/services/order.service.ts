import OrderModel from '@/models/order.model';
import { BuyPowerProvider } from './providers/buypower';
import { AppException } from '@/utils/appException.utils';
import { Order } from '@/types/order.types';
import { BillProvider, BillType, ElectricityDetails } from '@/types/bill.types';
import crypto from "crypto";
import { serviceCharge } from '@/constants/serviceCharge';
import meterService from './meter.service';

export class OrderService {
    private providers: BillProvider[];

    private _getOrderQuery() {
        return OrderModel
            .findOne()
            .populate('user', 'phone')
            .lean();
    }

    constructor() {
        this.providers = [
            new BuyPowerProvider(),
        ].sort((a, b) => a.priority - b.priority);
    }

    /**
     * Create a pending order before payment confirmation
     */
    async createOrder(orderData: {
        user: string;
        type: BillType;
        details: Record<string, any>;
        amount: number;
        customerPhone: string;
    }): Promise<Order> {
        try {
            const totalAmount = Number(orderData.amount) + serviceCharge;

            return OrderModel.create({
                ...orderData,
                amount: totalAmount,
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
        console.log(reference, 'reference')
        try {
            const order = await OrderModel.findOne({ reference });
            if (!order) {
                throw AppException.NotFound('Order not found');
            }

            if (order.status !== 'pending_payment') {
                throw AppException.BadRequest('Order already processed');
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
                    const result = await provider.vend({
                        amount,
                        billType: order.type,
                        orderReference: order.reference,
                        details: order.details,
                        userInfo: {
                            phone: order.customerPhone,
                        }
                    });
                    if (result.success) {
                        const existingMeter = await meterService.getMeter(
                            { phoneNumber: order?.customerPhone }
                        );

                        if (!existingMeter && order.type === BillType.ELECTRICITY) {
                            const electricityDetails = order.details as ElectricityDetails;

                            await meterService.saveMeter({
                                address: electricityDetails.meterAddress!,
                                discoCode: electricityDetails.disco,
                                meterNumber: electricityDetails.meterNumber,
                                name: electricityDetails.meterName!,
                                phoneNumber: order.customerPhone,
                                user: order?.user.toString(),
                                vendType: electricityDetails.vendType
                            });
                            console.log(`New meter saved: ${electricityDetails.meterNumber}`);
                        } else {
                            console.log(`Meter ${existingMeter?.meterNumber} already exists. Skipping save.`);
                        }
                        return this.markOrderSuccess(order, provider.name, result.orderId);

                    }
                } catch (error) {
                    lastError = error as Error;
                    console.error(`[${provider.name}] Vending failed:`, error);
                }
            }

            return this.markOrderFailed(order, lastError?.message || 'All providers failed');
        } catch (error) {
            throw this.handleServiceError(error);
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
        return this._getOrderQuery()
            .where({ reference })
            .exec();
    }

    // ... keep other methods (getOrders, retryFailedOrder, countOrders) the same ...

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
}

export default new OrderService();