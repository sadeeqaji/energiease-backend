import env from "./env";

export const MonnifyConfig = {
    isProduction: process.env.NODE_ENV === 'production',
    baseUrl: process.env.NODE_ENV === 'production'
        ? 'https://api.monnify.com'
        : 'https://sandbox.monnify.com',
    apiKey: env.MONNIFY_API_KEY,
    clientSecret: env.MONNIFY_CLIENT_SECRET,
    contractCode: env.MONNIFY_CONTRACT_CODE,
    timeout: parseInt(env.MONNIFY_TIMEOUT || '15000'),
};