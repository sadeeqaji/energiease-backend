import axios from 'axios';
import { PaystackConfig } from '@/config/paystack.config';
import { AppException } from '@/utils/appException.utils';
import {
    PaystackInitTransactionPayload,
    BankTransferPayload,
    CardChargePayload
} from '@/types/paystack.types';
import { expiresIn30Minutes } from '@/utils/time';

export class PaystackService {
    private async _request(method: 'POST' | 'GET', endpoint: string, data?: any) {
        try {
            return await axios({
                method,
                url: `${PaystackConfig.baseUrl}${endpoint}`,
                headers: {
                    Authorization: `Bearer ${PaystackConfig.secretKey}`,
                    'Content-Type': 'application/json'
                },
                data,
                timeout: 15000
            });
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('[Paystack] API Error:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    endpoint
                });

                throw AppException.InternalServerError(
                    error.response?.data?.message || 'API request failed',
                    error.response?.data?.status
                );
            }
            throw AppException.InternalServerError('API request failed');
        }
    }

    async initializeTransaction(payload: PaystackInitTransactionPayload) {
        const response = await this._request(
            'POST',
            '/transaction/initialize',
            payload
        );
        return response.data.data;
    }

    async chargeCard(payload: CardChargePayload) {
        const response = await this._request(
            'POST',
            '/charge',
            payload
        );
        return response.data.data;
    }

    async generateBankTransfer(payload: BankTransferPayload) {
        const response = await this._request(
            'POST',
            '/charge',
            {
                ...payload,
                bank_transfer: {
                    account_expires_at: expiresIn30Minutes()
                }
            }
        );
        return response.data.data;
    }
}

export default new PaystackService();