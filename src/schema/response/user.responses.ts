import { z } from 'zod';

const documentSchema = z.object({
  type: z.enum(['utility_bill', 'id_card', 'passport']),
  fileUrl: z.string().url(),
  uploadedAt: z.date(),
  _id: z.string(),
});

export const getUsersResponseSchema = {
  200: z.array(
    z.object({
      _id: z.string(),
      firstName: z.string(),
      middleName: z.string(),
      gender: z.string(),
      phoneNumber: z.string(),
      lastName: z.string(),
      kyc: z.object({
        status: z.string(),
      }),
    }),
  ),
  400: z.object({
    error: z.string(),
  }),
};

export const getUserResponseSchema = {
  200: z.object({
    _id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    gender: z.string(),
    phoneNumber: z.string(),
    kyc: z.object({
      status: z.enum(['pending', 'verified', 'rejected']),
    }),
    bankDetails: z
      .object({
        accountNumber: z.string(),
        accountName: z.string(),
        bankName: z.string(),
        bankCode: z.string(),
        status: z.enum(['pending', 'verified', 'rejected']),
      })
      .optional(),
    documents: z.array(documentSchema).optional(),
  }),
  // 404: z.object({ error: z.string() }),
  // 400: z.object({ error: z.string() }),
};
