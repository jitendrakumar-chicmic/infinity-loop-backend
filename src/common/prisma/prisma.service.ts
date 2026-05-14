import { config } from '@config';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { transactionContext } from './transaction.context';

/**
 * Prisma model names that participate in transparent transaction delegation.
 * Must be updated whenever a new model is added to schema.prisma.
 */
const PRISMA_MODEL_PROPERTIES = new Set([
    'level',
    'board',
    'gameConfig',
    'gameSession',
    'gameSessionBoard',
    'userStageProgress',
    'stageConfig',
    'stageLevelConfig',
    'stageLevelBoard',
    'gameMove',
]);

/**
 * PrismaService with transparent transaction support via AsyncLocalStorage Proxy.
 * Any service method decorated with @Transactional() will automatically run
 * all Prisma calls inside the active transaction — no code changes needed in services.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        const pool = new Pool({
            connectionString: config.database.url,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        const adapter = new PrismaPg(pool);
        super({ adapter });

        return new Proxy(this, {
            get(target, prop, receiver) {
                if (typeof prop === 'string' && PRISMA_MODEL_PROPERTIES.has(prop)) {
                    const txClient = transactionContext.getStore();
                    if (txClient) {
                        return (txClient as Record<string, unknown>)[prop];
                    }
                }
                return Reflect.get(target, prop, receiver) as unknown;
            },
        });
    }

    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
