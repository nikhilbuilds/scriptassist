export interface AuthUser {
  id: string;
  role: string;
}

export interface AuthUserWithEmail extends AuthUser {
  email: string;
}

export interface RequestUser extends AuthUser {
  email: string;
  name?: string;
}
