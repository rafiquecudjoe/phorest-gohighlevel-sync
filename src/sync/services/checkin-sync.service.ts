import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlApiClient } from '../../integrations/gohighlevel/ghl-api.client';
import { SyncLogService } from './sync-log.service';
import { EntityMappingService } from './entity-mapping.service';
import { PrismaService } from '../../common/prisma.service';
import { PhorestAppointmentImportService } from '../import/phorest-appointment-import.service';
import { PhorestAppointment as DbAppointment } from '@prisma/client';

export interface CheckinSyncResult {
    totalProcessed: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ entityId: string; error: string }>;
}

/**
 * Checkin Sync Service
 * Syncs check-ins from Phorest to GHL (via Local DB)
 * 
 * Two-Phase Pattern:
 * 1. Appointment data is already imported via AppointmentImportService → Local DB
 * 2. Read from Local DB (PhorestAppointment where state=CHECKED_IN) → Sync to GHL
 */
@Injectable()
export class CheckinSyncService {
    private readonly logger = new Logger(CheckinSyncService.name);
    private readonly maxRecords: number;

    constructor(
        private readonly ghlClient: GhlApiClient,
        private readonly syncLogService: SyncLogService,
        private readonly entityMappingService: EntityMappingService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly appointmentImportService: PhorestAppointmentImportService,
    ) {
        this.maxRecords = this.configService.get<number>('SYNC_MAX_RECORDS') || 0;
    }

    /**
     * Sync check-ins from Phorest to GHL (via Local DB)
     * - Reads from Local DB appointments with state: CHECKED_IN or PAID
     * - Updates the linked GHL contact with last check-in info
     * - Adds a note to the contact
     */
    async syncPhorestToGhl(options?: { jobId?: string; skipImport?: boolean }): Promise<CheckinSyncResult> {
        this.logger.log('Starting Phorest → Local DB → GHL check-in sync');

        const result: CheckinSyncResult = {
            totalProcessed: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        const { runId, batchId } = await this.syncLogService.createSyncRun({
            direction: 'phorest_to_ghl',
            entityType: 'checkin',
        });

        try {
            // Step 1: Import fresh appointment data from Phorest (optional)
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            if (!options?.skipImport) {
                this.logger.log('📥 Step 1: Importing appointments from Phorest API to Local DB...');
                await this.appointmentImportService.importAll({
                    startDate: sevenDaysAgo,
                    endDate: now,
                    maxRecords: this.maxRecords,
                });
                this.logger.log('✅ Step 1 Complete: Local DB updated with fresh Phorest data.');
            } else {
                this.logger.log('⏭️ Step 1 Skipped: Using existing Local DB data.');
            }

            // Step 2: Read from Local DB and sync to GHL
            this.logger.log('📤 Step 2: Reading checked-in appointments from Local DB...');

            const checkedInAppointments = await this.prisma.phorestAppointment.findMany({
                where: {
                    state: { in: ['CHECKED_IN', 'PAID'] },
                    appointmentDate: {
                        gte: sevenDaysAgo,
                        lte: now,
                    },
                    deleted: false,
                },
                take: this.maxRecords > 0 ? this.maxRecords : undefined,
            });

            this.logger.debug(`Found ${checkedInAppointments.length} checked-in appointments in Local DB`);

            for (const appointment of checkedInAppointments) {
                if (this.maxRecords > 0 && result.totalProcessed >= this.maxRecords) {
                    this.logger.log(`⚠️ Reached max records limit (${this.maxRecords}), stopping sync`);
                        break;
                    }

                    const itemResult = await this.processCheckin(
                        appointment,
                        runId,
                        batchId,
                        options?.jobId,
                    );

                    result.totalProcessed++;
                    if (itemResult === 'updated') result.updated++;
                    else if (itemResult === 'skipped') result.skipped++;
                    else if (itemResult === 'failed') result.failed++;
            }

            await this.syncLogService.completeSyncRun(runId, {
                totalRecords: result.totalProcessed,
                successCount: result.updated,
                failedCount: result.failed,
                skippedCount: result.skipped,
            });

            this.logger.log(
                `Phorest → GHL check-in sync completed: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Phorest → GHL check-in sync failed: ${errorMessage}`);
            await this.syncLogService.failSyncRun(runId, errorMessage);
            throw error;
        }

        return result;
    }

    /**
     * Process a single check-in from Local DB
     */
    private async processCheckin(
        appointment: DbAppointment,
        runId: string,
        batchId: string,
        jobId?: string,
    ): Promise<'updated' | 'skipped' | 'failed'> {
        const startedAt = new Date();

        try {
            // Skip appointments without a client
            if (!appointment.clientId) {
                return 'skipped';
            }

            // Check if we've already processed this check-in (by appointment mapping with checkin metadata)
            const existingMapping = await this.entityMappingService.findByPhorestId(
                'checkin',
                appointment.phorestId,
            );

            if (existingMapping) {
                // Already processed this check-in
                return 'skipped';
            }

            // Find the GHL contact for this Phorest client
            const clientMapping = await this.entityMappingService.findByPhorestId(
                'client',
                appointment.clientId,
            );

            if (!clientMapping) {
                this.logger.warn(
                    `Skipping check-in for appointment ${appointment.phorestId} - client not synced`
                );
                return 'skipped';
            }

            const ghlContactId = clientMapping.ghlId;

            // Build check-in info using local DB fields
            const serviceNames = appointment.serviceName || 'Appointment';

            // Format date from DB timestamp
            let formattedDate = 'Recently';
            try {
                const date = appointment.startTime || appointment.appointmentDate;
                if (date) {
                        formattedDate = date.toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        });
                }
            } catch (e) {
                this.logger.warn(`Could not parse date for appointment ${appointment.phorestId}`);
            }

            // Add a note to the GHL contact
            const noteBody = `✅ Checked in: ${serviceNames}\n📅 ${formattedDate}\n🆔 Phorest Apt: ${appointment.phorestId}`;

            try {
                await this.ghlClient.addContactNote(ghlContactId, noteBody);
                this.logger.debug(`Added check-in note to GHL contact ${ghlContactId}`);
            } catch (noteError) {
                // If notes fail, log but continue - GHL might not have notes API in all versions
                this.logger.warn(`Could not add note to contact: ${noteError}`);
            }

            // Store the checkin mapping to prevent re-processing (won't delete other appointments from same contact)
            await this.entityMappingService.createCheckinMapping(
                appointment.phorestId,
                ghlContactId,
                {
                    checkinTime: appointment.startTime?.toISOString(),
                    services: serviceNames,
                    syncedAt: new Date().toISOString(),
                },
            );

            // Log success
            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'checkin',
                entityId: appointment.phorestId,
                direction: 'phorest_to_ghl',
                action: 'update',
                status: 'success',
                sourceData: appointment,
                targetData: { note: noteBody },
                responseData: { ghlContactId },
                startedAt,
                completedAt: new Date(),
            });

            return 'updated';
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorCode = (error as any)?.response?.status?.toString() || 'UNKNOWN';

            this.logger.error(
                `Failed to sync check-in for appointment ${appointment.phorestId}: ${errorMessage}`
            );

            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'checkin',
                entityId: appointment.phorestId,
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
}
