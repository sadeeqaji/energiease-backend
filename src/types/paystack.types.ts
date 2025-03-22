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
    reference?: string;
    bank_transfer?: {
        account_expires_at: string;
    };
    metadata?: Record<string, any>;
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

export interface PaystackEvent {
    event: string;
    data: {
        id: number;
        reference: string;
        amount: number;
        metadata?: Record<string, any>;
        [key: string]: any;
    };
}

export interface SuccessfulChargeEvent extends PaystackEvent {
    event: 'charge.success';
    data: {
        id: number;
        reference: string;
        amount: number;
        metadata?: {
            paymentReference?: string;
            [key: string]: any;
        };
        [key: string]: any;
    };
}