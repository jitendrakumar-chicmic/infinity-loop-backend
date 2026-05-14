import { ApiExceptionFilter } from '@common/filters/api-exception.filter';
import { ApiResponseInterceptor } from '@common/interceptors/api-response.interceptor';
import { validateMessages } from '@common/responses';
import { config } from '@config';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';

import { AppModule } from './app.module';

class AppLogger extends ConsoleLogger {
    log(message: any, context?: string) {
        if (config.env !== 'production' || context === 'HTTP') {
            super.log(message, context);
        }
    }

    debug(message: any, context?: string) {
        if (config.env !== 'production') {
            super.debug(message, context);
        }
    }

    verbose(message: any, context?: string) {
        if (config.env !== 'production') {
            super.verbose(message, context);
        }
    }

    warn(message: any, context?: string) {
        if (config.env !== 'production' || context === 'HTTP') {
            super.warn(message, context);
        }
    }
}

async function bootstrap() {
    // Validate all language files on startup
    validateMessages();

    const app = await NestFactory.create(AppModule, {
        logger: new AppLogger(),
    });

    // Enable CORS for frontend connectivity with credentials support
    app.enableCors({
        origin: true, // Reflects the incoming origin
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
    });

    // Register global exception filter for standardized error responses
    app.useGlobalFilters(new ApiExceptionFilter());

    // Register global interceptor for standardized success responses
    app.useGlobalInterceptors(new ApiResponseInterceptor());

    // Register global validation pipe for Zod DTOs
    app.useGlobalPipes(new ZodValidationPipe());

    // Swagger/OpenAPI — explicit opt-in only
    if (config.security.enableSwagger) {
        const swaggerConfig = new DocumentBuilder()
            .setTitle(config.swagger.title)
            .setDescription(config.swagger.description)
            .setVersion(config.swagger.version)
            .addBearerAuth()
            .build();

        const document = SwaggerModule.createDocument(app, swaggerConfig);
        SwaggerModule.setup('api', app, document);
    }

    const port = Number(process.env.PORT) || config.server.port || 3004;
    await app.listen(port);
}

void bootstrap();
