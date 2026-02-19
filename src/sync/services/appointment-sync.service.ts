import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlApiClient } from '../../integrations/gohighlevel/ghl-api.client';
import { SyncLogService } from './sync-log.service';
import { EntityMappingService } from './entity-mapping.service';
import { PhorestAppointment } from '../../integrations/phorest/interfaces/phorest.interfaces';
import { PrismaService } from '../../common/prisma.service';
import { PhorestAppointmentImportService } from '../import/phorest-appointment-import.service';
import { PhorestClientImportService } from '../import/phorest-client-import.service';
import { PhorestSyncStatus } from '@prisma/client';
import {
    mapPhorestAppointmentToGhlCreate,
    mapPhorestAppointmentToGhlUpdate,
    shouldSyncPhorestAppointment,
} from '../mappers/appointment.mapper';
import { mapPhorestClientToGhlUpsert } from '../mappers/client.mapper';
import pLimit from 'p-limit';

export interface SyncResult {
    totalProcessed: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    clientsRepaired: number;
    errors: Array<{ entityId: string; error: string }>;
    durationMs?: number; // Time taken to complete sync in milliseconds
}

@Injectable()
export class AppointmentSyncService {
    private readonly logger = new Logger(AppointmentSyncService.name);
    private readonly maxRecords: number;
    private readonly dryRun: boolean;

    constructor(
        private readonly ghlClient: GhlApiClient,
        private readonly syncLogService: SyncLogService,
        private readonly entityMappingService: EntityMappingService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly appointmentImportService: PhorestAppointmentImportService,
        private readonly clientImportService: PhorestClientImportService,
    ) {
        this.maxRecords = this.configService.get<number>('SYNC_MAX_RECORDS') || 0;
        this.dryRun = this.configService.get<string>('SYNC_DRY_RUN') === 'true';

        if (this.maxRecords > 0) {
            this.logger.warn(`⚠️ TEST MODE: Appointment sync limited to ${this.maxRecords} records`);
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
     * Sync appointments from Phorest to GHL (via Local DB)
     * 
     * Two-Phase Pattern:
     * 1. Import from Phorest API → Local DB (PhorestAppointment table)
     * 2. Read PENDING/FAILED appointments from Local DB → Sync to GHL
     * 
     * Key optimizations:
     * - Only processes appointments with syncStatus = PENDING or FAILED
     * - Missing clients are synced INLINE (not via separate job)
     * - Client repair attempts are tracked in DB (persists across restarts)
     */
    async syncPhorestToGhl(options?: {
        updatedSince?: Date;
        jobId?: string;
        skipImport?: boolean;
        forceResync?: boolean; // If true, resync all appointments (not just PENDING)
        onProgress?: (progress: number) => void;
    }): Promise<SyncResult> {
        const startTime = Date.now();
        this.logger.log('Starting Phorest → Local DB → GHL appointment sync');

        const result: SyncResult = {
            totalProcessed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            clientsRepaired: 0,
            errors: [],
        };

        const { runId, batchId } = await this.syncLogService.createSyncRun({
            direction: 'phorest_to_ghl',
            entityType: 'appointment',
        });

        try {
            // Step 1: Import from Phorest API to Local DB (optional)
            const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
            const thirtyDaysAhead = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            if (!options?.skipImport) {
                this.logger.log('📥 Step 1: Importing from Phorest API to Local DB...');
                await this.appointmentImportService.importAll({
                    startDate: sixtyDaysAgo,
                    endDate: thirtyDaysAhead,
                    maxRecords: this.maxRecords,
                });
                this.logger.log('✅ Step 1 Complete: Local DB updated with fresh Phorest data.');
            } else {
                this.logger.log('⏭️ Step 1 Skipped: Using existing Local DB data.');
            }

            // Step 2: Fetch ONLY appointments that need syncing from LOCAL database
            this.logger.log('📤 Step 2: Syncing from Local DB to GHL...');

            const whereClause: any = {
                deleted: false,
                appointmentDate: { gte: sixtyDaysAgo },
            };

            // KEY OPTIMIZATION: Only process appointments that need syncing
            if (!options?.forceResync) {
                whereClause.OR = [
                    { syncStatus: PhorestSyncStatus.PENDING },
                    { syncStatus: PhorestSyncStatus.FAILED },
                    // Also include SYNCED appointments that were updated after last sync
                    {
                        syncStatus: PhorestSyncStatus.SYNCED,
                        updatedAt: { gt: this.prisma.$queryRaw`"lastSyncedAt"` },
                    },
                ];
            }

            if (options?.updatedSince) {
                whereClause.updatedAt = { gte: options.updatedSince };
            }

            // First, count total pending to give accurate progress
            const pendingCount = await this.prisma.phorestAppointment.count({
                where: {
                    deleted: false,
                    appointmentDate: { gte: sixtyDaysAgo },
                    syncStatus: { in: [PhorestSyncStatus.PENDING, PhorestSyncStatus.FAILED] },
                },
            });

            this.logger.log(`📊 Found ${pendingCount} appointments needing sync (PENDING/FAILED)`);

            // Fetch appointments that need syncing
            const dbAppointments = await this.prisma.phorestAppointment.findMany({
                where: {
                    deleted: false,
                    appointmentDate: { gte: sixtyDaysAgo },
                    syncStatus: { in: [PhorestSyncStatus.PENDING, PhorestSyncStatus.FAILED] },
                },
                orderBy: { appointmentDate: 'asc' },
                take: this.maxRecords > 0 ? this.maxRecords : undefined,
            });

            this.logger.log(`Processing ${dbAppointments.length} appointments (concurrency: 5)`);
            const totalAppointments = dbAppointments.length;

            // OPTIMIZATION: Parallel processing with concurrency limit
            const limit = pLimit(5);
            let processed = 0;

            const tasks = dbAppointments.map((dbApt, _i) =>
                limit(async () => {
                    // Convert DB record to PhorestAppointment interface format
                    const appointment: PhorestAppointment = {
                        appointmentId: dbApt.phorestId,
                        branchId: dbApt.branchId || '',
                        clientId: dbApt.clientId || undefined,
                        staffId: dbApt.staffId || undefined,
                        startTime: dbApt.startTime.toISOString(),
                        endTime: dbApt.endTime.toISOString(),
                        serviceName: dbApt.serviceName || undefined,
                        state: (dbApt.state as any) || 'BOOKED',
                        activationState: (dbApt.activationState as any) || 'ACTIVE',
                        notes: dbApt.notes || undefined,
                        services: [],
                        createdAt: dbApt.createdAt?.toISOString() || new Date().toISOString(),
                        updatedAt: dbApt.updatedAt?.toISOString() || new Date().toISOString(),
                    };

                    const itemResult = await this.processSingleAppointment(
                        appointment,
                        runId,
                        batchId,
                        result,
                        options?.jobId,
                    );

                    // Increment counters (atomic in JS single-thread)
                    processed++;
                    if (itemResult === 'created') result.created++;
                    else if (itemResult === 'updated') result.updated++;
                    else if (itemResult === 'skipped') result.skipped++;
                    else if (itemResult === 'failed') result.failed++;

                    // Report progress every 10 appointments
                    if (options?.onProgress && processed % 10 === 0) {
                        const progress = Math.floor((processed / totalAppointments) * 100);
                        options.onProgress(progress);
                    }

                    return itemResult;
                })
            );

            await Promise.all(tasks);
            result.totalProcessed = processed;

            await this.syncLogService.completeSyncRun(runId, {
                totalRecords: result.totalProcessed,
                successCount: result.created + result.updated,
                failedCount: result.failed,
                skippedCount: result.skipped,
            });

            this.logger.log(
                `Phorest → GHL appointment sync completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed, ${result.clientsRepaired} clients repaired`,
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Phorest → GHL appointment sync failed: ${errorMessage}`);
            await this.syncLogService.failSyncRun(runId, errorMessage);
            throw error;
        } finally {
            // Calculate duration even on error
            result.durationMs = Date.now() - startTime;
        }

        return result;
    }

    /**
     * Process a single Phorest appointment
     * 
     * If the client doesn't exist in GHL, attempts INLINE repair:
     * 1. Import client from Phorest API to local DB (if not exists)
     * 2. Sync client to GHL (inline, not via separate job)
     * 3. Continue with appointment sync
     */
    private async processSingleAppointment(
        appointment: PhorestAppointment,
        runId: string,
        batchId: string,
        result: SyncResult,
        jobId?: string,
    ): Promise<'created' | 'updated' | 'skipped' | 'failed'> {
        const startedAt = new Date();

        try {
            // Check if we should sync this appointment
            if (!shouldSyncPhorestAppointment(appointment)) {
                return 'skipped';
            }

            // Skip appointments without a client
            if (!appointment.clientId) {
                this.logger.debug(`Skipping appointment ${appointment.appointmentId} - no client`);
                return 'skipped';
            }

            // Find the GHL contact ID for this Phorest client
            let clientMapping = await this.entityMappingService.findByPhorestId(
                'client',
                appointment.clientId,
            );

            // If no mapping exists, attempt INLINE client repair
            let ghlContactId: string;

            if (!clientMapping) {
                const repairResult = await this.attemptInlineClientRepair(appointment.clientId);

                if (repairResult.success && repairResult.mapping) {
                    result.clientsRepaired++;
                    ghlContactId = repairResult.mapping.ghlId;
                    this.logger.log(`✅ Inline client repair successful: ${appointment.clientId} → ${ghlContactId}`);
                } else {
                    // Client repair failed - mark appointment for retry later
                    this.logger.debug(
                        `Skipping appointment ${appointment.appointmentId} - client ${appointment.clientId} repair failed: ${repairResult.reason}`,
                    );
                    return 'skipped';
                }
            } else {
                ghlContactId = clientMapping.ghlId;
            }
            const locationId = this.configService.getOrThrow<string>('GHL_LOCATION_ID');
            const calendarId = this.configService.getOrThrow<string>('GHL_DEFAULT_CALENDAR_ID');

            // Look up staff full name for the appointment description (for automations: {{appointment.description}} = 'Ann Moore')
            let staffName: string | undefined;
            if (appointment.staffId) {
                const staff = await this.prisma.phorestStaff.findUnique({
                    where: { phorestId: appointment.staffId },
                    select: { firstName: true, lastName: true },
                });
                if (staff?.firstName) {
                    staffName = staff.lastName
                        ? `${staff.firstName} ${staff.lastName}`.trim()
                        : staff.firstName.trim();
                }
            }

            // Check if we already have a mapping for this appointment
            const existingMapping = await this.entityMappingService.findByPhorestId(
                'appointment',
                appointment.appointmentId,
            );

            let action: 'create' | 'update';
            let ghlAppointmentId: string;

            if (existingMapping) {
                // Update existing GHL appointment
                action = 'update';
                const updateData = mapPhorestAppointmentToGhlUpdate(appointment, staffName);

                if (this.dryRun) {
                    await this.simulateApiDelay();
                    this.logger.log(`[DRY RUN] Would UPDATE GHL appointment: ${existingMapping.ghlId}`);
                    ghlAppointmentId = existingMapping.ghlId;
                } else {
                    await this.ghlClient.updateAppointment(existingMapping.ghlId, updateData);
                    ghlAppointmentId = existingMapping.ghlId;
                    this.logger.debug(`Updated GHL appointment: ${ghlAppointmentId}`);
                }
            } else {
                // Create new GHL appointment
                action = 'create';
                const createData = mapPhorestAppointmentToGhlCreate(
                    appointment,
                    ghlContactId,
                    calendarId,
                    locationId,
                    staffName,
                );

                if (this.dryRun) {
                    await this.simulateApiDelay();
                    // Generate mock ID for dry run
                    ghlAppointmentId = `mock-${appointment.appointmentId}`;
                    this.logger.log(`[DRY RUN] Would CREATE GHL appointment for: ${appointment.appointmentId} -> ${ghlAppointmentId}`);
                } else {
                    const ghlAppointment = await this.ghlClient.createAppointment(createData);
                    ghlAppointmentId = ghlAppointment.id;
                    this.logger.debug(`Created GHL appointment: ${ghlAppointmentId}`);
                }
            }

            // Store/update the mapping (ONLY if not dry run)
            if (!this.dryRun) {
                await this.entityMappingService.upsertMapping(
                    'appointment',
                    appointment.appointmentId,
                    ghlAppointmentId,
                    {
                        phorestClientId: appointment.clientId,
                        ghlContactId,
                        syncedAt: new Date().toISOString(),
                    },
                );

                // Update local DB sync status
                await this.prisma.phorestAppointment.update({
                    where: { phorestId: appointment.appointmentId },
                    data: {
                        syncStatus: 'SYNCED',
                        ghlEventId: ghlAppointmentId,
                        lastSyncedAt: new Date(),
                    },
                }).catch(err => {
                    // Don't fail sync if status update fails
                    this.logger.warn(`Failed to update sync status for ${appointment.appointmentId}: ${err.message}`);
                });
            } else {
                this.logger.log(`[DRY RUN] Skipping DB mapping save for ${appointment.appointmentId} -> ${ghlAppointmentId}`);
            }

            // Log success
            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'appointment',
                entityId: appointment.appointmentId,
                direction: 'phorest_to_ghl',
                action,
                status: 'success',
                sourceData: appointment,
                targetData: action === 'create'
                    ? mapPhorestAppointmentToGhlCreate(appointment, ghlContactId, calendarId, locationId, staffName)
                    : mapPhorestAppointmentToGhlUpdate(appointment, staffName),
                responseData: { ghlAppointmentId },
                startedAt,
                completedAt: new Date(),
            });

            return action === 'create' ? 'created' : 'updated';
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorCode = (error as any)?.response?.status?.toString() || 'UNKNOWN';
            const responseData = (error as any)?.response?.data;

            this.logger.error(
                `Failed to sync Phorest appointment ${appointment.appointmentId}: ${errorMessage}`,
            );
            if (responseData) {
                this.logger.error(`GHL Error Response: ${JSON.stringify(responseData)}`);
            }

            // Update local DB sync status to FAILED
            await this.prisma.phorestAppointment.update({
                where: { phorestId: appointment.appointmentId },
                data: {
                    syncStatus: 'FAILED',
                    syncError: errorMessage.substring(0, 500),
                },
            }).catch(() => { }); // Ignore if update fails

            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'appointment',
                entityId: appointment.appointmentId,
                direction: 'phorest_to_ghl',
                action: 'update',
                status: 'failed',
                errorCode,
                errorMessage,
                sourceData: appointment,
                startedAt,
                completedAt: new Date(),
            });

            return 'failed';
        }
    }

    /**
     * Attempt to repair a missing client INLINE (synchronously)
     * 
     * Steps:
     * 1. Check if client exists in local DB
     * 2. If not, import from Phorest API (single client)
     * 3. Check for recent repair attempts in DB (prevents infinite retries)
     * 4. Sync client to GHL
     * 5. Store mapping
     * 
     * Returns { success: true, mapping } or { success: false, reason }
     */
    private async attemptInlineClientRepair(clientId: string): Promise<{
        success: boolean;
        mapping?: { phorestId: string; ghlId: string };
        reason?: string;
    }> {
        const MAX_REPAIR_ATTEMPTS = 3;
        const REPAIR_COOLDOWN_HOURS = 24;

        try {
            // Step 1: Check if client exists in local DB
            let clientInLocalDb = await this.prisma.phorestClient.findUnique({
                where: { phorestId: clientId },
            });

            // Step 2: If not in local DB, try importing from Phorest
            if (!clientInLocalDb) {
                this.logger.debug(`Client ${clientId} not in local DB, importing from Phorest...`);
                await this.clientImportService.importAll({ clientId });

                clientInLocalDb = await this.prisma.phorestClient.findUnique({
                    where: { phorestId: clientId },
                });

                if (!clientInLocalDb) {
                    return { success: false, reason: 'Client not found in Phorest' };
                }
            }

            // Step 3: Check for recent repair attempts (stored in syncError field)
            // Format: "REPAIR_ATTEMPT:count:timestamp"
            const syncError = clientInLocalDb.syncError || '';
            const repairMatch = syncError.match(/^REPAIR_ATTEMPT:(\d+):(\d+)$/);

            if (repairMatch) {
                const attemptCount = parseInt(repairMatch[1], 10);
                const lastAttemptTime = parseInt(repairMatch[2], 10);
                const hoursSinceLastAttempt = (Date.now() - lastAttemptTime) / (1000 * 60 * 60);

                if (attemptCount >= MAX_REPAIR_ATTEMPTS && hoursSinceLastAttempt < REPAIR_COOLDOWN_HOURS) {
                    return {
                        success: false,
                        reason: `Max repair attempts (${MAX_REPAIR_ATTEMPTS}) reached, cooldown ${(REPAIR_COOLDOWN_HOURS - hoursSinceLastAttempt).toFixed(1)}h remaining`,
                    };
                }
            }

            // If client already has a GHL ID and mapping exists, just return it
            if (clientInLocalDb.ghlContactId) {
                const existingMapping = await this.entityMappingService.findByPhorestId('client', clientId);
                if (existingMapping) {
                    return { success: true, mapping: existingMapping };
                }
            }

            // Step 4: Record repair attempt before trying
            const currentAttemptCount = repairMatch ? parseInt(repairMatch[1], 10) + 1 : 1;
            await this.prisma.phorestClient.update({
                where: { phorestId: clientId },
                data: { syncError: `REPAIR_ATTEMPT:${currentAttemptCount}:${Date.now()}` },
            });

            // DRY RUN: Skip GHL API calls and return mock data
            if (this.dryRun) {
                await this.simulateApiDelay();
                const mockGhlId = `mock-contact-${clientId}`;
                this.logger.log(`[DRY RUN] Would CREATE client ${clientId} -> ${mockGhlId}`);

                // Skip DB update in dry run
                this.logger.log(`[DRY RUN] Skipping DB update for client repair: ${clientId}`);

                return {
                    success: true,
                    mapping: { phorestId: clientId, ghlId: mockGhlId },
                };
            }

            // Step 5: Sync client to GHL (real API calls)
            const locationId = this.configService.getOrThrow<string>('GHL_LOCATION_ID');

            // Get custom field map (cached would be better but inline is simpler)
            const customFields = await this.ghlClient.getCustomFields();
            const customFieldMap = new Map<string, string>();
            for (const field of customFields) {
                const key = field.fieldKey || field.name.toLowerCase().replace(/\s+/g, '_');
                customFieldMap.set(key, field.id);
            }

            // Get category map
            const categories = await this.prisma.phorestClientCategory.findMany();
            const categoryMap = new Map<string, string>();
            for (const cat of categories) {
                categoryMap.set(cat.phorestId, cat.name);
            }

            const upsertData = mapPhorestClientToGhlUpsert(
                clientInLocalDb as any,
                locationId,
                categoryMap,
                customFieldMap,
            );

            let ghlContact;
            if (upsertData.email || upsertData.phone) {
                ghlContact = await this.ghlClient.upsertContact(upsertData);
            } else {
                // No email or phone - create directly (risk of duplicates, but necessary)
                ghlContact = await this.ghlClient.createContact(upsertData as any);
            }

            // Step 6: Store mapping
            await this.entityMappingService.upsertMapping(
                'client',
                clientId,
                ghlContact.id,
                {
                    phorestName: `${clientInLocalDb.firstName} ${clientInLocalDb.lastName}`,
                    ghlEmail: ghlContact.email,
                    syncedAt: new Date().toISOString(),
                    repairedDuringAppointmentSync: true,
                },
            );

            // Step 7: Update client sync status
            await this.prisma.phorestClient.update({
                where: { phorestId: clientId },
                data: {
                    syncStatus: PhorestSyncStatus.SYNCED,
                    ghlContactId: ghlContact.id,
                    lastSyncedAt: new Date(),
                    syncError: null, // Clear repair attempts on success
                },
            });

            return {
                success: true,
                mapping: { phorestId: clientId, ghlId: ghlContact.id },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`Inline client repair failed for ${clientId}: ${errorMessage}`);

            // Don't update syncError here - we already recorded the attempt
            return { success: false, reason: errorMessage };
        }
    }
}
