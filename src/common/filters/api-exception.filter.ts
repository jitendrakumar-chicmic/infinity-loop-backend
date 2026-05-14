import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

import { STATUS_CODES, REQUEST_CONTEXT } from '../constants';
import { ApiResponse } from '../interfaces/api-response.interface';
import { getMessage } from '../responses';

interface RequestWithLanguage extends Request {
    [REQUEST_CONTEXT.LANGUAGE]?: string;
}

interface ValidationErrorShape {
    path?: string[];
    message: string;
}

interface HttpResponseShape {
    message?: string | string[];
    errors?: ValidationErrorShape[];
}

/**
 * Global exception filter that catches all exceptions
 * Transforms exceptions into standardized ApiResponse error format with i18n support
 * Language is extracted by LanguageMiddleware and attached to the request
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(ApiExceptionFilter.name);

    /**
     * Catches and handles exceptions, formatting them as ApiResponse errors
     * Uses language preference from request (set by middleware)
     * @param {unknown} exception - The exception that was thrown
     * @param {ArgumentsHost} host - The arguments host
     */
    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<RequestWithLanguage>();
        const response = ctx.getResponse<Response>();

        // Get language from request (set by LanguageMiddleware)
        const lang = request[REQUEST_CONTEXT.LANGUAGE] || 'en';

        let statusCode: number = STATUS_CODES.INTERNAL_SERVER_ERROR;
        let message = getMessage('INTERNAL_SERVER_ERROR', lang);
        let data: Record<string, string> | null = null;

        // Handle HttpException
        if (exception instanceof HttpException) {
            statusCode = exception.getStatus();
            const res = exception.getResponse();

            if (typeof res === 'string') {
                message = getMessage(res, lang);
            } else if (typeof res === 'object' && res !== null) {
                const resObj = res as HttpResponseShape;
                const rawMessage = resObj.message;
                const errors = resObj.errors;

                if (Array.isArray(errors)) {
                    // Handle Zod validation errors specifically
                    message = getMessage('VALIDATION_FAILED', lang);
                    const validationData: Record<string, string> = {};
                    errors.forEach((err) => {
                        const path = err.path ? err.path.join('.') : 'unknown';
                        const msg = getMessage(err.message, lang);
                        validationData[path] = msg;
                    });
                    data = validationData;
                } else if (Array.isArray(rawMessage)) {
                    // For other array messages, translate each part
                    message = rawMessage.map((m) => getMessage(m, lang)).join(', ');
                } else if (typeof rawMessage === 'string') {
                    message = getMessage(rawMessage, lang);
                }
            }
        }

        // Global Logging for all failed requests
        const logMethod = statusCode >= 500 ? 'error' : 'warn';
        this.logger[logMethod](
            `[FAILED] ${request.method} ${request.url} - Status: ${statusCode} - Error: ${message}`,
        );

        if (statusCode === STATUS_CODES.INTERNAL_SERVER_ERROR) {
            this.logger.error(
                `Stack Trace:`,
                exception instanceof Error ? exception.stack : exception,
            );
        }

        const apiResponse: ApiResponse = {
            success: false,
            statusCode,
            message,
            data,
        };

        response.status(statusCode).json(apiResponse);
    }
}
