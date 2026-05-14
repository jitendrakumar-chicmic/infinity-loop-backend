import { AsyncLocalStorage } from 'async_hooks';

import type { Prisma } from '@prisma';

/**
 * AsyncLocalStorage context for Prisma transaction clients.
 * When a transaction is active, the transaction client is stored here
 * and PrismaService's Proxy automatically delegates model calls to it.
 */
export const transactionContext = new AsyncLocalStorage<Prisma.TransactionClient>();
