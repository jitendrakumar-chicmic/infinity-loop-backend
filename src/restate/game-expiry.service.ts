import { GAME_CONFIGS } from '@common/constants';
import { config } from '@config';
import { Injectable, Logger } from '@nestjs/common';
import * as restateClients from '@restatedev/restate-sdk-clients';

import { GAME_EXPIRY_RESTATE_TARGET, GameExpiryRequest } from './game-expiry.restate';

@Injectable()
export class GameExpiryService {
    private readonly logger = new Logger(GameExpiryService.name);
    private readonly restateClient = restateClients.connect({ url: config.restate.ingressUrl });

    // Schedule two durable delayed RPCs:
    //  1. markResultProcessing  — fires at expiryAtMs           (status → RESULT_PROCESSING)
    //  2. finalizeExpiredSession — fires at expiryAtMs + graceMs (commit to DB + clear state)
    //
    // Both carry idempotency keys so Restate deduplicates retried schedule() calls.
    async schedule(
        sessionId: string,
        expiryAtMs: number,
        userId: string,
        stageId: string,
    ): Promise<void> {
        const now = Date.now();
        const graceMs = GAME_CONFIGS.EXPIRY_GRACE_SECONDS * 1_000;
        const rpDelayMs = Math.max(0, expiryAtMs - now);
        const finDelayMs = Math.max(0, expiryAtMs + graceMs - now);

        const payload: GameExpiryRequest = {
            sessionId,
            objectKey: `${userId}:${stageId}`,
        };
        const client = this.restateClient.serviceSendClient(GAME_EXPIRY_RESTATE_TARGET);

        await client.markResultProcessing(
            payload,
            restateClients.rpc.sendOpts({
                delay: rpDelayMs,
                idempotencyKey: `game-expiry:${sessionId}:result-processing`,
            }),
        );

        await client.finalizeExpiredSession(
            payload,
            restateClients.rpc.sendOpts({
                delay: finDelayMs,
                idempotencyKey: `game-expiry:${sessionId}:finalize`,
            }),
        );

        this.logger.debug(
            `Scheduled durable expiry for session ${sessionId} (rpDelay=${rpDelayMs}ms finDelay=${finDelayMs}ms)`,
        );
    }
}
