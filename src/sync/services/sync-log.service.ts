import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SyncDirection, SyncEntityType } from '../../common/enums/queue.enum';
import { v4 as uuidv4 } from 'uuid';

export interface CreateSyncRunParams {
    jobId?: string;
    direction: SyncDirection;
    entityType: SyncEntityType;
}

export interface LogSyncItemParams {
    runId: string;
    batchId: string;
    jobId?: string;
    entityType: SyncEntityType;
    entityId?: string;
    direction: SyncDirection;
    action: 'create' | 'update' | 'skip' | 'delete';
    status: 'success' | 'failed' | 'skipped';
    errorCode?: string;
    errorMessage?: string;
    retryCount?: number;
    sourceData?: object;
    targetData?: object;
    responseData?: object;
    startedAt: Date;
    completedAt?: Date;
}

export interface SyncStatusResponse {
    lastRun: Date | null;
    status: 'healthy' | 'degraded' | 'failed' | 'no_runs';
    recentFailures: number;
    lastError: string | null;
    mappings?: {
        staff: number;
        client: number;
        appointment: number;
        product: number;
        checkin: number;
    };
    recentRuns?: any[];
}

@Injectable()
export class SyncLogService {
    private readonly logger = new Logger(SyncLogService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Create a new sync run summary and return the batch ID
     */
    async createSyncRun(params: CreateSyncRunParams): Promise<{ runId: string; batchId: string }> {
        const batchId = `batch_${uuidv4()}`;

        const run = await this.prisma.syncRunSummary.create({
            data: {
                batchId,
                jobId: params.jobId,
                direction: params.direction,
                entityType: params.entityType,
                status: 'running',
                startedAt: new Date(),
            },
        });

        this.logger.log(`Created sync run: ${batchId} for ${params.direction} ${params.entityType}`);
        return { runId: run.id, batchId };
    }

    /**
     * Log a single sync item result
     */
    async logSyncItem(params: LogSyncItemParams): Promise<void> {
        const durationMs = params.completedAt
            ? params.completedAt.getTime() - params.startedAt.getTime()
            : undefined;

        await this.prisma.syncLog.create({
            data: {
                runId: params.runId,
                batchId: params.batchId,
                jobId: params.jobId,
                entityType: params.entityType,
                entityId: params.entityId,
                direction: params.direction,
                action: params.action,
                status: params.status,
                errorCode: params.errorCode,
                errorMessage: params.errorMessage,
                retryCount: params.retryCount || 0,
                sourceData: params.sourceData as object,
                targetData: params.targetData as object,
                responseData: params.responseData as object,
                startedAt: params.startedAt,
                completedAt: params.completedAt,
                durationMs,
            },
        });
    }

    /**
     * Complete a sync run with final counts
     */
    async completeSyncRun(
        runId: string,
        result: {
            totalRecords: number;
            successCount: number;
            failedCount: number;
            skippedCount: number;
            lastError?: string;
        },
    ): Promise<void> {
        const run = await this.prisma.syncRunSummary.findUnique({
            where: { id: runId },
        });

        if (!run) {
            this.logger.error(`Sync run not found: ${runId}`);
            return;
        }

        const completedAt = new Date();
        const durationMs = completedAt.getTime() - run.startedAt.getTime();

        let status: string;
        if (result.failedCount === 0) {
            status = 'completed';
        } else if (result.successCount === 0) {
            status = 'failed';
        } else {
            status = 'partial';
        }

        await this.prisma.syncRunSummary.update({
            where: { id: runId },
            data: {
                totalRecords: result.totalRecords,
                successCount: result.successCount,
                failedCount: result.failedCount,
                skippedCount: result.skippedCount,
                status,
                completedAt,
                durationMs,
                lastError: result.lastError,
            },
        });

        this.logger.log(
            `Completed sync run ${runId}: ${result.successCount}/${result.totalRecords} success, ${result.failedCount} failed`,
        );
    }

    /**
     * Update heartbeat for a running sync job to prevent it from being marked as stale
     * Call this periodically (e.g., every batch or every minute) to keep the job alive
     */
    async updateSyncRunHeartbeat(runId: string): Promise<void> {
        await this.prisma.syncRunSummary.update({
            where: { id: runId },
            data: {
                updatedAt: new Date(), // Update the updatedAt timestamp to indicate it's still active
            },
        });
    }

    /**
     * Mark a sync run as failed
     */
    async failSyncRun(runId: string, errorMessage: string): Promise<void> {
        await this.prisma.syncRunSummary.update({
            where: { id: runId },
            data: {
                status: 'failed',
                completedAt: new Date(),
                lastError: errorMessage,
            },
        });
        this.logger.error(`Sync run ${runId} failed: ${errorMessage}`);
    }

    /**
     * Get quick sync status for health check
     */
    async getSyncStatus(): Promise<SyncStatusResponse> {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

        // First, clean up any stale running jobs before fetching status
        await this.cleanupStaleRunningJobs(5);

        const [lastRun, recentFailedRuns, recentRuns, staffCount, clientCount, appointmentCount, productCount, checkinCount, bookingCount] = await Promise.all([
            this.prisma.syncRunSummary.findFirst({
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.syncRunSummary.count({
                where: {
                    createdAt: { gte: oneDayAgo },
                    status: 'failed',
                },
            }),
            this.prisma.syncRunSummary.findMany({
                where: {
                    // Exclude stale "running" jobs from display
                    OR: [
                        { status: { not: 'running' } },
                        { 
                            status: 'running',
                            startedAt: { gte: staleThreshold }
                        }
                    ]
                },
                orderBy: { createdAt: 'desc' },
                take: 10,
            }),
            this.prisma.entityMapping.count({ where: { entityType: 'staff' } }),
            this.prisma.entityMapping.count({ where: { entityType: 'client' } }),
            this.prisma.entityMapping.count({ where: { entityType: 'appointment' } }),
            this.prisma.entityMapping.count({ where: { entityType: 'product' } }),
            this.prisma.entityMapping.count({ where: { entityType: 'checkin' } }),
            this.prisma.entityMapping.count({ where: { entityType: 'booking' } }),
        ]);

        const mappings = {
            staff: staffCount,
            client: clientCount,
            appointment: appointmentCount,
            product: productCount,
            checkin: checkinCount,
            booking: bookingCount,
        };

        if (!lastRun) {
            return {
                lastRun: null,
                status: 'no_runs',
                recentFailures: 0,
                lastError: null,
                mappings,
                recentRuns: [],
            };
        }

        let status: 'healthy' | 'degraded' | 'failed';
        if (lastRun.status === 'failed') {
            status = 'failed';
        } else if (recentFailedRuns > 0 || lastRun.status === 'partial') {
            status = 'degraded';
        } else {
            status = 'healthy';
        }

        return {
            lastRun: lastRun.completedAt || lastRun.startedAt,
            status,
            recentFailures: recentFailedRuns,
            lastError: lastRun.lastError,
            mappings,
            recentRuns,
        };
    }

    /**
     * Get failed sync runs
     */
    async getFailedRuns(limit = 10) {
        return this.prisma.syncRunSummary.findMany({
            where: { status: { in: ['failed', 'partial'] } },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /**
     * Get sync logs for a specific run
     */
    async getSyncLogs(runId: string, options?: { status?: string; limit?: number }) {
        return this.prisma.syncLog.findMany({
            where: {
                runId,
                ...(options?.status && { status: options.status }),
            },
            orderBy: { createdAt: 'desc' },
            take: options?.limit || 100,
        });
    }

    /**
     * Get recent failed logs across all runs
     */
    async getRecentFailedLogs(limit = 50) {
        return this.prisma.syncLog.findMany({
            where: { status: 'failed' },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                run: {
                    select: {
                        batchId: true,
                        direction: true,
                        entityType: true,
                    },
                },
            },
        });
    }

    /**
     * Mark stale running jobs as failed
     * Jobs that have been "running" for longer than the timeout are considered stale
     * Uses updatedAt to check for heartbeat, falls back to startedAt if updatedAt not set
     */
    async cleanupStaleRunningJobs(timeoutMinutes = 5): Promise<number> {
        const cutoffTime = new Date();
        cutoffTime.setMinutes(cutoffTime.getMinutes() - timeoutMinutes);

        // Find all running jobs where updatedAt is older than cutoff (no recent heartbeat)
        const staleJobs = await this.prisma.syncRunSummary.findMany({
            where: {
                status: 'running',
                updatedAt: { lt: cutoffTime },
            },
        });

        if (staleJobs.length === 0) {
            return 0;
        }

        // Update all stale jobs to failed
        const result = await this.prisma.syncRunSummary.updateMany({
            where: {
                id: { in: staleJobs.map(job => job.id) }
            },
            data: {
                status: 'failed',
                completedAt: new Date(),
                lastError: `Job timed out after ${timeoutMinutes} minutes (no heartbeat detected)`,
            },
        });

        if (result.count > 0) {
            this.logger.warn(`Cleaned up ${result.count} stale running jobs (older than ${timeoutMinutes} minutes)`);
        }

        return result.count;
    }
}
