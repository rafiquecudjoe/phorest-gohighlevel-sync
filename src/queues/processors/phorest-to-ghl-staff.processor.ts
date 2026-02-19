import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames, SyncJobData } from '../../common/enums/queue.enum';
import { StaffSyncService, StaffSyncResult } from '../../sync/services/staff-sync.service';

/**
 * Processor for Phorest → GHL Staff Queue
 * Runs every 5 minutes to keep staff in sync
 */
@Processor(QueueNames.phorestToGhlStaff)
export class StaffSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(StaffSyncProcessor.name);

    constructor(
        private readonly staffSyncService: StaffSyncService,
    ) {
        super();
    }

    async process(job: Job<SyncJobData>): Promise<StaffSyncResult> {
        this.logger.log(`🔄 [STAFF SYNC] Starting job: ${job.id}`);

        await job.updateProgress(0);

        try {
            const result = await this.staffSyncService.syncPhorestToGhl({
                jobId: job.id,
            });

            await job.updateProgress(100);

            const duration = ((result.durationMs || 0) / 1000).toFixed(2);

            // Log detailed results
            this.logger.log(`═══════════════════════════════════════════`);
            this.logger.log(`✅ [STAFF SYNC] Job ${job.id} completed in ${duration}s`);
            this.logger.log(`   📊 Total Processed: ${result.totalProcessed}`);
            this.logger.log(`   ✨ Created: ${result.created}`);
            this.logger.log(`   🔄 Updated: ${result.updated}`);
            this.logger.log(`   ⏭️  Skipped: ${result.skipped}`);
            this.logger.log(`   ❌ Failed: ${result.failed}`);
            this.logger.log(`═══════════════════════════════════════════`);

            return result;
        } catch (error) {
            this.logger.error(`❌ [STAFF SYNC] Job ${job.id} failed:`, error);
            throw error;
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<SyncJobData>) {
        this.logger.log(`[STAFF SYNC] Job ${job.id} completed successfully`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<SyncJobData>, error: Error) {
        this.logger.error(
            `[STAFF SYNC] Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`
        );
    }
}

