import { MonnifyService } from './monnify.service';
import { PaystackService } from './paystack.service';
import { MonnifyInitTransactionPayload } from '@/types/monnify.types';
import { PaystackInitTransactionPayload } from '@/types/paystack.types';
import { transformBankDetails } from '@/utils/payment';
import { BankDetails, PaymentProviders } from '@/types/payment.types';
import { makeValidURI } from '@/utils/url';
import { FastifyInstance } from 'fastify';

export class PaymentService {
    private paymentProviders: { name: PaymentProviders; service: MonnifyService | PaystackService; priority: number }[];
    private readonly fastify: FastifyInstance;

    constructor(fastify: FastifyInstance) {
        this.paymentProviders = [
            { name: 'Monnify' as PaymentProviders, service: fastify.monnifyService, priority: 1 },
            { name: 'Paystack' as PaymentProviders, service: fastify.paystackService, priority: 2 },
        ].sort((a, b) => a.priority - b.priority);
        this.fastify = fastify;

    }

    /**
     * Initialize payment with fallback mechanism
     */
    async initializePayment(order: {
        amount: number;
        reference: string;
    }): Promise<{ paymentUrl: string; provider: string, bankTransferDetails: BankDetails }> {
        let lastError: Error | null = null;

        for (const provider of this.paymentProviders) {
            try {
                let paymentResponse;
                let bankTransferDetails;

                if (provider.name === 'Monnify') {
                    const payload: MonnifyInitTransactionPayload = {
                        amount: order.amount,
                        customerName: 'Customer',
                        customerEmail: 'developer@mindcolony.tech',
                        paymentReference: order.reference,
                    };
                    paymentResponse = await this.fastify.monnifyService.initializeTransaction(payload)
                    if (paymentResponse.transactionReference) {
                        const generateBankResponse = await this.fastify.monnifyService.generateBankTransfer(
                            { transactionReference: paymentResponse.transactionReference }
                        )
                        bankTransferDetails = transformBankDetails('Monnify', generateBankResponse)

                    }

                } else if (provider.name === 'Paystack') {
                    const amount = (order.amount * 100).toString();
                    const payload: PaystackInitTransactionPayload = {
                        amount,
                        email: 'accounting@mindcolony.tech',
                        metadata: {
                            reference: order.reference,
                        }
                    };
                    paymentResponse = await this.fastify.paystackService.initializeTransaction(payload);
                    const generateBankResponse = await this.fastify.paystackService.generateBankTransfer(
                        {
                            amount,
                            email: 'accounting@mindcolony.tech',
                            metadata: {
                                reference: order.reference,
                            }
                        }
                    )
                    bankTransferDetails = transformBankDetails('Paystack', generateBankResponse)
                }
                if (paymentResponse && bankTransferDetails) {
                    return {
                        paymentUrl: paymentResponse.authorization_url || makeValidURI(paymentResponse.checkoutUrl),
                        provider: provider.name,
                        bankTransferDetails
                    };
                }
            } catch (error) {
                lastError = error as Error;
                console.error(`[${provider.name}] Payment initialization failed:`, error);
            }
        }
        throw lastError || new Error('All payment providers failed');
    }
}

