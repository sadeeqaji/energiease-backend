import axios from 'axios';
import https from 'https';
import { MonnifyConfig } from '@/config/monnify.config';

const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 30000,
});
import { AppException } from '@/utils/appException.utils';
import {
    BankTransferPayload,
    CardChargePayload,
    MonnifyInitTransactionPayload,
    MonnifyAccessToken,
    Bank,
    AccountValidationResponse,
    DirectDebitMandateResponse,
    DirectDebitMandatePayload
} from '@/types/monnify.types';
import { FastifyInstance } from 'fastify';
import { REDIS_PREFIXES } from '@/constants/redisPrefix';
import { popular_bank_codes } from '@/constants/popularBank';

export class MonnifyService {
    private accessToken: MonnifyAccessToken | null = null;
    private readonly fastify: FastifyInstance;
    private readonly BANK_CACHE_TTL = 24 * 60 * 60;
    private readonly TOKEN_CACHE_KEY = 'monnify:accessToken';

    constructor(fastify: FastifyInstance) {
        this.fastify = fastify;
    }

    private async getAccessToken(): Promise<string> {
        try {
            const cachedToken = await this.fastify.redis.get(this.TOKEN_CACHE_KEY);
            if (cachedToken) {
                this.accessToken = {
                    accessToken: cachedToken,
                    expiresIn: 3600,
                    tokenExpiry: new Date(Date.now() + 3600 * 1000)
                };
                return cachedToken;
            }
        } catch (error) {
            this.fastify.log.error('Failed to get token from Redis cache:', error);
        }

        // If no valid cached token, fetch a new one
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
                    timeout: 10000,
                    httpsAgent,
                }
            );

            this.accessToken = {
                accessToken: response.data.responseBody.accessToken,
                expiresIn: response.data.responseBody.expiresIn,
                tokenExpiry: new Date(Date.now() + (response.data.responseBody.expiresIn * 1000))
            };

            // Cache the token in Redis with a slightly shorter TTL than actual expiry
            try {
                await this.fastify.redis.set(
                    this.TOKEN_CACHE_KEY,
                    this.accessToken.accessToken,
                    { ttl: response.data.responseBody.expiresIn - 60 } // 1 minute less than expiry
                );
            } catch (error) {
                this.fastify.log.error('Failed to cache token in Redis:', error);
            }

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
                timeout: 15000,
                httpsAgent,
            });
        } catch (error) {
            if (axios.isAxiosError(error)) {
                this.fastify.log.error('[Monnify] API Error:', {
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

    async getBanks(forceRefresh = false): Promise<Bank[]> {
        // Try to get from Redis cache first if not forcing refresh
        if (!forceRefresh) {
            try {
                const cachedBanks = await this.fastify.redis.get(REDIS_PREFIXES.BANK_LIST_CACHE_KEY);
                if (cachedBanks) {
                    return JSON.parse(cachedBanks) as Bank[];
                }
            } catch (error) {
                this.fastify.log.error('Failed to get banks from Redis cache:', error);
            }
        }

        try {
            const token = await this.getAccessToken();
            const response = await axios.get(`${MonnifyConfig.baseUrl}/api/v1/banks`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json'
                },
                timeout: 10000
            });

            const banks = response.data.responseBody as Bank[];

            try {
                await this.fastify.redis.set(
                    REDIS_PREFIXES.BANK_LIST_CACHE_KEY,
                    JSON.stringify(banks),
                    { ttl: this.BANK_CACHE_TTL }
                );
            } catch (error) {
                this.fastify.log.error('Failed to cache banks in Redis:', error);
            }

            return banks;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                this.fastify.log.error('[Monnify] Bank List Error:', {
                    status: error.response?.status,
                    data: error.response?.data
                });

                // If we failed to fetch fresh data but have stale cache, return that
                if (!forceRefresh) {
                    try {
                        const cachedBanks = await this.fastify.redis.get(REDIS_PREFIXES.BANK_LIST_CACHE_KEY);
                        if (cachedBanks) {
                            this.fastify.log.warn('Returning stale bank list from cache');
                            return JSON.parse(cachedBanks) as Bank[];
                        }
                    } catch (cacheError) {
                        this.fastify.log.error('Failed to get stale banks from cache:', cacheError);
                    }
                }

                throw AppException.InternalServerError(
                    error.response?.data?.responseMessage || 'Failed to fetch banks',
                    error.response?.data?.responseCode
                );
            }

            throw AppException.InternalServerError('Failed to fetch banks');
        }
    }

    async getPopularBanks(forceRefresh = false): Promise<{ id: string, title: string }[]> {
        const allBanks = await this.getBanks(forceRefresh);

        return allBanks
            .filter(bank => popular_bank_codes.includes(bank.code))
            .map(bank => ({
                id: bank.code,
                title: bank.name
            }));
    }

    /**
     * Validate a bank account number
     * @param accountNumber The account number to validate
     * @param bankCode The bank code for the account
     * @returns Account validation response containing account details
     */
    async validateBankAccount(
        accountNumber: string,
        bankCode: string
    ): Promise<AccountValidationResponse> {
        try {
            const response = await this._request(
                'GET',
                `/api/v1/disbursements/account/validate?accountNumber=${accountNumber}&bankCode=${bankCode}`
            );
            return response.data.responseBody;
        } catch (error: any) {
            console.log(error);
            if (axios.isAxiosError(error)) {
                this.fastify.log.error('[Monnify] Account Validation Error:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    accountNumber,
                    bankCode
                });

                throw AppException.InternalServerError(
                    error.response?.data?.responseMessage || 'Account validation failed',
                    error.response?.data?.responseCode
                );
            }
            throw AppException.InternalServerError('Account validation failed');
        }
    }


    /**
     * Create a direct debit mandate
     * @param payload The direct debit mandate creation payload
     * @returns Response containing mandate details
     */
    async createDirectDebitMandate(
        payload: DirectDebitMandatePayload
    ): Promise<DirectDebitMandateResponse> {
        try {
            // Add contract code from config if not provided
            const requestPayload = {
                ...payload,
                contractCode: payload.contractCode || MonnifyConfig.contractCode
            };

            const response = await this._request(
                'POST',
                '/api/v1/direct-debit/mandate/create',
                requestPayload
            );

            return response.data.responseBody;
        } catch (error) {
            console.log(error, 'error direct-debit');
            if (axios.isAxiosError(error)) {
                this.fastify.log.error('[Monnify] Direct Debit Mandate Creation Error:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    payload
                });

                throw AppException.InternalServerError(
                    error.response?.data?.responseMessage || 'Direct debit mandate creation failed',
                    error.response?.data?.responseCode
                );
            }
            throw AppException.InternalServerError('Direct debit mandate creation failed');
        }
    }

    async getBankByCode(code: string): Promise<Bank | undefined> {
        const banks = await this.getBanks();
        return banks.find(bank => bank.code === code);
    }

    /**
 * Get the status of a direct debit mandate
 * @param mandateReference The unique reference for the mandate
 * @returns Response containing mandate status details
 */
    async getDirectDebitMandateStatus(
        mandateReference: string
    ): Promise<DirectDebitMandateResponse> {
        try {
            const response = await this._request(
                'GET',
                `/api/v1/direct-debit/mandate/?mandateReferences=${mandateReference}`
            );
            return response.data.responseBody;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                this.fastify.log.error('[Monnify] Direct Debit Mandate Status Error:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    mandateReference
                });

                throw AppException.InternalServerError(
                    error.response?.data?.responseMessage || 'Failed to get mandate status',
                    error.response?.data?.responseCode
                );
            }
            throw AppException.InternalServerError('Failed to get mandate status');
        }
    }

    async chargeDirectDebitMandate(params: {
        paymentReference: string;
        mandateCode: string;
        amount: number;
        customerEmail: string;
        description: string;
    }): Promise<{
        status: string;
        amount: number;
        transactionReference: string;
    }> {
        try {
            const response = await this._request('POST', '/api/v1/direct-debit/mandate/debit', {
                paymentReference: params.paymentReference,
                mandateCode: params.mandateCode,
                debitAmount: params.amount.toString(),
                narration: params.description,
                customerEmail: params.customerEmail,
            });

            console.log(response, 'response data');
            return {
                status: response.data.responseBody.requestSuccessful,
                amount: response.data.responseBody.debitAmount,
                transactionReference: response.data.responseBody.transactionReference
            };
        } catch (error: any) {
            console.log(error, 'error charging mandate');
            this.fastify.log.error('Monnify direct debit charge failed:', error);
            throw AppException.InternalServerError('Failed to charge mandate');
        }
    }

    async refreshBanks(): Promise<Bank[]> {
        return this.getBanks(true);
    }

    /**
     * Query transaction details directly from Monnify API by paymentReference
     * Returns exact fee, amount paid, settlement amount, and payment status
     */
    async queryTransaction(paymentReference: string) {
        try {
            const response = await this._request(
                'GET',
                `/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(paymentReference)}`
            );
            return response.data.responseBody;
        } catch (error: any) {
            this.fastify.log.error('[Monnify] Query transaction failed:', error?.message);
            throw error;
        }
    }

    /**
     * Get merchant wallet / disbursement balance from Monnify
     */
    async getWalletBalance() {
        try {
            const response = await this._request(
                'GET',
                '/api/v1/disbursements/wallet/balance'
            );
            return response.data.responseBody;
        } catch (error: any) {
            this.fastify.log.error('[Monnify] Failed to fetch wallet balance:', error?.message);
            return { availableBalance: 0, ledgerBalance: 0 };
        }
    }

    /**
     * Search transactions across date ranges and status for financial reconciliation
     */
    async searchTransactions(params: {
        pageNo?: number;
        pageSize?: number;
        fromDate?: string;
        toDate?: string;
        paymentStatus?: string;
    }) {
        try {
            const query = new URLSearchParams();
            if (params.pageNo) query.set('pageNo', params.pageNo.toString());
            if (params.pageSize) query.set('pageSize', params.pageSize.toString());
            if (params.fromDate) query.set('fromDate', params.fromDate);
            if (params.toDate) query.set('toDate', params.toDate);
            if (params.paymentStatus) query.set('paymentStatus', params.paymentStatus);

            const response = await this._request(
                'GET',
                `/api/v1/merchant/transactions/search?${query.toString()}`
            );
            return response.data.responseBody;
        } catch (error: any) {
            this.fastify.log.error('[Monnify] Search transactions failed:', error?.message);
            throw error;
        }
    }

    /**
     * Initiate automated refund directly through Monnify
     */
    async initiateRefund(params: {
        transactionReference: string;
        refundAmount: number;
        refundReason: string;
        customerNote?: string;
    }) {
        try {
            const response = await this._request(
                'POST',
                '/api/v1/refunds/initiate-refund',
                {
                    transactionReference: params.transactionReference,
                    refundAmount: params.refundAmount,
                    refundReason: params.refundReason,
                    customerNote: params.customerNote || 'EnergiEase automatic refund for unfulfilled electricity vend',
                }
            );
            return response.data.responseBody;
        } catch (error: any) {
            this.fastify.log.error('[Monnify] Refund initiation failed:', error?.message);
            throw error;
        }
    }
}