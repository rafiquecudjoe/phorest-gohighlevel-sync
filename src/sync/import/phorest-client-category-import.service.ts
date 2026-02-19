import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PhorestApiClient } from '../../integrations/phorest/phorest-api.client';
import { ImportResult } from './phorest-staff-import.service';

/**
 * Phase 1: Import Client Categories from Phorest API to Local Database
 */
@Injectable()
export class PhorestClientCategoryImportService {
    private readonly logger = new Logger(PhorestClientCategoryImportService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly phorestClient: PhorestApiClient,
    ) { }

    /**
     * Import all client categories from Phorest to local database
     */
    async importAll(): Promise<ImportResult> {
        this.logger.log('🔄 Starting Phorest Client Categories import to local database...');

        const result: ImportResult = {
            total: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        try {
            const categories = await this.phorestClient.getClientCategories();

            this.logger.debug(`Found ${categories.length} client categories`);

            for (const category of categories) {
                result.total++;

                try {
                    // Cast to any because the interface might not match exactly what comes back (e.g. colour property)
                    // and we want to use the correct property names from the API response
                    const cat = category as any;

                    // The API returns 'clientCategoryId' but our initial interface might have had 'categoryId'
                    // We use 'clientCategoryId' as per the API behavior we observed
                    const phorestId = cat.clientCategoryId || cat.categoryId || cat.id;

                    if (!phorestId) {
                        throw new Error('Missing category ID');
                    }

                    const existing = await this.prisma.phorestClientCategory.findUnique({
                        where: { phorestId },
                    });

                    await this.upsertCategory(cat);

                    if (existing) {
                        result.updated++;
                    } else {
                        result.created++;
                    }
                } catch (error: any) {
                    result.failed++;
                    result.errors.push(`Category: ${error.message}`);
                    this.logger.error(`Failed to import category: ${error.message}`);
                }
            }

            this.logger.log(`✅ Client Categories import complete: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

        } catch (error: any) {
            this.logger.error(`Client Categories import failed: ${error.message}`);
            throw error;
        }

        return result;
    }

    /**
     * Upsert a single category to local database
     */
    private async upsertCategory(category: any): Promise<void> {
        const phorestId = category.clientCategoryId || category.categoryId || category.id;

        await this.prisma.phorestClientCategory.upsert({
            where: { phorestId },
            create: {
                phorestId,
                name: category.name,
                description: category.colour || category.description,
            },
            update: {
                name: category.name,
                description: category.colour || category.description,
            },
        });
    }

    /**
     * Get import stats
     */
    async getStats(): Promise<{
        total: number;
    }> {
        const total = await this.prisma.phorestClientCategory.count();
        return { total };
    }
}
