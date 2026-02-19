import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames, SyncJobData } from '../../common/enums/queue.enum';
import { BookingSyncService } from '../../sync/services/booking-sync.service';

/**
 * Processor for Phorest → GHL Bookings Queue
 */
@Processor(QueueNames.phorestToGhlBookings)
export class BookingSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(BookingSyncProcessor.name);

    constructor(
        private readonly bookingSyncService: BookingSyncService,
    ) {
        super();
    }

    async process(job: Job<SyncJobData>) {
        this.logger.log(`Processing booking sync job: ${job.id}`);

        try {
            const result = await this.bookingSyncService.syncPhorestToGhl({
                jobId: job.id,
            });

            this.logger.log(
                `Booking sync completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed`,
            );
            return result;
        } catch (error) {
            this.logger.error(`Booking sync job ${job.id} failed:`, error);
            throw error;
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<SyncJobData>) {
        this.logger.log(`Booking sync job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<SyncJobData>, error: Error) {
        this.logger.error(
            `Booking sync job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
        );
    }
}
