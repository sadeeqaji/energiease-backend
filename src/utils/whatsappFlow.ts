import crypto from 'crypto';

const tokenStore: Record<string, number> = {};

const TOKEN_EXPIRATION_TIME = 60 * 60 * 1000;

export const generateFlowToken = (): string => {
    const token = crypto.randomBytes(16).toString('hex');
    tokenStore[token] = Date.now();
    return token;
};

export const isTokenValid = (token: string): boolean => {
    const creationTime = tokenStore[token];
    if (!creationTime) return false;

    const currentTime = Date.now();
    return currentTime - creationTime <= TOKEN_EXPIRATION_TIME;
};