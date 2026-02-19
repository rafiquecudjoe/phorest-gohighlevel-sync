import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { QueueNames } from '../../common/enums/queue.enum';
import { GhlWebhooksController } from './ghl-webhooks.controller';
import { GhlWebhooksService } from './ghl-webhooks.service';
import { GhlWebhooksValidator } from './ghl-webhooks.validator';
import { GhlWebhooksProcessor } from '../../queues/processors/ghl-webhooks.processor';
import { SyncModule } from '../../sync/sync.module';

@Module({
    imports: [
        ConfigModule,
        SyncModule,

        // Register webhook queue
        BullModule.registerQueue({ name: QueueNames.ghlWebhooks }),

        // Register with Bull Board for monitoring
        BullBoardModule.forFeature({
            name: QueueNames.ghlWebhooks,
            adapter: BullMQAdapter,
        }),
    ],
    controllers: [GhlWebhooksController],
    providers: [
        GhlWebhooksService,
        GhlWebhooksValidator,
        GhlWebhooksProcessor,
    ],
    exports: [GhlWebhooksService],
})
export class WebhooksModule { }
