import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { RedisCacheService } from '../../../common/services/redis-cache.service';
import { UsersService } from '../../users/users.service';

export interface AuthContext {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  sessionId: string;
}

@Injectable()
export class EnhancedAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private cacheService: RedisCacheService,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Level 1: Token Validation
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const payload = await this.validateToken(token);
    
    // Level 2: Session Validation
    const sessionValid = await this.validateSession(payload.sub, request);
    if (!sessionValid) {
      throw new UnauthorizedException('Invalid session');
    }

    // Level 3: User Status Check
    const user = await this.usersService.findOne(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User account not found');
    }

    // Level 4: Role-based Authorization
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(user.role)) {
        throw new ForbiddenException('Insufficient role permissions');
      }
    }

    // Level 5: Permission-based Authorization
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions = await this.getUserPermissions(user.id);
      const hasPermission = requiredPermissions.every(permission => 
        userPermissions.includes(permission)
      );
      
      if (!hasPermission) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    // Level 6: Resource-based Authorization
    const resourceOwnerCheck = this.reflector.getAllAndOverride<boolean>('checkResourceOwner', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (resourceOwnerCheck) {
      const isOwner = await this.checkResourceOwnership(request, user.id);
      if (!isOwner) {
        throw new ForbiddenException('Access denied to this resource');
      }
    }

    // Level 7: Rate Limiting Check
    const rateLimitExceeded = await this.checkRateLimit(request, user.id);
    if (rateLimitExceeded) {
      throw new ForbiddenException('Rate limit exceeded');
    }

    // Attach user context to request
    (request as any).user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: await this.getUserPermissions(user.id),
      sessionId: this.generateSessionId(request),
    };

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private async validateToken(token: string): Promise<any> {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });

      // Check if token is blacklisted
      const isBlacklisted = await this.cacheService.get(`blacklist:${token}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }

      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private async validateSession(userId: string, request: Request): Promise<boolean> {
    const sessionId = this.generateSessionId(request);
    const sessionKey = `session:${userId}:${sessionId}`;
    
    const session = await this.cacheService.get(sessionKey);
    return !!session;
  }

  private async getUserPermissions(userId: string): Promise<string[]> {
    const cacheKey = `permissions:${userId}`;
    let permissions = await this.cacheService.get<string[]>(cacheKey);
    
    if (!permissions) {
      // In a real application, you would fetch permissions from database
      // For now, we'll use role-based permissions
      const user = await this.usersService.findOne(userId);
      permissions = this.getRolePermissions(user?.role || 'USER');
      
      await this.cacheService.set(cacheKey, permissions, { ttl: 300 }); // Cache for 5 minutes
    }
    
    return permissions;
  }

  private getRolePermissions(role: string): string[] {
    const permissionMap: Record<string, string[]> = {
      'ADMIN': [
        'users:read', 'users:write', 'users:delete',
        'tasks:read', 'tasks:write', 'tasks:delete',
        'system:admin', 'reports:read', 'reports:write'
      ],
      'MANAGER': [
        'users:read', 'tasks:read', 'tasks:write',
        'reports:read', 'team:manage'
      ],
      'USER': [
        'tasks:read', 'tasks:write:own',
        'profile:read', 'profile:write'
      ]
    };
    
    return permissionMap[role] || [];
  }

  private async checkResourceOwnership(request: Request, userId: string): Promise<boolean> {
    const resourceId = request.params.id || request.body.userId;
    
    if (!resourceId) {
      return true; // No specific resource to check
    }

    // Check if user owns the resource
    const ownershipKey = `ownership:${resourceId}`;
    const ownerId = await this.cacheService.get(ownershipKey);
    
    if (ownerId) {
      return ownerId === userId;
    }

    // If not in cache, check database (simplified)
    // In a real application, you would check the actual resource ownership
    return true;
  }

  private async checkRateLimit(request: Request, userId: string): Promise<boolean> {
    const endpoint = `${request.method}:${request.route?.path || request.url}`;
    const rateLimitKey = `rate_limit:${userId}:${endpoint}`;
    
    const currentCount = await this.cacheService.increment(rateLimitKey, 1, { ttl: 60 });
    
    // Define rate limits per endpoint
    const rateLimits: Record<string, number> = {
      'GET:/tasks': 100,
      'POST:/tasks': 10,
      'PUT:/tasks': 20,
      'DELETE:/tasks': 5,
      'default': 50
    };
    
    const limit = rateLimits[endpoint] || rateLimits.default;
    return currentCount > limit;
  }

  private generateSessionId(request: Request): string {
    const userAgent = request.headers['user-agent'] || '';
    const ip = request.ip || request.connection.remoteAddress || '';
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(`${userAgent}:${ip}`).digest('hex').substring(0, 16);
  }
}
