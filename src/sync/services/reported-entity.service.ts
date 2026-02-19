import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface ReportFailureParams {
    entityType: string;
    entityId: string;
    errorMessage: string;
    errorCode?: string;
}

export interface FailureRecord {
    id: number;
    entityType: string;
    entityId: string;
    errorMessage: string;
    errorCode: string | null;
    timestamp: Date;
    resolved: boolean;
}

@Injectable()
export class ReportedEntityService {
    private readonly logger = new Logger(ReportedEntityService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Report a failed sync operation
     */
    async reportFailure(params: ReportFailureParams): Promise<FailureRecord> {
        this.logger.warn(
            `Reporting failure: ${params.entityType} ${params.entityId} - ${params.errorCode || 'UNKNOWN'}: ${params.errorMessage}`
        );

        const record = await this.prisma.reportedEntity.create({
            data: {
                entityType: params.entityType,
                entityId: params.entityId,
                errorMessage: params.errorMessage,
                errorCode: params.errorCode,
            },
        });

        return record;
    }

    /**
     * Get recent failed records
     */
    async getRecentFailures(limit = 50): Promise<FailureRecord[]> {
        return this.prisma.reportedEntity.findMany({
            where: { resolved: false },
            orderBy: { timestamp: 'desc' },
            take: limit,
        });
    }

    /**
     * Get failures by entity type
     */
    async getFailuresByEntity(entityType: string, limit = 50): Promise<FailureRecord[]> {
        return this.prisma.reportedEntity.findMany({
            where: {
                entityType,
                resolved: false,
            },
            orderBy: { timestamp: 'desc' },
            take: limit,
        });
    }

    /**
     * Get error statistics
     */
    async getErrorStats(): Promise<{
        totalUnresolved: number;
        byEntityType: Record<string, number>;
        byErrorCode: Record<string, number>;
    }> {
        const [totalUnresolved, byEntityType, byErrorCode] = await Promise.all([
            // Total unresolved count
            this.prisma.reportedEntity.count({
                where: { resolved: false },
            }),

            // Group by entity type
            this.prisma.reportedEntity.groupBy({
                by: ['entityType'],
                where: { resolved: false },
                _count: { entityType: true },
            }),

            // Group by error code
            this.prisma.reportedEntity.groupBy({
                by: ['errorCode'],
                where: {
                    resolved: false,
                    errorCode: { not: null },
                },
                _count: { errorCode: true },
            }),
        ]);

        const entityTypeStats: Record<string, number> = {};
        byEntityType.forEach((item) => {
            entityTypeStats[item.entityType] = item._count.entityType;
        });

        const errorCodeStats: Record<string, number> = {};
        byErrorCode.forEach((item) => {
            if (item.errorCode) {
                errorCodeStats[item.errorCode] = item._count.errorCode;
            }
        });

        return {
            totalUnresolved,
            byEntityType: entityTypeStats,
            byErrorCode: errorCodeStats,
        };
    }

    /**
     * Mark an error as resolved
     */
    async markResolved(id: number): Promise<void> {
        await this.prisma.reportedEntity.update({
            where: { id },
            data: { resolved: true },
        });

        this.logger.log(`Marked error ${id} as resolved`);
    }

    /**
     * Mark multiple errors as resolved
     */
    async markMultipleResolved(ids: number[]): Promise<number> {
        const result = await this.prisma.reportedEntity.updateMany({
            where: { id: { in: ids } },
            data: { resolved: true },
        });

        this.logger.log(`Marked ${result.count} errors as resolved`);
        return result.count;
    }

    /**
     * Clean up old resolved records
     */
    async cleanOldRecords(daysOld = 30): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await this.prisma.reportedEntity.deleteMany({
            where: {
                resolved: true,
                timestamp: { lt: cutoffDate },
            },
        });

        this.logger.log(`Cleaned ${result.count} old resolved error records (older than ${daysOld} days)`);
        return result.count;
    }

    /**
     * Get all failures (both resolved and unresolved) for a specific entity
     */
    async getFailuresForEntity(entityType: string, entityId: string): Promise<FailureRecord[]> {
        return this.prisma.reportedEntity.findMany({
            where: {
                entityType,
                entityId,
            },
            orderBy: { timestamp: 'desc' },
        });
    }
}
