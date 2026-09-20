import axios from 'axios';
import { BuyPowerConfig } from '@/config/buypower.config';
import { AppException } from '@/utils/appException.utils';
import { analytics } from './analytics.service';

export class BuyPowerService {
    async checkMeter(
        meterNo: string,
        disco: string,
        vendType: string,
    ) {
        console.log('[BuyPower] Starting meter check:', { meterNo, disco, vendType });
        const startTime = performance.now();

        try {
            const response = await axios.get(`${BuyPowerConfig.baseUrl}/check/meter`, {
                params: {
                    meter: meterNo,
                    disco,
                    vendType,
                    vertical: 'ELECTRICITY',
                    orderId: 'false',
                },
                headers: {
                    Authorization: `Bearer ${BuyPowerConfig.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            const durationMs = Math.round(performance.now() - startTime);
            analytics.trackMeterValidation(
                meterNo,
                disco,
                meterNo,
                true,
                durationMs,
                { meterType: vendType }
            );

            return response.data;

        } catch (error: any) {
            const durationMs = Math.round(performance.now() - startTime);
            analytics.trackMeterValidation(
                meterNo,
                disco,
                meterNo,
                false,
                durationMs,
                {
                    meterType: vendType,
                    error: error?.response?.data?.message || error?.message || 'Meter check failed',
                }
            );

            if (axios.isAxiosError(error)) {
                console.error('[BuyPower] Error Details:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    config: error.config
                });

                throw error.response?.data
            }

            throw AppException.InternalServerError('Internal server error');
        }
    }

    async vendElectricity(payload: {
        orderId: string;
        meter: string;
        disco: string;
        phone: string;
        vendType: string;
        amount: string;
        email: string;
        name: string;
    }) {
        try {
            const response = await axios.post(
                `${BuyPowerConfig.baseUrl}/vend`,
                { ...payload, paymentType: 'B2B', vertical: 'ELECTRICITY' },
                {
                    headers: {
                        Authorization: `Bearer ${BuyPowerConfig.apiKey}`,
                    }
                },
            );
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw AppException.InternalServerError(
                    error.response?.data?.message || 'Vend request failed',
                );
            }
            throw AppException.InternalServerError('Internal server error');
        }
    }

    async getWalletBalance(): Promise<{ balance: number; commission: number }> {
        try {
            const response = await axios.get(`${BuyPowerConfig.baseUrl}/wallet/balance`, {
                headers: {
                    Authorization: `Bearer ${BuyPowerConfig.apiKey}`,
                },
                timeout: 10000,
            });
            return response.data;
        } catch (error: any) {
            console.error('[BuyPower] Failed to fetch wallet balance:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Re-query transaction state directly from BuyPower API using orderId
     */
    async requeryTransaction(orderId: string) {
        try {
            const response = await axios.get(`${BuyPowerConfig.baseUrl}/transaction/${encodeURIComponent(orderId)}`, {
                headers: {
                    Authorization: `Bearer ${BuyPowerConfig.apiKey}`,
                    Accept: 'application/json',
                },
                timeout: 15000,
            });
            return response.data;
        } catch (error: any) {
            console.error('[BuyPower] Re-query error:', error.response?.data || error.message);
            if (axios.isAxiosError(error)) {
                throw AppException.InternalServerError(
                    error.response?.data?.message || 'BuyPower re-query request failed',
                    { status: error.response?.status }
                );
            }
            throw AppException.InternalServerError('BuyPower re-query request failed');
        }
    }

    /**
     * Get historical transactions from BuyPower
     */
    async getTransactions(params?: { limit?: number; start?: string; end?: string }) {
        try {
            const response = await axios.get(`${BuyPowerConfig.baseUrl}/transactions`, {
                params: {
                    limit: params?.limit || 50,
                    start: params?.start,
                    end: params?.end,
                },
                headers: {
                    Authorization: `Bearer ${BuyPowerConfig.apiKey}`,
                    Accept: 'application/json',
                },
                timeout: 15000,
            });
            return response.data;
        } catch (error: any) {
            console.error('[BuyPower] Failed to fetch transactions:', error.response?.data || error.message);
            return null;
        }
    }

    private reliabilityCache: { data: ReliabilityProvider[]; timestamp: number } | null = null;
    private readonly RELIABILITY_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes in-memory cache

    async getReliabilityIndex(): Promise<ReliabilityProvider[]> {
        const now = Date.now();
        if (this.reliabilityCache && now - this.reliabilityCache.timestamp < this.RELIABILITY_CACHE_TTL_MS) {
            return this.reliabilityCache.data;
        }

        try {
            const response = await axios.get(`${BuyPowerConfig.baseUrl}/providers/reliability-index`, {
                headers: {
                    Authorization: `Bearer ${BuyPowerConfig.apiKey}`,
                },
                timeout: 10000,
            });

            if (response.data?.status === 'ok' && Array.isArray(response.data?.data)) {
                this.reliabilityCache = {
                    data: response.data.data,
                    timestamp: now,
                };
                return response.data.data;
            }
            return this.reliabilityCache?.data || [];
        } catch (error: any) {
            console.error('[BuyPower] Failed to fetch reliability index:', error.response?.data || error.message);
            return this.reliabilityCache?.data || [];
        }
    }

    async getDiscoReliability(disco: string): Promise<DiscoReliability> {
        const rawUpper = (disco || '').toUpperCase().trim();
        const discoCode = DISCO_ALIASES[rawUpper] || rawUpper;

        const allProviders = await this.getReliabilityIndex();
        const electricityProviders = allProviders.filter(p => p.vertical === 'ELECTRICITY');
        const provider = electricityProviders.find(p => p.disco_code.toUpperCase() === discoCode);

        // If provider not found in list, treat as online and healthy
        if (!provider) {
            return {
                disco,
                discoCode,
                isOnline: true,
                successPercentage: 100,
                failurePercentage: 0,
                isReliable: true,
                status: 'HEALTHY',
            };
        }

        const isOnline = provider.provider_online !== false;
        const successRate = provider.success_percentage ?? 100;
        const failureRate = provider.failure_percentage ?? 0;

        if (!isOnline) {
            return {
                disco,
                discoCode,
                isOnline: false,
                successPercentage: successRate,
                failurePercentage: failureRate,
                isReliable: false,
                status: 'DOWN',
                warningMessage: `${disco} is currently offline on the national grid network. You can proceed to pay, and your order will be queued and automatically vended as soon as ${disco} comes back online.`,
            };
        }

        if (successRate < 80) {
            return {
                disco,
                discoCode,
                isOnline: true,
                successPercentage: successRate,
                failurePercentage: failureRate,
                isReliable: false,
                status: 'DEGRADED',
                warningMessage: `${disco} is currently experiencing high network delays (${failureRate}% failure rate). If you proceed, your transaction will be queued and retried automatically until successful.`,
            };
        }

        return {
            disco,
            discoCode,
            isOnline: true,
            successPercentage: successRate,
            failurePercentage: failureRate,
            isReliable: true,
            status: 'HEALTHY',
        };
    }

    async getAllDiscosStatus(): Promise<Array<{
        code: string;
        name: string;
        coverage: string;
        isOnline: boolean;
        successRate: number;
        failureRate: number;
        status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
        statusLabel: 'Online' | 'Slow' | 'Maintenance';
    }>> {
        const allProviders = await this.getReliabilityIndex();
        const electricityProviders = (allProviders || []).filter(p => p.vertical === 'ELECTRICITY');

        return STANDARD_DISCOS.map(disco => {
            const alias = DISCO_ALIASES[disco.code] || disco.code;
            const provider = electricityProviders.find(p => p.disco_code && p.disco_code.toUpperCase() === alias);

            const isOnline = provider ? provider.provider_online !== false : true;
            const successRate = provider?.success_percentage ?? 100;
            const failureRate = provider?.failure_percentage ?? 0;

            let status: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';
            let statusLabel: 'Online' | 'Slow' | 'Maintenance' = 'Online';

            if (!isOnline) {
                status = 'DOWN';
                statusLabel = 'Maintenance';
            } else if (successRate < 80) {
                status = 'DEGRADED';
                statusLabel = 'Slow';
            }

            return {
                code: disco.code,
                name: disco.name,
                coverage: disco.coverage,
                isOnline,
                successRate,
                failureRate,
                status,
                statusLabel,
            };
        });
    }
}

export const STANDARD_DISCOS = [
    { code: 'AEDC', name: 'Abuja Electricity', coverage: 'FCT, Kogi, Nasarawa, Niger' },
    { code: 'EKEDC', name: 'Eko Electricity', coverage: 'Lagos (Island, Lekki, Apapa)' },
    { code: 'IKEDC', name: 'Ikeja Electric', coverage: 'Lagos (Mainland, Ikeja, Ikorodu)' },
    { code: 'IBEDC', name: 'Ibadan Electricity', coverage: 'Oyo, Ogun, Osun, Kwara' },
    { code: 'EEDC', name: 'Enugu Electricity', coverage: 'Enugu, Abia, Imo, Anambra, Ebonyi' },
    { code: 'PHED', name: 'Port Harcourt Electricity', coverage: 'Rivers, Bayelsa, Cross River, Akwa Ibom' },
    { code: 'KEDCO', name: 'Kano Electricity', coverage: 'Kano, Katsina, Jigawa' },
    { code: 'JED', name: 'Jos Electricity', coverage: 'Plateau, Bauchi, Benue, Gombe' },
    { code: 'KAEDCO', name: 'Kaduna Electric', coverage: 'Kaduna, Kebbi, Sokoto, Zamfara' },
    { code: 'BEDC', name: 'Benin Electricity', coverage: 'Edo, Delta, Ondo, Ekiti' },
    { code: 'YEDC', name: 'Yola Electricity', coverage: 'Adamawa, Borno, Taraba, Yobe' },
    { code: 'ABA', name: 'Aba Power (APLE)', coverage: 'Abia (Aba Ring-fenced Area)' },
];

export interface ReliabilityProvider {
    vertical: string;
    disco_code: string;
    success_percentage: number | null;
    pending_percentage: number | null;
    failure_percentage: number | null;
    provider_online: boolean;
}

export interface DiscoReliability {
    disco: string;
    discoCode: string;
    isOnline: boolean;
    successPercentage: number;
    failurePercentage: number;
    isReliable: boolean;
    status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    warningMessage?: string;
}

export const DISCO_ALIASES: Record<string, string> = {
    PORT_HARCOURT: 'PH',
    PHED: 'PH',
    PH: 'PH',
    AEDC: 'ABUJA',
    ABUJA: 'ABUJA',
    EKEDC: 'EKO',
    EKO: 'EKO',
    IKEDC: 'IKEJA',
    IKEJA: 'IKEJA',
    IBEDC: 'IBADAN',
    IBADAN: 'IBADAN',
    KEDCO: 'KANO',
    KANO: 'KANO',
    KAEDCO: 'KADUNA',
    KADUNA: 'KADUNA',
    JED: 'JOS',
    JOS: 'JOS',
    BEDC: 'BENIN',
    BENIN: 'BENIN',
    EEDC: 'ENUGU',
    ENUGU: 'ENUGU',
    YEDC: 'YOLA',
    YOLA: 'YOLA',
    ABA: 'ABAPOWER',
    ABAPOWER: 'ABAPOWER',
    APLE: 'APLE',
};

export default new BuyPowerService();

