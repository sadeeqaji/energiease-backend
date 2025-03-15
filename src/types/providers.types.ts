export interface ElectricityProvider {
    name: string;
    priority: number;

    checkMeter(
        meterNo: string,
        disco: string,
        vendType: string
    ): Promise<any>;

    vendElectricity(payload: {
        meter: string;
        disco: string;
        amount: number;
        phone: string;
        email: string;
        name: string;
    }): Promise<{
        success: boolean;
        orderId?: string;
        error?: string;
    }>;
}