export interface BuyPowerMFBCreateInvoicePayload {
    exchangeRef: string;
    amount: number;
    description: string;
    email: string;
    name: string;
    expireAt?: string;
}

export interface BuyPowerMFBInvoiceData {
    id: number;
    businessId?: number;
    providerCredentialId?: number;
    exchangeRef: string;
    nuban: string;
    bankName: string;
    bankCode: string;
    amount: number;
    description: string;
    name: string;
    email?: string;
    status: 'PENDING' | 'PAID' | 'EXPIRED' | string;
    expireAt?: string;
    expiryDate?: string;
    metadata?: Record<string, any>;
    createdAt?: string;
    updatedAt?: string;
}

export interface BuyPowerMFBInvoiceResponse {
    status: string;
    message: string;
    data: BuyPowerMFBInvoiceData;
}

export interface BuyPowerMFBWebhookTransactionData {
    transactionId: number;
    transactionReference: string;
    accountExchangeReference: string;
    sessionId?: string;
    accountNumber: string;
    accountType?: string;
    amount: string;
    sourceAccountName?: string;
    sourceAccountNumber?: string;
    sourceBankName?: string;
    sourceBankCode?: string;
    destinationAccountNumber: string;
    destinationAccountName: string;
    destinationBankName: string;
    destinationBankCode: string;
    type: string;
    status: 'CONFIRMED' | 'UNRESOLVED' | 'AUTHORIZED' | string;
    narration?: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, any>;
}

export interface BuyPowerMFBWebhookPayload {
    event: 'invoice.paid' | 'static_account.transaction.created' | string;
    data: BuyPowerMFBWebhookTransactionData;
}

export interface BuyPowerMFBResolveBankResponse {
    status: string;
    data: {
        bankCode: string;
        accountNumber: string;
        accountName: string;
        bankName: string;
    };
}

export interface BuyPowerMFBBank {
    bankName: string;
    bankCode: string;
    isNew?: boolean;
}
