import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlApiClient } from '../../integrations/gohighlevel/ghl-api.client';
import { SyncLogService } from './sync-log.service';
import { EntityMappingService } from './entity-mapping.service';
import { PhorestStaffImportService } from '../import/phorest-staff-import.service';
import { PrismaService } from '../../common/prisma.service';
import { PhorestStaff } from '@prisma/client';

export interface StaffSyncResult {
    totalProcessed: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    durationMs?: number; // Time taken to complete sync in milliseconds
}

@Injectable()
export class StaffSyncService {
    private readonly logger = new Logger(StaffSyncService.name);
    private readonly maxRecords: number;

    constructor(
        private readonly ghlClient: GhlApiClient,
        private readonly syncLogService: SyncLogService,
        private readonly entityMappingService: EntityMappingService,
        private readonly configService: ConfigService,
        private readonly staffImportService: PhorestStaffImportService,
        private readonly prisma: PrismaService,
    ) {
        this.maxRecords = this.configService.get<number>('SYNC_MAX_RECORDS') || 0;
    }

    /**
     * Sync staff from Phorest to GHL (via Local DB)
     * 1. Import from Phorest API -> Local DB
     * 2. Read from Local DB -> Sync to GHL
     */
    async syncPhorestToGhl(options?: { jobId?: string }): Promise<StaffSyncResult> {
        const startTime = Date.now();
        this.logger.log('Starting Phorest → Local DB → GHL staff sync');

        const result: StaffSyncResult = {
            totalProcessed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
        };

        const { runId, batchId } = await this.syncLogService.createSyncRun({
            direction: 'phorest_to_ghl',
            entityType: 'staff',
        });

        try {
            // Step 1: Import from Phorest to Local DB
            this.logger.log('📥 Step 1: Importing from Phorest API to Local DB...');
            await this.staffImportService.importAll();
            this.logger.log('✅ Step 1 Complete: Local DB updated.');

            // Step 2: Read from Local DB and Sync to GHL
            this.logger.log('📤 Step 2: Syncing from Local DB to GHL...');

            // Fetch all active staff from DB
            const staffMembers = await this.prisma.phorestStaff.findMany({
                where: { deleted: false }
            });

            this.logger.debug(`Found ${staffMembers.length} active staff members in Local DB`);

            for (const staff of staffMembers) {
                if (this.maxRecords > 0 && result.totalProcessed >= this.maxRecords) {
                    this.logger.log(`⚠️ Reached max records limit (${this.maxRecords}), stopping sync`);
                    break;
                }

                const itemResult = await this.processStaffMember(
                    staff,
                    runId,
                    batchId,
                    options?.jobId,
                );

                result.totalProcessed++;
                if (itemResult === 'created') result.created++;
                else if (itemResult === 'updated') result.updated++;
                else if (itemResult === 'skipped') result.skipped++;
                else if (itemResult === 'failed') result.failed++;
            }

            await this.syncLogService.completeSyncRun(runId, {
                totalRecords: result.totalProcessed,
                successCount: result.created + result.updated,
                failedCount: result.failed,
                skippedCount: result.skipped,
            });

            this.logger.log(
                `Phorest → GHL staff sync completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Phorest → GHL staff sync failed: ${errorMessage}`);
            await this.syncLogService.failSyncRun(runId, errorMessage);
            throw error;
        } finally {
            result.durationMs = Date.now() - startTime;
        }

        return result;
    }

    /**
     * Process a single staff member (DB Model)
     * Creates staff as GHL Contacts with role:staff tag
     */
    private async processStaffMember(
        staff: PhorestStaff,
        runId: string,
        batchId: string,
        jobId?: string,
    ): Promise<'created' | 'updated' | 'skipped' | 'failed'> {
        const startedAt = new Date();

        try {
            // Check if we already have a mapping
            const existingMapping = await this.entityMappingService.findByPhorestId(
                'staff',
                staff.phorestId, // Use phorestId from DB model
            );

            const ghlConfig = this.ghlClient.getConfig();
            const staffFullName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim();

            // Staff tags
            const staffTags = [
                'role:staff',
                'phorest-staff:true',
                `phorest-staff-id:${staff.phorestId}`,
            ];

            let ghlContactId: string;
            let action: 'create' | 'update' = 'create';

            if (existingMapping && existingMapping.ghlId && existingMapping.ghlId !== 'UNMATCHED') {
                // Already synced to GHL, update it
                try {
                    const updatedContact = await this.ghlClient.updateContact(existingMapping.ghlId, {
                        firstName: staff.firstName || undefined,
                        lastName: staff.lastName || undefined,
                        email: staff.email || undefined,
                        phone: staff.mobile || undefined,
                        tags: staffTags,
                    });
                    ghlContactId = updatedContact.id;
                    action = 'update';
                } catch (updateError: any) {
                    // If contact doesn't exist in GHL, create it
                    if (updateError?.response?.status === 404 || updateError?.response?.status === 400) {
                        // Fallback to create
                        const hasIdentifier = (staff.email && staff.email.trim().length > 0) ||
                            (staff.mobile && staff.mobile.trim().length > 0);

                        if (hasIdentifier) {
                            const ghlContact = await this.ghlClient.upsertContact({
                                locationId: ghlConfig.locationId,
                                firstName: staff.firstName || undefined,
                                lastName: staff.lastName || undefined,
                                name: staffFullName,
                                email: staff.email || undefined,
                                phone: staff.mobile || undefined,
                                tags: staffTags,
                                source: 'phorest-staff-sync',
                            });
                            ghlContactId = ghlContact.id;
                        } else {
                            const ghlContact = await this.ghlClient.createContact({
                                locationId: ghlConfig.locationId,
                                firstName: staff.firstName || undefined,
                                lastName: staff.lastName || undefined,
                                name: staffFullName,
                                tags: staffTags,
                                source: 'phorest-staff-sync',
                            });
                            ghlContactId = ghlContact.id;
                        }
                        action = 'create';
                    } else {
                        throw updateError;
                    }
                }
            } else {
                // Create new contact in GHL for this staff member
                // If we have email or phone, use upsert (safer)
                // If we have neither, use create (upsert fails without identifier)
                const hasIdentifier = (staff.email && staff.email.trim().length > 0) ||
                    (staff.mobile && staff.mobile.trim().length > 0);

                if (hasIdentifier) {
                    const ghlContact = await this.ghlClient.upsertContact({
                        locationId: ghlConfig.locationId,
                        firstName: staff.firstName || undefined,
                        lastName: staff.lastName || undefined,
                        name: staffFullName,
                        email: staff.email || undefined,
                        phone: staff.mobile || undefined,
                        tags: staffTags,
                        source: 'phorest-staff-sync',
                    });
                    ghlContactId = ghlContact.id;
                } else {
                    const ghlContact = await this.ghlClient.createContact({
                        locationId: ghlConfig.locationId,
                        firstName: staff.firstName || undefined,
                        lastName: staff.lastName || undefined,
                        name: staffFullName,
                        tags: staffTags,
                        source: 'phorest-staff-sync',
                    });
                    ghlContactId = ghlContact.id;
                }
            }

            this.logger.debug(
                `Synced Phorest staff ${staffFullName} to GHL contact ${ghlContactId}`
            );

            // Store the mapping
            await this.entityMappingService.upsertMapping(
                'staff',
                staff.phorestId,
                ghlContactId,
                {
                    phorestName: staffFullName,
                    phorestEmail: staff.email,
                    ghlContactId,
                    syncedAt: new Date().toISOString(),
                },
            );

            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'staff',
                entityId: staff.phorestId,
                direction: 'phorest_to_ghl',
                action,
                status: 'success',
                sourceData: staff as any,
                targetData: { ghlContactId },
                startedAt,
                completedAt: new Date(),
            });

            return action === 'create' ? 'created' : 'updated';
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorCode = error?.response?.status?.toString() || 'UNKNOWN';
            const responseData = error?.response?.data;

            this.logger.error(
                `Failed to sync staff ${staff.phorestId}: ${errorMessage}`,
            );
            if (responseData) {
                this.logger.error(`GHL Error Response: ${JSON.stringify(responseData)}`);
            }

            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'staff',
                entityId: staff.phorestId,
                direction: 'phorest_to_ghl',
                action: 'update',
                status: 'failed',
                errorCode,
                errorMessage,
                sourceData: staff as any,
                startedAt,
                completedAt: new Date(),
            });

            return 'failed';
        }
    }

    /**
   * Get staff mapping for appointment assignment
   */
    async getGhlUserIdForPhorestStaff(phorestStaffId: string): Promise<string | null> {
        const mapping = await this.entityMappingService.findByPhorestId('staff', phorestStaffId);
        if (mapping && mapping.ghlId !== 'UNMATCHED') {
            return mapping.ghlId;
        }
        return null;
    }
}
