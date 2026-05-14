import { STATUS_CODES } from '../constants';
import type { ApiResponse } from '../interfaces/api-response.interface';

/**
 * Builds a standardised success response for WebSocket handlers.
 * Mirrors the HTTP ApiResponse shape so clients use one schema for both transports.
 */
export function wsSuccess<T>(data: T, message = 'Success'): ApiResponse<T> {
    return {
        success: true,
        statusCode: STATUS_CODES.OK,
        message,
        data: data ?? null,
    };
}

/**
 * Builds a standardised error response for the WsExceptionFilter.
 */
export function wsError(
    message: string,
    statusCode: number = STATUS_CODES.BAD_REQUEST,
): ApiResponse<null> {
    return {
        success: false,
        statusCode,
        message,
        data: null,
    };
}
