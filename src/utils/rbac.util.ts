import { Role } from '@/types/admin.types';

export const roles: Record<Role, string[]> = {
  user: ['view_profile', 'update_profile'],
  admin: ['view_kyc', 'approve_kyc', 'reject_kyc', 'manage_credit_limit'],
  superadmin: ['manage_admins', 'manage_users', 'manage_credit_limit', 'manage_card'],
};

export function hasPermission(role: Role, permission: string): boolean {
  return roles[role]?.includes(permission) || false;
}
