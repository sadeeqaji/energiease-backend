import { z } from 'zod';
import { successResponseSchema } from './shared.schema';



export const cardholderResponseSchema = z.object({
    _id: z.string(),
    name: z.string(),
    status: z.string(),
    individual: z.object({
        firstName: z.string(),
        lastName: z.string(),
    }),
    phoneNumber: z.string(),
    emailAddress: z.string(),
    billingAddress: z.object({
        line1: z.string(),
        city: z.string(),
        state: z.string(),
        country: z.string(),
        postalCode: z.string(),
    }),
});


export const cardResponseSchema = z.object({
    _id: z.string(),
    type: z.string(),
    brand: z.string(),
    currency: z.string(),
    number: z.string().optional(),
    status: z.string(),
    spendingControls: z.object({
        allowedCategories: z.array(z.string()),
        blockedCategories: z.array(z.string()),
        channels: z.object({
            atm: z.boolean(),
            pos: z.boolean(),
            web: z.boolean(),
            mobile: z.boolean(),
        }),
        spendingLimits: z.array(
            z.object({
                amount: z.number(),
                interval: z.string(),
            }),
        ),
    }),
});


export const createCardholderResponseSchema = {
    201: successResponseSchema.extend({
        data: cardholderResponseSchema,
    }),
    400: z.object({
        error: z.string(),
    }),
};

export const getCardholderResponseSchema = {
    200: successResponseSchema.extend({
        data: cardholderResponseSchema,
    }),
    400: z.object({
        error: z.string(),
    }),
};

export const createCardResponseSchema = {
    201: successResponseSchema.extend({
        data: cardResponseSchema,
    }),
    400: z.object({
        error: z.string(),
    }),
};

export const updateCardStatusResponseSchema = {
    200: successResponseSchema.extend({
        data: cardResponseSchema,
    }),
    400: z.object({
        error: z.string(),
    }),
};


export const getCardByIdResponseSchema = {
    200: successResponseSchema.extend({
        data: cardResponseSchema,
    }),
    404: z.object({
        error: z.string(),
    }),
    400: z.object({
        error: z.string(),
    }),
};

