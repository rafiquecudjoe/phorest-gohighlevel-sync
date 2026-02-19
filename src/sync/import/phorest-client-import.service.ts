import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PhorestApiClient } from '../../integrations/phorest/phorest-api.client';
import { PhorestSyncStatus } from '@prisma/client';
import { ImportResult } from './phorest-staff-import.service';

/**
 * Phase 1: Import Clients from Phorest API to Local Database
 */
@Injectable()
export class PhorestClientImportService {
    private readonly logger = new Logger(PhorestClientImportService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly phorestClient: PhorestApiClient,
    ) { }

    /**
     * Import all clients from Phorest to local database
     */
    async importAll(options?: { maxRecords?: number; clientId?: string }): Promise<ImportResult> {
        if (options?.clientId) {
            return this.importSingleClient(options.clientId);
        }

        this.logger.log('🔄 Starting Phorest Clients import to local database...');

        const result: ImportResult = {
            total: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        const maxRecords = options?.maxRecords || 0; // 0 = unlimited

        try {
            let page = 0;
            let hasMore = true;
            const batchSize = 100;

            while (hasMore) {
                if (maxRecords > 0 && result.total >= maxRecords) {
                    this.logger.log(`Reached max records limit (${maxRecords}), stopping`);
                    break;
                }

                const response = await this.phorestClient.getClients({
                    page,
                    size: batchSize,
                });

                const clients = response._embedded?.clients || [];

                if (clients.length === 0) {
                    hasMore = false;
                    break;
                }

                this.logger.debug(`Processing page ${page}: ${clients.length} clients`);

                // OPTIMIZATION: Batch fetch existing clients to eliminate N+1 queries
                const clientIds = clients.map((c: any) => c.clientId);
                const existingClients = await this.prisma.phorestClient.findMany({
                    where: { phorestId: { in: clientIds } },
                    select: { phorestId: true, phorestUpdatedAt: true },
                });
                const existingMap = new Map(
                    existingClients.map(c => [c.phorestId, c.phorestUpdatedAt])
                );

                for (const client of clients) {
                    if (maxRecords > 0 && result.total >= maxRecords) break;

                    result.total++;

                    try {
                        const existingUpdatedAt = existingMap.get(client.clientId);
                        const isNew = !existingUpdatedAt;

                        // Check if data actually changed
                        const phorestUpdatedAt = client.updatedAt ? new Date(client.updatedAt) : null;
                        const dataChanged = isNew ||
                            !existingUpdatedAt ||
                            !phorestUpdatedAt ||
                            phorestUpdatedAt.getTime() !== existingUpdatedAt.getTime();

                        await this.upsertClient(client, isNew, dataChanged);

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
                            result.errors.push(`Client ${client.clientId}: ${error.message}`);
                        }
                        this.logger.error(`Failed to import client ${client.clientId}: ${error.message}`);
                    }
                }

                page++;

                // Log progress every 10 pages
                if (page % 10 === 0) {
                    this.logger.log(`Progress: ${result.total} clients processed (page ${page})`);
                }

                if (page > 500) {
                    this.logger.warn('Reached page limit, stopping');
                    break;
                }
            }

            this.logger.log(`✅ Clients import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} unchanged, ${result.failed} failed`);

        } catch (error: any) {
            this.logger.error(`Clients import failed: ${error.message}`);
            throw error;
        }

        return result;
    }

    /**
     * Upsert a single client to local database
     * @param client - Phorest client data
     * @param _isNew - Whether this is a new client (not currently used but for consistency)
     * @param dataChanged - Whether the data has actually changed
     */
    private async upsertClient(client: any, _isNew: boolean, dataChanged: boolean): Promise<void> {
        const address = client.address || {};

        await this.prisma.phorestClient.upsert({
            where: { phorestId: client.clientId },
            create: {
                phorestId: client.clientId,
                firstName: client.firstName || '',
                lastName: client.lastName || '',
                email: client.email,
                mobile: client.mobile,
                landLine: client.landLine,
                gender: client.gender,
                birthDate: client.birthDate,
                streetAddress1: address.streetAddress1 || address.street,
                streetAddress2: address.streetAddress2,
                city: address.city,
                state: address.state,
                postalCode: address.postalCode,
                country: address.country,
                preferredStaffId: client.preferredStaffId,
                notes: client.notes,
                clientCategoryIds: client.clientCategoryIds || [],
                archived: client.archived || false,
                banned: client.banned || false,
                deleted: client.deleted || false,
                smsMarketingConsent: client.smsMarketingConsent || false,
                emailMarketingConsent: client.emailMarketingConsent || false,
                smsReminderConsent: client.smsReminderConsent !== false,
                emailReminderConsent: client.emailReminderConsent !== false,
                loyaltyCardSerial: client.loyaltyCard?.serial,
                loyaltyPoints: client.loyaltyCard?.points,
                clientSince: client.clientSince ? new Date(client.clientSince) : null,
                firstVisit: client.firstVisit ? new Date(client.firstVisit) : null,
                lastVisit: client.lastVisit ? new Date(client.lastVisit) : null,
                syncStatus: PhorestSyncStatus.PENDING,
                phorestCreatedAt: client.createdAt ? new Date(client.createdAt) : null,
                phorestUpdatedAt: client.updatedAt ? new Date(client.updatedAt) : null,
            },
            update: {
                firstName: client.firstName || '',
                lastName: client.lastName || '',
                email: client.email,
                mobile: client.mobile,
                landLine: client.landLine,
                gender: client.gender,
                birthDate: client.birthDate,
                streetAddress1: address.streetAddress1 || address.street,
                streetAddress2: address.streetAddress2,
                city: address.city,
                state: address.state,
                postalCode: address.postalCode,
                country: address.country,
                preferredStaffId: client.preferredStaffId,
                notes: client.notes,
                clientCategoryIds: client.clientCategoryIds || [],
                archived: client.archived || false,
                banned: client.banned || false,
                deleted: client.deleted || false,
                smsMarketingConsent: client.smsMarketingConsent || false,
                emailMarketingConsent: client.emailMarketingConsent || false,
                smsReminderConsent: client.smsReminderConsent !== false,
                emailReminderConsent: client.emailReminderConsent !== false,
                loyaltyCardSerial: client.loyaltyCard?.serial,
                loyaltyPoints: client.loyaltyCard?.points,
                clientSince: client.clientSince ? new Date(client.clientSince) : null,
                firstVisit: client.firstVisit ? new Date(client.firstVisit) : null,
                lastVisit: client.lastVisit ? new Date(client.lastVisit) : null,
                phorestUpdatedAt: client.updatedAt ? new Date(client.updatedAt) : null,
                // OPTIMIZATION: Only set PENDING if data changed, preserve existing status otherwise
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
        withEmail: number;
        withMobile: number;
    }> {
        const [total, pending, synced, failed, withEmail, withMobile] = await Promise.all([
            this.prisma.phorestClient.count(),
            this.prisma.phorestClient.count({ where: { syncStatus: PhorestSyncStatus.PENDING } }),
            this.prisma.phorestClient.count({ where: { syncStatus: PhorestSyncStatus.SYNCED } }),
            this.prisma.phorestClient.count({ where: { syncStatus: PhorestSyncStatus.FAILED } }),
            this.prisma.phorestClient.count({ where: { email: { not: null } } }),
            this.prisma.phorestClient.count({ where: { mobile: { not: null } } }),
        ]);

        return { total, pending, synced, failed, withEmail, withMobile };
    }

    /**
     * Import a single client from Phorest API
     */
    public async importSingleClient(clientId: string): Promise<ImportResult> {
        this.logger.log(`🔄 Importing single client ${clientId} from Phorest...`);
        const result: ImportResult = {
            total: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        try {
            const client = await this.phorestClient.getClient(clientId);
            if (client) {
                result.total = 1;
                const existing = await this.prisma.phorestClient.findUnique({
                    where: { phorestId: client.clientId },
                    select: { phorestUpdatedAt: true },
                });

                const isNew = !existing;
                // For single client import, always treat as dataChanged to ensure sync
                await this.upsertClient(client, isNew, true);

                if (existing) {
                    result.updated = 1;
                } else {
                    result.created = 1;
                }
                this.logger.log(`✅ Single client import complete: ${client.clientId}`);
            }
        } catch (error: any) {
            result.failed = 1;
            result.errors.push(error.message);
            this.logger.error(`❌ Failed to import single client ${clientId}: ${error.message}`);
        }

        return result;
    }
}
