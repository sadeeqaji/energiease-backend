import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { BuyPowerMFBConfig } from '@/config/buypower-mfb.config';
import {
    BuyPowerMFBCreateInvoicePayload,
    BuyPowerMFBInvoiceData,
    BuyPowerMFBInvoiceResponse,
    BuyPowerMFBBank,
    BuyPowerMFBResolveBankResponse
} from '@/types/buypower-mfb.types';
import { AppException } from '@/utils/appException.utils';

export class BuyPowerMFBService {
    private readonly client: AxiosInstance;
    private readonly fastify?: FastifyInstance;

    constructor(fastify?: FastifyInstance) {
        this.fastify = fastify;
        this.client = axios.create({
            baseURL: BuyPowerMFBConfig.baseUrl,
            timeout: 20000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Request interceptor to attach Bearer token dynamically
        this.client.interceptors.request.use((config) => {
            if (BuyPowerMFBConfig.apiKey) {
                config.headers.Authorization = `Bearer ${BuyPowerMFBConfig.apiKey}`;
            }
            return config;
        });
    }

    private log(level: 'info' | 'error' | 'warn', message: string, meta?: any) {
        if (this.fastify?.log) {
            this.fastify.log[level](meta || {}, `[BuyPowerMFB] ${message}`);
        } else {
            const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
            consoleMethod(`[BuyPowerMFB] ${message}`, meta || '');
        }
    }

    /**
     * Create a dynamic single-use invoice virtual account for an order
     */
    async createInvoiceAccount(payload: BuyPowerMFBCreateInvoicePayload): Promise<BuyPowerMFBInvoiceData> {
        this.log('info', 'Creating dynamic invoice account', {
            exchangeRef: payload.exchangeRef,
            amount: payload.amount,
        });

        try {
            const response = await this.client.post<BuyPowerMFBInvoiceResponse>(
                '/api/banking/virtual/accounts/invoices',
                payload
            );

            if (!response.data?.data) {
                throw new Error(response.data?.message || 'Failed to create BuyPower MFB invoice account');
            }

            this.log('info', 'Invoice account created successfully', {
                exchangeRef: payload.exchangeRef,
                nuban: response.data.data.nuban,
                bankName: response.data.data.bankName,
            });

            return response.data.data;
        } catch (error: any) {
            this.log('error', 'Invoice account creation failed', {
                error: error.response?.data || error.message,
                status: error.response?.status,
            });

            if (axios.isAxiosError(error) && error.response?.data) {
                throw error.response.data;
            }

            throw AppException.InternalServerError(
                error.message || 'BuyPower MFB invoice account creation failed'
            );
        }
    }

    /**
     * Fetch list of invoice accounts
     */
    async getInvoiceAccounts(): Promise<any> {
        try {
            const response = await this.client.get('/api/banking/virtual/accounts/invoices');
            return response.data;
        } catch (error: any) {
            this.log('error', 'Failed to fetch invoice accounts', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Verify incoming webhook signature using HMAC-SHA256
     */
    verifyWebhookSignature(signature: string | undefined, rawPayload: string | Buffer): boolean {
        if (!signature) {
            this.log('warn', 'Missing x-buypower-signature header in webhook');
            return false;
        }

        const secret = BuyPowerMFBConfig.webhookSecret || process.env.BUYPOWER_MFB_WEBHOOK_SECRET;
        if (!secret) {
            this.log('warn', 'BUYPOWER_MFB_WEBHOOK_SECRET is not configured');
            return false;
        }

        try {
            const payloadString = Buffer.isBuffer(rawPayload) ? rawPayload.toString('utf8') : (typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload));
            const computedSignature = crypto
                .createHmac('sha256', secret)
                .update(payloadString)
                .digest('hex');

            return crypto.timingSafeEqual(
                Buffer.from(computedSignature, 'hex'),
                Buffer.from(signature, 'hex')
            );
        } catch (err: any) {
            this.log('error', 'Error evaluating webhook signature', { error: err.message });
            return false;
        }
    }

    /**
     * Resolve account number to get customer account name (Name Inquiry)
     */
    async resolveBankAccount(bankCode: string, accountNumber: string): Promise<BuyPowerMFBResolveBankResponse['data']> {
        try {
            const response = await this.client.get<BuyPowerMFBResolveBankResponse>(
                `/api/banking/core/bank/resolve`,
                {
                    params: { bankCode, accountNumber },
                }
            );

            return response.data.data;
        } catch (error: any) {
            this.log('error', 'Bank account resolution failed', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get list of commercial & microfinance banks with CBN bank codes
     */
    async getBanks(): Promise<BuyPowerMFBBank[]> {
        try {
            const response = await this.client.get<{ status: string; data: BuyPowerMFBBank[] }>(
                '/api/banking/core/banks'
            );
            return response.data.data;
        } catch (error: any) {
            this.log('error', 'Failed to retrieve banks list', error.response?.data || error.message);
            throw error;
        }
    }
}

export default BuyPowerMFBService;
