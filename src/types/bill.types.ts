export enum BillType {
    ELECTRICITY = 'electricity',
    AIRTIME = 'airtime',
    CABLE = 'cable',
    WATER = 'water'
}

export type ElectricityDetails = {
    meterNumber: string;
    disco: string;
    vendType: 'prepaid' | 'postpaid';
    meterName?: string;
    meterAddress?: string;
};

export type AirtimeDetails = {
    phone: string;
    network: string;
    amount: number;
};

export type CableDetails = {
    smartcard: string;
    package: string;
    months: number;
};

export type WaterDetails = {
    accountNumber: string;
    utility: string;
};

export type BillDetails = ElectricityDetails | AirtimeDetails | CableDetails | WaterDetails;

export interface VendParams {
    amount: number;
    billType: BillType;
    orderReference: string;
    details: Record<string, any>;
    userInfo: { phone: string };
}

interface VendResponse {
    success: boolean;
    orderId?: string;
}

export interface BillProvider {
    name: string;
    priority: number;
    supportedBillTypes: BillType[];
    vend(params: VendParams): Promise<VendResponse>;
    validate?(details: Record<string, any>): Promise<boolean>;
}