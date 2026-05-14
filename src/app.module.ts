import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AdminModule } from './admin/admin.module';
import { CommonModule } from './common/common.module';
import { TransactionInterceptor } from './common/interceptors/transaction.interceptor';
import { LanguageMiddleware } from './common/middleware/language.middleware';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { PrismaModule } from './common/prisma/prisma.module';
import { GameModule } from './game/game.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { UserModule } from './user/user.module';

@Module({
    imports: [PrismaModule, CommonModule, RedisModule, GameModule, AdminModule, HealthModule, UserModule],
    providers: [
        {
            provide: APP_INTERCEPTOR,
            useClass: TransactionInterceptor,
        },
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(LoggerMiddleware, LanguageMiddleware).forRoutes('*');
    }
}
