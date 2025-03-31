import { MeterModel } from '@/models/meter.model';
import { FastifyInstance } from 'fastify';

export class MeterService {

    private readonly fastify: FastifyInstance;

    constructor(fastify: FastifyInstance) {
        this.fastify = fastify;

    }
    async getMeter({ id, meterNumber, userId, phoneNumber }: {
        id?: string;
        meterNumber?: string;
        userId?: string;
        phoneNumber?: string;
    }) {
        return await MeterModel.findOne({
            $or: [
                ...(id ? [{ _id: id }] : []),
                ...(meterNumber ? [{ meterNumber }] : []),
                ...(userId ? [{ user: userId }] : []),
                ...(phoneNumber ? [{ phoneNumber }] : []),
            ],
        });
    }

    async saveMeter(meterData: {
        user?: string;
        phoneNumber: string;
        meterNumber: string;
        name: string;
        address: string;
        discoCode: string;
        vendType: string;
    }) {
        const existingMeter = await this.getMeter({
            meterNumber: meterData.meterNumber,
            phoneNumber: meterData.phoneNumber
        });

        if (existingMeter) {
            console.log(`Meter ${meterData.meterNumber} already exists for user ${meterData.user}`);
            return existingMeter;
        }

        const newMeter = new MeterModel(meterData);
        return await newMeter.save();
    }

    async getMetersByPhoneNumber(phoneNumber: string) {
        return await MeterModel.find({ phoneNumber });
    }
}

// export default new MeterService();