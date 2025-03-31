import env from "./env";

export const MonnifyConfig = {
    isProduction: process.env.NODE_ENV === 'production',
    baseUrl: env.MONNIFY_BASE_URL,
    apiKey: env.MONNIFY_API_KEY,
    clientSecret: env.MONNIFY_CLIENT_SECRET,
    contractCode: env.MONNIFY_CONTRACT_CODE,
    timeout: parseInt(env.MONNIFY_TIMEOUT || '15000'),
};