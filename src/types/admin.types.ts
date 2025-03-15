export type Role = 'user' | 'admin' | 'superadmin';

export interface Admin {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  permissions: string[];
  isModified: (path: string) => boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
  createdAt: Date;
  updatedAt: Date;
}
