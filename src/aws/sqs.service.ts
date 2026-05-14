import {
    DeleteMessageCommand,
    Message,
    ReceiveMessageCommand,
    SQSClient,
} from '@aws-sdk/client-sqs';
import { config } from '@config';
import { GAME_CONFIGS } from '@common/constants';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

type MessageHandler = (message: Message) => Promise<void>;

@Injectable()
export class SqsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SqsService.name);
    private readonly client = new SQSClient({
        region: config.aws.region,
        credentials: {
            accessKeyId: config.aws.accessKeyId,
            secretAccessKey: config.aws.secretAccessKey,
        },
    });

    private readonly handlers: MessageHandler[] = [];
    private stopped = false;

    onModuleInit() {
        void this.poll();
    }

    onModuleDestroy() {
        this.stopped = true;
    }

    subscribe(handler: MessageHandler) {
        this.handlers.push(handler);
    }

    private async poll() {
        while (!this.stopped) {
            try {
                const result = await this.client.send(
                    new ReceiveMessageCommand({
                        QueueUrl: config.aws.sqs.jobQueueUrl,
                        MaxNumberOfMessages: config.aws.sqs.maxMessages,
                        WaitTimeSeconds: config.aws.sqs.pollWaitSeconds,
                        MessageAttributeNames: ['All'],
                        AttributeNames: ['All'],
                    }),
                );

                const messages = result.Messages ?? [];

                await Promise.all(
                    messages.map(async (message) => {
                        try {
                            await Promise.all(this.handlers.map((handler) => handler(message)));
                            await this.client.send(
                                new DeleteMessageCommand({
                                    QueueUrl: config.aws.sqs.jobQueueUrl,
                                    ReceiptHandle: message.ReceiptHandle!,
                                }),
                            );
                        } catch (err) {
                            this.logger.error(
                                `Failed to process message ${message.MessageId}: ${(err as Error).message}`,
                            );
                        }
                    }),
                );
            } catch (err) {
                if (!this.stopped) {
                    this.logger.error(`SQS poll error: ${(err as Error).message}`);
                    await new Promise((resolve) =>
                        setTimeout(resolve, GAME_CONFIGS.SQS_POLL_ERROR_RETRY_MS),
                    );
                }
            }
        }
    }
}
