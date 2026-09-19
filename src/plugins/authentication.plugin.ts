import fp from 'fastify-plugin';
import { FastifyRequest, FastifyInstance } from 'fastify';
import { AppException } from '@/utils/appException.utils';
import { verifyToken } from '@/utils/jwt.utils';
import { JwtTokenPayload } from '@/types/auth.types';
import logger from '@/utils/logger';

async function authenticationPlugin(fastify: FastifyInstance) {
  fastify.decorate('authenticateAccessToken', async (req: FastifyRequest) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        throw AppException.Unauthorized('Authentication required');
      }
      const decoded = verifyToken(token!) as JwtTokenPayload;
      const staffRoles = ['superadmin', 'admin', 'support', 'accounting'];
      if (!decoded?.user_id || !staffRoles.includes(decoded?.role)) {
        throw AppException.Unauthorized('Authentication required');
      }
      req.user = decoded;
    } catch (err) {
      logger.error(err);
      throw AppException.Unauthorized('Invalid or expired access token');
    }
  });
}

export default fp(authenticationPlugin);
