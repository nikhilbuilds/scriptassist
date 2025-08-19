export interface IUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}
