export interface MonnifyAccessToken {
    accessToken: string;
    expiresIn: number;
    tokenExpiry?: Date;
}

export interface MonnifyInitTransactionPayload {
    amount: number;
    customerName?: string;
    customerEmail: string;
    paymentReference: string;
    paymentDescription?: string;
    currencyCode?: string;
    contractCode?: string;
    redirectUrl?: string;
    paymentMethods?: string[];
    incomeSplitConfig?: any[];
    metaData?: Record<string, unknown>;
}

export interface BankTransferPayload {
    transactionReference: string;
    bankCode?: string;
}

export interface CardChargePayload {
    transactionReference: string;
    collectionChannel: string;
    card: {
        number: string;
        expiryMonth: string;
        expiryYear: string;
        pin: string;
        cvv: string;
    };
    deviceInformation: Record<string, unknown>;
}


export interface BaseEvent {
    eventType: string;
    eventData: Record<string, any>;
}

export interface SuccessfulTransactionEvent extends BaseEvent {
    eventType: 'SUCCESSFUL_TRANSACTION';
    eventData: {
        transactionReference: string;
        paymentReference: string;
        amountPaid: number;
        currency: string;
        customer: {
            name: string;
            email: string;
        };
    };
}

export interface MandateUpdateEvent extends BaseEvent {
    eventType: 'MANDATE_UPDATE';
    eventData: {
        mandateCode: string;
        mandateStatus: string;
        customerName: string;
    };
}

export type MonnifyEvent = SuccessfulTransactionEvent | MandateUpdateEvent;