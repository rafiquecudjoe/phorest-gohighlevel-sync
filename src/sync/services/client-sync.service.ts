import { Injectable, Logger } from '@nestjs/common';
import { GhlApiClient } from '../../integrations/gohighlevel/ghl-api.client';
import { PhorestApiClient } from '../../integrations/phorest/phorest-api.client';
import { SyncLogService } from './sync-log.service';
import { EntityMappingService } from './entity-mapping.service';
import { GhlContact } from '../../integrations/gohighlevel/interfaces/ghl.interfaces';
import {
    mapGhlContactToPhorestClient,
    mapGhlContactToPhorestUpdate,
    getPhorestIdFromGhlContact,
    shouldSyncGhlContact,
    mapPhorestClientToGhlUpsert,
} from '../mappers/client.mapper';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { PhorestClientImportService } from '../import/phorest-client-import.service'; // TODO: Enable for two-phase sync
import { PhorestClient as DbClient, PhorestSyncStatus } from '@prisma/client';

export interface SyncResult {
    totalProcessed: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    deleted: number; // Count of deleted/banned clients processed
    errors: Array<{ entityId: string; error: string }>;
    durationMs?: number; // Time taken to complete sync in milliseconds
}

@Injectable()
export class ClientSyncService {
    private readonly logger = new Logger(ClientSyncService.name);
    private readonly batchSize: number;
    private readonly maxRecords: number;
    private readonly dryRun: boolean;

    constructor(
        private readonly ghlClient: GhlApiClient,
        private readonly phorestClient: PhorestApiClient,
        private readonly syncLogService: SyncLogService,
        private readonly entityMappingService: EntityMappingService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly clientImportService: PhorestClientImportService,
    ) {
        this.batchSize = this.configService.get<number>('SYNC_BATCH_SIZE', 100);
        this.maxRecords = this.configService.get<number>('SYNC_MAX_RECORDS', 0);
        this.dryRun = this.configService.get<string>('SYNC_DRY_RUN') === 'true';

        if (this.maxRecords > 0) {
            this.logger.warn(`⚠️ TEST MODE: Sync limited to ${this.maxRecords} records`);
        }
        if (this.dryRun) {
            this.logger.warn(`🧪 DRY RUN MODE: No real GHL API calls will be made (simulated delays enabled)`);
        }
    }

    /**
     * Simulate API delay for dry-run mode (100-200ms like real API)
     */
    private async simulateApiDelay(): Promise<void> {
        const delay = 100 + Math.random() * 100; // 100-200ms
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Sync clients from GoHighLevel to Phorest
     * This is the main entry point for GHL → Phorest sync
     */
    async syncGhlToPhorest(jobId?: string): Promise<SyncResult> {
        const startTime = Date.now();
        this.logger.log('Starting GHL → Phorest client sync');

        // Create sync run for audit trail
        const { runId, batchId } = await this.syncLogService.createSyncRun({
            jobId,
            direction: 'ghl_to_phorest',
            entityType: 'client',
        });

        const result: SyncResult = {
            totalProcessed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            deleted: 0,
            errors: [],
        };

        try {
            // Fetch contacts from GHL using cursor-based pagination
            const locationId = this.configService.getOrThrow<string>('GHL_LOCATION_ID');
            let startAfterId: string | undefined = undefined;
            let hasMore = true;

            while (hasMore) {
                const searchResult = await this.ghlClient.listContacts({
                    locationId,
                    limit: this.batchSize,
                    startAfterId,
                });

                const contacts = searchResult.contacts || [];
                this.logger.debug(`Fetched ${contacts.length} contacts from GHL`);

                if (contacts.length === 0) {
                    hasMore = false;
                    break;
                }

                // Process each contact
                for (const contact of contacts) {
                    // Check if we've hit the max records limit (for testing)
                    if (this.maxRecords > 0 && result.totalProcessed >= this.maxRecords) {
                        this.logger.log(`⚠️ Reached max records limit (${this.maxRecords}), stopping sync`);
                        hasMore = false;
                        break;
                    }

                    const itemResult = await this.processSingleContact(
                        contact,
                        runId,
                        batchId,
                        jobId,
                    );

                    result.totalProcessed++;
                    if (itemResult === 'created') result.created++;
                    else if (itemResult === 'updated') result.updated++;
                    else if (itemResult === 'skipped') result.skipped++;
                    else if (itemResult === 'failed') result.failed++;
                }

                // For cursor-based pagination, use the last contact's ID
                if (contacts.length > 0) {
                    startAfterId = contacts[contacts.length - 1].id;
                }
                hasMore = contacts.length === this.batchSize;
            }

            this.logger.log(
                `GHL → Phorest sync completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`,
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('GHL → Phorest sync failed:', errorMessage);
            result.errors.push({ entityId: 'batch', error: errorMessage });
        }

        // Calculate duration
        result.durationMs = Date.now() - startTime;

        // Complete sync run with results
        await this.syncLogService.completeSyncRun(runId, {
            totalRecords: result.totalProcessed,
            successCount: result.created + result.updated,
            failedCount: result.failed,
            skippedCount: result.skipped,
            lastError: result.errors.length > 0 ? result.errors[0].error : undefined,
        });

        return result;
    }

    /**
     * Sync clients from Phorest to GHL (via Local DB)
     * 1. Import from Phorest API -> Local DB (optional, can be skipped)
     * 2. Read from Local DB -> Sync to GHL
     * 
     * @param options.skip - Number of records to skip (for batch processing)
     * @param options.take - Max number of records to process (batch size)
     * @param options.skipPhorestImport - Skip step 1 (useful for batch testing with existing data)
     */
    async syncPhorestToGhl(options?: {
        forceFullSync?: boolean;
        jobId?: string;
        maxRecords?: number;
        skip?: number;
        take?: number;
        skipPhorestImport?: boolean;
        clientId?: string; // For auto-repair of single client
        onProgress?: (progress: number) => void; // Progress callback for Bull Board
    }): Promise<SyncResult> {
        const startTime = Date.now();
        const skip = options?.skip ?? 0;
        const take = options?.take ?? options?.maxRecords ?? this.maxRecords;

        this.logger.log(`Starting Phorest → GHL client sync (skip: ${skip}, take: ${take})`);

        const result: SyncResult = {
            totalProcessed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            deleted: 0,
            errors: [],
        };

        const { runId, batchId } = await this.syncLogService.createSyncRun({
            direction: 'phorest_to_ghl',
            entityType: 'client',
            jobId: options?.jobId,
        });

        try {
            //Step 1: Import from Phorest to Local DB (optional)
            if (!options?.skipPhorestImport) {
                this.logger.log('📥 Step 1: Importing from Phorest API to Local DB...');
                await this.clientImportService.importAll({
                    maxRecords: options?.maxRecords,
                    clientId: options?.clientId
                });
                this.logger.log('✅ Step 1 Complete: Local DB updated.');
            } else {
                this.logger.log('⏭️ Step 1 Skipped: Using existing Local DB data.');
            }

            // Step 2: Read from Local DB and Sync to GHL
            this.logger.log('📤 Step 2: Syncing from Local DB to GHL...');

            // Fetch custom field mappings and categories once
            // In dry-run mode, skip GHL API calls
            let customFieldMap = new Map<string, string>();
            if (!this.dryRun) {
                customFieldMap = await this.getGhlCustomFieldMap();
            } else {
                this.logger.debug('[DRY RUN] Skipping GHL custom fields fetch');
            }
            const categoryMap = await this.getPhorestCategoryMap();
            const ghlLocationId = this.configService.getOrThrow<string>('GHL_LOCATION_ID');

            // Fetch clients from DB with pagination
            // Include deleted and banned clients to handle cleanup in GHL
            const whereClause: any = { archived: false };
            if (options?.clientId) {
                whereClause.phorestId = options.clientId;
                this.logger.log(`🔧 Repairing single client: ${options.clientId}`);
            }

            const clients = await this.prisma.phorestClient.findMany({
                where: whereClause,
                skip: skip,
                take: take > 0 ? take : undefined,
                orderBy: { phorestId: 'asc' }, // Consistent ordering for batch processing
            });

            this.logger.debug(`Found ${clients.length} clients in batch (skip: ${skip}, take: ${take})`);

            const totalClients = clients.length;

            // Process clients in parallel with concurrency limit
            const CONCURRENCY = 5; // Reduced from 10 to avoid rate limits (GHL limit: 100 req/10s)

            for (let i = 0; i < clients.length; i += CONCURRENCY) {
                const batch = clients.slice(i, i + CONCURRENCY);

                // Report progress every 50 clients to prevent job stalling
                if (options?.onProgress && i % 50 === 0) {
                    const progress = Math.floor((i / totalClients) * 100);
                    options.onProgress(progress);
                }

                const batchResults = await Promise.allSettled(
                    batch.map(client =>
                        this.processSingleClient(
                            client,
                            runId,
                            batchId,
                            ghlLocationId,
                            customFieldMap,
                            categoryMap,
                            options?.jobId,
                        )
                    )
                );

                // Process results
                for (const settledResult of batchResults) {
                    result.totalProcessed++;
                    if (settledResult.status === 'fulfilled') {
                        const itemResult = settledResult.value;
                        if (itemResult === 'created') result.created++;
                        else if (itemResult === 'updated') result.updated++;
                        else if (itemResult === 'skipped') result.skipped++;
                        else if (itemResult === 'deleted') result.deleted++;
                        else if (itemResult === 'failed') result.failed++;
                    } else {
                        // Promise rejected
                        result.failed++;
                        this.logger.error(`Parallel sync error: ${settledResult.reason}`);
                    }
                }
            }

            await this.syncLogService.completeSyncRun(runId, {
                totalRecords: result.totalProcessed,
                successCount: result.created + result.updated,
                failedCount: result.failed,
                skippedCount: result.skipped,
            });

            this.logger.log(
                `Phorest → GHL sync completed: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted/banned, ${result.skipped} skipped, ${result.failed} failed`,
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Phorest → GHL sync failed: ${errorMessage}`);
            await this.syncLogService.failSyncRun(runId, errorMessage);
            result.errors.push({ entityId: 'batch', error: errorMessage });
            throw error;
        } finally {
            // Calculate duration even on error
            result.durationMs = Date.now() - startTime;
        }

        return result;
    }

    /**
     * Process a single Phorest client and sync to GHL
     */
    private async processSingleClient(
        client: DbClient,
        runId: string,
        batchId: string,
        locationId: string,
        customFieldMap: Map<string, string>,
        categoryMap: Map<string, string>,
        jobId?: string,
    ): Promise<'created' | 'updated' | 'skipped' | 'deleted' | 'failed'> {
        const startedAt = new Date();

        try {
            // Check for existing mapping first
            const existingMapping = await this.entityMappingService.findByPhorestId('client', client.phorestId);

            // Handle DELETED clients - add tag in GHL
            if (client.deleted) {
                if (existingMapping?.ghlId) {
                    return await this.handleDeletedClient(client, existingMapping.ghlId, runId, batchId, jobId, startedAt);
                }
                return 'skipped'; // No mapping, nothing to delete
            }

            // Handle BANNED clients - add tag + DND in GHL
            if (client.banned) {
                if (existingMapping?.ghlId) {
                    return await this.handleBannedClient(client, existingMapping.ghlId, runId, batchId, jobId, startedAt);
                }
                return 'skipped'; // Don't create banned clients
            }

            const upsertData = mapPhorestClientToGhlUpsert(
                client as any, // Cast to DbClient model properties
                locationId,
                categoryMap,
                customFieldMap,
            );

            // OPTIMIZATION: Skip syncing if client hasn't changed since last sync
            // Only applies to clients that have been synced before
            if (existingMapping && existingMapping.ghlId && client.lastSyncedAt) {
                // Compare Phorest update time with our last sync time
                const phorestUpdatedAt = client.phorestUpdatedAt;
                const lastSyncedAt = client.lastSyncedAt;

                if (phorestUpdatedAt && lastSyncedAt && phorestUpdatedAt <= lastSyncedAt) {
                    // Client hasn't been modified in Phorest since last sync - skip
                    this.logger.debug(
                        `⏭️ Skipping client ${client.phorestId} (${client.firstName} ${client.lastName}) - ` +
                        `no changes since last sync (Phorest: ${phorestUpdatedAt.toISOString()}, ` +
                        `Last Sync: ${lastSyncedAt.toISOString()})`
                    );

                    // Log as skipped for audit trail
                    await this.syncLogService.logSyncItem({
                        runId,
                        batchId,
                        jobId,
                        entityType: 'client',
                        entityId: client.phorestId,
                        direction: 'phorest_to_ghl',
                        action: 'skip',
                        status: 'skipped',
                        sourceData: { reason: 'no_changes', phorestUpdatedAt, lastSyncedAt },
                        startedAt,
                        completedAt: new Date(),
                    });

                    return 'skipped';
                }
            }

            let ghlContact;
            let action: 'create' | 'update' = 'create';

            if (existingMapping && existingMapping.ghlId) {
                // UPDATE existing contact
                // Note: GHL PUT endpoint doesn't accept locationId, gender, or source fields
                const { locationId: _loc, gender: _gen, source: _src, ...updateData } = upsertData;
                try {
                    if (this.dryRun) {
                        await this.simulateApiDelay();
                        this.logger.log(`[DRY RUN] Would UPDATE contact: ${existingMapping.ghlId} (${client.firstName} ${client.lastName})`);
                        ghlContact = { id: existingMapping.ghlId, email: client.email };
                    } else {
                        ghlContact = await this.ghlClient.updateContact(existingMapping.ghlId, updateData);
                    }
                    action = 'update';
                } catch (error: any) {
                    // If contact not found (404), allow fallthrough to re-create
                    if (error?.response?.status === 404) {
                        this.logger.warn(`Mapped contact ${existingMapping.ghlId} not found in GHL, re-creating`);
                        existingMapping.ghlId = ''; // Clear invalid ID
                    } else {
                        throw error;
                    }
                }
            }

            // If no valid existing mapping (or re-creation needed)
            if (!ghlContact) {
                if (this.dryRun) {
                    await this.simulateApiDelay();
                    const mockId = `mock-${client.phorestId}`;
                    this.logger.log(`[DRY RUN] Would CREATE contact: ${client.firstName} ${client.lastName} -> ${mockId}`);
                    ghlContact = { id: mockId, email: client.email };
                } else if (upsertData.email || upsertData.phone) {
                    ghlContact = await this.ghlClient.upsertContact(upsertData);
                } else {
                    this.logger.debug(`Client ${client.phorestId} has no email/phone, using createContact fallback`);
                    // CAUTION: This creates a new contact. Rely on mapping to prevent dupes in future runs.
                    ghlContact = await this.ghlClient.createContact(upsertData as any);
                }
                action = existingMapping ? 'update' : 'create';
            }

            // Store/Update Mapping (ONLY if not dry run)
            if (!this.dryRun) {
                await this.entityMappingService.upsertMapping(
                    'client',
                    client.phorestId,
                    ghlContact.id,
                    {
                        phorestName: `${client.firstName} ${client.lastName}`,
                        ghlEmail: ghlContact.email,
                        syncedAt: new Date().toISOString(),
                    },
                );

                // Update DB sync status
                await this.prisma.phorestClient.update({
                    where: { phorestId: client.phorestId },
                    data: {
                        syncStatus: PhorestSyncStatus.SYNCED,
                        lastSyncedAt: new Date(),
                    },
                });
            } else {
                this.logger.log(`[DRY RUN] Skipping DB mapping save for ${client.phorestId} -> ${ghlContact.id}`);
            }

            // Log success
            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'client',
                entityId: client.phorestId,
                direction: 'phorest_to_ghl',
                action,
                status: 'success',
                sourceData: client as any,
                targetData: upsertData,
                responseData: ghlContact,
                startedAt,
                completedAt: new Date(),
            });

            return action === 'create' ? 'created' : 'updated';
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorCode = error?.response?.status?.toString() || 'UNKNOWN';
            const responseData = error?.response?.data; // GHL often sends validation details here

            // Handle 422 (Unprocessable Entity) - Likely Duplicate or Logic Conflict
            if (errorCode === '422') {
                const validationError = responseData?.message || responseData?.error || JSON.stringify(responseData);
                this.logger.warn(`⚠️ Client ${client.phorestId} sync skipped (422): ${validationError}`);
                // treat as 'skipped' so it doesn't count as a failure in stats
                return 'skipped';
            }

            // Handle 400 (Bad Request) - Validation Error (e.g. Missing Phone/Email)
            if (errorCode === '400') {
                const ghlValidationMsg = responseData ? JSON.stringify(responseData) : errorMessage;
                this.logger.warn(`⚠️ Client ${client.phorestId} validation failed (400): ${ghlValidationMsg}`);

                // Log failure but with specific validation error for visibility
                await this.syncLogService.logSyncItem({
                    runId,
                    batchId,
                    jobId,
                    entityType: 'client',
                    entityId: client.phorestId,
                    direction: 'phorest_to_ghl',
                    action: 'create',
                    status: 'failed',
                    errorCode,
                    errorMessage: `Validation Failed: ${ghlValidationMsg}`,
                    sourceData: client as any,
                    startedAt,
                    completedAt: new Date(),
                });
                return 'failed';
            }

            this.logger.error(`Failed to sync client ${client.phorestId}: ${errorMessage}`);

            // Update DB sync status to FAILED
            await this.prisma.phorestClient.update({
                where: { phorestId: client.phorestId },
                data: { syncStatus: PhorestSyncStatus.FAILED },
            });

            // Log fatal failure
            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'client',
                entityId: client.phorestId,
                direction: 'phorest_to_ghl',
                action: 'create',
                status: 'failed',
                errorCode,
                errorMessage,
                sourceData: client as any,
                startedAt,
                completedAt: new Date(),
            });

            return 'failed';
        }
    }

    /**
     * Process a single GHL contact and sync to Phorest
     */
    private async processSingleContact(
        contact: GhlContact,
        runId: string,
        batchId: string,
        jobId?: string,
    ): Promise<'created' | 'updated' | 'skipped' | 'failed'> {
        const startedAt = new Date();

        try {
            // Check if contact should be synced
            if (!shouldSyncGhlContact(contact)) {
                await this.syncLogService.logSyncItem({
                    runId,
                    batchId,
                    jobId,
                    entityType: 'client',
                    entityId: contact.id,
                    direction: 'ghl_to_phorest',
                    action: 'skip',
                    status: 'skipped',
                    sourceData: contact,
                    startedAt,
                    completedAt: new Date(),
                });
                return 'skipped';
            }

            // Check if we already have a mapping for this GHL contact
            const existingPhorestId = await this.entityMappingService.getPhorestIdByGhlId(
                'client',
                contact.id,
            );

            // Also check if contact has phorest_id custom field
            const phorestIdFromContact = getPhorestIdFromGhlContact(contact);
            let phorestId = existingPhorestId || phorestIdFromContact;

            // If no mapping, try to find in Phorest by email or phone
            if (!phorestId) {
                // Try email search
                if (contact.email) {
                    const existingByEmail = await this.phorestClient.findClientByEmail(contact.email);
                    if (existingByEmail) {
                        phorestId = existingByEmail.clientId;
                        this.logger.debug(`Found existing Phorest client by email for GHL contact ${contact.id}: ${phorestId}`);
                    }
                }

                // Try phone search if still not found
                if (!phorestId && contact.phone) {
                    const existingByPhone = await this.phorestClient.findClientByPhone(contact.phone);
                    if (existingByPhone) {
                        phorestId = existingByPhone.clientId;
                        this.logger.debug(`Found existing Phorest client by mobile for GHL contact ${contact.id}: ${phorestId}`);
                    }
                }
            }

            let action: 'create' | 'update';
            let updatedPhorestClient: any;

            if (phorestId) {
                // Update existing Phorest client
                action = 'update';

                // Fetch current client to get the mandatory version field
                const currentClient = await this.phorestClient.getClient(phorestId);
                const updateData = mapGhlContactToPhorestUpdate(contact, currentClient);
                updateData.version = currentClient.version;

                updatedPhorestClient = await this.phorestClient.updateClient(phorestId, updateData);
                this.logger.debug(`Updated Phorest client: ${phorestId}`);
            } else {
                // Create new Phorest client
                action = 'create';
                const createData = mapGhlContactToPhorestClient(contact);
                // Add the branch ID required by Phorest for creating clients
                createData.creatingBranchId = this.configService.getOrThrow<string>('PHOREST_BRANCH_ID');
                updatedPhorestClient = await this.phorestClient.createClient(createData);
                this.logger.debug(`Created Phorest client: ${updatedPhorestClient.clientId}`);
            }

            // Always store/refresh the mapping to ensure persistence and linkage info
            await this.entityMappingService.upsertMapping(
                'client',
                updatedPhorestClient.clientId,
                contact.id,
                {
                    ghlEmail: contact.email,
                    phorestEmail: updatedPhorestClient.email,
                    syncedAt: new Date().toISOString(),
                    discovered: !existingPhorestId && !!phorestId,
                },
            );

            // Log success
            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'client',
                entityId: contact.id,
                direction: 'ghl_to_phorest',
                action,
                status: 'success',
                sourceData: contact,
                targetData: action === 'create' ? mapGhlContactToPhorestClient(contact) : mapGhlContactToPhorestUpdate(contact),
                responseData: updatedPhorestClient,
                startedAt,
                completedAt: new Date(),
            });

            return action === 'create' ? 'created' : 'updated';
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorCode = (error as any)?.response?.status?.toString() || 'UNKNOWN';
            const responseData = (error as any)?.response?.data;

            this.logger.error(`Failed to sync GHL contact ${contact.id}: ${errorMessage}`);
            if (responseData) {
                this.logger.error(`Phorest Error Response: ${JSON.stringify(responseData)}`);
            }

            // Log failure
            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'client',
                entityId: contact.id,
                direction: 'ghl_to_phorest',
                action: 'create', // Assume create for failures
                status: 'failed',
                errorCode,
                errorMessage,
                sourceData: contact,
                startedAt,
                completedAt: new Date(),
            });

            return 'failed';
        }
    }

    /**
     * Sync a single contact by GHL ID (Legacy/Single action)
     */
    async syncSingleContact(ghlContactId: string): Promise<SyncResult> {
        const startTime = Date.now();
        this.logger.log(`Syncing single contact: ${ghlContactId}`);

        const result: SyncResult = {
            totalProcessed: 1,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            deleted: 0,
            errors: [],
        };

        try {
            const contact = await this.ghlClient.getContact(ghlContactId);

            const { runId, batchId } = await this.syncLogService.createSyncRun({
                direction: 'ghl_to_phorest',
                entityType: 'client',
            });

            const itemResult = await this.processSingleContact(contact, runId, batchId);

            if (itemResult === 'created') result.created = 1;
            else if (itemResult === 'updated') result.updated = 1;
            else if (itemResult === 'skipped') result.skipped = 1;
            else if (itemResult === 'failed') result.failed = 1;

            await this.syncLogService.completeSyncRun(runId, {
                totalRecords: 1,
                successCount: result.created + result.updated,
                failedCount: result.failed,
                skippedCount: result.skipped,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            result.failed = 1;
            result.errors.push({ entityId: ghlContactId, error: errorMessage });
        } finally {
            result.durationMs = Date.now() - startTime;
        }

        return result;
    }

    /**
     * Helper to get GHL Custom Field Map (Key -> ID)
     */
    private async getGhlCustomFieldMap(): Promise<Map<string, string>> {
        const fields = await this.ghlClient.getCustomFields();
        const map = new Map<string, string>();
        for (const field of fields) {
            // Map by key if available, otherwise by name slugified
            const key = field.fieldKey || field.name.toLowerCase().replace(/\s+/g, '_');
            map.set(key, field.id);
        }
        return map;
    }

    /**
     * Helper to get Phorest Category Map (ID -> Name)
     */
    private async getPhorestCategoryMap(): Promise<Map<string, string>> {
        const categories = await this.prisma.phorestClientCategory.findMany();
        const map = new Map<string, string>();
        for (const cat of categories) {
            map.set(cat.phorestId, cat.name);
        }
        return map;
    }

    /**
     * Handle deleted clients - add tag in GHL
     */
    private async handleDeletedClient(
        client: DbClient,
        ghlContactId: string,
        runId: string,
        batchId: string,
        jobId: string | undefined,
        startedAt: Date,
    ): Promise<'deleted'> {
        try {
            // DRY RUN: Skip GHL API calls
            if (this.dryRun) {
                await this.simulateApiDelay();
                this.logger.log(`[DRY RUN] Would mark contact ${ghlContactId} as DELETED (client: ${client.phorestId})`);
                return 'deleted';
            }

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

            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'client',
                entityId: client.phorestId,
                direction: 'phorest_to_ghl',
                action: 'update',
                status: 'success',
                sourceData: client as any,
                targetData: { tags: [deletedTag] },
                responseData: { ghlContactId, action: 'marked_deleted' },
                startedAt,
                completedAt: new Date(),
            });

            return 'deleted';
        } catch (error) {
            this.logger.error(`Failed to mark client ${client.phorestId} as deleted: ${error}`);
            throw error;
        }
    }

    /**
     * Handle banned clients - add tag and set DND in GHL
     */
    private async handleBannedClient(
        client: DbClient,
        ghlContactId: string,
        runId: string,
        batchId: string,
        jobId: string | undefined,
        startedAt: Date,
    ): Promise<'deleted'> {
        try {
            // DRY RUN: Skip GHL API calls
            if (this.dryRun) {
                await this.simulateApiDelay();
                this.logger.log(`[DRY RUN] Would mark contact ${ghlContactId} as BANNED + DND (client: ${client.phorestId})`);
                return 'deleted';
            }

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

            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'client',
                entityId: client.phorestId,
                direction: 'phorest_to_ghl',
                action: 'update',
                status: 'success',
                sourceData: client as any,
                targetData: { tags: [bannedTag], dnd: true },
                responseData: { ghlContactId, action: 'marked_banned' },
                startedAt,
                completedAt: new Date(),
            });

            return 'deleted';
        } catch (error) {
            this.logger.error(`Failed to mark client ${client.phorestId} as banned: ${error}`);
            throw error;
        }
    }
}
