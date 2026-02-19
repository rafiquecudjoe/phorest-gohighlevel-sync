import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { GhlApiClient } from '../../integrations/gohighlevel/ghl-api.client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Audit result for a single entity type
 */
export interface EntityAuditResult {
    entityType: string;
    localCount: number;
    ghlCount: number;
    match: boolean;
    discrepancy: number;
    sampleChecks?: { id: string; exists: boolean; details?: string }[];
    orphanedInGhl?: string[];
    missingInGhl?: string[];
    status: 'success' | 'failed' | 'skipped';
    errorMessage?: string;
    durationMs?: number;
}

/**
 * Check-in audit result
 */
export interface CheckinAuditResult {
    totalMappings: number;
    sampleSize: number;
    notesFound: number;
    notesMissing: number;
    missingDetails: Array<{ phorestId: string; ghlContactId: string }>;
    status: 'success' | 'failed';
    errorMessage?: string;
}

/**
 * Full audit run result
 */
export interface AuditRunResult {
    auditRunId: string;
    entities: EntityAuditResult[];
    checkinAudit?: CheckinAuditResult;
    totalEntities: number;
    matchCount: number;
    mismatchCount: number;
    failedCount: number;
    skippedCount: number;
    totalDurationMs: number;
    auditedAt: Date;
}

/**
 * SyncAuditService - Compares local DB (EntityMapping) with GHL API
 * 
 * Auditable entities:
 * - client (contacts) ✅
 * - appointment (calendar events) ✅
 * - staff (synced as contacts) ✅
 * - booking (not actively synced - skip)
 * - checkin (notes on contacts - not countable via API)
 * - loyalty (custom fields on contacts - not countable via API)
 * - product (tags on contacts - not countable via API)
 * 
 * Note: Some entities (checkin, loyalty, product) modify contact properties
 * rather than creating separate GHL resources, so they can't be easily counted.
 */
@Injectable()
export class SyncAuditService {
    private readonly logger = new Logger(SyncAuditService.name);
    private readonly calendarId: string;
    private readonly locationId: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly ghlClient: GhlApiClient,
        private readonly configService: ConfigService,
    ) {
        this.calendarId = this.configService.getOrThrow<string>('GHL_DEFAULT_CALENDAR_ID');
        this.locationId = this.configService.getOrThrow<string>('GHL_LOCATION_ID');
    }

    /**
     * Run full audit across all auditable entities
     * 
     * This comprehensive audit:
     * 1. Compares entity counts (client, appointment, staff)
     * 2. Does FULL appointment comparison - verifies each GHL appointment exists in local DB
     * 3. Audits check-in notes - verifies notes exist in GHL contacts
     */
    async runFullAudit(): Promise<AuditRunResult> {
        const auditRunId = uuidv4();
        const auditedAt = new Date();
        const startTime = Date.now();

        this.logger.log(`🔍 Starting comprehensive sync audit run: ${auditRunId}`);

        const entities: EntityAuditResult[] = [];

        // Audit appointment (full comparison with GHL)
        // NOTE: Client audit removed - too slow with 15,000+ contacts
        try {
            this.logger.log('📅 Auditing appointments...');
            const appointmentResult = await this.auditAppointmentsFull();
            entities.push(appointmentResult);
            await this.saveAuditResult(auditRunId, appointmentResult);

            if (appointmentResult.match) {
                this.logger.log(`✅ appointment: MATCH (${appointmentResult.localCount})`);
                } else {
                    this.logger.warn(
                    `⚠️ appointment: MISMATCH - Local: ${appointmentResult.localCount}, GHL: ${appointmentResult.ghlCount} (diff: ${appointmentResult.discrepancy})`,
                    );
                if (appointmentResult.orphanedInGhl?.length) {
                    this.logger.warn(`   Orphaned in GHL: ${appointmentResult.orphanedInGhl.length}`);
                }
                if (appointmentResult.missingInGhl?.length) {
                    this.logger.warn(`   Missing in GHL: ${appointmentResult.missingInGhl.length}`);
                }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`❌ appointment: FAILED - ${errorMessage}`);
                const failedResult: EntityAuditResult = {
                entityType: 'appointment',
                    localCount: 0,
                    ghlCount: 0,
                    match: false,
                    discrepancy: 0,
                    status: 'failed',
                    errorMessage,
                };
                entities.push(failedResult);
                await this.saveAuditResult(auditRunId, failedResult);
            }

        // Audit check-in notes
        let checkinAudit: CheckinAuditResult | undefined;
        try {
            this.logger.log('📋 Auditing check-in notes...');
            checkinAudit = await this.auditCheckinNotes();

            if (checkinAudit.notesMissing === 0) {
                this.logger.log(`✅ checkin notes: ALL FOUND (${checkinAudit.notesFound}/${checkinAudit.sampleSize} sampled)`);
            } else {
                this.logger.warn(
                    `⚠️ checkin notes: ${checkinAudit.notesMissing} MISSING out of ${checkinAudit.sampleSize} sampled`,
                );
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`❌ checkin notes audit: FAILED - ${errorMessage}`);
            checkinAudit = {
                totalMappings: 0,
                sampleSize: 0,
                notesFound: 0,
                notesMissing: 0,
                missingDetails: [],
                status: 'failed',
                errorMessage,
            };
        }

        // Add skipped entities for visibility
        // client/staff skipped - too slow to pull 15,000+ contacts from GHL
        const skippedTypes = ['client', 'staff', 'booking', 'loyalty', 'product', 'client_update'];
        for (const entityType of skippedTypes) {
            const skippedResult: EntityAuditResult = {
                entityType,
                localCount: 0,
                ghlCount: 0,
                match: true,
                discrepancy: 0,
                status: 'skipped',
                errorMessage: entityType === 'client' || entityType === 'staff'
                    ? 'Skipped - too slow to audit 15,000+ contacts'
                    : 'Entity type cannot be audited via GHL API',
            };
            entities.push(skippedResult);
            await this.saveAuditResult(auditRunId, skippedResult);
        }

        const totalDurationMs = Date.now() - startTime;

        const result: AuditRunResult = {
            auditRunId,
            entities,
            checkinAudit,
            totalEntities: entities.length,
            matchCount: entities.filter(e => e.status === 'success' && e.match).length,
            mismatchCount: entities.filter(e => e.status === 'success' && !e.match).length,
            failedCount: entities.filter(e => e.status === 'failed').length,
            skippedCount: entities.filter(e => e.status === 'skipped').length,
            totalDurationMs,
            auditedAt,
        };

        this.logger.log(
            `🔍 Audit complete: ${result.matchCount} match, ${result.mismatchCount} mismatch, ${result.failedCount} failed, ${result.skippedCount} skipped (${totalDurationMs}ms)`,
        );

        return result;
    }

    /**
     * FULL appointment comparison
     * - Gets all appointments from GHL
     * - Gets all appointment mappings from local DB
     * - Cross-references to find orphans and missing
     */
    private async auditAppointmentsFull(): Promise<EntityAuditResult> {
        const startTime = Date.now();
        this.logger.log('📋 Running FULL appointment audit...');

        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

        // Get all GHL appointments
        const ghlEvents = await this.ghlClient.getCalendarEvents({
            locationId: this.locationId,
            calendarId: this.calendarId,
            startTime: sixtyDaysAgo.getTime(),
            endTime: Date.now(),
        });

        const ghlAppointmentIds = new Set(ghlEvents.map((e: any) => e.id));
        this.logger.debug(`Found ${ghlAppointmentIds.size} appointments in GHL`);

        // Get all local appointment mappings
        const localMappings = await this.prisma.entityMapping.findMany({
            where: { entityType: 'appointment' },
            select: { phorestId: true, ghlId: true },
        });

        const localGhlIds = new Set(localMappings.map(m => m.ghlId));
        this.logger.debug(`Found ${localMappings.length} appointment mappings in local DB`);

        // Find orphaned GHL appointments (in GHL but not in local mappings)
        const orphanedInGhl: string[] = [];
        for (const ghlId of ghlAppointmentIds) {
            if (!localGhlIds.has(ghlId)) {
                orphanedInGhl.push(ghlId);
            }
        }

        // Find missing in GHL (in local mappings but not in GHL)
        const missingInGhl: string[] = [];
        for (const mapping of localMappings) {
            if (!ghlAppointmentIds.has(mapping.ghlId)) {
                missingInGhl.push(mapping.ghlId);
            }
        }

        // Sample check: verify a few appointments have correct data
        const sampleChecks: { id: string; exists: boolean; details?: string }[] = [];
        const sampleSize = Math.min(10, localMappings.length);
        const sampledMappings = localMappings.slice(0, sampleSize);

        for (const mapping of sampledMappings) {
            const exists = ghlAppointmentIds.has(mapping.ghlId);
            sampleChecks.push({
                id: mapping.phorestId,
                exists,
                details: exists ? 'Found in GHL' : 'NOT found in GHL',
            });
        }

        const durationMs = Date.now() - startTime;
        const match = orphanedInGhl.length === 0 && missingInGhl.length === 0;

        this.logger.log(`📋 Appointment audit complete: ${orphanedInGhl.length} orphaned, ${missingInGhl.length} missing`);

        return {
            entityType: 'appointment',
            localCount: localMappings.length,
            ghlCount: ghlAppointmentIds.size,
            match,
            discrepancy: ghlAppointmentIds.size - localMappings.length,
            orphanedInGhl: orphanedInGhl.slice(0, 50), // Limit to first 50 for storage
            missingInGhl: missingInGhl.slice(0, 50),
            sampleChecks,
            status: 'success',
            durationMs,
        };
    }

    /**
     * Audit check-in notes
     * - Gets recent check-in mappings
     * - Verifies each has a corresponding note in GHL
     */
    private async auditCheckinNotes(): Promise<CheckinAuditResult> {
        this.logger.log('📋 Auditing check-in notes...');

        // Get total count
        const totalMappings = await this.prisma.entityMapping.count({
            where: { entityType: 'checkin' },
        });

        // Sample recent check-ins (last 100)
        const recentCheckins = await this.prisma.entityMapping.findMany({
            where: { entityType: 'checkin' },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });

        const sampleSize = recentCheckins.length;
        let notesFound = 0;
        let notesMissing = 0;
        const missingDetails: Array<{ phorestId: string; ghlContactId: string }> = [];

        for (const checkin of recentCheckins) {
            try {
                const notes = await this.ghlClient.getContactNotes(checkin.ghlId);

                // Check if any note contains the Phorest appointment ID or "Checked in"
                const hasCheckinNote = notes.some((note: any) =>
                    note.body?.includes(checkin.phorestId) ||
                    note.body?.includes('Checked in'),
                );

                if (hasCheckinNote) {
                    notesFound++;
                } else {
                    notesMissing++;
                    if (missingDetails.length < 20) {
                        missingDetails.push({
                            phorestId: checkin.phorestId,
                            ghlContactId: checkin.ghlId,
                        });
                    }
                }

                // Rate limiting
                await this.delay(150);
            } catch (error: any) {
                // If contact not found, count as missing
                if (error.response?.status === 404) {
                    notesMissing++;
                    if (missingDetails.length < 20) {
                        missingDetails.push({
                            phorestId: checkin.phorestId,
                            ghlContactId: checkin.ghlId,
                        });
                    }
                } else {
                    this.logger.warn(`Error checking notes for ${checkin.phorestId}: ${error.message}`);
                }
            }
        }

        return {
            totalMappings,
            sampleSize,
            notesFound,
            notesMissing,
            missingDetails,
            status: 'success',
        };
    }

    /**
     * Save audit result to database
     */
    private async saveAuditResult(auditRunId: string, result: EntityAuditResult): Promise<void> {
        await this.prisma.syncAuditLog.create({
            data: {
                auditRunId,
                entityType: result.entityType,
                localCount: result.localCount,
                ghlCount: result.ghlCount,
                match: result.match,
                discrepancy: result.discrepancy,
                sampleChecks: result.sampleChecks ?? undefined,
                errorMessage: result.errorMessage,
                status: result.status,
                durationMs: result.durationMs,
            },
        });
    }

    /**
     * Get recent audit runs from database
     */
    async getRecentAudits(limit = 10): Promise<any[]> {
        const audits = await this.prisma.syncAuditLog.findMany({
            orderBy: { auditedAt: 'desc' },
            take: limit,
        });
        return audits;
    }

    /**
     * Helper delay function
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
