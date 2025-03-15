import { JwtTokenPayload } from './auth.types';

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtTokenPayload;
  }
  interface FastifyReply {
    sendSuccessResponse: (statusCode: number, message: string, data?: unknown) => void;
  }

  export interface AuthorizationOptions {
    allowedRoles?: ('admin' | 'staff' | 'business' | 'user')[];
    requireBusinessOwnership?: boolean;
  }

  export interface FastifyInstance {
    authenticateAccessToken: (
      req: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    authenticateRefreshToken: (
      req: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    authorize: (
      options: AuthorizationOptions,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
