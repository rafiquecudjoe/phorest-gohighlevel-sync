import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PhorestApiClient } from '../../integrations/phorest/phorest-api.client';
import { PhorestSyncStatus } from '@prisma/client';
import { ImportResult } from './phorest-staff-import.service';
import { PhorestClientImportService } from './phorest-client-import.service';
import moment from 'moment-timezone';

/**
 * Phase 1: Import Appointments from Phorest API to Local Database
 */
@Injectable()
export class PhorestAppointmentImportService {
    private readonly logger = new Logger(PhorestAppointmentImportService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly phorestClient: PhorestApiClient,
        @Inject(forwardRef(() => PhorestClientImportService))
        private readonly clientImportService: PhorestClientImportService,
    ) { }

    /**
     * Import appointments from Phorest to local database
     * @param options.startDate - Start date for appointment range (default: 30 days ago)
     * @param options.endDate - End date for appointment range (default: today)
     * 
     * Note: Phorest API has a max 31-day limit per request, so we chunk larger ranges
     * 
     * OPTIMIZATIONS:
     * - Batch existence check (eliminates N+1 queries)
     * - Smart syncStatus: only sets PENDING for NEW records or when phorestUpdatedAt changed
     */
    async importAll(options?: {
        startDate?: Date;
        endDate?: Date;
        maxRecords?: number;
    }): Promise<ImportResult> {
        this.logger.log('🔄 Starting Phorest Appointments import to local database...');

        const result: ImportResult = {
            total: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        const maxRecords = options?.maxRecords || 0;
        const endDate = options?.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead default
        const startDate = options?.startDate || new Date(endDate.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days before end

        // Phorest API max date range is 31 days, so chunk if needed
        const MAX_DAYS_PER_REQUEST = 30;
        const dateRanges = this.chunkDateRange(startDate, endDate, MAX_DAYS_PER_REQUEST);

        this.logger.log(`📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} (${dateRanges.length} chunk(s))`);

        try {
            for (const { start, end } of dateRanges) {
                if (maxRecords > 0 && result.total >= maxRecords) {
                    this.logger.log(`Reached max records limit (${maxRecords}), stopping`);
                    break;
                }

                this.logger.debug(`📅 Fetching chunk: ${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`);

                let page = 0;
                let hasMore = true;
                const batchSize = 100;

                while (hasMore) {
                    if (maxRecords > 0 && result.total >= maxRecords) {
                        break;
                    }

                    const response = await this.phorestClient.getAppointments({
                        page,
                        size: batchSize,
                        startDate: start.toISOString().split('T')[0],
                        endDate: end.toISOString().split('T')[0],
                    });

                    const appointments = response._embedded?.appointments || [];

                    if (appointments.length === 0) {
                        hasMore = false;
                        break;
                    }

                    this.logger.debug(`Processing page ${page}: ${appointments.length} appointments`);

                    // OPTIMIZATION: Batch fetch existing appointments to avoid N+1 queries
                    const appointmentIds = appointments.map((a: any) => a.appointmentId);
                    const existingAppointments = await this.prisma.phorestAppointment.findMany({
                        where: { phorestId: { in: appointmentIds } },
                        select: { phorestId: true, phorestUpdatedAt: true, syncStatus: true },
                    });
                    const existingMap = new Map(
                        existingAppointments.map(a => [a.phorestId, { updatedAt: a.phorestUpdatedAt, syncStatus: a.syncStatus }])
                    );

                    // OPTIMIZATION: Batch check for existing clients to avoid FK constraint errors
                    const clientIds = [...new Set(appointments.map((a: any) => a.clientId).filter(Boolean))];
                    const existingClients = await this.prisma.phorestClient.findMany({
                        where: { phorestId: { in: clientIds } },
                        select: { phorestId: true },
                    });
                    const existingClientSet = new Set(existingClients.map(c => c.phorestId));

                    for (const appointment of appointments) {
                        if (maxRecords > 0 && result.total >= maxRecords) break;

                        result.total++;

                        try {
                            // On-the-fly client import: Fetch missing client from Phorest API
                            if (appointment.clientId && !existingClientSet.has(appointment.clientId)) {
                                this.logger.log(`📥 Importing missing client ${appointment.clientId} for appointment ${appointment.appointmentId}`);
                                try {
                                    const clientResult = await this.clientImportService.importSingleClient(appointment.clientId);
                                    if (clientResult.created > 0 || clientResult.updated > 0) {
                                        existingClientSet.add(appointment.clientId); // Add to set to avoid re-fetching
                                        this.logger.log(`✅ Client ${appointment.clientId} imported successfully`);
                                    } else {
                                        // Client not found in Phorest API either - skip this appointment
                                        this.logger.warn(`⚠️ Client ${appointment.clientId} not found in Phorest API - skipping appointment`);
                                        result.skipped++;
                                        continue;
                                    }
                                } catch (clientError: any) {
                                    this.logger.warn(`⚠️ Failed to import client ${appointment.clientId}: ${clientError.message} - skipping appointment`);
                                    result.skipped++;
                                    continue;
                                }
                            }

                            const existing = existingMap.get(appointment.appointmentId);
                            const isNew = !existing;

                            // Check if data actually changed (compare phorestUpdatedAt)
                            const phorestUpdatedAt = appointment.updatedAt ? new Date(appointment.updatedAt) : null;
                            const dataChanged = existing?.updatedAt && phorestUpdatedAt
                                ? phorestUpdatedAt.getTime() > existing.updatedAt.getTime()
                                : true;

                            await this.upsertAppointment(appointment, isNew, dataChanged);

                            if (isNew) {
                                result.created++;
                            } else if (dataChanged) {
                                result.updated++;
                            } else {
                                result.skipped++;
                            }
                        } catch (error: any) {
                            result.failed++;
                            if (result.errors.length < 10) {
                                result.errors.push(`Appointment ${appointment.appointmentId}: ${error.message}`);
                            }
                            this.logger.error(`Failed to import appointment ${appointment.appointmentId}: ${error.message}`);
                        }
                    }

                    page++;

                    if (page > 100) {
                        this.logger.warn('Reached page limit for this chunk, moving to next');
                        break;
                    }

                    hasMore = response.page.number < response.page.totalPages - 1;
                }
            }

            this.logger.log(`✅ Appointments import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} unchanged, ${result.failed} failed`);

        } catch (error: any) {
            this.logger.error(`Appointments import failed: ${error.message}`);
            throw error;
        }

        return result;
    }

    /**
     * Upsert a single appointment to local database
     * @param appointment - Phorest appointment data
     * @param isNew - True if this is a new record (not in DB yet)
     * @param dataChanged - True if phorestUpdatedAt indicates data changed
     */
    private async upsertAppointment(
        appointment: any,
        _isNew: boolean = true,
        dataChanged: boolean = true,
    ): Promise<void> {
        // Phorest returns appointmentDate as YYYY-MM-DD and startTime/endTime as HH:MM:SS.mmm
        // We need to combine them to create valid DateTime values in the salon's timezone (EST)

        if (!appointment.appointmentDate) {
            throw new Error('Missing appointmentDate');
        }

        const appointmentDateStr = appointment.appointmentDate; // YYYY-MM-DD
        const startTimeStr = appointment.startTime || '00:00:00.000';
        const endTimeStr = appointment.endTime || '23:59:59.000';

        // Use the configured app timezone (EST) to parse the local salon time
        const timezone = process.env.APP_TIMEZONE || 'America/New_York';

        // Create UTC moments by parsing as local timezone
        const startTime = moment.tz(`${appointmentDateStr}T${startTimeStr}`, timezone).toDate();
        const endTime = moment.tz(`${appointmentDateStr}T${endTimeStr}`, timezone).toDate();
        const appointmentDate = moment.tz(appointmentDateStr, timezone).startOf('day').toDate();

        // Validate the parsed dates
        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
            throw new Error(`Invalid date/time: ${appointmentDateStr} ${startTimeStr} - ${endTimeStr}`);
        }

        // Look up staff full name for the client's lastStylistName
        let staffName: string | undefined;
        if (appointment.staffId) {
            try {
                const staff = await this.prisma.phorestStaff.findUnique({
                    where: { phorestId: appointment.staffId },
                    select: { firstName: true, lastName: true },
                });
                if (staff?.firstName) {
                    staffName = staff.lastName
                        ? `${staff.firstName} ${staff.lastName}`.trim()
                        : staff.firstName.trim();
                }
            } catch (error) {
                this.logger.debug(`Could not look up staff ${appointment.staffId} for lastStylistName`);
            }
        }

        // Update the client with the stylist name
        if (appointment.clientId && staffName) {
            try {
                await this.prisma.phorestClient.update({
                    where: { phorestId: appointment.clientId },
                    data: {
                        lastStylistName: staffName,
                        syncStatus: PhorestSyncStatus.PENDING,
                    }
                });
            } catch (error) {
                this.logger.debug(`Could not update lastStylistName for client ${appointment.clientId}: Client may not exist locally yet`);
            }
        }

        // Upsert booking if ID is present (Derived from appointment)
        if (appointment.bookingId) {
            try {
                await this.prisma.phorestBooking.upsert({
                    where: { phorestId: appointment.bookingId },
                    create: {
                        phorestId: appointment.bookingId,
                        branchId: appointment.branchId,
                        clientId: appointment.clientId,
                        status: appointment.state,
                        bookingDate: appointmentDate,
                        createdAt: appointmentDate, // Best guess
                    },
                    update: {
                        clientId: appointment.clientId,
                        status: appointment.state,
                        bookingDate: appointmentDate,
                    }
                });
            } catch (error) {
                // Log but don't fail the appointment import if booking fails
                this.logger.warn(`Failed to upsert derived booking ${appointment.bookingId}: ${error}`);
            }
        }

        // OPTIMIZATION: Only set syncStatus to PENDING if:
        // 1. This is a new record (isNew = true)
        // 2. OR data actually changed (dataChanged = true)
        // Otherwise, preserve existing syncStatus to avoid re-processing

        await this.prisma.phorestAppointment.upsert({
            where: { phorestId: appointment.appointmentId },
            create: {
                phorestId: appointment.appointmentId,
                branchId: appointment.branchId,
                clientId: appointment.clientId,
                staffId: appointment.staffId,
                serviceId: appointment.serviceId,
                bookingId: appointment.bookingId,
                serviceName: appointment.serviceName,
                appointmentDate,
                startTime,
                endTime,
                state: appointment.state || 'BOOKED',
                activationState: appointment.activationState || 'ACTIVE',
                confirmed: appointment.confirmed || false,
                deleted: appointment.deleted || false,
                price: appointment.price || null,
                depositAmount: appointment.depositAmount || null,
                source: appointment.source,
                notes: appointment.notes,
                syncStatus: PhorestSyncStatus.PENDING, // New records always PENDING
                phorestCreatedAt: appointment.createdAt ? new Date(appointment.createdAt) : null,
                phorestUpdatedAt: appointment.updatedAt ? new Date(appointment.updatedAt) : null,
            },
            update: {
                branchId: appointment.branchId,
                clientId: appointment.clientId,
                staffId: appointment.staffId,
                serviceId: appointment.serviceId,
                bookingId: appointment.bookingId,
                serviceName: appointment.serviceName,
                appointmentDate,
                startTime,
                endTime,
                state: appointment.state || 'BOOKED',
                activationState: appointment.activationState || 'ACTIVE',
                confirmed: appointment.confirmed || false,
                deleted: appointment.deleted || false,
                price: appointment.price || null,
                depositAmount: appointment.depositAmount || null,
                source: appointment.source,
                notes: appointment.notes,
                phorestUpdatedAt: appointment.updatedAt ? new Date(appointment.updatedAt) : null,
                // Only set PENDING if data actually changed, otherwise preserve existing status
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
        byState: Record<string, number>;
    }> {
        const [total, pending, synced, failed] = await Promise.all([
            this.prisma.phorestAppointment.count(),
            this.prisma.phorestAppointment.count({ where: { syncStatus: PhorestSyncStatus.PENDING } }),
            this.prisma.phorestAppointment.count({ where: { syncStatus: PhorestSyncStatus.SYNCED } }),
            this.prisma.phorestAppointment.count({ where: { syncStatus: PhorestSyncStatus.FAILED } }),
        ]);

        // Get counts by state
        const stateGroups = await this.prisma.phorestAppointment.groupBy({
            by: ['state'],
            _count: true,
        });

        const byState: Record<string, number> = {};
        stateGroups.forEach((g: { state: string; _count: number }) => {
            byState[g.state] = g._count;
        });

        return { total, pending, synced, failed, byState };
    }

    /**
     * Chunk a date range into smaller ranges (max days per chunk)
     * Phorest API has a max 31-day limit per request
     */
    private chunkDateRange(startDate: Date, endDate: Date, maxDays: number): Array<{ start: Date; end: Date }> {
        const chunks: Array<{ start: Date; end: Date }> = [];
        const msPerDay = 24 * 60 * 60 * 1000;

        let currentStart = new Date(startDate);

        while (currentStart < endDate) {
            const chunkEnd = new Date(Math.min(
                currentStart.getTime() + (maxDays * msPerDay),
                endDate.getTime()
            ));

            chunks.push({
                start: new Date(currentStart),
                end: chunkEnd,
            });

            // Move to next chunk (start from day after current end)
            currentStart = new Date(chunkEnd.getTime() + msPerDay);
        }

        return chunks;
    }
}
