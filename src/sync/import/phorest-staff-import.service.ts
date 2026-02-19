import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PhorestApiClient } from '../../integrations/phorest/phorest-api.client';
import { PhorestSyncStatus } from '@prisma/client';

export interface ImportResult {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: string[];
}

/**
 * Phase 1: Import Staff from Phorest API to Local Database
 */
@Injectable()
export class PhorestStaffImportService {
    private readonly logger = new Logger(PhorestStaffImportService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly phorestClient: PhorestApiClient,
    ) { }

    /**
     * Import all staff from Phorest to local database
     */
    async importAll(): Promise<ImportResult> {
        this.logger.log('🔄 Starting Phorest Staff import to local database...');

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
                const response = await this.phorestClient.getStaff({
                    page,
                    size: batchSize,
                });

                const embedded = response._embedded as any;
                const staffMembers = embedded?.staffs || embedded?.staff || [];

                if (staffMembers.length === 0) {
                    hasMore = false;
                    break;
                }

                this.logger.debug(`Processing page ${page}: ${staffMembers.length} staff members`);

                // OPTIMIZATION: Batch fetch existing staff to eliminate N+1 queries
                const staffIds = staffMembers.map((s: any) => s.staffId);
                const existingStaff = await this.prisma.phorestStaff.findMany({
                    where: { phorestId: { in: staffIds } },
                    select: { phorestId: true, phorestUpdatedAt: true },
                });
                const existingMap = new Map(
                    existingStaff.map(s => [s.phorestId, s.phorestUpdatedAt])
                );

                for (const staff of staffMembers) {
                    result.total++;

                    try {
                        const existingUpdatedAt = existingMap.get(staff.staffId);
                        const isNew = !existingUpdatedAt;

                        // Check if data actually changed
                        const phorestUpdatedAt = staff.updatedAt ? new Date(staff.updatedAt) : null;
                        const dataChanged = isNew ||
                            !existingUpdatedAt ||
                            !phorestUpdatedAt ||
                            phorestUpdatedAt.getTime() !== existingUpdatedAt.getTime();

                        await this.upsertStaff(staff, isNew, dataChanged);

                        if (isNew) {
                            result.created++;
                        } else if (dataChanged) {
                            result.updated++;
                        } else {
                            result.skipped++;
                        }
                    } catch (error: any) {
                        result.failed++;
                        result.errors.push(`Staff ${staff.staffId}: ${error.message}`);
                        this.logger.error(`Failed to import staff ${staff.staffId}: ${error.message}`);
                    }
                }

                page++;

                // Safety check for pagination
                if (page > 100) {
                    this.logger.warn('Reached page limit, stopping');
                    break;
                }
            }

            this.logger.log(`✅ Staff import complete: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

        } catch (error: any) {
            this.logger.error(`Staff import failed: ${error.message}`);
            throw error;
        }

        return result;
    }

    /**
     * Upsert a single staff member to local database
     * @param staff - Phorest staff data
     * @param _isNew - Whether this is a new staff member
     * @param dataChanged - Whether the data has actually changed
     */
    private async upsertStaff(staff: any, _isNew: boolean, dataChanged: boolean): Promise<void> {
        await this.prisma.phorestStaff.upsert({
            where: { phorestId: staff.staffId },
            create: {
                phorestId: staff.staffId,
                branchId: staff.branchId,
                firstName: staff.firstName || '',
                lastName: staff.lastName || '',
                email: staff.email,
                mobile: staff.mobile,
                gender: staff.gender,
                birthDate: staff.birthDate,
                position: staff.position,
                startDate: staff.startDate,
                selfEmployed: staff.selfEmployed || false,
                staffCategoryId: staff.staffCategoryId,
                staffCategoryName: staff.staffCategoryName,
                active: staff.active !== false,
                archived: staff.archived || false,
                deleted: staff.deleted || false,
                notes: staff.notes,
                imageUrl: staff.imageUrl,
                syncStatus: PhorestSyncStatus.PENDING,
                phorestCreatedAt: staff.createdAt ? new Date(staff.createdAt) : null,
                phorestUpdatedAt: staff.updatedAt ? new Date(staff.updatedAt) : null,
            },
            update: {
                branchId: staff.branchId,
                firstName: staff.firstName || '',
                lastName: staff.lastName || '',
                email: staff.email,
                mobile: staff.mobile,
                gender: staff.gender,
                birthDate: staff.birthDate,
                position: staff.position,
                startDate: staff.startDate,
                selfEmployed: staff.selfEmployed || false,
                staffCategoryId: staff.staffCategoryId,
                staffCategoryName: staff.staffCategoryName,
                active: staff.active !== false,
                archived: staff.archived || false,
                deleted: staff.deleted || false,
                notes: staff.notes,
                imageUrl: staff.imageUrl,
                phorestUpdatedAt: staff.updatedAt ? new Date(staff.updatedAt) : null,
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
            this.prisma.phorestStaff.count(),
            this.prisma.phorestStaff.count({ where: { syncStatus: PhorestSyncStatus.PENDING } }),
            this.prisma.phorestStaff.count({ where: { syncStatus: PhorestSyncStatus.SYNCED } }),
            this.prisma.phorestStaff.count({ where: { syncStatus: PhorestSyncStatus.FAILED } }),
        ]);

        return { total, pending, synced, failed };
    }
}
