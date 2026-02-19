import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames, SyncJobData } from '../../common/enums/queue.enum';
import { ClientSyncService } from '../../sync/services/client-sync.service';

/**
 * Processor for Phorest → GHL Client Sync Queue
 * Runs every 12 hours to sync clients from Phorest to GHL
 */
@Processor(QueueNames.phorestToGhlClients)
export class PhorestToGhlClientSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(PhorestToGhlClientSyncProcessor.name);

    constructor(
        private readonly clientSyncService: ClientSyncService,
    ) {
        super();
    }

    async process(job: Job<SyncJobData>): Promise<any> {
        this.logger.log(`🔄 [CLIENT SYNC] Starting job: ${job.id}`);

        // Initialize progress
        await job.updateProgress(0);

        try {
            const result = await this.clientSyncService.syncPhorestToGhl({
                jobId: job.id,
                clientId: job.data.entityId, // Support for single client auto-repair
                onProgress: async (progress: number) => {
                    await job.updateProgress(progress);
                },
            });

            // Mark as complete
            await job.updateProgress(100);

            const duration = ((result.durationMs || 0) / 1000).toFixed(2);

            // Log detailed results
            this.logger.log(`═══════════════════════════════════════════`);
            this.logger.log(`✅ [CLIENT SYNC] Job ${job.id} completed in ${duration}s`);
            this.logger.log(`   📊 Total Processed: ${result.totalProcessed}`);
            this.logger.log(`   ✨ Created: ${result.created}`);
            this.logger.log(`   🔄 Updated: ${result.updated}`);
            this.logger.log(`   ⏭️  Skipped: ${result.skipped}`);
            this.logger.log(`   ❌ Failed: ${result.failed}`);
            this.logger.log(`   ⏱️  Duration: ${duration}s (${result.durationMs}ms)`);
            this.logger.log(`═══════════════════════════════════════════`);

            return result;
        } catch (error) {
            this.logger.error(`❌ [CLIENT SYNC] Job ${job.id} failed:`, error);
            throw error;
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<SyncJobData>) {
        this.logger.log(`[CLIENT SYNC] Job ${job.id} completed successfully`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<SyncJobData>, error: Error) {
        this.logger.error(
            `[CLIENT SYNC] Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`
        );
    }
}
