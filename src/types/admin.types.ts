export type Role = 'user' | 'admin' | 'superadmin' | 'support' | 'accounting';

export interface Admin {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: Role;
  permissions: string[];
  isModified: (path: string) => boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
  createdAt: Date;
  updatedAt: Date;
}
