import { v4 as uuidv4 } from 'uuid';

export const generateMandateReference = (phoneNumber: string): string => {
    // Format: EE-MNFY-DD-{PHONE_LAST4}-{TIMESTAMP}-{RANDOM4}
    const timestamp = Date.now().toString().slice(-6);
    const phoneLast4 = phoneNumber.slice(-4);
    const random4 = uuidv4().split('-')[0].slice(0, 4);
    return `EE-MNFY-DD-${phoneLast4}-${timestamp}-${random4}`.toUpperCase();
};