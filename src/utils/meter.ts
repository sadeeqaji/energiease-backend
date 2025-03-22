import { DISCO_MAP } from "@/constants/discos";
import { Meter } from "@/types/meter.types";

export const transformedMeters = (savedMeters: Meter[]) => {
    return savedMeters.map((meter, index) => ({
        id: meter._id,
        title: meter.name,
        description: `DisCo: ${DISCO_MAP[meter.discoCode] || meter.discoCode} | Meter Number: ${meter.meterNumber}`
    }));
}