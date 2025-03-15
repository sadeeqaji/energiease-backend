import { FastifyInstance } from 'fastify';
import { AuthController } from '@/controllers/auth.controller';
import { Login } from '@/types/auth.types';
import {
  loginRouteSchema,
  refreshTokenRouteSchema,
} from '@/schema/auth.schemas';

const authController = new AuthController();

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: Login;
  }>(
    '/login',
    {
      schema: loginRouteSchema,
    },
    authController.login.bind(authController),
  );
  fastify.post<{ Body: { refreshToken: string } }>(
    '/refresh-token',
    {
      schema: refreshTokenRouteSchema,
    },
    authController.refreshToken.bind(authController),
  );
}
