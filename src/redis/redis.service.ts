import { config } from '@config';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Session data cached in Redis.
 * userType matches USER_TYPES numeric constants (1 = user, 2 = admin).
 */
export interface RedisSession {
    userId: string | null;
    adminId: string | null;
    userType: number;
    expiresAt: string; // ISO string — re-validated by guard even though Redis TTL handles eviction
}

/**
 * Minimal user data stored in Redis (no user table in DB).
 */
export interface RedisUser {
    id: string;
    name: string;
    stageId?: string;
    createdAt: string; // ISO string
}

export interface RedisAdmin {
    id: string;
    email: string;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string | null;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private client: Redis;
    private readonly sessionKeyPrefixes = ['Shunya-Users:session:', 'session:'];
    private readonly userKeyPrefixes = ['Shunya-Users:user:', 'user:'];
    private readonly adminKeyPrefixes = ['shunya-admin:admin:', 'admin:'];

    onModuleInit() {
        if (config.redis.url) {
            this.client = new Redis(config.redis.url, {
                lazyConnect: true,
            });
        } else {
            this.client = new Redis({
                host: config.redis.host,
                port: config.redis.port,
                password: config.redis.password,
                db: config.redis.db,
                lazyConnect: true,
            });
        }

        this.client.on('error', (err) => this.logger.error('Redis error', err));
        this.client.connect().catch(() => {});
    }

    async onModuleDestroy() {
        await this.client.quit();
    }

    // ── Sessions ─────────────────────────────────────────────────────────────

    async setSession(sessionId: string, data: RedisSession, ttlSeconds: number): Promise<void> {
        await this.client.set(
            `${this.sessionKeyPrefixes[0]}${sessionId}`,
            JSON.stringify(data),
            'EX',
            ttlSeconds,
        );
    }

    async getSession(sessionId: string): Promise<RedisSession | null> {
        const results = await Promise.all(
            this.sessionKeyPrefixes.map((p) => this.client.get(`${p}${sessionId}`)),
        );
        const raw = results.find((r) => r !== null) ?? null;
        if (!raw) {
            return null;
        }
        return JSON.parse(raw) as RedisSession;
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.client.del(...this.sessionKeyPrefixes.map((prefix) => `${prefix}${sessionId}`));
    }

    // ── Users ─────────────────────────────────────────────────────────────────

    async setUser(userId: string, data: RedisUser, ttlSeconds?: number): Promise<void> {
        const key = `${this.userKeyPrefixes[0]}${userId}`;
        if (ttlSeconds) {
            await this.client.set(key, JSON.stringify(data), 'EX', ttlSeconds);
        } else {
            await this.client.set(key, JSON.stringify(data));
        }
    }

    async getUser(userId: string): Promise<RedisUser | null> {
        const results = await Promise.all(
            this.userKeyPrefixes.map((p) => this.client.get(`${p}${userId}`)),
        );
        const raw = results.find((r) => r !== null) ?? null;
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as Partial<RedisUser>;
        const rawStageId = (parsed as Partial<RedisUser> & { stageId?: string | number }).stageId;
        return {
            id: parsed.id ?? userId,
            name: parsed.name ?? '',
            createdAt: parsed.createdAt ?? new Date().toISOString(),
            stageId:
                typeof rawStageId === 'string'
                    ? rawStageId
                    : typeof rawStageId === 'number'
                      ? String(rawStageId)
                      : undefined,
        };
    }

    async deleteUser(userId: string): Promise<void> {
        await this.client.del(...this.userKeyPrefixes.map((prefix) => `${prefix}${userId}`));
    }

    // ── Admins ────────────────────────────────────────────────────────────────

    async getAdmin(adminId: string): Promise<RedisAdmin | null> {
        const results = await Promise.all(
            this.adminKeyPrefixes.map((p) => this.client.get(`${p}${adminId}`)),
        );
        const raw = results.find((r) => r !== null) ?? null;
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as Partial<RedisAdmin>;
        return {
            id: parsed.id ?? adminId,
            email: parsed.email ?? '',
            createdAt: parsed.createdAt,
            updatedAt: parsed.updatedAt,
            deletedAt: parsed.deletedAt ?? null,
        };
    }

    async setAdmin(adminId: string, data: RedisAdmin, ttlSeconds?: number): Promise<void> {
        const key = `${this.adminKeyPrefixes[0]}${adminId}`;
        const value = JSON.stringify(data);
        if (ttlSeconds) {
            await this.client.set(key, value, 'EX', ttlSeconds);
            return;
        }
        await this.client.set(key, value);
    }

    // ── Generic JSON Storage ──────────────────────────────────────────────────

    async set(key: string, data: any, ttlSeconds?: number): Promise<void> {
        const val = JSON.stringify(data);
        if (ttlSeconds) {
            await this.client.set(key, val, 'EX', ttlSeconds);
        } else {
            await this.client.set(key, val);
        }
    }

    async get<T>(key: string): Promise<T | null> {
        const raw = await this.client.get(key);
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    }

    async del(key: string): Promise<void> {
        await this.client.del(key);
    }

    async keys(pattern: string): Promise<string[]> {
        return this.client.keys(pattern);
    }
}
