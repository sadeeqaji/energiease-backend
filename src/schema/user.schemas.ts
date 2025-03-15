import { z } from 'zod';
import { createRouteSchema } from '@/utils/schemaGenerator.utils';
import { Tags } from '@/constants/routes.tags';
import {
  getUserResponseSchema,
  getUsersResponseSchema,
} from './response/user.responses';

const tags = Tags.users;
const status = z.enum(['pending', 'verified', 'rejected']);

const getUsersQuerySchema = z.object({
  kycStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
  gender: z.enum(['male', 'female']).optional(),
  employmentType: z.enum(['salary_earner', 'non_salary_earner']).optional(),
  state: z.string().optional(),
  lga: z.string().optional(),
  page: z.number().default(1).optional(),
  limit: z.number().default(100).optional(),
});

export const getUsersRouteSchema = createRouteSchema({
  tags,
  description: 'Get Users by KYC Status',
  summary: 'Fetches users filtered by their KYC status.',
  query: getUsersQuerySchema,
  response: getUsersResponseSchema,
});

const getUserByIdentifierParamsSchema = z.object({
  identifier: z.string(),
});

export const getUserByIdentifierRouteSchema = createRouteSchema({
  tags,
  description: 'Get a user by identifier (userId, phoneNumber, or BVN).',
  summary: 'Fetches a single user by their unique identifier.',
  params: getUserByIdentifierParamsSchema,
  response: getUserResponseSchema,
});

const updateKYCStatusBodySchema = z.object({ status });

const updateBankStatusBodySchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected']),
});

export const updateKYCStatusRouteSchema = createRouteSchema({
  tags,
  summary: 'Update user KYC status',
  description: 'Updates the KYC status of a user.',
  params: z.object({ user_id: z.string() }),
  body: updateKYCStatusBodySchema,
  response: getUserResponseSchema,
});

export const updateBankStatusRouteSchema = createRouteSchema({
  tags,
  summary: 'Update user bank status',
  description: 'Updates bank status for a user.',
  params: z.object({ user_id: z.string() }),
  body: updateBankStatusBodySchema,
  response: getUserResponseSchema,
});
