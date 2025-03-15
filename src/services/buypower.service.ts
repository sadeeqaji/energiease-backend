import axios from 'axios';
import { BuyPowerConfig } from '@/config/buypower.config';
import { AppException } from '@/utils/appException.utils';

export class BuyPowerService {
    async checkMeter(
        meterNo: string,
        disco: string,
        vendType: string,
    ) {
        console.log('[BuyPower] Starting meter check:', { meterNo, disco, vendType });

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

            return response.data;

        } catch (error) {

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
}

export default new BuyPowerService();
