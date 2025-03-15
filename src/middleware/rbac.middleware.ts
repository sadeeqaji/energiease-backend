import { FastifyRequest } from 'fastify';
import { AppException } from '@/utils/appException.utils';
import { hasPermission } from '@/utils/rbac.util';

export function requirePermission(permission: string) {
  return async (req: FastifyRequest) => {
    const requesterRole = req.user.role;
    if (!hasPermission(requesterRole, permission)) {
      throw AppException.Unauthorized(
        'Unauthorized: You do not have the required permission',
      );
    }
  };
}
