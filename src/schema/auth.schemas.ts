import { z } from 'zod';
import {
  loginResponseSchema,
  refreshTokenResponseSchema,
} from './response/auth.responses';
import { createRouteSchema } from '@/utils/schemaGenerator.utils';
import { Tags } from '@/constants/routes.tags';

const tags = Tags.auth;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const loginRouteSchema = createRouteSchema({
  tags,
  description: 'User Login',
  summary: 'Allows admin to log in using their email and password.',
  body: loginSchema,
  response: { 200: loginResponseSchema },
});

export const refreshTokenRouteSchema = createRouteSchema({
  tags,
  description: 'Refresh Token',
  summary: 'Generates a new access token using the refresh token.',
  body: refreshTokenSchema,
  response: { 200: refreshTokenResponseSchema },
});
