import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { GhlWebhooksService } from '../ghl-webhooks.service';
import { GhlWebhooksValidator } from '../ghl-webhooks.validator';
import { SyncModule } from '../../../sync/sync.module';
import { BullModule } from '@nestjs/bullmq';
import { QueueNames } from '../../../common/enums/queue.enum';

describe('GhlWebhooksService', () => {
    let module: TestingModule;
    let service: GhlWebhooksService;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                BullModule.forRoot({
                    connection: {
                        host: process.env.REDIS_HOST || 'localhost',
                        port: parseInt(process.env.REDIS_PORT || '6379'),
                    },
                }),
                BullModule.registerQueue({ name: QueueNames.ghlWebhooks }),
                SyncModule,
            ],
            providers: [GhlWebhooksService, GhlWebhooksValidator],
        }).compile();

        service = module.get<GhlWebhooksService>(GhlWebhooksService);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('handleWebhook', () => {
        it('should reject webhook with missing payload', async () => {
            const result = await service.handleWebhook(null);

            expect(result).toBeDefined();
            expect(result.success).toBe(false);
            expect(result.status).toBe(200); // Always 200 to prevent GHL retries
        });

        it('should reject webhook with missing type', async () => {
            const result = await service.handleWebhook({
                locationId: 'test-location',
                id: 'test-id',
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(false);
        });

        it('should reject webhook with wrong locationId', async () => {
            const result = await service.handleWebhook({
                type: 'ContactCreate',
                locationId: 'wrong-location-id',
                id: 'test-id',
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(false);
            expect(result.message).toContain('Unauthorized');
        });

        it('should acknowledge non-processable event types', async () => {
            process.env.GHL_LOCATION_ID = 'test-location';

            const result = await service.handleWebhook({
                type: 'UnknownEvent',
                locationId: 'test-location',
                id: 'test-id',
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.message).toContain('acknowledged');
        });
    });

    describe('getQueueStatus', () => {
        it('should return queue status', async () => {
            const result = await service.getQueueStatus();

            expect(result).toBeDefined();
            expect(typeof result.waiting).toBe('number');
            expect(typeof result.active).toBe('number');
            expect(typeof result.completed).toBe('number');
            expect(typeof result.failed).toBe('number');
        });
    });
});
