import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames, SyncJobData } from '../../common/enums/queue.enum';
import { SyncAuditService } from '../../sync/services/sync-audit.service';

/**
 * Processor for Sync Audit Queue
 * Runs at midnight to compare local DB with GHL
 */
@Processor(QueueNames.syncAudit)
export class SyncAuditProcessor extends WorkerHost {
    private readonly logger = new Logger(SyncAuditProcessor.name);

    constructor(private readonly syncAuditService: SyncAuditService) {
        super();
    }

    async process(job: Job<SyncJobData>) {
        this.logger.log(`🔍 Starting comprehensive sync audit job: ${job.id}`);

        try {
            const result = await this.syncAuditService.runFullAudit();

            this.logger.log('═══════════════════════════════════════════');
            this.logger.log(`🔍 SYNC AUDIT COMPLETE - ${result.auditRunId}`);
            this.logger.log('═══════════════════════════════════════════');
            this.logger.log(`✅ Match: ${result.matchCount}`);
            this.logger.log(`⚠️  Mismatch: ${result.mismatchCount}`);
            this.logger.log(`❌ Failed: ${result.failedCount}`);
            this.logger.log(`⏭️  Skipped: ${result.skippedCount}`);

            // Log appointment audit details
            const appointmentAudit = result.entities.find(e => e.entityType === 'appointment');
            if (appointmentAudit) {
                this.logger.log(`📅 Appointments: Local=${appointmentAudit.localCount}, GHL=${appointmentAudit.ghlCount}`);
                if (appointmentAudit.orphanedInGhl?.length) {
                    this.logger.warn(`   ⚠️ Orphaned in GHL: ${appointmentAudit.orphanedInGhl.length}`);
                }
                if (appointmentAudit.missingInGhl?.length) {
                    this.logger.warn(`   ⚠️ Missing in GHL: ${appointmentAudit.missingInGhl.length}`);
                }
            }

            // Log checkin audit details
            if (result.checkinAudit) {
                this.logger.log(`📋 Check-in Notes: ${result.checkinAudit.notesFound}/${result.checkinAudit.sampleSize} found`);
                if (result.checkinAudit.notesMissing > 0) {
                    this.logger.warn(`   ⚠️ Missing notes: ${result.checkinAudit.notesMissing}`);
                }
            }

            this.logger.log(`⏱️  Duration: ${result.totalDurationMs}ms`);
            this.logger.log('═══════════════════════════════════════════');

            return result;
        } catch (error) {
            this.logger.error(`Sync audit job ${job.id} failed:`, error);
            throw error;
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<SyncJobData>) {
        this.logger.log(`✅ Sync audit job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<SyncJobData>, error: Error) {
        this.logger.error(
            `❌ Sync audit job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
        );
    }
}
