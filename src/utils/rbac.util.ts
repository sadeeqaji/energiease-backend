import { Role } from '@/types/admin.types';

export const roles: Record<Role, string[]> = {
  user: ['view_profile', 'update_profile'],
  support: ['view_orders', 'manage_orders', 'send_tokens', 'view_customers'],
  accounting: ['view_analytics', 'view_orders', 'view_accounting'],
  admin: [
    'view_analytics',
    'view_orders',
    'manage_orders',
    'send_tokens',
    'view_customers',
    'view_accounting',
  ],
  superadmin: [
    'view_analytics',
    'view_orders',
    'manage_orders',
    'send_tokens',
    'view_customers',
    'view_accounting',
    'manage_admins',
  ],
};

export function hasPermission(role: Role, permission: string): boolean {
  return roles[role]?.includes(permission) || false;
}
