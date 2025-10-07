import { User } from '../entities/user.entity';

export type PublicUser = Omit<User, 'password'>;
