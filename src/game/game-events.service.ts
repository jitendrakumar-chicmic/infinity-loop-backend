import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class GameEventsService {
    private readonly logger = new Logger(GameEventsService.name);
    private server: Server;

    setServer(server: Server) {
        this.server = server;
    }

    emitTimeout(
        userId: string,
        stageId: string,
        data: { score: number; boardsCompleted: number; boardsTotal: number },
    ) {
        if (!this.server) {
            this.logger.warn('emitTimeout called before server was set');
            return;
        }
        this.server.to(`user:${userId}:stage:${stageId}`).emit('game:already_finished', {
            success: true,
            statusCode: 200,
            message: 'GAME_COMPLETED',
            data: {
                stage: stageId,
                status: 'FAILED',
                reason: 'TIME_UP',
                score: data.score,
                boardsCompleted: data.boardsCompleted,
                boardsTotal: data.boardsTotal,
                message: `Stage ${stageId} is already FAILED`,
            },
        });
    }
}
