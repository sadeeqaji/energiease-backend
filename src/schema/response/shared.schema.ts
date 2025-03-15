import { z } from 'zod';

export const successResponseSchema = z.object({
    statusCode: z.number(),
    message: z.string(),
    data: z.any(),
});