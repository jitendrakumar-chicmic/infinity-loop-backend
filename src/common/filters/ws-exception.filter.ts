import { Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

import { STATUS_CODES } from '../constants';
import { wsError } from '../utils/ws-response.util';

interface WsClientLike {
    emit(event: string, payload: unknown): void;
}

interface HttpStyleException {
    response?: {
        message?: string;
    };
    status?: number;
    message?: string;
    stack?: string;
}

/**
 * Global WebSocket exception filter.
 * Catches WsExceptions thrown in gateway handlers and emits them back
 * as a standardised ApiResponse-shaped object via the socket 'exception' event.
 *
 * Clients should listen to the 'exception' event to handle errors uniformly:
 *   socket.on('exception', (response) => { ... })
 *
 * For ACK-based handlers the formatted response is also passed to the callback.
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
    private readonly logger = new Logger(WsExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToWs();
        const client = ctx.getClient<WsClientLike>();
        const error = exception as HttpStyleException;

        let message = 'INTERNAL_SERVER_ERROR';
        let statusCode: number = STATUS_CODES.BAD_REQUEST;

        if (exception instanceof WsException) {
            message =
                typeof exception.getError() === 'string'
                    ? (exception.getError() as string)
                    : 'WS_ERROR';
        } else if (error.response && typeof error.response.message === 'string') {
            // Handle Nest HTTP Exceptions (Conflict, NotFound, etc.)
            message = error.response.message;
            statusCode = error.status || STATUS_CODES.BAD_REQUEST;
        } else if (typeof error.message === 'string') {
            message = error.message;
        }

        const response = wsError(message, statusCode);

        this.logger.error(`Exception: ${message}`, error.stack);

        // Emit to the client directly — received by socket.on('exception', ...)
        client.emit('exception', response);
    }
}
