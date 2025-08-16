import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';
export const RESOURCE_OWNER_KEY = 'checkResourceOwner';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
export const CheckResourceOwner = () => SetMetadata(RESOURCE_OWNER_KEY, true);

// Predefined role decorators
export const AdminOnly = () => Roles('ADMIN');
export const ManagerOrAdmin = () => Roles('MANAGER', 'ADMIN');
export const AuthenticatedUser = () => Roles('USER', 'MANAGER', 'ADMIN');

// Predefined permission decorators
export const CanReadUsers = () => Permissions('users:read');
export const CanWriteUsers = () => Permissions('users:write');
export const CanDeleteUsers = () => Permissions('users:delete');
export const CanReadTasks = () => Permissions('tasks:read');
export const CanWriteTasks = () => Permissions('tasks:write');
export const CanDeleteTasks = () => Permissions('tasks:delete');
export const CanManageSystem = () => Permissions('system:admin');
export const CanReadReports = () => Permissions('reports:read');
export const CanWriteReports = () => Permissions('reports:write');
export const CanManageTeam = () => Permissions('team:manage');

// Combined decorators for common use cases
export const AdminAccess = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    AdminOnly()(target, propertyKey, descriptor);
    CanManageSystem()(target, propertyKey, descriptor);
    return descriptor;
  };
};

export const TaskManagement = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    CanReadTasks()(target, propertyKey, descriptor);
    CanWriteTasks()(target, propertyKey, descriptor);
    return descriptor;
  };
};

export const UserManagement = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    CanReadUsers()(target, propertyKey, descriptor);
    CanWriteUsers()(target, propertyKey, descriptor);
    return descriptor;
  };
};

export const ReportAccess = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    CanReadReports()(target, propertyKey, descriptor);
    CanWriteReports()(target, propertyKey, descriptor);
    return descriptor;
  };
};
