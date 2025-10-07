import {
  NotFoundException,
  ConflictException,
  Inject,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { AuthUser } from '../../common/types';
import type { IUsersRepository } from './users.repository.interface';
import { USERS_REPOSITORY } from './users.repository.interface';
import { CacheService } from '../../common/services/cache.service';
import * as bcrypt from 'bcrypt';
import { UserRole } from './enum/user-role.enum';
import type { PublicUser } from './types/user-public.type';
import { toPublicUser } from './utils/users.utils';
import { normalizeEmail } from '../../common/utils/normalizers.util';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly USER_CACHE_TTL = Number(process.env.CACHE_USER_BY_ID_TTL_SECONDS ?? 600);

  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: IUsersRepository,
    private readonly cacheService: CacheService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const normalizedEmail = normalizeEmail(createUserDto.email);

    const existingUser = await this.usersRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException(`User with email ${normalizedEmail} already exists`);
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = await this.usersRepository.create({
      ...createUserDto,
      email: normalizedEmail,
      password: hashedPassword,
    });

    return user;
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.findAll();
  }

  async findOne(id: string, currentUser: AuthUser): Promise<PublicUser> {
    const cacheKey = `user:id:${id}`;
    const cachedUser = await this.cacheService.get<PublicUser>(cacheKey);

    if (cachedUser) {
      this.logger.debug(`Cache hit for user ID: ${id}`);
      if (currentUser.role === UserRole.USER && currentUser.id !== id) {
        throw new ForbiddenException('You can only view your own profile');
      }
      return cachedUser;
    }

    this.logger.debug(`Cache miss for user ID: ${id}`);
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (currentUser.role === UserRole.USER && currentUser.id !== id) {
      throw new ForbiddenException('You can only view your own profile');
    }

    const publicUser = toPublicUser(user);
    await this.cacheService.set(cacheKey, publicUser, this.USER_CACHE_TTL);

    return publicUser;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = normalizeEmail(email);

    this.logger.debug(`Fetching user by email: ${normalizedEmail}`);
    const user = await this.usersRepository.findByEmail(normalizedEmail);

    return user;
  }

  async update(
    id: string,
    currentUser: AuthUser,
    updateUserDto: UpdateUserDto,
  ): Promise<PublicUser> {
    const existingUser = await this.findOne(id, currentUser);

    if (currentUser.role === UserRole.USER && currentUser.id !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }

    if (currentUser.role === UserRole.USER && updateUserDto.role) {
      throw new ForbiddenException('You cannot change your own role');
    }

    if (currentUser.role === UserRole.ADMIN && updateUserDto.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('You cannot change your own role to super admin');
    }

    const updateData: Partial<User> = { ...updateUserDto };
    if (updateUserDto.password) {
      updateData.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const oldEmail = existingUser.email;
    let newEmail: string | undefined;
    const emailChanged = updateUserDto.email && updateUserDto.email !== oldEmail;

    if (emailChanged) {
      newEmail = normalizeEmail(updateUserDto.email!);
      updateData.email = newEmail;

      const emailExists = await this.usersRepository.findByEmail(newEmail);
      if (emailExists) {
        throw new ConflictException(`User with email ${newEmail} already exists`);
      }

      this.logger.warn(
        `Email change detected for user ${id}: ${oldEmail} -> ${newEmail}. ` +
          `TODO: Implement email verification flow (send verification email to new address).`,
      );

      // TODO: In production, implement:
      // 1. Generate verification token
      // 2. Send verification email to new address
      // 3. Store pending email change with token
      // 4. Only update email after user clicks verification link
      // 5. Notify old email about change attempt
    }

    const updatedUser = await this.usersRepository.update(id, updateData);

    await this.cacheService.delete(`user:id:${id}`);
    this.logger.debug(`Invalidated cache for user ID: ${id}`);

    const publicUser = toPublicUser(updatedUser);
    await this.cacheService.set(`user:id:${id}`, publicUser, this.USER_CACHE_TTL);

    return publicUser;
  }

  async remove(id: string): Promise<void> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.usersRepository.delete(id);

    await this.cacheService.delete(`user:id:${id}`);
    this.logger.debug(`Invalidated cache for user ID: ${id}`);
  }

  /**
   * Change user email with password confirmation
   * TODO: Implement full email verification flow:
   * 1. Verify password
   * 2. Generate verification token
   * 3. Send verification email to new address
   * 4. Store pending change
   * 5. Complete change on verification
   */
  async changeEmail(userId: string, newEmail: string, password: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      throw new ForbiddenException('Invalid password');
    }

    const normalizedNewEmail = normalizeEmail(newEmail);

    const emailExists = await this.usersRepository.findByEmail(normalizedNewEmail);
    if (emailExists) {
      throw new ConflictException(`Email ${normalizedNewEmail} is already in use`);
    }

    this.logger.warn(
      `Email change request for user ${userId}: ${user.email} -> ${normalizedNewEmail}. ` +
        `Verification email should be sent to ${normalizedNewEmail}.`,
    );

    // For now, directly update (in production, this should be pending verification)
    // await this.usersRepository.update(userId, { email: normalizedNewEmail });
    // await this.cacheService.delete(`user:id:${userId}`);

    throw new ConflictException(
      'Email verification flow not fully implemented. ' +
        'This feature requires email service configuration.',
    );
  }
}
