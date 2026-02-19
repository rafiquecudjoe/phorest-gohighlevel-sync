import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportedEntityService } from './reported-entity.service';
import { SyncLogService } from './sync-log.service';
import { PrismaService } from '../../common/prisma.service';

export interface RetryConfig {
    maxRetryAge: number; // in days
    maxRetryAttempts: number;
    retryableErrorCodes: string[];
    skipErrorCodes: string[]; // Don't retry these (permanent failures)
}

/**
 * Automatic Retry Service
 * Handles scheduled retries of failed sync operations
 */
@Injectable()
export class AutoRetryService {
    private readonly logger = new Logger(AutoRetryService.name);

    private readonly config: RetryConfig = {
        maxRetryAge: 7, // Don't retry errors older than 7 days
        maxRetryAttempts: 4, // Max 4 retry attempts (after initial failure)
        retryableErrorCodes: [
            'ETIMEDOUT',
            'ECONNRESET',
            'ECONNABORTED',
            '502',
            '503',
            '520',
            '504',
            'timeout',
        ],
        skipErrorCodes: [
            '400', // Bad Request - data validation error
            '401', // Unauthorized - auth issue
            '403', // Forbidden - permission issue
            '404', // Not Found - entity doesn't exist
            '422', // Unprocessable Entity - validation error
        ],
    };

    constructor(
        private readonly reportedEntityService: ReportedEntityService,
        private readonly syncLogService: SyncLogService,
        private readonly prisma: PrismaService,
    ) { }

    /**
     * Scheduled cron job - runs every hour to retry failed records
     */
    @Cron(CronExpression.EVERY_HOUR)
    async autoRetryFailedSyncs() {
        this.logger.log('🔄 Starting scheduled maintenance...');

        try {
            // Step 1: Clean up stale running jobs (stuck for >5 minutes)
            const staleCount = await this.syncLogService.cleanupStaleRunningJobs(5);
            if (staleCount > 0) {
                this.logger.log(`🧹 Cleaned up ${staleCount} stale running jobs`);
            }

            // Step 2: Retry failed syncs
            const stats = await this.retryFailedRecords();

            this.logger.log(
                `✅ Scheduled retry complete: ${stats.attempted} attempted, ${stats.succeeded} succeeded, ${stats.failed} failed, ${stats.skipped} skipped`
            );
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`❌ Scheduled retry failed: ${errorMessage}`);
        }
    }

    /**
     * Retry all eligible failed records
     */
    async retryFailedRecords(): Promise<{
        attempted: number;
        succeeded: number;
        failed: number;
        skipped: number;
    }> {
        const stats = {
            attempted: 0,
            succeeded: 0,
            failed: 0,
            skipped: 0,
        };

        // Get recent unresolved failures
        const failures = await this.reportedEntityService.getRecentFailures(100);

        for (const failure of failures) {
            // Check if error is retryable
            if (!this.shouldRetry(failure)) {
                stats.skipped++;
                continue;
            }

            stats.attempted++;

            try {
                const success = await this.retrySingleEntity(failure);

                if (success) {
                    stats.succeeded++;
                    // Mark as resolved
                    await this.reportedEntityService.markResolved(failure.id);
                } else {
                    stats.failed++;
                }
            } catch (error: unknown) {
                stats.failed++;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(
                    `Failed to retry ${failure.entityType} ${failure.entityId}: ${errorMessage}`
                );
            }
        }

        return stats;
    }

    /**
     * Determine if an error should be retried
     */
    private shouldRetry(failure: { timestamp: Date; errorCode: string | null; entityType: string; entityId: string }): boolean {
        // Don't retry if too old
        const ageInDays = (Date.now() - failure.timestamp.getTime()) / (1000 * 60 * 60 * 24);
        if (ageInDays > this.config.maxRetryAge) {
            this.logger.debug(`Skipping ${failure.entityType} ${failure.entityId} - too old (${ageInDays.toFixed(1)} days)`);
            return false;
        }

        // Don't retry permanent errors (validation, not found, etc.)
        if (failure.errorCode && this.config.skipErrorCodes.includes(failure.errorCode)) {
            this.logger.debug(
                `Skipping ${failure.entityType} ${failure.entityId} - permanent error (${failure.errorCode})`
            );
            return false;
        }

        return true;
    }

    /**
     * Retry a single entity based on its type
     */
    private async retrySingleEntity(failure: { entityType: string; entityId: string }): Promise<boolean> {
        this.logger.log(`Retrying ${failure.entityType} ${failure.entityId}...`);

        try {
            switch (failure.entityType) {
                case 'client':
                    return await this.retryClient(failure.entityId);

                case 'appointment':
                    return await this.retryAppointment(failure.entityId);

                case 'loyalty':
                    return await this.retryLoyalty(failure.entityId);

                default:
                    this.logger.warn(`Unknown entity type: ${failure.entityType}`);
                    return false;
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Retry failed for ${failure.entityType} ${failure.entityId}: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Retry a failed client sync
     */
    private async retryClient(phorestClientId: string): Promise<boolean> {
        try {
            // Check if client exists in local DB
            const client = await this.prisma.phorestClient.findUnique({
                where: { phorestId: phorestClientId },
            });

            if (!client) {
                this.logger.warn(`Client ${phorestClientId} not found in local DB`);
                return false;
            }

            // TODO: Add single client sync method to ClientSyncService
            this.logger.log(`Would retry client sync for ${phorestClientId}`);
            return true;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to retry client ${phorestClientId}: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Retry a failed appointment sync
     */
    private async retryAppointment(phorestAppointmentId: string): Promise<boolean> {
        try {
            // Check if appointment exists in local DB
            const appointment = await this.prisma.phorestAppointment.findUnique({
                where: { phorestId: phorestAppointmentId },
            });

            if (!appointment) {
                this.logger.warn(`Appointment ${phorestAppointmentId} not found in local DB`);
                return false;
            }

            // TODO: Add single appointment sync method to AppointmentSyncService
            this.logger.log(`Would retry appointment sync for ${phorestAppointmentId}`);
            return true;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to retry appointment ${phorestAppointmentId}: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Retry a failed loyalty sync
     */
    private async retryLoyalty(phorestClientId: string): Promise<boolean> {
        try {
            // Loyalty retry is the same as client retry since loyalty is client-based
            return await this.retryClient(phorestClientId);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to retry loyalty ${phorestClientId}: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Manual trigger for retry (can be called from API endpoint)
     */
    async manualRetry(entityType: string, entityId: string): Promise<boolean> {
        this.logger.log(`Manual retry triggered for ${entityType} ${entityId}`);

        const failure = {
            entityType,
            entityId,
            timestamp: new Date(),
            errorCode: null,
        };

        return await this.retrySingleEntity(failure);
    }
}
