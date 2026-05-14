import { TOKEN_TYPES, USER_TYPES, GAME_STAGES, GAME_SESSION_STATUS } from '@common/constants';
import { Transactional } from '@common/decorators/transactional.decorator';
import { WsExceptionFilter } from '@common/filters/ws-exception.filter';
import { UserHttpService } from '@common/http/user-http.service';
import { verifyToken } from '@common/utils/token.util';
import { wsSuccess, wsError } from '@common/utils/ws-response.util';
import { config } from '@config';
import { Logger, UseFilters } from '@nestjs/common';
import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
    WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { RedisService, RedisUser } from '../redis/redis.service';
import {
    GameSessionRestateService,
    type RotateResponse,
    type StartGameResponse,
} from '../restate/game-session-restate.service';

import { GameConfigService } from './game-config.service';
import { GameEventsService } from './game-events.service';
import { GameService } from './game.service';

interface SocketData {
    userId: string;
    userName: string;
    user: RedisUser;
    sessionId: string;
    token: string;
    gameSessionId: string | null;
    gameStage: string | null;
}

interface StartPayload {
    stage?: string | number;
}

interface RotatePayload {
    r?: number | string;
    row?: number | string;
    c?: number | string;
    column?: number | string;
    col?: number | string;
    boardId?: string;
    timestamp?: number | string;
}

interface RotateBatchMove {
    r: number;
    c: number;
    timestamp?: number;
}

interface RotateBatchPayload {
    moves: RotateBatchMove[];
}

interface GatewayResponseData {
    grid: number[][];
    isBoardSolved: boolean;
    isStageComplete: boolean;
    nextBoard?: RotateResponse['nextBoard'];
    moves: number;
    remainingTime?: number;
    boardId?: string;
    message?: string;
    completedLevel?: string;
    score?: number;
    boardsCompleted?: number;
    boardsTotal?: number;
}

const ALLOWED_TOKEN_TYPES = [TOKEN_TYPES.LOGIN, TOKEN_TYPES.GAME_SESSION] as const;

function parseMessageBody<T>(incomingPayload: unknown): T {
    if (typeof incomingPayload === 'string') {
        return JSON.parse(incomingPayload) as T;
    }

    return incomingPayload as T;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

@UseFilters(WsExceptionFilter)
@WebSocketGateway({
    cors: {
        origin: true,
        methods: ['GET', 'POST'],
        credentials: true,
    },
    transports: ['websocket'],
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(GameGateway.name);

    constructor(
        private redis: RedisService,
        private gameService: GameService,
        private gameConfigService: GameConfigService,
        private gameSessionRestateService: GameSessionRestateService,
        private gameEvents: GameEventsService,
        private userHttp: UserHttpService,
    ) {}

    private isDevelopment(): boolean {
        return config.env !== 'production';
    }

    afterInit(server: Server) {
        this.gameEvents.setServer(server);
        server.use((socket: Socket, next) => {
            void (async () => {
                try {
                    if (this.isDevelopment()) {
                        this.logger.log(`Connection attempt from socket: ${socket.id}`);
                    }
                    const token =
                        (socket.handshake.auth?.token as string | undefined) ??
                        (socket.handshake.auth?.authorization as string | undefined) ??
                        socket.handshake.headers?.authorization?.replace('Bearer ', '');

                    if (!token) {
                        this.logger.error(
                            `Handshake failed: No token provided | socket: ${socket.id}`,
                        );
                        return next(new Error('NO_TOKEN'));
                    }

                    const payload = verifyToken(token);

                    if (this.isDevelopment()) {
                        this.logger.debug(
                            `[DEBUG] Token accepted | socket: ${socket.id} | tokenType: ${payload.tokenType} | userId: ${payload.userId}`,
                        );
                    }

                    if (
                        payload.userType !== USER_TYPES.USER ||
                        !ALLOWED_TOKEN_TYPES.includes(
                            payload.tokenType as (typeof ALLOWED_TOKEN_TYPES)[number],
                        )
                    ) {
                        return next(new Error('INVALID_TOKEN_TYPE'));
                    }

                    let cached = await this.redis.getSession(payload.sessionId);
                    if (!cached || new Date(cached.expiresAt) < new Date()) {
                        try {
                            const userData = await this.userHttp.checkAuthenticated(token);
                            const sessionTTL = 3600;
                            cached = {
                                userId: userData.id,
                                adminId: null,
                                userType: USER_TYPES.USER,
                                expiresAt: new Date(Date.now() + sessionTTL * 1000).toISOString(),
                            };
                            await this.redis.setSession(payload.sessionId, cached, sessionTTL);
                            await this.redis.setUser(userData.id, {
                                id: userData.id,
                                name: userData.name,
                                stageId: userData.stageId,
                                createdAt: userData.createdAt,
                            });
                        } catch {
                            this.logger.error(
                                `Handshake rejected: session not found and fallback failed | socket: ${socket.id} | sessionId: ${payload.sessionId}`,
                            );
                            return next(new Error('SESSION_EXPIRED'));
                        }
                    }

                    let user = await this.redis.getUser(payload.userId);
                    if (!user) {
                        try {
                            const userData = await this.userHttp.checkAuthenticated(token);
                            user = {
                                id: userData.id,
                                name: userData.name,
                                stageId: userData.stageId,
                                createdAt: userData.createdAt,
                            };
                            await this.redis.setUser(userData.id, user);
                        } catch {
                            this.logger.error(
                                `Handshake rejected: user not found and fallback failed | socket: ${socket.id} | userId: ${payload.userId}`,
                            );
                            return next(new Error('USER_NOT_FOUND'));
                        }
                    }

                    (socket.data as SocketData) = {
                        userId: user.id,
                        userName: user.name,
                        user,
                        sessionId: payload.sessionId,
                        token,
                        gameSessionId: null,
                        gameStage: null,
                    };

                    next();
                } catch {
                    next(new Error('AUTH_FAILED'));
                }
            })();
        });

        if (this.isDevelopment()) {
            this.logger.log('GameGateway initialized on root namespace (/)');
        }
    }

    handleConnection(socket: Socket) {
        const data = socket.data as SocketData;
        this.logger.log(`Connected: ${socket.id} | user: ${data?.userId}`);
        this.gameService
            .getGameMeta()
            .then((meta) => {
                socket.emit('game:meta', wsSuccess(meta));
            })
            .catch((err: unknown) => {
                this.logger.error(
                    `Failed to emit game:meta on connect | socket: ${socket.id} | error: ${getErrorMessage(err)}`,
                );
                socket.emit('exception', wsError('GAME_META_FAILED'));
            });
    }

    async handleDisconnect(socket: Socket) {
        const data = socket.data as SocketData;

        if (this.isDevelopment()) {
            this.logger.log(`Disconnected: ${socket.id} | user: ${data?.userId}`);
        }

        if (data?.gameSessionId) {
            await this.gameSessionRestateService.disconnectGame(
                data.userId,
                data.gameStage ?? data.user.stageId ?? '1',
            );
        }
    }

    /**
     * Explicit request for game metadata (stages, levels, difficulties).
     */
    @SubscribeMessage('game:meta')
    async handleGameMeta() {
        const meta = await this.gameService.getGameMeta();
        return wsSuccess(meta);
    }

    @Transactional()
    @SubscribeMessage('game:start')
    async handleGameStart(
        @ConnectedSocket() socket: Socket,
        @MessageBody() incomingPayload: unknown,
    ) {
        const payload = parseMessageBody<StartPayload>(incomingPayload);
        if (this.isDevelopment()) {
            this.logger.log(`game:start received | payload: ${JSON.stringify(payload)}`);
        }

        const data = socket.data as SocketData;
        const stage = payload?.stage ? payload.stage.toString() : (data.user.stageId ?? '1');
        const stageNumber = Number(stage);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stage);
        const isValidNumericStage = !isNaN(stageNumber) && stageNumber >= GAME_STAGES.MIN && stageNumber <= GAME_STAGES.MAX;

        if (!stage || (!isUuid && !isValidNumericStage)) {
            this.logger.error(
                `Invalid stage resolved: ${stage} | payload: ${JSON.stringify(payload)}`,
            );
            throw new WsException('INVALID_STAGE');
        }

        const roomName = `user:${data.userId}:stage:${stage}`;
        const existingSockets = await this.server.in(roomName).fetchSockets();
        for (const existing of existingSockets) {
            if (existing.id !== socket.id) {
                existing.emit('force:disconnect', wsSuccess(null, 'NEW_CONNECTION'));
                existing.disconnect(true);
            }
        }

        if (this.isDevelopment()) {
            this.logger.log(`Calling startGame for user ${data.userId} stage ${stage}`);
        }
        const result: StartGameResponse = await this.gameSessionRestateService.startGame(
            data.userId,
            stage,
            data.token,
        );
        if (this.isDevelopment()) {
            this.logger.log(`startGame result: ${JSON.stringify(result)}`);
        }

        if (!result.board) {
            const statusLabel =
                result.status === GAME_SESSION_STATUS.COMPLETED ? 'COMPLETED' : 'FAILED';
            const summaryResponse = {
                stage,
                status: statusLabel,
                score: result.score,
                boardsCompleted: result.boardsCompleted,
                boardsTotal: result.boardsTotal,
                message: `Stage ${stage} is already ${statusLabel}`,
            };
            if (this.isDevelopment()) {
                this.logger.log(`Stage already finished, emitting game:already_finished`);
            }
            socket.emit('game:already_finished', wsSuccess(summaryResponse));
            return wsSuccess(summaryResponse);
        }

        const { id: gameSessionId, boardsTotal, board } = result;
        if (!board) {
            this.logger.error(
                `Start failed: no active board returned for user ${data.userId} stage ${stage}`,
            );
            return wsError('NO_ACTIVE_BOARD');
        }
        const gameConfig = await this.gameConfigService
            .getActiveConfig(stage, 'default')
            .catch(() => null);

        data.gameSessionId = gameSessionId;
        data.gameStage = stage;
        await socket.join(roomName);

        const responseData = {
            gameSessionId,
            boardsTotal,
            stage,
            score: result.score || 0,
            boardsCompleted: result.boardsCompleted || 0,
            boardId: board.id,
            moves: board.moves,
            grid: board.grid,
            board: {
                ...board,
                moves: board.moves,
            },
            config: gameConfig ? { timeLimit: gameConfig.timeLimitSec } : null,
        };

        if (this.isDevelopment()) {
            this.logger.log(`Emitting game:started for session ${gameSessionId}`);
        }
        socket.emit('game:started', wsSuccess(responseData));

        return wsSuccess(responseData);
    }

    @Transactional()
    @SubscribeMessage('game:reset')
    async handleGameReset(
        @ConnectedSocket() socket: Socket,
        @MessageBody() incomingPayload: unknown,
    ) {
        return this.handleGameStart(socket, incomingPayload);
    }

    @SubscribeMessage('game:rotate')
    async handleRotate(@ConnectedSocket() socket: Socket, @MessageBody() incomingPayload: unknown) {
        try {
            const payload = parseMessageBody<RotatePayload>(incomingPayload);
            if (this.isDevelopment()) {
                this.logger.log(`game:rotate received | payload: ${JSON.stringify(payload)}`);
            }
            const data = socket.data as SocketData;

            const r = Number(payload?.r ?? payload?.row);
            const c = Number(payload?.c ?? payload?.column ?? payload?.col);
            const boardId: string | undefined = payload?.boardId;
            const timestamp: number | undefined = payload?.timestamp
                ? Number(payload.timestamp)
                : undefined;

            if (isNaN(r) || isNaN(c)) {
                return wsError('INVALID_COORDINATES');
            }

            if (this.isDevelopment()) {
                this.logger.log(
                    `Rotate requested for session: ${data?.gameSessionId} | coords: [${r}, ${c}] | boardId: ${boardId} | timestamp: ${timestamp}`,
                );
            }
            if (!data?.gameSessionId || !data?.gameStage) {
                const stageId = data?.gameStage ?? data?.user?.stageId ?? '1';
                const finished = await this.emitAlreadyFinishedIfTerminal(socket, stageId);
                if (finished) {
                    return wsSuccess(null);
                }
                return wsError('NO_ACTIVE_GAME_SESSION');
            }

            const {
                grid,
                isBoardSolved,
                isStageComplete,
                completedLevel,
                nextBoard,
                moves,
                totalScore,
                boardsCompleted,
                boardsTotal,
                remainingTime,
                currentBoardId,
            }: RotateResponse = await this.gameSessionRestateService.rotateTile(
                data.userId,
                data.gameStage,
                {
                    r,
                    c,
                    boardId,
                    timestamp,
                },
            );

            if (this.isDevelopment()) {
                this.logger.log(
                    `Grid State after rotation:\n${grid.map((row: number[]) => `[${row.join(',')}]`).join('\n')}`,
                );
            }

            const responseData: GatewayResponseData = {
                grid,
                isBoardSolved,
                isStageComplete,
                nextBoard,
                moves,
                remainingTime,
                boardId: currentBoardId,
            };

            if (completedLevel) {
                responseData.message = `${completedLevel} completed`;
                responseData.completedLevel = completedLevel;
            }

            if (isStageComplete) {
                responseData.score = totalScore;
                responseData.boardsCompleted = boardsCompleted;
                responseData.boardsTotal = boardsTotal;
                responseData.message = 'You have completed the game';
                const completedStage = data.gameStage;
                data.gameSessionId = null;
                data.gameStage = null;
                socket.emit('game:rotate', wsSuccess(responseData));
                socket.emit(
                    'game:already_finished',
                    wsSuccess({
                        stage: completedStage,
                        status: 'COMPLETED',
                        score: totalScore,
                        boardsCompleted,
                        boardsTotal,
                        message: `Stage ${completedStage} is already COMPLETED`,
                    }),
                );
                return wsSuccess(responseData);
            }

            socket.emit('game:rotate', wsSuccess(responseData));
            return wsSuccess(responseData);
        } catch (err: unknown) {
            const errorMessage = getErrorMessage(err);
            this.logger.error(`Rotate error: ${errorMessage}`);
            if (errorMessage === 'TIME_UP') {
                return this.emitTimeoutCompletion(socket, socket.data as SocketData);
            }
            if (errorMessage === 'STAGE_ALREADY_FINISHED') {
                const data = socket.data as SocketData;
                const stageId = data?.gameStage ?? data?.user?.stageId ?? '1';
                data.gameSessionId = null;
                data.gameStage = null;
                await this.emitAlreadyFinishedIfTerminal(socket, stageId);
                return wsSuccess(null);
            }
            return wsError(errorMessage || 'ROTATE_FAILED');
        }
    }

    @SubscribeMessage('game:rotate:batch')
    async handleRotateBatch(
        @ConnectedSocket() socket: Socket,
        @MessageBody() incomingPayload: unknown,
    ) {
        try {
            const payload = parseMessageBody<RotateBatchPayload>(incomingPayload);
            if (this.isDevelopment()) {
                this.logger.log(`game:rotate:batch received | payload: ${JSON.stringify(payload)}`);
            }
            const data = socket.data as SocketData;

            if (!payload || !Array.isArray(payload.moves)) {
                return wsError('INVALID_MOVES_BATCH');
            }

            if (!data?.gameSessionId || !data?.gameStage) {
                const stageId = data?.gameStage ?? data?.user?.stageId ?? '1';
                const finished = await this.emitAlreadyFinishedIfTerminal(socket, stageId);
                if (finished) {
                    return wsSuccess(null);
                }
                return wsError('NO_ACTIVE_GAME_SESSION');
            }

            const {
                grid,
                isBoardSolved,
                isStageComplete,
                completedLevel,
                nextBoard,
                moves,
                totalScore,
                boardsCompleted,
                boardsTotal,
                remainingTime,
                currentBoardId,
            }: RotateResponse = await this.gameSessionRestateService.rotateTileBatch(
                data.userId,
                data.gameStage,
                {
                    moves: payload.moves,
                },
            );

            if (this.isDevelopment()) {
                this.logger.log(
                    `Grid State after batch rotation:\n${grid.map((row: number[]) => `[${row.join(',')}]`).join('\n')}`,
                );
            }

            const responseData: GatewayResponseData = {
                grid,
                isBoardSolved,
                isStageComplete,
                nextBoard,
                moves,
                remainingTime,
                boardId: currentBoardId,
            };

            if (completedLevel) {
                responseData.message = `${completedLevel} completed`;
                responseData.completedLevel = completedLevel;
            }

            if (isStageComplete) {
                responseData.score = totalScore;
                responseData.boardsCompleted = boardsCompleted;
                responseData.boardsTotal = boardsTotal;
                responseData.message = 'You have completed the game';
                const completedStage = data.gameStage;
                data.gameSessionId = null;
                data.gameStage = null;
                socket.emit('game:rotate', wsSuccess(responseData));
                socket.emit(
                    'game:already_finished',
                    wsSuccess({
                        stage: completedStage,
                        status: 'COMPLETED',
                        score: totalScore,
                        boardsCompleted,
                        boardsTotal,
                        message: `Stage ${completedStage} is already COMPLETED`,
                    }),
                );
                return wsSuccess(responseData);
            }

            socket.emit('game:rotate', wsSuccess(responseData));
            return wsSuccess(responseData);
        } catch (err: unknown) {
            const errorMessage = getErrorMessage(err);
            this.logger.error(`Rotate batch error: ${errorMessage}`);
            if (errorMessage === 'TIME_UP') {
                return this.emitTimeoutCompletion(socket, socket.data as SocketData);
            }
            if (errorMessage === 'STAGE_ALREADY_FINISHED') {
                const data = socket.data as SocketData;
                const stageId = data?.gameStage ?? data?.user?.stageId ?? '1';
                data.gameSessionId = null;
                data.gameStage = null;
                await this.emitAlreadyFinishedIfTerminal(socket, stageId);
                return wsSuccess(null);
            }
            return wsError(errorMessage || 'ROTATE_BATCH_FAILED');
        }
    }

    @Transactional()
    @SubscribeMessage('game:complete')
    async handleGameComplete(
        @ConnectedSocket() socket: Socket,
        @MessageBody() incomingPayload: unknown,
    ) {
        const payload = parseMessageBody<Record<string, unknown>>(incomingPayload);
        if (this.isDevelopment()) {
            this.logger.log(`game:complete received | payload: ${JSON.stringify(payload)}`);
        }
        const data = socket.data as SocketData;

        const stage = data.gameStage ?? data.user.stageId ?? '1';

        if (!data.gameSessionId) {
            const finished = await this.emitAlreadyFinishedIfTerminal(socket, stage);
            if (finished) {
                return wsSuccess(null);
            }
            throw new WsException('NO_ACTIVE_GAME_SESSION');
        }
        
        await this.gameSessionRestateService.completeGame(data.userId, stage);

        data.gameSessionId = null;
        data.gameStage = null;

        const summary = await this.gameService.getTerminalSummary(data.userId, stage);
        const statusLabel =
            summary?.status === GAME_SESSION_STATUS.COMPLETED ? 'COMPLETED' : 'FAILED';
        const responseData = {
            stage,
            status: statusLabel,
            score: summary?.score ?? 0,
            moves: summary?.moves ?? 0,
            boardsCompleted: summary?.boardsCompleted ?? 0,
            boardsTotal: summary?.boardsTotal ?? 0,
            message: `Stage ${stage} is already ${statusLabel}`,
        };
        socket.emit('game:already_finished', wsSuccess(responseData, 'GAME_COMPLETED'));
        return wsSuccess(responseData, 'GAME_COMPLETED');
    }

    private async emitAlreadyFinishedIfTerminal(socket: Socket, stageId: string): Promise<boolean> {
        const data = socket.data as SocketData;
        const summary = await this.gameService.getTerminalSummary(data.userId, stageId);
        if (!summary) {
            return false;
        }
        const statusLabel =
            summary.status === GAME_SESSION_STATUS.COMPLETED ? 'COMPLETED' : 'FAILED';
        socket.emit(
            'game:already_finished',
            wsSuccess({
                stage: stageId,
                status: statusLabel,
                score: summary.score,
                boardsCompleted: summary.boardsCompleted,
                boardsTotal: summary.boardsTotal,
                message: `Stage ${stageId} is already ${statusLabel}`,
            }),
        );
        return true;
    }

    private async emitTimeoutCompletion(socket: Socket, data: SocketData) {
        if (!data?.gameStage) {
            return wsError('TIME_UP');
        }

        const stageId = data.gameStage;
        const summary = await this.gameService.getTerminalSummary(data.userId, stageId);

        data.gameSessionId = null;
        data.gameStage = null;

        const responseData = {
            stage: stageId,
            status: 'FAILED',
            reason: 'TIME_UP',
            score: summary?.score ?? 0,
            moves: summary?.moves ?? 0,
            boardsCompleted: summary?.boardsCompleted ?? 0,
            boardsTotal: summary?.boardsTotal ?? 0,
            message: `Stage ${stageId} is already FAILED`,
        };

        socket.emit('game:already_finished', wsSuccess(responseData, 'GAME_COMPLETED'));
        return wsSuccess(responseData, 'GAME_COMPLETED');
    }
}
