import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PhorestApiClient } from '../../integrations/phorest/phorest-api.client';
import { PhorestSyncStatus } from '@prisma/client';
import { ImportResult } from './phorest-staff-import.service';

/**
 * Phase 1: Import Products from Phorest API to Local Database
 */
@Injectable()
export class PhorestProductImportService {
    private readonly logger = new Logger(PhorestProductImportService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly phorestClient: PhorestApiClient,
    ) { }

    /**
     * Import all products from Phorest to local database
     */
    async importAll(): Promise<ImportResult> {
        this.logger.log('🔄 Starting Phorest Products import to local database...');

        const result: ImportResult = {
            total: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        try {
            let page = 0;
            let hasMore = true;
            const batchSize = 100;

            while (hasMore) {
                const response = await this.phorestClient.getProducts({
                    page,
                    size: batchSize,
                });

                const products = response._embedded?.products || [];

                if (products.length === 0) {
                    hasMore = false;
                    break;
                }

                this.logger.debug(`Processing page ${page}: ${products.length} products`);

                // OPTIMIZATION: Batch fetch existing products to eliminate N+1 queries
                const productIds = products.map((p: any) => p.productId);
                const existingProducts = await this.prisma.phorestProduct.findMany({
                    where: { phorestId: { in: productIds } },
                    select: { phorestId: true, phorestUpdatedAt: true },
                });
                const existingMap = new Map(
                    existingProducts.map(p => [p.phorestId, p.phorestUpdatedAt])
                );

                for (const product of products) {
                    result.total++;

                    try {
                        const existingUpdatedAt = existingMap.get(product.productId);
                        const isNew = !existingUpdatedAt;

                        // Check if data actually changed
                        const phorestUpdatedAt = product.updatedAt ? new Date(product.updatedAt) : null;
                        const dataChanged = isNew ||
                            !existingUpdatedAt ||
                            !phorestUpdatedAt ||
                            phorestUpdatedAt.getTime() !== existingUpdatedAt.getTime();

                        await this.upsertProduct(product, isNew, dataChanged);

                        if (isNew) {
                            result.created++;
                        } else if (dataChanged) {
                            result.updated++;
                        } else {
                            result.skipped++;
                        }
                    } catch (error: any) {
                        result.failed++;
                        result.errors.push(`Product ${product.productId}: ${error.message}`);
                        this.logger.error(`Failed to import product ${product.productId}: ${error.message}`);
                    }
                }

                page++;

                if (page > 200) {
                    this.logger.warn('Reached page limit, stopping');
                    break;
                }
            }

            this.logger.log(`✅ Products import complete: ${result.created} created, ${result.updated} updated, ${result.failed} failed`);

        } catch (error: any) {
            this.logger.error(`Products import failed: ${error.message}`);
            throw error;
        }

        return result;
    }

    /**
     * Upsert a single product to local database
     * @param product - Phorest product data
     * @param _isNew - Whether this is a new product
     * @param dataChanged - Whether the data has actually changed
     */
    private async upsertProduct(product: any, _isNew: boolean, dataChanged: boolean): Promise<void> {
        await this.prisma.phorestProduct.upsert({
            where: { phorestId: product.productId },
            create: {
                phorestId: product.productId,
                branchId: product.branchId,
                name: product.name || 'Unnamed Product',
                description: product.description,
                categoryId: product.categoryId,
                categoryName: product.categoryName,
                price: product.price || 0,
                costPrice: product.costPrice || null,
                sku: product.sku,
                barcode: product.barcode,
                stockLevel: product.stockLevel,
                reorderLevel: product.reorderLevel,
                active: product.active !== false,
                archived: product.archived || false,
                deleted: product.deleted || false,
                syncStatus: PhorestSyncStatus.PENDING,
                phorestCreatedAt: product.createdAt ? new Date(product.createdAt) : null,
                phorestUpdatedAt: product.updatedAt ? new Date(product.updatedAt) : null,
            },
            update: {
                branchId: product.branchId,
                name: product.name || 'Unnamed Product',
                description: product.description,
                categoryId: product.categoryId,
                categoryName: product.categoryName,
                price: product.price || 0,
                costPrice: product.costPrice || null,
                sku: product.sku,
                barcode: product.barcode,
                stockLevel: product.stockLevel,
                reorderLevel: product.reorderLevel,
                active: product.active !== false,
                archived: product.archived || false,
                deleted: product.deleted || false,
                phorestUpdatedAt: product.updatedAt ? new Date(product.updatedAt) : null,
                // OPTIMIZATION: Only set PENDING if data changed
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
    }> {
        const [total, pending, synced, failed] = await Promise.all([
            this.prisma.phorestProduct.count(),
            this.prisma.phorestProduct.count({ where: { syncStatus: PhorestSyncStatus.PENDING } }),
            this.prisma.phorestProduct.count({ where: { syncStatus: PhorestSyncStatus.SYNCED } }),
            this.prisma.phorestProduct.count({ where: { syncStatus: PhorestSyncStatus.FAILED } }),
        ]);

        return { total, pending, synced, failed };
    }
}
