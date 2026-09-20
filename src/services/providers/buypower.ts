import axios from 'axios';
import { BuyPowerConfig } from '@/config/buypower.config';
import { AppException } from '@/utils/appException.utils';
import { BillProvider, BillType, VendParams } from '@/types/bill.types';
import { WhatsAppService } from '../whatsapp.service';
import { ELECTRICITY_PURCHASE_CONFIRMATION } from '@/constants/whatsapp.flow';
import { formatNigerianPhoneNumber } from '@/utils/phoneNumber';

import receiptService from '../receipt.service';
import { analytics } from '../analytics.service';
import telegramService from '../telegram.service';
import { SupportService } from '../support.service';

const whatsappService = new WhatsAppService();
const supportService = new SupportService();

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

        // Retrieve customer retention & LTV metrics
        const retention = await analytics.getCustomerRetentionMetrics(userInfo.phone);

        try {
            const { data } = await axios.post(
                `${BuyPowerConfig.baseUrl}/vend?strict=0`,
                this.createElectricityPayload(details, userInfo),
                { headers: { Authorization: `Bearer ${BuyPowerConfig.apiKey}` } }
            );

            const durationMs = Math.round(performance.now() - startTime);
            const token = data.data.token;
            const units = data.data.units;
            const totalAmountPaid = data.data.totalAmountPaid || amount;
            const disco = data.data.disco || details.disco;

            // Track vending latency, success, and retention cohort in PostHog
            analytics.trackTokenVend(
                userInfo.phone,
                orderReference,
                disco,
                'success',
                durationMs,
                {
                    amount: totalAmountPaid,
                    units,
                    provider: 'BuyPower',
                    is_returning_customer: retention.is_returning_customer,
                    customer_total_orders: retention.customer_total_orders,
                    days_since_last_order: retention.days_since_last_order,
                    customer_cohort: retention.customer_cohort,
                }
            );

            // Send WhatsApp confirmation with isolated error guard so delivery issues never cancel a vended token
            let whatsappDeliveryFailed = false;
            let whatsappErrorCode = '';
            let whatsappErrorMessage = '';

            try {
                await whatsappService.sendMessage(ELECTRICITY_PURCHASE_CONFIRMATION(
                    {
                        amount: totalAmountPaid,
                        disco,
                        meterNumber: details.meterNumber,
                        orderReference,
                        to: userInfo.phone,
                        token,
                        unit: units,
                    }
                ));
            } catch (waErr: any) {
                whatsappDeliveryFailed = true;
                whatsappErrorCode = waErr?.code || waErr?.response?.data?.error?.code || 'WHATSAPP_DISPATCH_FAILED';
                whatsappErrorMessage = waErr?.response?.data?.error?.message || waErr?.message || 'Failed to dispatch WhatsApp message';

                console.error(`🚨 [BuyPowerProvider] CRITICAL: Token ${token} vended, but WhatsApp delivery failed:`, {
                    phone: userInfo.phone,
                    orderReference,
                    code: whatsappErrorCode,
                    message: whatsappErrorMessage,
                });

                // 1. Track delivery failure in PostHog
                analytics.trackWhatsAppDeliveryFailed(
                    userInfo.phone,
                    orderReference,
                    token,
                    whatsappErrorCode,
                    whatsappErrorMessage,
                    {
                        disco,
                        amount: totalAmountPaid,
                        units,
                    }
                );

                // 2. Alert Telegram operations channel
                telegramService.sendAlert(
                    `🚨 <b>CRITICAL: WhatsApp Token Delivery Failed!</b>\n` +
                    `<b>Phone:</b> <code>${userInfo.phone}</code>\n` +
                    `<b>Order:</b> <code>${orderReference}</code>\n` +
                    `<b>Token:</b> <code>${token}</code> (${units ? `${units} kWh` : ''})\n` +
                    `<b>DISCO:</b> ${disco}\n` +
                    `<b>Meta Error:</b> [${whatsappErrorCode}] ${whatsappErrorMessage}\n` +
                    `<i>⚠️ Token was vended on BuyPower. Contact customer immediately via phone/SMS!</i>`
                ).catch(() => {});

                // 3. Create an urgent Support Ticket so support desk agents intervene immediately
                supportService.createUrgentDeliveryFailureTicket({
                    phone: userInfo.phone,
                    orderReference,
                    token,
                    disco,
                    meterNumber: details.meterNumber,
                    amount: totalAmountPaid,
                    errorCode: whatsappErrorCode,
                    errorMessage: whatsappErrorMessage,
                }).catch((err) => console.error('[BuyPowerProvider] Failed to create urgent ticket:', err));
            }

            // Automatically generate and deliver official PDF receipt to customer if WhatsApp was healthy
            if (!whatsappDeliveryFailed) {
                receiptService.sendReceipt(
                    {
                        reference: orderReference,
                        customerPhone: userInfo.phone,
                        amount: totalAmountPaid,
                        providerOrderId: data.data.orderId,
                        details: {
                            ...details,
                            disco,
                            units,
                            token,
                            meterNumber: details.meterNumber,
                            vendType: details.vendType || 'PREPAID',
                        },
                    },
                    {
                        to: userInfo.phone,
                        token,
                        units,
                        amount: totalAmountPaid,
                    }
                ).catch(receiptErr => {
                    console.error('[BuyPowerProvider] Async receipt delivery error:', receiptErr);
                });
            }

            return {
                success: true,
                orderId: data.data.orderId,
                token,
                units,
                amount: totalAmountPaid,
                disco,
                whatsappDeliveryFailed,
                whatsappDeliveryError: whatsappDeliveryFailed ? `[${whatsappErrorCode}] ${whatsappErrorMessage}` : undefined,
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
                    is_returning_customer: retention.is_returning_customer,
                    customer_total_orders: retention.customer_total_orders,
                    days_since_last_order: retention.days_since_last_order,
                    customer_cohort: retention.customer_cohort,
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