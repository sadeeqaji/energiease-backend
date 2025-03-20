import { MonnifyConfig } from '@/config/monnify.config';
import monnifyService, { MonnifyService } from './monnify.service';
import paystackService, { PaystackService } from './paystack.service';
import { AppException } from '@/utils/appException.utils';
import { MonnifyInitTransactionPayload } from '@/types/monnify.types';
import { PaystackInitTransactionPayload } from '@/types/paystack.types';
import { transformBankDetails } from '@/utils/payment';
import { BankDetails, PaymentProviders } from '@/types/payment.types';
import { makeValidURI } from '@/utils/url';

export class PaymentService {
    private paymentProviders: { name: PaymentProviders; service: MonnifyService | PaystackService; priority: number }[];

    constructor() {
        this.paymentProviders = [
            { name: 'Monnify' as PaymentProviders, service: new MonnifyService(), priority: 2 },
            { name: 'Paystack' as PaymentProviders, service: new PaystackService(), priority: 1 },
        ].sort((a, b) => a.priority - b.priority);
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
                    paymentResponse = await monnifyService.initializeTransaction(payload)
                    if (paymentResponse.transactionReference) {
                        const generateBankResponse = await monnifyService.generateBankTransfer(
                            { transactionReference: paymentResponse.transactionReference }
                        )
                        bankTransferDetails = transformBankDetails('Monnify', generateBankResponse)

                    }

                } else if (provider.name === 'Paystack') {
                    const amount = (order.amount * 100).toString();
                    const payload: PaystackInitTransactionPayload = {
                        amount,
                        email: 'accounting@mindcolony.tech',
                        reference: order.reference,
                    };
                    paymentResponse = await paystackService.initializeTransaction(payload);
                    const generateBankResponse = await paystackService.generateBankTransfer(
                        {
                            amount,
                            email: 'accounting@mindcolony.tech',
                            reference: order.reference + '1',

                        }
                    )
                    console.log(generateBankResponse, 'generateBankResponse')
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

    /**
     * Verify payment using the provider
     */
    // async verifyPayment(reference: string, provider: string): Promise<boolean> {
    //     const paymentProvider = this.paymentProviders.find(p => p.name === provider);

    //     if (!paymentProvider) {
    //         throw AppException.BadRequest('Invalid payment provider');
    //     }

    //     try {
    //         if (paymentProvider.name === 'monnify') {
    //             const transaction = await paymentProvider.service.verifyTransaction(reference);
    //             return transaction.status === 'PAID';
    //         } else if (paymentProvider.name === 'paystack') {
    //             const transaction = await paymentProvider.service.verifyTransaction(reference);
    //             return transaction.status === 'success';
    //         }
    //     } catch (error) {
    //         console.error(`[${provider}] Payment verification failed:`, error);
    //         throw AppException.InternalServerError('Payment verification failed');
    //     }

    //     return false;
    // }
}

export default new PaymentService();