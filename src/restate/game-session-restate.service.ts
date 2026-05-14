import { RESTATE_SERVICES } from '@common/constants';
import { config } from '@config';
import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import * as restateClients from '@restatedev/restate-sdk-clients';

import { GameService } from '../game/game.service';

import type {
    GameSessionObject,
    CompleteGameRequest,
    GetStatusRequest,
    RotateBatchRequest,
    RotateTileRequest,
    StartGameRequest,
} from './game-session.object';

const GAME_SESSION_TARGET = {
    name: RESTATE_SERVICES.GAME_SESSION,
} as unknown as GameSessionObject;

export interface RestateBoardResponse {
    id: string;
    sessionBoardId: string;
    gridX: number;
    gridY: number;
    grid: number[][];
    color?: string | null;
    moves: number;
}

export interface StartGameResponse {
    id: string | null;
    status?: number;
    score?: number;
    moves?: number;
    boardsCompleted: number;
    boardsTotal: number;
    message?: string;
    board?: RestateBoardResponse | null;
}

export interface RotateResponse {
    grid: number[][];
    isBoardSolved: boolean;
    isStageComplete: boolean;
    completedLevel?: string | null;
    nextBoard?: RestateBoardResponse | null;
    moves: number;
    totalScore?: number;
    boardsCompleted?: number;
    boardsTotal?: number;
    remainingTime?: number;
    currentBoardId?: string;
}

export type GetStatusResponse = StartGameResponse;
export interface CompleteGameResponse {
    score: number;
    status: number;
}

@Injectable()
export class GameSessionRestateService {
    private readonly logger = new Logger(GameSessionRestateService.name);
    private readonly restateClient = restateClients.connect({ url: config.restate.ingressUrl });

    constructor(
        @Inject(forwardRef(() => GameService))
        private readonly gameService: GameService,
    ) {}

    async startGame(userId: string, stageId: string, token?: string): Promise<StartGameResponse> {
        void token;
        return this.call('startGame', userId, stageId, () =>
            this.client(userId, stageId).startGame({ userId, stageId } satisfies StartGameRequest),
        );
    }

    async rotateTile(
        userId: string,
        stageId: string,
        req: RotateTileRequest,
    ): Promise<RotateResponse> {
        return this.call('rotateTile', userId, stageId, () =>
            this.client(userId, stageId).rotateTile(req),
        );
    }

    async rotateTileBatch(
        userId: string,
        stageId: string,
        req: RotateBatchRequest,
    ): Promise<RotateResponse> {
        return this.call('rotateTileBatch', userId, stageId, () =>
            this.client(userId, stageId).rotateTileBatch(req),
        );
    }

    async completeGame(
        userId: string,
        stageId: string,
        reason?: 'MANUAL' | 'DISCONNECT',
    ): Promise<CompleteGameResponse> {
        return this.call('completeGame', userId, stageId, () =>
            this.client(userId, stageId).completeGame({ reason } satisfies CompleteGameRequest),
        );
    }

    async disconnectGame(userId: string, stageId: string): Promise<void> {
        return this.call('disconnectGame', userId, stageId, () =>
            this.client(userId, stageId).disconnectGame({}),
        );
    }

    async getStatus(userId: string, stageId: string): Promise<GetStatusResponse> {
        return this.call('getStatus', userId, stageId, () =>
            this.client(userId, stageId).getStatus({ userId, stageId } satisfies GetStatusRequest),
        );
    }

    private objectKey(userId: string, stageId: string): string {
        return `${userId}:${stageId}`;
    }

    private client(userId: string, stageId: string) {
        return this.restateClient.objectClient(
            GAME_SESSION_TARGET,
            this.objectKey(userId, stageId),
        );
    }

    private async call<T>(
        operation: string,
        userId: string,
        stageId: string,
        fn: () => PromiseLike<T>,
    ): Promise<T> {
        try {
            return await fn();
        } catch (err) {
            if (this.isRestateIngressUnavailable(err)) {
                this.logger.error(
                    `Restate ingress unavailable for ${operation} (${userId}:${stageId}). ` +
                        `Game state is managed exclusively by Restate.`,
                );
                throw new Error('RESTATE_UNAVAILABLE');
            }
            throw err;
        }
    }

    private isRestateIngressUnavailable(err: unknown): boolean {
        const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
        const lower = message.toLowerCase();
        if (lower.includes('fetch failed')) {
            return true;
        }
        if (lower.includes('econnrefused')) {
            return true;
        }
        if (lower.includes('unable to connect')) {
            return true;
        }
        if (lower.includes('failed to fetch')) {
            return true;
        }
        if (lower.includes('network')) {
            return true;
        }

        const cause = (err as { cause?: unknown })?.cause;
        if (cause instanceof Error) {
            const cl = cause.message.toLowerCase();
            return (
                cl.includes('fetch failed') ||
                cl.includes('econnrefused') ||
                cl.includes('unable to connect') ||
                cl.includes('failed to fetch')
            );
        }
        return false;
    }
}
