/**
 * Minimal i18n response message system.
 * All user-facing messages keyed by constant string identifiers.
 */

const MESSAGES: Record<string, Record<string, string>> = {
    en: {
        // Generic
        OK: 'Success',
        CREATED: 'Created successfully',
        INTERNAL_SERVER_ERROR: 'An internal server error occurred',
        VALIDATION_FAILED: 'Validation failed',

        // Auth
        TOKEN_INVALID: 'Invalid or missing token',
        TOKEN_EXPIRED: 'Token has expired',
        INVALID_SESSION: 'Session is invalid or expired',
        FORBIDDEN: 'Access denied',
        USER_NOT_FOUND: 'User not found',

        // Game
        INVALID_STAGE: 'Invalid game stage',
        STAGE_ALREADY_COMPLETED: 'This stage has already been completed',
        NO_ACTIVE_GAME_SESSION: 'No active game session found',
    },
};

/**
 * Get message.
 *
 * @param {string} key - key value.
 * @param {string} lang - lang value.
 *
 * @returns {string} The string result.
 */
export function getMessage(key: string, lang = 'en'): string {
    const languageMessages = MESSAGES[lang] || MESSAGES['en'];
    return languageMessages[key] ?? key;
}

/**
 * Validate messages.
 */
export function validateMessages(): void {
    // placeholder — add integrity checks here as the message set grows
}
