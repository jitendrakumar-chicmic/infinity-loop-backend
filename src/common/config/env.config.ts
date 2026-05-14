import * as path from 'path';

import * as dotenv from 'dotenv';

// Load .env first so NODE_ENV defined there can influence which
// environment-specific file is loaded next.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Then load .env.{NODE_ENV} (e.g. .env.development, .env.production)
// to override base values.
const env = process.env.NODE_ENV || 'development';
dotenv.config({
    path: path.resolve(process.cwd(), `.env.${env}`),
    override: true,
});

interface Config {
    env: string;
    gameType: number;
    gameTypeKey: string;
    database: {
        url: string;
    };
    server: {
        port: number;
    };
    security: {
        jwtSecret: string;
        adminBypass: boolean;
        enableDevAuth: boolean;
        enableSwagger: boolean;
    };
    redis: {
        url?: string;
        host: string;
        port: number;
        password: string | undefined;
        db: number;
        infinityLoopProjectKey: string;
        adminProjectKey: string;
    };
    aws: {
        region: string;
        accessKeyId: string;
        secretAccessKey: string;
        sns: {
            cheatTopicArn: string;
        };
        sqs: {
            jobQueueUrl: string;
            pollWaitSeconds: number;
            maxMessages: number;
        };
    };
    swagger: {
        title: string;
        description: string;
        version: string;
    };
    language: {
        supported: string[];
        default: string;
    };
    adminMicroservice: {
        baseUrl: string;
    };
    usersMicroservice: {
        baseUrl: string;
    };
    restate: {
        ingressUrl: string;
        endpointPort: number;
    };
}

const getEnvVar = (key: string, defaultValue?: string): string => {
    const value = process.env[key] || defaultValue;
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
};

const normalizeDatabaseUrl = (databaseUrl: string): string => {
    try {
        const url = new URL(databaseUrl);
        const sslMode = url.searchParams.get('sslmode');

        // pg currently treats these as verify-full aliases and warns that this
        // will change in future versions, so make the current behavior explicit.
        if (sslMode && ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
            url.searchParams.set('sslmode', 'verify-full');
            url.searchParams.delete('uselibpqcompat');
        }

        return url.toString();
    } catch {
        return databaseUrl;
    }
};

export const config: Config = {
    env,
    gameType: parseInt(getEnvVar('GAME_TYPE', '2'), 10),
    gameTypeKey: getEnvVar('GAME_TYPE_KEY', 'INFINITY_LOOP'),
    database: {
        url: normalizeDatabaseUrl(getEnvVar('DATABASE_URL')),
    },
    server: {
        port: parseInt(getEnvVar('PORT'), 10),
    },
    security: {
        jwtSecret: getEnvVar('JWT_SECRET'),
        adminBypass: process.env['ADMIN_BYPASS'] === 'true',
        enableDevAuth: process.env['ENABLE_DEV_AUTH'] === 'true',
        enableSwagger: process.env['ENABLE_SWAGGER'] === 'true',
    },
    redis: {
        url: process.env['REDIS_URL'],
        host: getEnvVar('REDIS_HOST', 'localhost'),
        port: parseInt(getEnvVar('REDIS_PORT', '6379'), 10),
        password: process.env['REDIS_PASSWORD'] || undefined,
        db: parseInt(getEnvVar('REDIS_DB', '0'), 10),
        infinityLoopProjectKey: getEnvVar('REDIS_INFINITYLOOP_PROJECT_KEY'),
        adminProjectKey: getEnvVar('REDIS_ADMIN_PROJECT_KEY'),
    },
    aws: {
        region: getEnvVar('AWS_REGION'),
        accessKeyId: getEnvVar('AWS_ACCESS_KEY_ID'),
        secretAccessKey: getEnvVar('AWS_SECRET_ACCESS_KEY'),
        sns: {
            cheatTopicArn: getEnvVar('AWS_SNS_CHEAT_TOPIC_ARN'),
        },
        sqs: {
            jobQueueUrl: getEnvVar('AWS_SQS_JOB_QUEUE_URL'),
            pollWaitSeconds: parseInt(getEnvVar('AWS_SQS_POLL_WAIT_SECONDS', '20'), 10),
            maxMessages: parseInt(getEnvVar('AWS_SQS_MAX_MESSAGES', '10'), 10),
        },
    },
    adminMicroservice: {
        baseUrl: getEnvVar('ADMIN_MICROSERVICE_BASE_URL'),
    },
    usersMicroservice: {
        baseUrl: getEnvVar('USERS_MICROSERVICE_BASE_URL'),
    },
    restate: {
        ingressUrl: getEnvVar('RESTATE_INGRESS_URL', 'http://127.0.0.1:8080'),
        endpointPort: parseInt(getEnvVar('RESTATE_ENDPOINT_PORT', '9080'), 10),
    },
    swagger: {
        title: getEnvVar('PROJECT_NAME', 'Infinity Loop Game Service'),
        description: getEnvVar('PROJECT_DESCRIPTION', 'Infinity Loop Game Service API'),
        version: getEnvVar('PROJECT_VERSION', '1.0'),
    },
    language: {
        supported: getEnvVar('SUPPORTED_LANGUAGES', 'en')
            .split(',')
            .map((l) => l.trim()),
        default: getEnvVar('DEFAULT_LANGUAGE', 'en'),
    },
};
