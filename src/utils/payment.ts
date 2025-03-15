import { BankDetails, PaymentProviders } from "@/types/payment.types";

export function transformBankDetails(provider: PaymentProviders, data: any): BankDetails {
    if (provider === 'paystack') {
        return {
            bankName: data.bank.name,
            accountNumber: data.account_number,
            expiresOn: data.account_expires_at,
            accountName: data.account_name,
        };
    } else if (provider === 'monnify') {
        return {
            bankName: data.bankName,
            accountNumber: data.accountNumber,
            expiresOn: data.expiresOn,
            accountName: data.accountName,
        };
    } else {
        throw new Error('Unsupported payment provider');
    }
}