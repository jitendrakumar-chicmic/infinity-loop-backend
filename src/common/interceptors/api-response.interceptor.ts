import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { STATUS_CODES, REQUEST_CONTEXT } from '../constants';
import { ApiResponse } from '../interfaces/api-response.interface';
import { getMessage } from '../responses';

interface RequestWithLanguage {
    [REQUEST_CONTEXT.LANGUAGE]?: string;
}

interface ResponseWithStatusCode {
    statusCode?: number;
}

interface MessageResponse {
    message?: string;
    [key: string]: unknown;
}

/**
 * Interceptor that transforms all successful responses to match ApiResponse interface
 * Automatically wraps response data in a standardized format with i18n support
 * Language is extracted by LanguageMiddleware and attached to the request
 * @template T - The type of data being returned
 */
@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
    /**
     * Intercepts the response and transforms it to ApiResponse format
     * Uses language preference from request (set by middleware)
     * @param {ExecutionContext} context - The execution context
     * @param {CallHandler} next - The next handler in the chain
     * @returns {Observable<ApiResponse<T>>} The transformed response
     */
    intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
        const req = context.switchToHttp().getRequest<RequestWithLanguage>();
        const res = context.switchToHttp().getResponse<ResponseWithStatusCode>();

        // Get language from request (set by LanguageMiddleware)
        const lang = req[REQUEST_CONTEXT.LANGUAGE] || 'en';

        return next.handle().pipe(
            map((data) => {
                let message = getMessage('OK', lang);
                let responseData: T | null = data;

                // Extract message if it exists in the response object
                if (data && typeof data === 'object' && 'message' in data) {
                    const messageData = data as MessageResponse;
                    if (typeof messageData.message === 'string') {
                        message = messageData.message;
                    }

                    // If data is just the message, set it to null
                    // Otherwise, remove message from data to avoid duplication
                    const { message: _message, ...rest } = messageData;
                    void _message;
                    responseData = Object.keys(rest).length > 0 ? (rest as T) : null;
                }

                return {
                    success: true,
                    statusCode: res.statusCode ?? STATUS_CODES.OK,
                    message,
                    data: responseData ?? null,
                };
            }),
        );
    }
}
