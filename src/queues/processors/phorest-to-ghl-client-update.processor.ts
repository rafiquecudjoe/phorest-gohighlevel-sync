import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames, SyncJobData } from '../../common/enums/queue.enum';
import { PhorestClientUpdateSyncService, ClientSyncResult } from '../../sync/services/phorest-client-update-sync.service';

/**
 * Processor for Phorest → GHL Client Updates Queue
 */
@Processor(QueueNames.phorestToGhlClientUpdates)
export class ClientUpdateSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(ClientUpdateSyncProcessor.name);

    constructor(
        private readonly clientUpdateSyncService: PhorestClientUpdateSyncService,
    ) {
        super();
    }

    async process(job: Job<SyncJobData>): Promise<ClientSyncResult> {
        this.logger.log(`Processing client sync job: ${job.id}`);

        await job.updateProgress(0);

        try {
            const result = await this.clientUpdateSyncService.syncPhorestToGhl({
                jobId: job.id,
                fullSync: job.data.fullSync,
            });

            await job.updateProgress(100);

            this.logger.log(
                `Client sync completed: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted/banned, ${result.skipped} skipped, ${result.failed} failed`
            );
            return result;

        } catch (error) {
            this.logger.error(`Client update sync job ${job.id} failed:`, error);
            throw error;
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<SyncJobData>) {
        this.logger.log(`Client update sync job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<SyncJobData>, error: Error) {
        this.logger.error(
            `Client update sync job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`
        );
    }
}
