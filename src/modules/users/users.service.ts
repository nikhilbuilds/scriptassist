import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { ErrorCode, forbid, notFound, conflict } from '../../common/errors';

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
      conflict(ErrorCode.USER_EMAIL_ALREADY_EXISTS);
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
        forbid(ErrorCode.USER_SELF_VIEW_ONLY);
      }
      return cachedUser;
    }

    this.logger.debug(`Cache miss for user ID: ${id}`);
    const user = await this.usersRepository.findById(id);

    if (!user) {
      notFound(ErrorCode.USER_NOT_FOUND);
    }

    if (currentUser.role === UserRole.USER && currentUser.id !== id) {
      forbid(ErrorCode.USER_SELF_VIEW_ONLY);
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
      forbid(ErrorCode.USER_SELF_UPDATE_ONLY);
    }

    if (currentUser.role === UserRole.USER && updateUserDto.role) {
      forbid(ErrorCode.USER_ROLE_CHANGE_FORBIDDEN);
    }

    if (currentUser.role === UserRole.ADMIN && updateUserDto.role === UserRole.SUPER_ADMIN) {
      forbid(ErrorCode.USER_ROLE_SUPER_ADMIN_FORBIDDEN);
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
        conflict(ErrorCode.USER_EMAIL_ALREADY_EXISTS);
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
      notFound(ErrorCode.USER_NOT_FOUND);
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
      notFound(ErrorCode.USER_NOT_FOUND);
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      forbid(ErrorCode.USER_PASSWORD_INVALID);
    }

    const normalizedNewEmail = normalizeEmail(newEmail);

    const emailExists = await this.usersRepository.findByEmail(normalizedNewEmail);
    if (emailExists) {
      conflict(ErrorCode.USER_EMAIL_ALREADY_EXISTS);
    }

    this.logger.warn(
      `Email change request for user ${userId}: ${user.email} -> ${normalizedNewEmail}. ` +
        `Verification email should be sent to ${normalizedNewEmail}.`,
    );

    // For now, directly update (in production, this should be pending verification)
    // await this.usersRepository.update(userId, { email: normalizedNewEmail });
    // await this.cacheService.delete(`user:id:${userId}`);

    conflict(ErrorCode.USER_EMAIL_VERIFICATION_NOT_IMPLEMENTED);
  }
}
