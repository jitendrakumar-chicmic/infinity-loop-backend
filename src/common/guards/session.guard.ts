import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { RedisService } from '../../redis/redis.service';
import { REQUEST_CONTEXT, USER_TYPES } from '../constants';
import type { TokenType } from '../constants';
import { SESSION_METADATA_KEY, SessionRequirements } from '../decorators/session.decorator';
import { AdminHttpService } from '../http/admin-http.service';
import { UserHttpService } from '../http/user-http.service';
import { verifyToken } from '../utils/token.util';

type RequestWithContext = Request & {
    [REQUEST_CONTEXT.USER]?: unknown;
};

/**
 * Guard to validate session on HTTP routes using @RequireSession decorator.
 * Sessions are stored exclusively in Redis — no DB session table exists.
 * On cache hit: validates expiry, then fetches minimal user from Redis.
 * On cache miss: if ADMIN, attempts fallback to external Admin service.
 */
@Injectable()
export class SessionGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private redis: RedisService,
        private adminHttp: AdminHttpService,
        private userHttp: UserHttpService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requirements = this.reflector.get<SessionRequirements>(
            SESSION_METADATA_KEY,
            context.getHandler(),
        );

        if (!requirements) {
            return true;
        }

        const request = context.switchToHttp().getRequest<RequestWithContext>();

        // Development Bypass: If enabled, skip auth for ADMIN routes
        // if (config.security.adminBypass && requirements.userTypes.includes(USER_TYPES.ADMIN)) {
        //     request[REQUEST_CONTEXT.USER] = {
        //         id: 'admin-bypass-id',
        //         email: 'admin-bypass@infinityloop.io',
        //         userType: USER_TYPES.ADMIN,
        //     };
        //     return true;
        // }

        const token = this.extractToken(request);
        if (!token) {
            throw new UnauthorizedException('TOKEN_INVALID');
        }

        try {
            const payload = verifyToken(token);

            if (!requirements.tokenTypes.includes(payload.tokenType as TokenType)) {
                throw new UnauthorizedException('TOKEN_INVALID');
            }

            if (!requirements.userTypes.includes(payload.userType)) {
                throw new UnauthorizedException('FORBIDDEN');
            }

            let userPayload = await this.redis.getSession(payload.sessionId);

            if (!userPayload || new Date(userPayload.expiresAt) < new Date()) {
                if (payload.userType === USER_TYPES.ADMIN) {
                    const adminData = await this.adminHttp.checkAuthenticated(token);
                    await this.redis.setAdmin(
                        adminData.id,
                        {
                            id: adminData.id,
                            email: adminData.email,
                            createdAt: adminData.createdAt,
                            updatedAt: adminData.updatedAt,
                            deletedAt: adminData.deletedAt,
                        },
                        300,
                    );
                    const adminUser = {
                        id: adminData.id,
                        email: adminData.email,
                        userType: USER_TYPES.ADMIN,
                    };
                    request[REQUEST_CONTEXT.USER] = adminUser;
                    return true;
                }
                if (payload.userType === USER_TYPES.USER) {
                    const userData = await this.userHttp.checkAuthenticated(token);
                    const sessionTTL = 3600;
                    userPayload = {
                        userId: userData.id,
                        adminId: null,
                        userType: USER_TYPES.USER,
                        expiresAt: new Date(Date.now() + sessionTTL * 1000).toISOString(),
                    };
                    await this.redis.setSession(payload.sessionId, userPayload, sessionTTL);
                    await this.redis.setUser(userData.id, {
                        id: userData.id,
                        name: userData.name,
                        stageId: userData.stageId,
                        createdAt: userData.createdAt,
                    });
                    request[REQUEST_CONTEXT.USER] = {
                        id: userData.id,
                        name: userData.name,
                        stageId: userData.stageId,
                        createdAt: userData.createdAt,
                    };
                    return true;
                }
                throw new UnauthorizedException('INVALID_SESSION');
            }

            // Strict Validation: Ensure JWT payload matches Redis session
            if (userPayload.userType !== payload.userType) {
                throw new UnauthorizedException('TOKEN_INVALID');
            }

            if (payload.userType === USER_TYPES.ADMIN) {
                const adminId = userPayload.adminId ?? payload.userId;
                if (adminId !== payload.userId) {
                    throw new UnauthorizedException('TOKEN_INVALID');
                }

                const admin = await this.redis.getAdmin(adminId);
                if (admin) {
                    request[REQUEST_CONTEXT.USER] = {
                        id: admin.id,
                        email: admin.email,
                        userType: USER_TYPES.ADMIN,
                    };
                    return true;
                }

                const adminData = await this.adminHttp.checkAuthenticated(token);
                await this.redis.setAdmin(
                    adminData.id,
                    {
                        id: adminData.id,
                        email: adminData.email,
                        createdAt: adminData.createdAt,
                        updatedAt: adminData.updatedAt,
                        deletedAt: adminData.deletedAt,
                    },
                    300,
                );
                request[REQUEST_CONTEXT.USER] = {
                    id: adminData.id,
                    email: adminData.email,
                    userType: USER_TYPES.ADMIN,
                };
                return true;
            }

            if (userPayload.userId !== payload.userId) {
                throw new UnauthorizedException('TOKEN_INVALID');
            }

            const userId = userPayload.userId;
            let user = await this.redis.getUser(userId);
            if (!user) {
                try {
                    const userData = await this.userHttp.checkAuthenticated(token);
                    user = {
                        id: userData.id,
                        name: userData.name,
                        stageId: userData.stageId,
                        createdAt: userData.createdAt,
                    };
                    await this.redis.setUser(userData.id, user);
                } catch {
                    throw new UnauthorizedException('USER_NOT_FOUND');
                }
            }

            // Attach user with stageId to context
            request[REQUEST_CONTEXT.USER] = user;
            return true;
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException('TOKEN_INVALID');
        }
    }

    private extractToken(request: RequestWithContext): string | undefined {
        const authHeader = request.headers.authorization;
        if (authHeader) {
            const [type, token] = authHeader.split(' ');
            if (type === 'Bearer' && token) {
                return token;
            }
        }

        const bodyToken = this.getTokenFromObject(request.body);
        if (typeof bodyToken === 'string' && bodyToken.trim().length > 0) {
            return bodyToken.trim();
        }

        const queryToken = this.getTokenFromObject(request.query);
        if (typeof queryToken === 'string' && queryToken.trim().length > 0) {
            return queryToken.trim();
        }

        return undefined;
    }

    private getTokenFromObject(value: unknown): string | string[] | undefined {
        if (!value || typeof value !== 'object' || !('token' in value)) {
            return undefined;
        }

        const token = (value as { token?: unknown }).token;
        if (typeof token === 'string' || Array.isArray(token)) {
            return token;
        }

        return undefined;
    }
}
