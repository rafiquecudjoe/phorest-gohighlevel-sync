import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlApiClient } from '../../integrations/gohighlevel/ghl-api.client';
import { PhorestApiClient } from '../../integrations/phorest/phorest-api.client';
import { SyncLogService } from './sync-log.service';
import { EntityMappingService } from './entity-mapping.service';
import { PrismaService } from '../../common/prisma.service';
import { PhorestClientImportService } from '../import/phorest-client-import.service';
import { PhorestClient as DbClient } from '@prisma/client';
import {
    mapPhorestClientToGhlUpsert,
} from '../mappers/client.mapper';

export interface ClientSyncResult {
    totalProcessed: number;
    created: number;
    updated: number;
    deleted: number;
    skipped: number;
    failed: number;
}

/**
 * @deprecated This service is deprecated. Use ClientSyncService instead.
 * 
 * Deleted/banned client handling has been merged into ClientSyncService.
 * The main ClientSyncService now handles:
 * - CREATE: New clients → Create GHL contacts
 * - UPDATE: Existing clients → Update GHL contacts (with timestamp optimization)
 * - DELETE: Deleted clients → Add 'phorest:deleted' tag
 * - BAN: Banned clients → Add 'phorest:banned' tag + DND
 * 
 * This service will be removed in a future version.
 */

/**
 * Phorest to GHL Client Update Sync Service (via Local DB)
 * Handles CREATE, UPDATE, and DELETE/BANNED operations
 * 
 * Two-Phase Pattern:
 * 1. Import from Phorest API → Local DB (PhorestClient table)
 * 2. Read from Local DB → Sync to GHL
 */
@Injectable()
export class PhorestClientUpdateSyncService {
    private readonly logger = new Logger(PhorestClientUpdateSyncService.name);
    private readonly maxRecords: number;

    // Category cache for tag mapping
    private categoryCache: Map<string, string> = new Map();
    // Custom field cache for ID mapping
    private customFieldCache: Map<string, string> = new Map();

    constructor(
        private readonly ghlClient: GhlApiClient,
        private readonly phorestClient: PhorestApiClient,
        private readonly syncLogService: SyncLogService,
        private readonly entityMappingService: EntityMappingService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly clientImportService: PhorestClientImportService,
    ) {
        this.maxRecords = this.configService.get<number>('SYNC_MAX_RECORDS') || 0;
    }

    /**
     * Sync clients from Phorest to GHL (via Local DB)
     * - CREATE: New clients → Create GHL contacts
     * - UPDATE: Existing clients → Update GHL contacts with full data
     * - DELETE/BANNED: Mark with tags in GHL
     */
    async syncPhorestToGhl(options?: {
        updatedSince?: Date;
        fullSync?: boolean;
        jobId?: string;
        skipImport?: boolean;
    }): Promise<ClientSyncResult> {
        this.logger.log('Starting Phorest → Local DB → GHL client update sync');

        const result: ClientSyncResult = {
            totalProcessed: 0,
            created: 0,
            updated: 0,
            deleted: 0,
            skipped: 0,
            failed: 0,
        };

        const { runId, batchId } = await this.syncLogService.createSyncRun({
            direction: 'phorest_to_ghl',
            entityType: 'client_update',
        });

        try {
            // Step 1: Import from Phorest to Local DB (optional)
            if (!options?.skipImport) {
                this.logger.log('📥 Step 1: Importing from Phorest API to Local DB...');
                await this.clientImportService.importAll({ maxRecords: this.maxRecords });
                this.logger.log('✅ Step 1 Complete: Local DB updated.');
            } else {
                this.logger.log('⏭️ Step 1 Skipped: Using existing Local DB data.');
            }

            // Step 2: Read from Local DB and Sync to GHL
            this.logger.log('📤 Step 2: Syncing from Local DB to GHL...');

            // Load category mappings for tag generation
            await this.loadCategoryCache();
            // Load custom field mappings for ID resolution
            await this.loadCustomFieldCache();

            const locationId = this.configService.getOrThrow<string>('GHL_LOCATION_ID');

            // Determine sync window for filtering local DB
            const updatedSince = options?.fullSync
                ? undefined
                : options?.updatedSince || new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Query clients from local DB
            const whereClause: any = {};
            if (updatedSince) {
                whereClause.updatedAt = { gte: updatedSince };
            }

            const clients = await this.prisma.phorestClient.findMany({
                where: whereClause,
                take: this.maxRecords > 0 ? this.maxRecords : undefined,
            });

            this.logger.debug(`Found ${clients.length} clients in Local DB for sync`);

            for (const client of clients) {
                // Check if we hit the limit of SUCCESSFUL syncs (not just processed)
                const currentSuccessCount = result.created + result.updated;
                if (this.maxRecords > 0 && currentSuccessCount >= this.maxRecords) {
                    this.logger.log(`✅ Reached max records limit of ${this.maxRecords} successful syncs, stopping`);
                    break;
                }

                const itemResult = await this.processClient(
                    client,
                    locationId,
                    runId,
                    batchId,
                    options?.jobId,
                );

                result.totalProcessed++;
                if (itemResult === 'created') result.created++;
                else if (itemResult === 'updated') result.updated++;
                else if (itemResult === 'deleted') result.deleted++;
                else if (itemResult === 'skipped') result.skipped++;
                else if (itemResult === 'failed') result.failed++;
            }

            await this.syncLogService.completeSyncRun(runId, {
                totalRecords: result.totalProcessed,
                successCount: result.created + result.updated + result.deleted,
                failedCount: result.failed,
                skippedCount: result.skipped,
            });

            this.logger.log(
                `Phorest → GHL client sync completed: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted/banned, ${result.skipped} skipped, ${result.failed} failed`
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Phorest → GHL client sync failed: ${errorMessage}`);
            await this.syncLogService.failSyncRun(runId, errorMessage);
            throw error;
        }

        return result;
    }

    /**
     * Process a single client from Local DB
     */
    private async processClient(
        client: DbClient,
        locationId: string,
        runId: string,
        batchId: string,
        jobId?: string,
    ): Promise<'created' | 'updated' | 'deleted' | 'skipped' | 'failed'> {
        const startedAt = new Date();

        try {
            // Find existing mapping
            const existingMapping = await this.entityMappingService.findByPhorestId(
                'client',
                client.phorestId,
            );

            // Handle DELETED clients
            if (client.deleted) {
                if (existingMapping) {
                    return await this.handleDeletedClient(
                        client,
                        existingMapping.ghlId,
                        runId,
                        batchId,
                        jobId,
                        startedAt,
                    );
                }
                return 'skipped'; // No mapping, nothing to delete
            }

            // Handle BANNED clients
            if (client.banned) {
                if (existingMapping) {
                    return await this.handleBannedClient(
                        client,
                        existingMapping.ghlId,
                        runId,
                        batchId,
                        jobId,
                        startedAt,
                    );
                }
                return 'skipped'; // Don't create banned clients
            }

            // Check if client has email or phone (basic requirement for sync)
            if (!client.email && !client.mobile) {
                return 'skipped';
            }

            // Map Phorest client to GHL format with full data
            const ghlUpsertData = mapPhorestClientToGhlUpsert(
                client as any, // Cast to support both DB and API types
                locationId,
                this.categoryCache,
                this.customFieldCache,
            );

            if (existingMapping) {
                // UPDATE existing GHL contact
                // Create update payload without fields that cause 422 error on PUT
                const updateData = { ...ghlUpsertData };
                delete (updateData as any).locationId;
                delete (updateData as any).gender;

                try {
                    await this.ghlClient.updateContact(existingMapping.ghlId, updateData);
                    this.logger.debug(`Updated GHL contact ${existingMapping.ghlId} from Phorest client ${client.phorestId}`);

                    // Update sync status in local DB
                    await this.prisma.phorestClient.update({
                        where: { phorestId: client.phorestId },
                        data: { syncStatus: 'SYNCED', lastSyncedAt: new Date() },
                    });

                    await this.logSuccess(
                        runId, batchId, jobId, client, 'update',
                        updateData, { ghlContactId: existingMapping.ghlId }, startedAt
                    );
                    return 'updated';
                } catch (updateError: any) {
                    // Check for 400 Bad Request with "Contact not found" message
                    const isContactNotFound = updateError?.response?.status === 400 &&
                        JSON.stringify(updateError?.response?.data || '').includes('Contact not found');

                    if (isContactNotFound) {
                        this.logger.warn(`GHL Contact ${existingMapping.ghlId} not found (stale mapping). Removing mapping and retrying as create.`);

                        // Delete stale mapping
                        await this.entityMappingService.deleteMapping('client', client.phorestId);

                        // Fall through to CREATE logic below by unsetting existingMapping? 
                        // Simpler to just call create right here.

                        const ghlResponse = await this.ghlClient.upsertContact(ghlUpsertData);
                        const ghlContactId = (ghlResponse as any).contact?.id || (ghlResponse as any).id;

                        this.logger.debug(`Re-created GHL contact ${ghlContactId} from Phorest client ${client.phorestId} (recovered from stale mapping)`);

                        await this.entityMappingService.upsertMapping(
                            'client',
                            client.phorestId,
                            ghlContactId,
                            {
                                syncedAt: new Date().toISOString(),
                                source: 'phorest',
                            },
                        );

                        // Update sync status in local DB
                        await this.prisma.phorestClient.update({
                            where: { phorestId: client.phorestId },
                            data: { syncStatus: 'SYNCED', lastSyncedAt: new Date() },
                        });

                        await this.logSuccess(
                            runId, batchId, jobId, client, 'create',
                            ghlUpsertData, { ghlContactId, note: 'Recovered from stale mapping' }, startedAt
                        );
                        return 'created';
                    }
                    throw updateError;
                }
            } else {
                // CREATE new GHL contact
                const ghlResponse = await this.ghlClient.upsertContact(ghlUpsertData);
                const ghlContactId = (ghlResponse as any).contact?.id || (ghlResponse as any).id;

                this.logger.debug(`Created GHL contact ${ghlContactId} from Phorest client ${client.phorestId}`);

                // Store mapping
                await this.entityMappingService.upsertMapping(
                    'client',
                    client.phorestId,
                    ghlContactId,
                    {
                        syncedAt: new Date().toISOString(),
                        source: 'phorest',
                    },
                );

                // Update sync status in local DB
                await this.prisma.phorestClient.update({
                    where: { phorestId: client.phorestId },
                    data: { syncStatus: 'SYNCED', lastSyncedAt: new Date() },
                });

                await this.logSuccess(
                    runId, batchId, jobId, client, 'create',
                    ghlUpsertData, { ghlContactId }, startedAt
                );
                return 'created';
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorCode = (error as any)?.response?.status?.toString() || 'UNKNOWN';
            const errorData = (error as any)?.response?.data;

            this.logger.error(
                `Failed to sync Phorest client ${client.phorestId}: ${errorMessage}`,
                errorData ? JSON.stringify(errorData) : undefined
            );

            // Update sync status to FAILED in local DB
            await this.prisma.phorestClient.update({
                where: { phorestId: client.phorestId },
                data: { syncStatus: 'FAILED' },
            }).catch(() => { });

            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'client_update',
                entityId: client.phorestId,
                direction: 'phorest_to_ghl',
                action: 'update',
                status: 'failed',
                errorCode,
                errorMessage,
                sourceData: client,
                startedAt,
                completedAt: new Date(),
            });

            return 'failed';
        }
    }

    /**
     * Handle deleted clients - add tag and optionally DND
     */
    private async handleDeletedClient(
        client: DbClient,
        ghlContactId: string,
        runId: string,
        batchId: string,
        jobId: string | undefined,
        startedAt: Date,
    ): Promise<'deleted'> {
        // Get current contact to preserve existing tags
        const currentContact = await this.ghlClient.getContact(ghlContactId);
        const existingTags = currentContact?.tags || [];

        // Add deleted tag if not already present
        const deletedTag = 'phorest:deleted';
        if (!existingTags.includes(deletedTag)) {
            const updatedTags = [...existingTags.filter((t: string) => !t.startsWith('phorest:')), deletedTag];
            await this.ghlClient.updateContact(ghlContactId, { tags: updatedTags });
        }

        this.logger.debug(`Marked GHL contact ${ghlContactId} as deleted (from Phorest client ${client.phorestId})`);

        await this.logSuccess(
            runId, batchId, jobId, client, 'update',
            { tags: [deletedTag] }, { ghlContactId, action: 'marked_deleted' }, startedAt
        );

        return 'deleted';
    }

    /**
     * Handle banned clients - add tag and set DND
     */
    private async handleBannedClient(
        client: DbClient,
        ghlContactId: string,
        runId: string,
        batchId: string,
        jobId: string | undefined,
        startedAt: Date,
    ): Promise<'deleted'> {
        // Get current contact to preserve existing tags
        const currentContact = await this.ghlClient.getContact(ghlContactId);
        const existingTags = currentContact?.tags || [];

        // Add banned tag
        const bannedTag = 'phorest:banned';
        if (!existingTags.includes(bannedTag)) {
            const updatedTags = [...existingTags.filter((t: string) => !t.startsWith('phorest:banned')), bannedTag];
            await this.ghlClient.updateContact(ghlContactId, {
                tags: updatedTags,
                dnd: true, // Set Do Not Disturb for banned clients
            });
        }

        this.logger.debug(`Marked GHL contact ${ghlContactId} as banned (from Phorest client ${client.phorestId})`);

        await this.logSuccess(
            runId, batchId, jobId, client, 'update',
            { tags: [bannedTag], dnd: true }, { ghlContactId, action: 'marked_banned' }, startedAt
        );

        return 'deleted';
    }

    /**
     * Load custom field cache for ID mapping
     */
    private async loadCustomFieldCache(): Promise<void> {
        try {
            const customFields = await this.ghlClient.getCustomFields();
            this.customFieldCache.clear();
            for (const field of customFields) {
                // Map both fieldKey and name (normalized) to ID for flexibility
                if (field.fieldKey) {
                    this.customFieldCache.set(field.fieldKey, field.id);
                }
                // Also map normalized name (e.g. "Phorest ID" -> "phorest_id") just in case
                // But primarily rely on fieldKey
            }
            this.logger.debug(`Loaded ${this.customFieldCache.size} custom fields for ID mapping`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`Failed to load custom fields: ${errorMessage}`);
        }
    }

    /**
     * Load category cache for tag mapping
     */
    private async loadCategoryCache(): Promise<void> {
        try {
            const categories = await this.phorestClient.getClientCategories();
            this.categoryCache.clear();
            for (const category of categories) {
                this.categoryCache.set(category.clientCategoryId, category.name);
            }
            this.logger.debug(`Loaded ${this.categoryCache.size} client categories for tag mapping`);
        } catch (error) {
            this.logger.warn('Failed to load client categories, tags will use IDs instead');
        }
    }

    /**
     * Helper to log successful sync
     */
    private async logSuccess(
        runId: string,
        batchId: string,
        jobId: string | undefined,
        client: DbClient,
        action: 'create' | 'update',
        targetData: any,
        responseData: any,
        startedAt: Date,
    ): Promise<void> {
        await this.syncLogService.logSyncItem({
            runId,
            batchId,
            jobId,
            entityType: 'client_update',
            entityId: client.phorestId,
            direction: 'phorest_to_ghl',
            action,
            status: 'success',
            sourceData: client,
            targetData,
            responseData,
            startedAt,
            completedAt: new Date(),
        });
    }
}
