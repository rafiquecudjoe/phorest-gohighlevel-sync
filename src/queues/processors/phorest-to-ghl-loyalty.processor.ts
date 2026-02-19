import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames, SyncJobData } from '../../common/enums/queue.enum';
import { LoyaltySyncService } from '../../sync/services/loyalty-sync.service';

/**
 * Processor for Phorest → GHL Loyalty Points Queue
 */
@Processor(QueueNames.phorestToGhlLoyalty)
export class LoyaltySyncProcessor extends WorkerHost {
    private readonly logger = new Logger(LoyaltySyncProcessor.name);

    constructor(
        private readonly loyaltySyncService: LoyaltySyncService,
    ) {
        super();
    }

    async process(job: Job<SyncJobData>) {
        this.logger.log(`Processing loyalty sync job: ${job.id}`);

        try {
            const result = await this.loyaltySyncService.syncPhorestToGhl({
                jobId: job.id,
            });

            this.logger.log(
                `Loyalty sync completed: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`,
            );
            return result;
        } catch (error) {
            this.logger.error(`Loyalty sync job ${job.id} failed:`, error);
            throw error;
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<SyncJobData>) {
        this.logger.log(`Loyalty sync job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<SyncJobData>, error: Error) {
        this.logger.error(
            `Loyalty sync job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
        );
    }
}
