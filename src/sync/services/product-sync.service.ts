import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlApiClient } from '../../integrations/gohighlevel/ghl-api.client';
import { SyncLogService } from './sync-log.service';
import { EntityMappingService } from './entity-mapping.service';
import { PhorestProductImportService } from '../import/phorest-product-import.service';
import { PrismaService } from '../../common/prisma.service';
import { PhorestProduct } from '../../integrations/phorest/interfaces/phorest.interfaces';
import { PhorestProduct as DbProduct } from '@prisma/client';

export interface ProductSyncResult {
    totalProcessed: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
}

/**
 * Product Sync Service
 * Syncs products from Phorest to GHL (via Local DB)
 * 
 * Two-Phase Pattern:
 * 1. Import from Phorest API → Local DB (PhorestProduct table)
 * 2. Read from Local DB → Sync to GHL
 * 
 * Strategy:
 * - Products are synced to GHL Products API
 * - Product mappings stored for reference when adding purchase tags to contacts
 */
@Injectable()
export class ProductSyncService {
    private readonly logger = new Logger(ProductSyncService.name);
    private readonly maxRecords: number;

    // Cache of products for tag generation
    private productCache: Map<string, PhorestProduct> = new Map();

    constructor(
        private readonly ghlClient: GhlApiClient,
        private readonly syncLogService: SyncLogService,
        private readonly entityMappingService: EntityMappingService,
        private readonly configService: ConfigService,
        private readonly productImportService: PhorestProductImportService,
        private readonly prisma: PrismaService,
    ) {
        this.maxRecords = this.configService.get<number>('SYNC_MAX_RECORDS') || 0;
    }

    /**
     * Sync products from Phorest to GHL (via Local DB)
     * 1. Import from Phorest API -> Local DB
     * 2. Read from Local DB -> Sync to GHL
     */
    async syncPhorestProducts(options?: { jobId?: string; skipImport?: boolean }): Promise<ProductSyncResult> {
        this.logger.log('Starting Phorest → Local DB → GHL product sync');

        const result: ProductSyncResult = {
            totalProcessed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
        };

        const { runId, batchId } = await this.syncLogService.createSyncRun({
            direction: 'phorest_to_ghl',
            entityType: 'product',
        });

        try {
            // Step 1: Import from Phorest to Local DB
            if (!options?.skipImport) {
                this.logger.log('📥 Step 1: Importing from Phorest API to Local DB...');
                await this.productImportService.importAll();
                this.logger.log('✅ Step 1 Complete: Local DB updated.');
            } else {
                this.logger.log('⏭️ Step 1 Skipped: Using existing Local DB data.');
            }

            // Step 2: Read from Local DB and Sync to GHL
            this.logger.log('📤 Step 2: Syncing from Local DB to GHL...');

            const products = await this.prisma.phorestProduct.findMany({
                where: { deleted: false, active: true },
                take: this.maxRecords > 0 ? this.maxRecords : undefined,
            });

            this.logger.debug(`Found ${products.length} products in Local DB`);

            for (const product of products) {
                if (this.maxRecords > 0 && result.totalProcessed >= this.maxRecords) {
                    this.logger.log(`⚠️ Reached max records limit (${this.maxRecords}), stopping sync`);
                        break;
                    }

                    const itemResult = await this.processProduct(
                        product,
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

            // Refresh the product cache
            await this.refreshProductCache();

            await this.syncLogService.completeSyncRun(runId, {
                totalRecords: result.totalProcessed,
                successCount: result.created + result.updated,
                failedCount: result.failed,
                skippedCount: result.skipped,
            });

            this.logger.log(
                `Phorest → GHL product sync completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Phorest product sync failed: ${errorMessage}`);
            await this.syncLogService.failSyncRun(runId, errorMessage);
            throw error;
        }

        return result;
    }

    /**
     * Process a single product from Local DB
     */
    private async processProduct(
        product: DbProduct,
        runId: string,
        batchId: string,
        jobId?: string,
    ): Promise<'created' | 'updated' | 'skipped' | 'failed'> {
        const startedAt = new Date();

        try {
            // Check if we already have this product mapped
            const existingMapping = await this.entityMappingService.findByPhorestId(
                'product',
                product.phorestId,
            );

            // Generate tags for this product
            const productTags = this.generateProductTagsFromDb(product);
            const ghlConfig = this.ghlClient.getConfig();

            let ghlProductId: string;
            let action: 'create' | 'update' = 'create';

            if (existingMapping && existingMapping.ghlId && !existingMapping.ghlId.startsWith('product:')) {
                // Already synced to GHL, update it
                try {
                    await this.ghlClient.updateProduct(existingMapping.ghlId, {
                        name: product.name,
                        description: `${product.categoryName || 'Product'} - ${product.name}`,
                        locationId: ghlConfig.locationId,
                        productType: 'PHYSICAL',
                    });
                    ghlProductId = existingMapping.ghlId;
                    action = 'update';
                } catch (updateError: any) {
                    // Log the specific error for debugging
                    if (updateError?.response?.data) {
                        this.logger.error(`GHL Product Update Error for ${product.phorestId}: ${JSON.stringify(updateError.response.data)}`);
                    }

                    // Only recreate on 404 (product deleted from GHL)
                    // On 422 (validation error), keep existing mapping and log warning
                    if (updateError?.response?.status === 404) {
                        this.logger.warn(`Product ${existingMapping.ghlId} not found in GHL, recreating...`);
                        const ghlProduct = await this.ghlClient.createProduct({
                            name: product.name,
                            locationId: ghlConfig.locationId,
                            description: `${product.categoryName || 'Product'} - ${product.name}`,
                            productType: 'PHYSICAL',
                            availableInStore: product.active,
                        });
                        ghlProductId = ghlProduct?._id || (ghlProduct as any)?.id;
                        if (!ghlProductId) {
                            throw new Error(`GHL Product creation returned no ID. Response: ${JSON.stringify(ghlProduct)}`);
                        }
                        action = 'create';
                    } else if (updateError?.response?.status === 422) {
                        // Validation error - keep existing mapping, don't create duplicate
                        this.logger.warn(`Product ${product.phorestId} update failed with 422. Keeping existing GHL ID: ${existingMapping.ghlId}`);
                        ghlProductId = existingMapping.ghlId;
                        action = 'update'; // Mark as updated even though it failed, to avoid duplicate creation
                    } else {
                        throw updateError;
                    }
                }
            } else {
                // No local mapping found. Check GHL for existing product by name to prevent duplicates.
                const searchResponse = await this.ghlClient.listProducts({
                    limit: 10,
                    search: product.name,
                    locationId: ghlConfig.locationId,
                });

                const existingProduct = searchResponse.products?.find(
                    (p: any) => p.name === product.name
                );

                if (existingProduct) {
                    this.logger.debug(`Found existing GHL product "${product.name}" (${existingProduct._id}), linking...`);
                    ghlProductId = existingProduct._id || existingProduct.id;
                    action = 'update'; // Treat as update to link it
                } else {
                    // Create new product in GHL
                    const ghlProduct = await this.ghlClient.createProduct({
                        name: product.name,
                        locationId: ghlConfig.locationId,
                        description: `${product.categoryName || 'Product'} - ${product.name}`,
                        productType: 'PHYSICAL',
                        availableInStore: product.active,
                    });
                    ghlProductId = ghlProduct?._id || (ghlProduct as any)?.id;
                    if (!ghlProductId) {
                        throw new Error(`GHL Product creation returned no ID. Response: ${JSON.stringify(ghlProduct)}`);
                    }
                    action = 'create';
                }
            }

            // Store/update the product mapping with metadata
            await this.entityMappingService.upsertMapping(
                'product',
                product.phorestId,
                ghlProductId,
                {
                    name: product.name,
                    categoryId: product.categoryId,
                    categoryName: product.categoryName,
                    price: product.price,
                    sku: product.sku,
                    tags: productTags,
                    syncedAt: new Date().toISOString(),
                },
            );

            // Update sync status in local DB
            await this.prisma.phorestProduct.update({
                where: { phorestId: product.phorestId },
                data: {
                    ghlProductId,
                    syncStatus: 'SYNCED',
                    lastSyncedAt: new Date(),
                },
            });

            // Add to cache
            this.productCache.set(product.phorestId, this.dbProductToPhorestProduct(product));

            // Log success
            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'product',
                entityId: product.phorestId,
                direction: 'phorest_to_ghl',
                action,
                status: 'success',
                sourceData: product,
                targetData: { tags: productTags },
                startedAt,
                completedAt: new Date(),
            });

            return existingMapping ? 'updated' : 'created';
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorCode = (error as any)?.response?.status?.toString() || 'UNKNOWN';

            this.logger.error(
                `Failed to sync product ${product.phorestId}: ${errorMessage}`
            );

            // Update sync status to FAILED in local DB
            await this.prisma.phorestProduct.update({
                where: { phorestId: product.phorestId },
                data: {
                    syncStatus: 'FAILED',
                    syncError: errorMessage,
                },
            }).catch(() => {}); // Ignore if update fails

            await this.syncLogService.logSyncItem({
                runId,
                batchId,
                jobId,
                entityType: 'product',
                entityId: product.phorestId,
                direction: 'phorest_to_ghl',
                action: 'create',
                status: 'failed',
                errorCode,
                errorMessage,
                sourceData: product,
                startedAt,
                completedAt: new Date(),
            });

            return 'failed';
        }
    }

    /**
     * Convert DbProduct to PhorestProduct interface for cache
     */
    private dbProductToPhorestProduct(product: DbProduct): PhorestProduct {
        return {
            productId: product.phorestId,
            name: product.name,
            categoryId: product.categoryId ?? undefined,
            categoryName: product.categoryName ?? undefined,
            price: product.price?.toNumber() ?? 0,
            sku: product.sku ?? undefined,
            active: product.active,
        } as PhorestProduct;
    }

    /**
     * Generate GHL-compatible tags for a product from DB record
     */
    generateProductTagsFromDb(product: DbProduct): string[] {
        const tags: string[] = [];

        // Category tag
        if (product.categoryName) {
            const categoryTag = `product:category:${product.categoryName.toLowerCase().replace(/\s+/g, '-')}`;
            tags.push(categoryTag);
        } else if (product.categoryId) {
            tags.push(`product:category:${product.categoryId}`);
        }

        // Product name tag
        const productNameTag = `product:purchased:${product.name.toLowerCase().replace(/\s+/g, '-')}`;
        tags.push(productNameTag);

        return tags;
    }

    /**
     * Generate GHL-compatible tags for a product
     */
    generateProductTags(product: PhorestProduct): string[] {
        const tags: string[] = [];

        // Category tag
        if (product.categoryName) {
            const categoryTag = `product:category:${product.categoryName.toLowerCase().replace(/\s+/g, '-')}`;
            tags.push(categoryTag);
        } else if (product.categoryId) {
            tags.push(`product:category:${product.categoryId}`);
        }

        // Product name tag
        const productNameTag = `product:purchased:${product.name.toLowerCase().replace(/\s+/g, '-')}`;
        tags.push(productNameTag);

        return tags;
    }

    /**
     * Get product tags for a list of product IDs
     * Used when syncing client purchase history to GHL
     */
    async getProductTagsForPurchases(productIds: string[]): Promise<string[]> {
        const allTags: string[] = [];

        for (const productId of productIds) {
            // Check cache first
            let product = this.productCache.get(productId);

            if (!product) {
                // Try to get from mapping
                const mapping = await this.entityMappingService.findByPhorestId('product', productId);
                if (mapping?.metadata?.tags) {
                    allTags.push(...(mapping.metadata.tags as string[]));
                    continue;
                }
            }

            if (product) {
                allTags.push(...this.generateProductTags(product));
            }
        }

        // Remove duplicates
        return [...new Set(allTags)];
    }

    /**
     * Refresh the product cache from database mappings
     */
    private async refreshProductCache(): Promise<void> {
        try {
            const mappings = await this.entityMappingService.getAllMappings('product');
            this.productCache.clear();

            for (const mapping of mappings) {
                if (mapping.metadata) {
                    const meta = mapping.metadata as Record<string, unknown>;
                    this.productCache.set(mapping.phorestId, {
                        productId: mapping.phorestId,
                        name: (meta.name as string) || '',
                        categoryId: meta.categoryId as string | undefined,
                        categoryName: meta.categoryName as string | undefined,
                        price: (meta.price as number) || 0,
                        sku: meta.sku as string | undefined,
                        active: true,
                    } as PhorestProduct);
                }
            }

            this.logger.debug(`Product cache refreshed with ${this.productCache.size} products`);
        } catch (error) {
            this.logger.error('Failed to refresh product cache', error);
        }
    }

    /**
     * Get cached product by ID
     */
    getProduct(productId: string): PhorestProduct | undefined {
        return this.productCache.get(productId);
    }

    /**
     * Get all cached products
     */
    getAllProducts(): PhorestProduct[] {
        return Array.from(this.productCache.values());
    }
}
