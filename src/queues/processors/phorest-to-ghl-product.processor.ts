import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames, SyncJobData } from '../../common/enums/queue.enum';
import { ProductSyncService } from '../../sync/services/product-sync.service';

@Processor(QueueNames.phorestToGhlProducts)
export class ProductSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(ProductSyncProcessor.name);

    constructor(private readonly productSyncService: ProductSyncService) {
        super();
    }

    async process(job: Job<SyncJobData>): Promise<any> {
        this.logger.log(`Processing product sync job ${job.id}`);

        try {
            const result = await this.productSyncService.syncPhorestProducts({
                jobId: job.id,
            });

            this.logger.log(
                `Product sync job ${job.id} completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`
            );

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Product sync job ${job.id} failed: ${errorMessage}`);
            throw error;
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<SyncJobData>) {
        this.logger.debug(`Job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<SyncJobData>, error: Error) {
        this.logger.error(`Job ${job.id} failed with error: ${error.message}`);
    }
}
