import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SyncLogService } from './sync-log.service';
import { EntityMappingService } from './entity-mapping.service';
import { PrismaService } from '../../common/prisma.service';
import { PhorestAppointmentImportService } from '../import/phorest-appointment-import.service';
import { PhorestAppointment } from '@prisma/client';

export interface BookingSyncResult {
    totalProcessed: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ entityId: string; error: string }>;
}

/**
 * Booking Sync Service
 * Syncs bookings from Phorest to GHL (via Local DB)
 * 
 * Two-Phase Pattern:
 * 1. Appointment data is already imported via AppointmentImportService → Local DB
 * 2. Read from Local DB (PhorestAppointment where bookingId is not null) → Sync to GHL
 * 
 * Note: In Phorest, "bookings" are containers for appointments (group bookings).
 * Individual appointments are already synced via AppointmentSyncService.
 * This service handles booking-level metadata and group booking scenarios.
 */
@Injectable()
export class BookingSyncService {
    private readonly logger = new Logger(BookingSyncService.name);
    private readonly maxRecords: number;

    constructor(
        private readonly syncLogService: SyncLogService,
        private readonly entityMappingService: EntityMappingService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly appointmentImportService: PhorestAppointmentImportService,
    ) {
        this.maxRecords = this.configService.get<number>('SYNC_MAX_RECORDS') || 0;

        if (this.maxRecords > 0) {
            this.logger.warn(`⚠️ TEST MODE: Booking sync limited to ${this.maxRecords} records`);
        }
    }

    /**
     * Sync bookings from Phorest to GHL (via Local DB)
     * Reads from PhorestAppointment table where bookingId is not null
     */
    async syncPhorestToGhl(options?: { jobId?: string; skipImport?: boolean }): Promise<BookingSyncResult> {
        this.logger.log('Starting Phorest → Local DB → GHL booking sync');

        const result: BookingSyncResult = {
            totalProcessed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        const { runId, batchId } = await this.syncLogService.createSyncRun({
            direction: 'phorest_to_ghl',
            entityType: 'booking',
        });

        try {
            // Step 1: Import fresh appointment data from Phorest (optional)
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

            if (!options?.skipImport) {
                this.logger.log('📥 Step 1: Importing appointments from Phorest API to Local DB...');
                await this.appointmentImportService.importAll({
                    startDate: thirtyDaysAgo,
                    endDate: now,
                    maxRecords: this.maxRecords,
                });
                this.logger.log('✅ Step 1 Complete: Local DB updated with fresh Phorest data.');
            } else {
                this.logger.log('⏭️ Step 1 Skipped: Using existing Local DB data.');
            }

            // Step 2: Read from Local DB and sync to GHL
            this.logger.log('📤 Step 2: Reading appointments with bookingId from Local DB...');

            const appointments = await this.prisma.phorestAppointment.findMany({
                where: {
                    bookingId: { not: null },
                    appointmentDate: {
                        gte: thirtyDaysAgo,
                        lte: now,
                    },
                    deleted: false,
                },
                take: this.maxRecords > 0 ? this.maxRecords : undefined,
            });

            this.logger.debug(`Found ${appointments.length} appointments with bookingId in Local DB`);

            const processedBookingIds = new Set<string>();

                for (const appointment of appointments) {
                if (!appointment.bookingId) continue;

                    // Skip if we already processed this booking
                    if (processedBookingIds.has(appointment.bookingId)) {
                        continue;
                    }
                    processedBookingIds.add(appointment.bookingId);

                    if (this.maxRecords > 0 && result.totalProcessed >= this.maxRecords) {
                    this.logger.log(`⚠️ Reached max records limit (${this.maxRecords}), stopping sync`);
                        break;
                    }

                    const itemResult = await this.processBooking(
                        appointment.bookingId,
                        appointment,
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
                `Phorest → GHL booking sync completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`,
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Phorest → GHL booking sync failed: ${errorMessage}`);
            await this.syncLogService.failSyncRun(runId, errorMessage);
            throw error;
        }

        return result;
    }

    /**
     * Process a single booking from Local DB
     * Since appointments are already synced, this adds booking-level metadata
     */
    private async processBooking(
        bookingId: string,
        appointment: PhorestAppointment,
        runId: string,
        batchId: string,
        jobId?: string,
    ): Promise<'created' | 'updated' | 'skipped' | 'failed'> {
        const startedAt = new Date();

        try {
            // Check if the appointment was synced to GHL
            const appointmentMapping = await this.entityMappingService.findByPhorestId(
                'appointment',
                appointment.phorestId,
            );

            if (!appointmentMapping) {
                // Appointment not synced yet, skip booking sync
                this.logger.debug(`Skipping booking ${bookingId} - appointment not synced to GHL`);
                return 'skipped';
            }

            // Check if we already have a mapping for this booking
            const existingMapping = await this.entityMappingService.findByPhorestId(
                'booking',
                bookingId,
            );

            // Store/update the booking mapping
            await this.entityMappingService.upsertMapping(
                'booking',
                bookingId,
                appointmentMapping.ghlId, // Link to the GHL appointment
                {
                    appointmentId: appointment.phorestId,
                    source: appointment.source || 'WIDGET',
                    syncedAt: new Date().toISOString(),
                },
            );

            const action = existingMapping ? 'update' : 'create';

            // Log success
            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'booking',
                entityId: bookingId,
                direction: 'phorest_to_ghl',
                action,
                status: 'success',
                sourceData: { bookingId, appointmentId: appointment.phorestId },
                targetData: { ghlAppointmentId: appointmentMapping.ghlId },
                startedAt,
                completedAt: new Date(),
            });

            return action === 'create' ? 'created' : 'updated';
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to sync booking ${bookingId}: ${errorMessage}`);

            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'booking',
                entityId: bookingId,
                direction: 'phorest_to_ghl',
                action: 'update',
                status: 'failed',
                errorMessage,
                sourceData: { bookingId },
                startedAt,
                completedAt: new Date(),
            });

            return 'failed';
        }
    }
}
