import { User } from './entities/user.entity';

export interface IUsersRepository {
  create(userData: Partial<User>): Promise<User>;

  findAll(): Promise<User[]>;

  findById(id: string): Promise<User | null>;

  findByEmail(email: string): Promise<User | null>;

  update(id: string, userData: Partial<User>): Promise<User>;

  delete(id: string): Promise<void>;
}

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
