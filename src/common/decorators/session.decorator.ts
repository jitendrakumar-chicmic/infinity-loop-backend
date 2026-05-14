import { SetMetadata } from '@nestjs/common';

import type { TokenType, UserType } from '../constants';
import { TOKEN_TYPES, USER_TYPES } from '../constants';

export const SESSION_METADATA_KEY = 'session_requirements';

export interface SessionRequirements {
    tokenTypes: TokenType[];
    userTypes: UserType[];
}

/**
 * Require a valid session on an HTTP route.
 * Session is validated against Redis — no DB lookup for session.
 *
 * @example
 * @RequireSession({ tokenTypes: [TOKEN_TYPES.LOGIN], userTypes: [USER_TYPES.USER] })
 */
export const RequireSession = (requirements: SessionRequirements) =>
    SetMetadata(SESSION_METADATA_KEY, requirements);

export { TOKEN_TYPES, USER_TYPES };
