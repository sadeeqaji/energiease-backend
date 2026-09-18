export enum BillType {
    ELECTRICITY = 'electricity',
    AIRTIME = 'airtime',
    CABLE = 'cable',
    WATER = 'water'
}

export type ElectricityDetails = {
    meterNumber: string;
    disco: string;
    vendType: 'PREPAID' | 'POSTPAID';
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

export interface VendResponse {
    success: boolean;
    orderId?: string;
    token?: string;
    units?: string | number;
    amount?: number;
    disco?: string;
    raw?: any;
}

export interface BillProvider {
    name: string;
    priority: number;
    supportedBillTypes: BillType[];
    vend(params: VendParams): Promise<VendResponse>;
    validate?(details: Record<string, any>): Promise<boolean>;
}