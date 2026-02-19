import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SyncService } from '../sync.service';
import { SyncValidator } from '../sync.validator';
import { SyncModule } from '../../../sync/sync.module';

describe('SyncService', () => {
    let module: TestingModule;
    let service: SyncService;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                SyncModule,
            ],
            providers: [SyncService, SyncValidator],
        }).compile();

        service = module.get<SyncService>(SyncService);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getSyncStatus', () => {
        it('should return sync status', async () => {
            const result = await service.getSyncStatus();

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data.queueStatus).toBeDefined();
        });
    });

    describe('triggerGhlToPhorestClientSync', () => {
        it('should return job details when triggered', async () => {
            const result = await service.triggerGhlToPhorestClientSync();

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.message).toContain('sync job');
            expect(result.data?.jobId).toBeDefined();
        });
    });

    describe('triggerPhorestToGhlAppointmentSync', () => {
        it('should return job details when triggered', async () => {
            const result = await service.triggerPhorestToGhlAppointmentSync();

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.message).toContain('sync job');
            expect(result.data?.jobId).toBeDefined();
        });
    });
});
