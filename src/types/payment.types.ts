export interface BankDetails {
    bankName: string;
    accountNumber: string;
    expiresOn: string;
    accountName: string;
}


export type PaymentProviders = 'Monnify' | 'Paystack';