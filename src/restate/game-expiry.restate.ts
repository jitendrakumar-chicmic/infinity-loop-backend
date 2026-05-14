import { RESTATE_SERVICES } from '@common/constants';
import * as restate from '@restatedev/restate-sdk';

import type { GameSessionObject } from './game-session.object';

export interface GameExpiryRequest {
    sessionId: string;
    // Forwarded at schedule() time so expiry handlers can call the correct
    // Virtual Object key without a DB lookup at fire time.
    objectKey: string; // `${userId}:${stageId}`
}

// Forward-reference target — resolved at registration time.
export const GAME_SESSION_RESTATE_TARGET = {
    name: RESTATE_SERVICES.GAME_SESSION,
} as unknown as GameSessionObject;

export function createGameExpiryRestateService() {
    return restate.service({
        name: RESTATE_SERVICES.GAME_EXPIRY,
        handlers: {
            // Fires at expiryAtMs — tells the Virtual Object to stop accepting
            // new board advances and start the grace window.
            markResultProcessing: async (
                ctx: restate.Context,
                request: GameExpiryRequest,
            ): Promise<void> => {
                await ctx
                    .objectClient(GAME_SESSION_RESTATE_TARGET, request.objectKey)
                    .markResultProcessing({ sessionId: request.sessionId });
            },

            // Fires at expiryAtMs + EXPIRY_GRACE_SECONDS — commits full game
            // state to the DB and clears the Virtual Object state.
            finalizeExpiredSession: async (
                ctx: restate.Context,
                request: GameExpiryRequest,
            ): Promise<void> => {
                await ctx
                    .objectClient(GAME_SESSION_RESTATE_TARGET, request.objectKey)
                    .finalizeExpired({ sessionId: request.sessionId });
            },
        },
    });
}

export type GameExpiryRestateService = ReturnType<typeof createGameExpiryRestateService>;

export const GAME_EXPIRY_RESTATE_TARGET = {
    name: RESTATE_SERVICES.GAME_EXPIRY,
} as unknown as GameExpiryRestateService;
