import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for transactional decorator
 */
export const TRANSACTIONAL_KEY = 'TRANSACTIONAL';

/**
 * Transactional decorator options
 */
export interface TransactionalOptions {
    /**
     * If true, uses RepeatableRead isolation for consistent reads.
     * Default: false (uses ReadCommitted — PostgreSQL default).
     */
    readOnly?: boolean;
}

/**
 * Decorator to wrap a controller method in a Prisma interactive transaction.
 * All database operations within the handler (and its called services) will
 * automatically use the transaction client via AsyncLocalStorage + Proxy.
 *
 * If any error is thrown, all DB changes are rolled back.
 *
 * @param {TransactionalOptions} [options] - Transaction options
 * @example
 * ```typescript
 * @Transactional()                        // write transaction (ReadCommitted)
 * @Transactional({ readOnly: true })      // read transaction (RepeatableRead)
 * ```
 */
export const Transactional = (options: TransactionalOptions = {}) =>
    SetMetadata(TRANSACTIONAL_KEY, options);
