import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { PaginationDto } from '@common/dto/pagination.dto';
import { PaginationMetaData } from '../../types/pagination.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });
    return this.usersRepository.save(user);
  }

  async findAll(
    paginationDto: PaginationDto,
  ): Promise<{ users: User[]; metaData: PaginationMetaData }> {
    const findOptions: FindManyOptions<User> = {
      skip: (paginationDto.page - 1) * paginationDto.limit,
      take: paginationDto.limit,
    };

    if (paginationDto.sortBy) {
      findOptions.order = { [paginationDto.sortBy]: paginationDto.sortOrder ?? 'ASC' };
    }

    const dbResponse = await this.usersRepository.findAndCount({
      skip: (paginationDto.page - 1) * paginationDto.limit,
      take: paginationDto.limit,
    });

    return {
      users: dbResponse[0],
      metaData: {
        total: dbResponse[1],
        page: paginationDto.page,
        limit: paginationDto.limit,
        totalPages: Math.ceil(dbResponse[1] / paginationDto.limit),
      },
    };
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      // Ineffiecient error handling, should not expose id.
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<{ message: string }> {
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    const updateResult = await this.usersRepository.update(id, { ...updateUserDto });
    if ((updateResult.affected ?? 0) > 0) {
      return { message: 'User updated successfully' };
    } else {
      throw new NotFoundException(`User not found`);
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleteResult = await this.usersRepository.delete(id);

    if ((deleteResult.affected ?? 0) === 0) {
      throw new NotFoundException(`User not found`);
    }

    return { message: 'User deleted successfully' };
  }
}
