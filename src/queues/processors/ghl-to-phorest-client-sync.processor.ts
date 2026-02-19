import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames, SyncJobData } from '../../common/enums/queue.enum';
import { ClientSyncService } from '../../sync/services/client-sync.service';

/**
 * Processor for GHL → Phorest Clients Queue
 */
@Processor(QueueNames.ghlToPhorestClients)
export class GhlToPhorestClientSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(GhlToPhorestClientSyncProcessor.name);

    constructor(
        private readonly clientSyncService: ClientSyncService,
    ) {
        super();
    }

    async process(job: Job<SyncJobData>) {
        this.logger.log(`Processing GHL → Phorest client sync job: ${job.id}`);

        await job.updateProgress(0);

        try {
            const result = await this.clientSyncService.syncGhlToPhorest(job.id);

            await job.updateProgress(100);

            this.logger.log(
                `GHL → Phorest client sync completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed`,
            );
            return result;
        } catch (error) {
            this.logger.error(`GHL → Phorest client sync job ${job.id} failed:`, error);
            throw error;
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<SyncJobData>) {
        this.logger.log(`GHL → Phorest client sync job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<SyncJobData>, error: Error) {
        this.logger.error(
            `GHL → Phorest client sync job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
        );
    }
}
