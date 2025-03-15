import axios from 'axios';
import { MonnifyConfig } from '@/config/monnify.config';
import { AppException } from '@/utils/appException.utils';
import {
    BankTransferPayload,
    CardChargePayload,
    MonnifyInitTransactionPayload,
    MonnifyAccessToken
} from '@/types/monnify.types';



export class MonnifyService {
    private accessToken: MonnifyAccessToken | null = null;

    private async getAccessToken(): Promise<string> {
        if (this.accessToken && this.accessToken.tokenExpiry &&
            new Date() < this.accessToken.tokenExpiry) {
            return this.accessToken.accessToken;
        }

        try {
            const authString = Buffer.from(
                `${MonnifyConfig.apiKey}:${MonnifyConfig.clientSecret}`
            ).toString('base64');

            const response = await axios.post(
                `${MonnifyConfig.baseUrl}/api/v1/auth/login`,
                {},
                {
                    headers: {
                        Authorization: `Basic ${authString}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            this.accessToken = {
                accessToken: response.data.responseBody.accessToken,
                expiresIn: response.data.responseBody.expiresIn,
                tokenExpiry: new Date(Date.now() + (response.data.responseBody.expiresIn * 1000))
            };

            return this.accessToken.accessToken;

        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw AppException.InternalServerError(
                    error.response?.data?.responseMessage || 'Authentication failed',
                    error.response?.data?.responseCode
                );
            }
            throw AppException.InternalServerError('Authentication failed');
        }
    }

    private async _request(method: 'POST' | 'GET', endpoint: string, data?: any) {
        try {
            const token = await this.getAccessToken();

            return await axios({
                method,
                url: `${MonnifyConfig.baseUrl}${endpoint}`,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data,
                timeout: 15000
            });
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('[Monnify] API Error:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    endpoint
                });

                throw AppException.InternalServerError(
                    error.response?.data?.responseMessage || 'API request failed',
                    error.response?.data?.responseCode
                );
            }
            throw AppException.InternalServerError('API request failed');
        }
    }

    async initializeTransaction(payload: MonnifyInitTransactionPayload) {
        const requiredPayload = {
            ...payload,
            contractCode: MonnifyConfig.contractCode,
            currencyCode: payload.currencyCode || 'NGN',
            paymentMethods: ["CARD", "ACCOUNT_TRANSFER"],
        };
        const response = await this._request(
            'POST',
            '/api/v1/merchant/transactions/init-transaction',
            requiredPayload
        );
        return response.data.responseBody;
    }

    async generateBankTransfer(payload: BankTransferPayload) {
        const response = await this._request(
            'POST',
            '/api/v1/merchant/bank-transfer/init-payment',
            payload
        );
        return response.data.responseBody;
    }

    async chargeCard(payload: CardChargePayload) {
        const response = await this._request(
            'POST',
            '/api/v1/merchant/cards/charge',
            payload
        );

        return response.data.responseBody;
    }
}

export default new MonnifyService();