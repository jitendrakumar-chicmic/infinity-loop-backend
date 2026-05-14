import * as http2 from 'http2';

import { config } from '@config';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as restate from '@restatedev/restate-sdk/node';

import { GameService } from '../game/game.service';

import { createGameExpiryRestateService } from './game-expiry.restate';
import { createGameSessionObject } from './game-session.object';

@Injectable()
export class RestateEndpointService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RestateEndpointService.name);
    private server: http2.Http2Server | null = null;

    constructor(private readonly gameService: GameService) {}

    async onModuleInit(): Promise<void> {
        const handler = restate.createEndpointHandler({
            services: [createGameExpiryRestateService(), createGameSessionObject(this.gameService)],
        });

        this.server = http2.createServer(handler);

        try {
            await new Promise<void>((resolve, reject) => {
                this.server!.once('error', reject);
                this.server!.listen(config.restate.endpointPort, () => {
                    this.server!.off('error', reject);
                    resolve();
                });
            });
            this.logger.log(`Restate endpoint listening on port ${config.restate.endpointPort}`);
        } catch (err: unknown) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'EADDRINUSE') {
                this.logger.warn(
                    `Restate endpoint port ${config.restate.endpointPort} already in use — running without Restate (fallback mode active).`,
                );
                this.server = null;
                return;
            }
            throw err;
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (!this.server) {
            return;
        }
        await new Promise<void>((resolve, reject) => {
            this.server!.close((err) => (err ? reject(err) : resolve()));
        });
        this.server = null;
    }
}
