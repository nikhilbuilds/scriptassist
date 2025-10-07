import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { IUsersRepository } from './users.repository.interface';

@Injectable()
export class UsersRepository implements IUsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepo.create(userData);
    return this.userRepo.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.userRepo.createQueryBuilder('user').orderBy('user.createdAt', 'DESC').getMany();
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.name',
        'user.role',
        'user.createdAt',
        'user.updatedAt',
      ])
      .where('user.id = :id', { id })
      .getOne();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .where('user.email = :email', { email })
      .getOne();
  }

  async update(id: string, userData: Partial<User>): Promise<User> {
    await this.userRepo.update(id, userData);
    const updatedUser = await this.findById(id);
    if (!updatedUser) {
      throw new Error(`User with ID ${id} not found after update`);
    }
    return updatedUser;
  }

  async delete(id: string): Promise<void> {
    await this.userRepo.delete(id);
  }
}
