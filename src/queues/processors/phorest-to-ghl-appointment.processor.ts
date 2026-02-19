import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames, SyncJobData } from '../../common/enums/queue.enum';
import { AppointmentSyncService } from '../../sync/services/appointment-sync.service';

/**
 * Processor for Phorest → GHL Appointments Queue
 * 
 * Configuration:
 * - lockDuration: 15 minutes (long-running sync with 1000+ appointments)
 * - concurrency: 1 (prevent overlapping syncs)
 * - stalledInterval: Controlled by lock extension via job.updateProgress()
 */
@Processor(QueueNames.phorestToGhlAppointments, {
    lockDuration: 900000, // 15 minutes - large appointment syncs can take a while
    concurrency: 1,       // Only process one sync at a time
})
export class AppointmentSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(AppointmentSyncProcessor.name);

    constructor(
        private readonly appointmentSyncService: AppointmentSyncService,
    ) {
        super();
    }

    async process(job: Job<SyncJobData>) {
        this.logger.log(`🚀 [APPOINTMENT SYNC] Starting job: ${job.id}`);

        // Update progress periodically to prevent stalling
        await job.updateProgress(0);

        try {
            const result = await this.appointmentSyncService.syncPhorestToGhl({
                jobId: job.id,
                onProgress: async (progress: number) => {
                    await job.updateProgress(progress);
                },
            });

            await job.updateProgress(100);

            const duration = ((result.durationMs || 0) / 1000).toFixed(2);
            this.logger.log(`═══════════════════════════════════════════`);
            this.logger.log(`✅ [APPOINTMENT SYNC] Job ${job.id} completed in ${duration}s`);
            this.logger.log(`   📊 Total: ${result.totalProcessed}`);
            this.logger.log(`   ✨ Created: ${result.created}`);
            this.logger.log(`   🔄 Updated: ${result.updated}`);
            this.logger.log(`   ⏭️  Skipped: ${result.skipped}`);
            this.logger.log(`   ❌ Failed: ${result.failed}`);
            this.logger.log(`   👥 Clients Repaired: ${result.clientsRepaired}`);
            this.logger.log(`   ⏱️  Duration: ${duration}s (${result.durationMs}ms)`);
            this.logger.log(`═══════════════════════════════════════════`);

            return result;
        } catch (error) {
            this.logger.error(`❌ [APPOINTMENT SYNC] Job ${job.id} failed:`, error);
            throw error;
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<SyncJobData>) {
        this.logger.log(`Appointment sync job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<SyncJobData>, error: Error) {
        this.logger.error(
            `Appointment sync job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
        );
    }
}
