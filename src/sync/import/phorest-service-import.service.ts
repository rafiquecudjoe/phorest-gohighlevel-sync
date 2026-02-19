import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PhorestApiClient } from '../../integrations/phorest/phorest-api.client';
import { PhorestSyncStatus } from '@prisma/client';
import { ImportResult } from './phorest-staff-import.service';

/**
 * Phase 1: Import Services from Phorest API to Local Database
 */
@Injectable()
export class PhorestServiceImportService {
    private readonly logger = new Logger(PhorestServiceImportService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly phorestClient: PhorestApiClient,
    ) { }

    /**
     * Import all services from Phorest to local database
     */
    async importAll(): Promise<ImportResult> {
        this.logger.log('🔄 Starting Phorest Services import to local database...');

        const result: ImportResult = {
            total: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        try {
            let page = 0;
            let hasMore = true;
            const batchSize = 100;

            while (hasMore) {
                const response = await this.phorestClient.getServices({
                    page,
                    size: batchSize,
                });

                const embedded = response._embedded as any;
                const services = embedded?.services || [];

                if (services.length === 0) {
                    hasMore = false;
                    break;
                }

                this.logger.debug(`Processing page ${page}: ${services.length} services`);

                // OPTIMIZATION: Batch fetch existing services to eliminate N+1 queries
                const serviceIds = services.map((s: any) => s.serviceId);
                const existingServices = await this.prisma.phorestService.findMany({
                    where: { phorestId: { in: serviceIds } },
                    select: { phorestId: true, phorestUpdatedAt: true },
                });
                const existingMap = new Map(
                    existingServices.map(s => [s.phorestId, s.phorestUpdatedAt])
                );

                for (const service of services) {
                    result.total++;

                    try {
                        const existingUpdatedAt = existingMap.get(service.serviceId);
                        const isNew = !existingUpdatedAt;

                        // Check if data actually changed
                        const phorestUpdatedAt = service.updatedAt ? new Date(service.updatedAt) : null;
                        const dataChanged = isNew ||
                            !existingUpdatedAt ||
                            !phorestUpdatedAt ||
                            phorestUpdatedAt.getTime() !== existingUpdatedAt.getTime();

                        await this.upsertService(service, isNew, dataChanged);

                        if (isNew) {
                            result.created++;
                        } else if (dataChanged) {
                            result.updated++;
                        } else {
                            result.skipped++;
                        }
                    } catch (error: any) {
                        result.failed++;
                        result.errors.push(`Service ${service.serviceId}: ${error.message}`);
                        this.logger.error(`Failed to import service ${service.serviceId}: ${error.message}`);
                    }
                }

                page++;

                if (page > 100) {
                    this.logger.warn('Reached page limit, stopping');
                    break;
                }
            }

            this.logger.log(`✅ Services import complete: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

        } catch (error: any) {
            this.logger.error(`Services import failed: ${error.message}`);
            throw error;
        }

        return result;
    }

    /**
     * Upsert a single service to local database
     * @param service - Phorest service data
     * @param _isNew - Whether this is a new service
     * @param dataChanged - Whether the data has actually changed
     */
    private async upsertService(service: any, _isNew: boolean, dataChanged: boolean): Promise<void> {
        await this.prisma.phorestService.upsert({
            where: { phorestId: service.serviceId },
            create: {
                phorestId: service.serviceId,
                branchId: service.branchId,
                name: service.name || 'Unnamed Service',
                description: service.description,
                categoryId: service.categoryId,
                categoryName: service.categoryName,
                price: service.price || 0,
                duration: service.duration || 0,
                bookable: service.bookable !== false,
                onlineBookable: service.onlineBookable !== false,
                active: service.active !== false,
                archived: service.archived || false,
                deleted: service.deleted || false,
                syncStatus: PhorestSyncStatus.PENDING,
                phorestCreatedAt: service.createdAt ? new Date(service.createdAt) : null,
                phorestUpdatedAt: service.updatedAt ? new Date(service.updatedAt) : null,
            },
            update: {
                branchId: service.branchId,
                name: service.name || 'Unnamed Service',
                description: service.description,
                categoryId: service.categoryId,
                categoryName: service.categoryName,
                price: service.price || 0,
                duration: service.duration || 0,
                bookable: service.bookable !== false,
                onlineBookable: service.onlineBookable !== false,
                active: service.active !== false,
                archived: service.archived || false,
                deleted: service.deleted || false,
                phorestUpdatedAt: service.updatedAt ? new Date(service.updatedAt) : null,
                // OPTIMIZATION: Only set PENDING if data changed
                ...(dataChanged ? { syncStatus: PhorestSyncStatus.PENDING } : {}),
            },
        });
    }

    /**
     * Get import stats
     */
    async getStats(): Promise<{
        total: number;
        pending: number;
        synced: number;
        failed: number;
    }> {
        const [total, pending, synced, failed] = await Promise.all([
            this.prisma.phorestService.count(),
            this.prisma.phorestService.count({ where: { syncStatus: PhorestSyncStatus.PENDING } }),
            this.prisma.phorestService.count({ where: { syncStatus: PhorestSyncStatus.SYNCED } }),
            this.prisma.phorestService.count({ where: { syncStatus: PhorestSyncStatus.FAILED } }),
        ]);

        return { total, pending, synced, failed };
    }
}
