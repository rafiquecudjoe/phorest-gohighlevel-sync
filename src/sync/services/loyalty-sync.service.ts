import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlApiClient } from '../../integrations/gohighlevel/ghl-api.client';
import { SyncLogService } from './sync-log.service';
import { ReportedEntityService } from './reported-entity.service';
import { EntityMappingService } from './entity-mapping.service';
import { PrismaService } from '../../common/prisma.service';
import { PhorestClientImportService } from '../import/phorest-client-import.service';
import { PhorestClient as DbClient } from '@prisma/client';
import pLimit from 'p-limit';

export interface LoyaltySyncResult {
    totalProcessed: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ entityId: string; error: string }>;
}

/**
 * Loyalty Sync Service
 * Syncs loyalty points from Phorest clients to GHL contact custom fields (via Local DB)
 * 
 * Two-Phase Pattern:
 * 1. Client data is already imported via ClientImportService → Local DB
 * 2. Read from Local DB (PhorestClient with loyalty data) → Sync to GHL
 * 
 * Strategy:
 * - Read clients with loyalty card data from Local DB
 * - Update corresponding GHL contacts with loyalty points as custom fields
 * - Custom fields: loyalty_points, loyalty_card_serial
 */
@Injectable()
export class LoyaltySyncService {
    private readonly logger = new Logger(LoyaltySyncService.name);
    private readonly maxRecords: number;
    private readonly dryRun: boolean;

    constructor(
        private readonly ghlClient: GhlApiClient,
        private readonly syncLogService: SyncLogService,
        private readonly reportedEntityService: ReportedEntityService,
        private readonly entityMappingService: EntityMappingService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly clientImportService: PhorestClientImportService,
    ) {
        this.maxRecords = this.configService.get<number>('SYNC_MAX_RECORDS') || 0;
        this.dryRun = this.configService.get<string>('SYNC_DRY_RUN') === 'true';

        if (this.maxRecords > 0) {
            this.logger.warn(`⚠️ TEST MODE: Loyalty sync limited to ${this.maxRecords} records`);
        }
        if (this.dryRun) {
            this.logger.warn(`🧪 DRY RUN MODE: No real GHL API calls will be made`);
        }
    }

    /**
     * Simulate an API delay for dry-run mode (100-200ms)
     */
    private async simulateApiDelay(): Promise<void> {
        const delay = Math.floor(Math.random() * 100) + 100;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Sync loyalty points from Phorest to GHL contacts (via Local DB)
     */
    async syncPhorestToGhl(options?: { jobId?: string; skipImport?: boolean }): Promise<LoyaltySyncResult> {
        this.logger.log('Starting Phorest → Local DB → GHL loyalty points sync');

        const result: LoyaltySyncResult = {
            totalProcessed: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        const { runId, batchId } = await this.syncLogService.createSyncRun({
            direction: 'phorest_to_ghl',
            entityType: 'loyalty',
        });

        try {
            // Step 1: Import fresh client data from Phorest (optional)
            if (!options?.skipImport) {
                this.logger.log('📥 Step 1: Importing clients from Phorest API to Local DB...');
                await this.clientImportService.importAll({ maxRecords: this.maxRecords });
                this.logger.log('✅ Step 1 Complete: Local DB updated with fresh Phorest data.');
            } else {
                this.logger.log('⏭️ Step 1 Skipped: Using existing Local DB data.');
            }

            // Step 2: Read from Local DB and sync to GHL
            this.logger.log('📤 Step 2: Reading clients with actual loyalty data from Local DB...');

            // Fetch clients with non-zero loyalty points OR a loyalty card serial
            // Skip clients with 0 or null points to avoid unnecessary API calls
            const clients = await this.prisma.phorestClient.findMany({
                where: {
                    OR: [
                        { loyaltyPoints: { gt: 0 } }, // Only sync if points > 0
                        { loyaltyCardSerial: { not: null } },
                    ],
                    deleted: false,
                },
                take: this.maxRecords > 0 ? this.maxRecords : undefined,
            });

            this.logger.log(`Found ${clients.length} clients with actual loyalty data to sync`);

            // If no clients to sync, complete early
            if (clients.length === 0) {
                this.logger.log('✅ No clients with loyalty points > 0 to sync. Skipping.');
                await this.syncLogService.completeSyncRun(runId, {
                    totalRecords: 0,
                    successCount: 0,
                    failedCount: 0,
                    skippedCount: 0,
                });
                return result;
            }

            // Process in parallel with concurrency limit
            const CONCURRENCY = 5;
            const limit = pLimit(CONCURRENCY);

            const tasks = clients
                .filter(client => (client.loyaltyPoints !== null && client.loyaltyPoints > 0) || client.loyaltyCardSerial !== null)
                .slice(0, this.maxRecords > 0 ? this.maxRecords : undefined)
                .map(client =>
                    limit(async () => {
                        return this.processClientLoyalty(client, runId, batchId, options?.jobId);
                    })
                );

            const results = await Promise.allSettled(tasks);

            for (const r of results) {
                result.totalProcessed++;
                if (r.status === 'fulfilled') {
                    if (r.value === 'updated') result.updated++;
                    else if (r.value === 'skipped') result.skipped++;
                    else if (r.value === 'failed') result.failed++;
                } else {
                    result.failed++;
                }
            }

            await this.syncLogService.completeSyncRun(runId, {
                totalRecords: result.totalProcessed,
                successCount: result.updated,
                failedCount: result.failed,
                skippedCount: result.skipped,
            });

            this.logger.log(
                `Phorest → GHL loyalty sync completed: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`,
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Phorest → GHL loyalty sync failed: ${errorMessage}`);
            await this.syncLogService.failSyncRun(runId, errorMessage);
            throw error;
        }

        return result;
    }

    /**
     * Process loyalty data for a single client from Local DB
     */
    private async processClientLoyalty(
        client: DbClient,
        runId: string,
        batchId: string,
        jobId?: string,
    ): Promise<'updated' | 'skipped' | 'failed'> {
        const startedAt = new Date();

        try {
            // Find the GHL contact for this Phorest client
            const clientMapping = await this.entityMappingService.findByPhorestId(
                'client',
                client.phorestId,
            );

            if (!clientMapping) {
                this.logger.debug(`Skipping loyalty for client ${client.phorestId} - not synced to GHL`);
                return 'skipped';
            }

            const ghlContactId = clientMapping.ghlId;

            // Build custom fields for loyalty data from DB
            const customFields: Array<{ id: string; value: any }> = [];

            if (client.loyaltyPoints !== null) {
                customFields.push({
                    id: 'loyalty_points',
                    value: client.loyaltyPoints.toString(),
                });
            }

            if (client.loyaltyCardSerial) {
                customFields.push({
                    id: 'loyalty_card_serial',
                    value: client.loyaltyCardSerial,
                });
            }

            // Build tags for loyalty tier (optional enhancement)
            const tags: string[] = [];
            if (client.loyaltyPoints !== null) {
                const points = client.loyaltyPoints;
                if (points >= 1000) {
                    tags.push('loyalty:gold');
                } else if (points >= 500) {
                    tags.push('loyalty:silver');
                } else if (points >= 100) {
                    tags.push('loyalty:bronze');
                } else {
                    tags.push('loyalty:member');
                }
            }

            // Update GHL contact with loyalty data
            // Update GHL contact with loyalty data
            if (this.dryRun) {
                await this.simulateApiDelay();
                this.logger.log(`[DRY RUN] Would update GHL contact ${ghlContactId} with ${client.loyaltyPoints || 0} points, tags: ${tags.join(', ')}`);
            } else {
                await this.ghlClient.updateContact(ghlContactId, {
                    customFields,
                    tags,
                });
            }

            this.logger.debug(
                `Updated GHL contact ${ghlContactId} with ${client.loyaltyPoints || 0} loyalty points`,
            );

            // Log success
            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'loyalty',
                entityId: client.phorestId,
                direction: 'phorest_to_ghl',
                action: 'update',
                status: 'success',
                sourceData: { clientId: client.phorestId, loyaltyPoints: client.loyaltyPoints, loyaltyCardSerial: client.loyaltyCardSerial },
                targetData: { ghlContactId, customFields, tags },
                startedAt,
                completedAt: new Date(),
            });

            return 'updated';
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorCode = this.extractErrorCode(error);

            this.logger.error(`Failed to sync loyalty for client ${client.phorestId}: ${errorMessage}`);

            // Log to sync logs
            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'loyalty',
                entityId: client.phorestId,
                direction: 'phorest_to_ghl',
                action: 'update',
                status: 'failed',
                errorCode,
                errorMessage,
                sourceData: { clientId: client.phorestId },
                startedAt,
                completedAt: new Date(),
            });

            // Report to ReportedEntity for automatic retry
            await this.reportedEntityService.reportFailure({
                entityType: 'loyalty',
                entityId: client.phorestId,
                errorMessage,
                errorCode,
            });

            return 'failed';
        }
    }

    /**
     * Extract error code from error object
     */
    private extractErrorCode(error: any): string | undefined {
        // HTTP status code
        if (error?.response?.status) {
            return error.response.status.toString();
        }

        // Network error code (ETIMEDOUT, ECONNRESET, etc.)
        if (error?.code) {
            return error.code;
        }

        // Check error message for common patterns
        if (error?.message) {
            if (error.message.includes('timeout')) return 'ETIMEDOUT';
            if (error.message.includes('socket hang up')) return 'ECONNRESET';
            if (error.message.includes('502')) return '502';
            if (error.message.includes('503')) return '503';
        }

        return undefined;
    }
}
