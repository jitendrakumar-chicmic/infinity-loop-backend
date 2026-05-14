import { Module } from '@nestjs/common';

import { SnsService } from './sns.service';
import { SqsService } from './sqs.service';

@Module({
    providers: [SnsService, SqsService],
    exports: [SnsService, SqsService],
})
export class AwsModule {}
