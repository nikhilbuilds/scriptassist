import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from '../dto/update-user.dto';
import { User } from '../entities/user.entity';
import { UserRole } from '../enum/user-role.enum';
import type { AuthUser } from '../../../common/types';
import { ErrorCode, forbid } from '../../../common/errors';

export function validateUpdateAuthorization(
  targetUserId: string,
  currentUser: AuthUser,
  updateDto: UpdateUserDto,
): void {
  // Regular users can only update themselves
  if (currentUser.role === UserRole.USER && currentUser.id !== targetUserId) {
    forbid(ErrorCode.USER_SELF_UPDATE_ONLY);
  }

  // Regular users cannot change their role
  if (currentUser.role === UserRole.USER && updateDto.role) {
    forbid(ErrorCode.USER_ROLE_CHANGE_FORBIDDEN);
  }

  // Admins cannot elevate to super-admin
  if (currentUser.role === UserRole.ADMIN && updateDto.role === UserRole.SUPER_ADMIN) {
    forbid(ErrorCode.USER_ROLE_SUPER_ADMIN_FORBIDDEN);
  }
}

export async function prepareUpdateData(updateDto: UpdateUserDto): Promise<Partial<User>> {
  const updateData: Partial<User> = { ...updateDto };

  if (updateDto.password) {
    updateData.password = await bcrypt.hash(updateDto.password, 10);
  }

  return updateData;
}

export function isEmailChange(updateDto: UpdateUserDto, currentEmail: string): boolean {
  return Boolean(updateDto.email && updateDto.email !== currentEmail);
}
