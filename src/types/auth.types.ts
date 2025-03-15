import { Role } from './admin.types';

export interface Login {
  email: string;
  password: string;
}

export interface JwtTokenPayload {
  user_id: string;
  role: Role;
}
