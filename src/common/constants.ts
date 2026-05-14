/**
 * Application Constants
 */

export const STATUS_CODES = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    INTERNAL_SERVER_ERROR: 500,
} as const;

export type StatusCode = (typeof STATUS_CODES)[keyof typeof STATUS_CODES];

export const HEADERS = {
    ACCEPT_LANGUAGE: 'accept-language',
    AUTHORIZATION: 'authorization',
} as const;

export const REQUEST_CONTEXT = {
    LANGUAGE: 'language',
    USER: 'user',
} as const;

/**
 * Token expiry durations (in seconds)
 */
export const TOKEN_EXPIRY = {
    LOGIN: 7 * 24 * 60 * 60, // 7 days — long-lived login token
    GAME_SESSION: 10 * 60, // 10 minutes — socket game session token
} as const;

/**
 * Token type constants
 */
export const TOKEN_TYPES = {
    LOGIN: 1,
    GAME_SESSION: 2,
} as const;

/**
 * User type constants (numeric)
 */
export const USER_TYPES = {
    USER: 1,
    ADMIN: 2,
} as const;

/**
 * Game session status constants
 */
export const GAME_SESSION_STATUS = {
    ACTIVE: 1,
    COMPLETED: 2,
    DISCONNECTED: 3,
    FAILED: 4,
    RESULT_PROCESSING: 5,
} as const;

export const TERMINAL_SESSION_STATUSES = [
    GAME_SESSION_STATUS.COMPLETED,
    GAME_SESSION_STATUS.FAILED,
] as const;

export const RESTATE_SERVICES = {
    GAME_SESSION: 'GameSessionObject',
    GAME_EXPIRY: 'GameExpiryService',
} as const;

export const GAME_CONFIGS = {
    MOVE_MIN_INTERVAL_MS: 50,
    EXPIRY_GRACE_SECONDS: 120,
    SQS_POLL_ERROR_RETRY_MS: 5_000,
} as const;

export const DEFAULT_STAGE_CONFIG = {
    TIME_LIMIT: 60,
    BOARD_COUNT: 1,
} as const;

export const GAME_CONFIG_EVENT_TYPE = {
    STAGE_ATTACHED: 'GAME_STAGE_ATTACHED',
    STAGE_DETACHED: 'GAME_STAGE_DETACHED',
} as const;

export const ANTI_CHEAT_CONFIGS = {
    ROTATE_TOO_FAST_MS: 50,
    UNIFORM_TIMING_CV_THRESHOLD: 0.1,
    UNIFORM_TIMING_MIN_INTERVALS: 3,
    IMPOSSIBLE_SOLVE_MS_PER_TILE: 100,
} as const;

export const CHEAT_FLAG_TYPE = {
    ROTATE_TOO_FAST: 1,
    UNIFORM_TIMING: 2,
    IMPOSSIBLE_SOLVE_TIME: 3,
} as const;

/**
 * Valid game stages (1–5)
 */
export const GAME_STAGES = {
    MIN: 1,
    MAX: 100,
} as const;

export type StatusCodeType = (typeof STATUS_CODES)[keyof typeof STATUS_CODES];
export type TokenType = (typeof TOKEN_TYPES)[keyof typeof TOKEN_TYPES];
export type UserType = (typeof USER_TYPES)[keyof typeof USER_TYPES];
export type GameSessionStatus = (typeof GAME_SESSION_STATUS)[keyof typeof GAME_SESSION_STATUS];
