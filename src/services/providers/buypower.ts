import axios from 'axios';
import { BuyPowerConfig } from '@/config/buypower.config';
import { AppException } from '@/utils/appException.utils';
import { BillProvider, BillType, VendParams } from '@/types/bill.types';
import { WhatsAppService } from '../whatsapp.service';
import { ELECTRICITY_PURCHASE_CONFIRMATION } from '@/constants/whatsapp.flow';
import { formatNigerianPhoneNumber } from '@/utils/phoneNumber';

import receiptService from '../receipt.service';
import { analytics } from '../analytics.service';

const whatsappService = new WhatsAppService();

export class BuyPowerProvider implements BillProvider {
    name = 'buypower';
    priority = 1;
    supportedBillTypes: BillType[] = [BillType.ELECTRICITY];

    async vend({ details, amount, billType, orderReference, userInfo }: VendParams) {
        if (billType !== 'electricity') {
            throw AppException.BadRequest('BuyPower only supports electricity bills');
        }
        details.amount = amount;
        details.reference = orderReference;
        const startTime = performance.now();

        try {
            const { data } = await axios.post(
                `${BuyPowerConfig.baseUrl}/vend?strict=0`,
                this.createElectricityPayload(details, userInfo),
                { headers: { Authorization: `Bearer ${BuyPowerConfig.apiKey}` } }
            );

            const durationMs = Math.round(performance.now() - startTime);

            // Track vending latency and success in PostHog
            analytics.trackTokenVend(
                userInfo.phone,
                orderReference,
                data.data.disco || details.disco,
                'success',
                durationMs,
                {
                    amount: data.data.totalAmountPaid || amount,
                    units: data.data.units,
                    provider: 'BuyPower',
                }
            );

            await whatsappService.sendMessage(ELECTRICITY_PURCHASE_CONFIRMATION(
                {
                    amount: data.data.totalAmountPaid,
                    disco: data.data.disco,
                    meterNumber: details.meterNumber,
                    orderReference: orderReference,
                    to: userInfo.phone,
                    token: data.data.token,
                    unit: data.data.units
                }
            ));

            // Automatically generate and deliver official PDF receipt to customer
            receiptService.sendReceipt(
                {
                    reference: orderReference,
                    customerPhone: userInfo.phone,
                    amount: data.data.totalAmountPaid,
                    providerOrderId: data.data.orderId,
                    details: {
                        ...details,
                        disco: data.data.disco,
                        units: data.data.units,
                        token: data.data.token,
                        meterNumber: details.meterNumber,
                        vendType: details.vendType || 'PREPAID',
                    },
                },
                {
                    to: userInfo.phone,
                    token: data.data.token,
                    units: data.data.units,
                    amount: data.data.totalAmountPaid,
                }
            ).catch(receiptErr => {
                console.error('[BuyPowerProvider] Async receipt delivery error:', receiptErr);
            });

            return {
                success: true,
                orderId: data.data.orderId,
                token: data.data.token,
                units: data.data.units,
                amount: data.data.totalAmountPaid,
                disco: data.data.disco,
                raw: data.data,
            };

        } catch (error: any) {
            const durationMs = Math.round(performance.now() - startTime);
            const failureReason = axios.isAxiosError(error)
                ? (error.response?.data?.message || error.message)
                : error?.message || 'Vending failed';

            // Track vending failure with latency in PostHog
            analytics.trackTokenVend(
                userInfo.phone,
                orderReference,
                details.disco || 'UNKNOWN',
                'failed',
                durationMs,
                {
                    amount,
                    failureReason,
                    provider: 'BuyPower',
                }
            );

            this.handleVendError(error);
        }
    }

    private createElectricityPayload(
        details: Record<string, any>,
        userInfo: { phone: string; email?: string; name?: string }
    ) {
        const phone = formatNigerianPhoneNumber(userInfo.phone)
        return {
            meter: details.meterNumber,
            disco: details.disco,
            vendType: details.vendType,
            amount: details.amount,
            phone,
            email: userInfo?.email,
            name: userInfo?.name,
            orderId: details.reference,
            paymentType: 'B2B',
            vertical: 'ELECTRICITY'
        };
    }

    async validate(details: Record<string, any>) {
        const requiredFields = ['meterNumber', 'disco', 'vendType'];
        const missing = requiredFields.filter(field => !details[field]);

        if (missing.length > 0) {
            throw AppException.BadRequest(`Missing fields: ${missing.join(', ')}`);
        }

        if (!/^\d{10,13}$/.test(details.meterNumber)) {
            throw AppException.BadRequest('Invalid meter number format');
        }

        return true;
    }


    private handleVendError(error: any): never {
        if (axios.isAxiosError(error)) {
            throw AppException.InternalServerError(
                error.response?.data?.message || 'BuyPower vending failed',
                error.response?.data
            );
        }
        throw error;
    }
}