export interface PaystackInitTransactionPayload {
    email: string;
    amount: string;
    reference?: string;
    currency?: string;
    metadata?: Record<string, any>;
}

export interface BankTransferPayload {
    email: string;
    amount: string;
    bank_transfer?: {
        account_expires_at: string;
    };
}

export interface CardChargePayload {
    email: string;
    amount: string;
    card: {
        number: string;
        cvv: string;
        expiry_month: string;
        expiry_year: string;
    };
}