import { config } from '@config';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { REQUEST_CONTEXT, HEADERS } from '../constants';

@Injectable()
export class LanguageMiddleware implements NestMiddleware {
    use(request: Request, _response: Response, next: NextFunction): void {
        const lang = request.headers[HEADERS.ACCEPT_LANGUAGE];
        const resolved = config.language.supported.includes(lang as string)
            ? lang
            : config.language.default;
        request[REQUEST_CONTEXT.LANGUAGE] = resolved;
        next();
    }
}
