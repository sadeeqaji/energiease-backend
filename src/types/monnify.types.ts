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


export interface AccountValidationResponse {
    accountNumber: string;
    accountName: string;
    bankCode: string;
    bankName: string;
    accountReference?: string;
    currencyCode?: string;
    status?: string;
}
export interface Bank {
    code: string;
    name: string;
    ussdTemplate: string | null;
    baseUssdCode: string | null;
    transferUssdTemplate: string | null;
    bankId: string | null;
    nipBankCode: string;
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
        customerName: string;
        customerAccountNumber: string;
        customerAccountBankCode: string;
        externalMandateReference: string;
        mandateStatus: MandateStatus;
        customerEmailAddress: string;
        customerPhoneNumber: string;
        [key: string]: any;
    };
}

export interface DirectDebitMandatePayload {
    contractCode?: string;
    mandateReference: string;
    autoRenew: boolean;
    customerCancellation: boolean;
    customerName: string;
    customerPhoneNumber: string;
    customerEmailAddress: string;
    customerAddress: string;
    customerAccountName: string;
    customerAccountNumber: string;
    customerAccountBankCode: string;
    mandateDescription: string;
    mandateStartDate: string; // ISO format date
    mandateEndDate: string; // ISO format date
}

export interface DirectDebitMandateResponse {
    mandateReference: string;
    merchantReference: string;
    mandateCode: string;
    status: string;
    createdOn: string;
    accountNumber: string;
    accountName: string;
    bankCode: string;
    bankName: string;
}



export type MandateStatus =
    | 'PENDING'
    | 'PENDING_AUTHORIZATION'
    | 'PENDING_ACTIVATION'
    | 'ACTIVE'
    | 'AUTHORIZATION_EXPIRED'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'SUSPENDED';




export type MonnifyEvent = SuccessfulTransactionEvent | MandateUpdateEvent;