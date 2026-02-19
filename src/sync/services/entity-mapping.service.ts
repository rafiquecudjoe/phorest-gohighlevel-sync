import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SyncEntityType } from '../../common/enums/queue.enum';

@Injectable()
export class EntityMappingService {
    private readonly logger = new Logger(EntityMappingService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Get GHL ID for a Phorest entity
     */
    async getGhlIdByPhorestId(
        entityType: SyncEntityType,
        phorestId: string,
    ): Promise<string | null> {
        const mapping = await this.prisma.entityMapping.findUnique({
            where: {
                entityType_phorestId: {
                    entityType,
                    phorestId,
                },
            },
        });
        return mapping?.ghlId || null;
    }

    /**
     * Get Phorest ID for a GHL entity
     */
    async getPhorestIdByGhlId(
        entityType: SyncEntityType,
        ghlId: string,
    ): Promise<string | null> {
        // Use findFirst since entityType_ghlId unique constraint was removed
        const mapping = await this.prisma.entityMapping.findFirst({
            where: {
                entityType,
                ghlId,
            },
        });
        return mapping?.phorestId || null;
    }

    /**
     * Create or update entity mapping
     */
    async upsertMapping(
        entityType: SyncEntityType,
        phorestId: string,
        ghlId: string,
        metadata?: object,
    ): Promise<void> {
        // Handle potential ghlId collision where another phorestId is already mapped to this ghlId
        // This can happen if Phorest has duplicate records that GHL correctly merges
        // Use findFirst since entityType_ghlId unique constraint was removed
        const existingGhlMapping = await this.prisma.entityMapping.findFirst({
            where: {
                entityType,
                ghlId,
            },
        });

        if (existingGhlMapping && existingGhlMapping.phorestId !== phorestId) {
            this.logger.warn(
                `GHL ID ${ghlId} is already mapped to Phorest ${existingGhlMapping.phorestId}. Reassigning to ${phorestId}.`,
            );
            await this.prisma.entityMapping.delete({
                where: { id: existingGhlMapping.id },
            });
        }

        await this.prisma.entityMapping.upsert({
            where: {
                entityType_phorestId: {
                    entityType,
                    phorestId,
                },
            },
            update: {
                ghlId,
                metadata: metadata as object,
            },
            create: {
                entityType,
                phorestId,
                ghlId,
                metadata: metadata as object,
            },
        });

        this.logger.debug(`Mapped ${entityType}: Phorest ${phorestId} <-> GHL ${ghlId}`);
    }

    /**
     * Create a check-in mapping (does NOT delete existing mappings for the same GHL ID)
     * This is different from upsertMapping because one contact can have many check-in appointments
     */
    async createCheckinMapping(
        appointmentId: string,
        ghlContactId: string,
        metadata?: object,
    ): Promise<void> {
        await this.prisma.entityMapping.upsert({
            where: {
                entityType_phorestId: {
                    entityType: 'checkin',
                    phorestId: appointmentId,
                },
            },
            update: {
                ghlId: ghlContactId,
                metadata: metadata as object,
            },
            create: {
                entityType: 'checkin',
                phorestId: appointmentId,
                ghlId: ghlContactId,
                metadata: metadata as object,
            },
        });

        this.logger.debug(`Mapped checkin: Phorest ${appointmentId} <-> GHL ${ghlContactId}`);
    }

    /**
     * Check if mapping exists
     */
    async hasMapping(entityType: SyncEntityType, phorestId: string): Promise<boolean> {
        const mapping = await this.prisma.entityMapping.findUnique({
            where: {
                entityType_phorestId: {
                    entityType,
                    phorestId,
                },
            },
        });
        return !!mapping;
    }

    /**
     * Delete mapping
     */
    async deleteMapping(entityType: SyncEntityType, phorestId: string): Promise<void> {
        await this.prisma.entityMapping.deleteMany({
            where: {
                entityType,
                phorestId,
            },
        });
    }

    /**
     * Get all mappings for an entity type
     */
    async getAllMappings(entityType: SyncEntityType) {
        return this.prisma.entityMapping.findMany({
            where: { entityType },
        });
    }

    /**
     * Get mapping by ID
     */
    async getMappingById(id: string) {
        return this.prisma.entityMapping.findUnique({
            where: { id },
        });
    }

    /**
     * Bulk check for existing mappings
     */
    async getBulkMappings(
        entityType: SyncEntityType,
        phorestIds: string[],
    ): Promise<Map<string, string>> {
        const mappings = await this.prisma.entityMapping.findMany({
            where: {
                entityType,
                phorestId: { in: phorestIds },
            },
        });

        return new Map(mappings.map((m) => [m.phorestId, m.ghlId]));
    }

    /**
     * Find full mapping by Phorest ID
     */
    async findByPhorestId(
        entityType: SyncEntityType,
        phorestId: string,
    ): Promise<{ id: string; phorestId: string; ghlId: string; metadata: any } | null> {
        const mapping = await this.prisma.entityMapping.findUnique({
            where: {
                entityType_phorestId: {
                    entityType,
                    phorestId,
                },
            },
        });
        return mapping;
    }
}
