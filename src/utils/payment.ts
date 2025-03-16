import { BankDetails, PaymentProviders } from "@/types/payment.types";

export function transformBankDetails(provider: PaymentProviders, data: any): BankDetails {
    if (provider === 'Paystack') {
        return {
            bankName: data.bank.name,
            accountNumber: data.account_number,
            expiresOn: data.account_expires_at,
            accountName: data.account_name,
        };
    } else if (provider === 'Monnify') {
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