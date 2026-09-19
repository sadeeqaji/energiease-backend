import env from './env';

export const BuyPowerMFBConfig = {
    apiKey: env.BUYPOWER_MFB_API_KEY || '',
    baseUrl: env.BUYPOWER_MFB_BASE_URL || 'https://api.buypowermfb.net',
    webhookSecret: env.BUYPOWER_MFB_WEBHOOK_SECRET || '',
};
