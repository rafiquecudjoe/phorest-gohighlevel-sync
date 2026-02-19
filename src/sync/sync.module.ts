import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { QueueNames } from '../common/enums/queue.enum';
import { PrismaService } from '../common/prisma.service';
import { PhorestModule } from '../integrations/phorest';
import { GohighlevelModule } from '../integrations/gohighlevel';

// Services
import { SyncLogService } from './services/sync-log.service';
import { EntityMappingService } from './services/entity-mapping.service';
import { ReportedEntityService } from './services/reported-entity.service';
import { ClientSyncService } from './services/client-sync.service';
import { AppointmentSyncService } from './services/appointment-sync.service';
import { CheckinSyncService } from './services/checkin-sync.service';
import { StaffSyncService } from './services/staff-sync.service';
import { PhorestClientUpdateSyncService } from './services/phorest-client-update-sync.service';
import { ProductSyncService } from './services/product-sync.service';
import { BookingSyncService } from './services/booking-sync.service';
import { LoyaltySyncService } from './services/loyalty-sync.service';
import { SyncAuditService } from './services/sync-audit.service';
import { AutoRetryService } from './services/auto-retry.service';

// Phase 1 Import Services (Phorest → Local DB)
import { PhorestStaffImportService } from './import/phorest-staff-import.service';
import { PhorestProductImportService } from './import/phorest-product-import.service';
import { PhorestServiceImportService } from './import/phorest-service-import.service';
import { PhorestClientCategoryImportService } from './import/phorest-client-category-import.service';
import { PhorestClientImportService } from './import/phorest-client-import.service';
import { PhorestAppointmentImportService } from './import/phorest-appointment-import.service';

// Processors
import {
    AppointmentSyncProcessor,
    GhlToPhorestClientSyncProcessor,
    PhorestToGhlClientSyncProcessor,
    CheckinSyncProcessor,
    StaffSyncProcessor,
    // ClientUpdateSyncProcessor, // REMOVED: Merged into main client sync
    ProductSyncProcessor,
    BookingSyncProcessor,
    LoyaltySyncProcessor,
} from '../queues/processors';
import { SyncAuditProcessor } from '../queues/processors/sync-audit.processor';

// Producer
import { SyncJobProducer } from '../queues';

@Module({
    imports: [
        ConfigModule,
        ScheduleModule.forRoot(), // Enable cron jobs

        // Register all entity-specific queues
        BullModule.registerQueue(
            { name: QueueNames.ghlToPhorestClients },
            { name: QueueNames.phorestToGhlAppointments },
            { name: QueueNames.phorestToGhlBookings },
            { name: QueueNames.phorestToGhlCheckins },
            { name: QueueNames.phorestToGhlClients },
            { name: QueueNames.phorestToGhlLoyalty },
            { name: QueueNames.phorestToGhlProducts },
            { name: QueueNames.phorestToGhlStaff },
            // { name: QueueNames.phorestToGhlClientUpdates }, // REMOVED: Merged into main client sync
            { name: QueueNames.syncAudit },
        ),

        // Register queues with Bull Board for monitoring
        BullBoardModule.forFeature(
            { name: QueueNames.ghlToPhorestClients, adapter: BullMQAdapter },
            { name: QueueNames.phorestToGhlAppointments, adapter: BullMQAdapter },
            { name: QueueNames.phorestToGhlBookings, adapter: BullMQAdapter },
            { name: QueueNames.phorestToGhlCheckins, adapter: BullMQAdapter },
            { name: QueueNames.phorestToGhlClients, adapter: BullMQAdapter },
            { name: QueueNames.phorestToGhlLoyalty, adapter: BullMQAdapter },
            { name: QueueNames.phorestToGhlProducts, adapter: BullMQAdapter },
            { name: QueueNames.phorestToGhlStaff, adapter: BullMQAdapter },
            // { name: QueueNames.phorestToGhlClientUpdates, adapter: BullMQAdapter }, // REMOVED: Merged into main client sync
            { name: QueueNames.syncAudit, adapter: BullMQAdapter },
        ),

        PhorestModule,
        GohighlevelModule,
    ],
    providers: [
        PrismaService,

        // Sync Services
        SyncLogService,
        EntityMappingService,
        ReportedEntityService,
        ClientSyncService,
        AppointmentSyncService,
        CheckinSyncService,
        StaffSyncService,
        PhorestClientUpdateSyncService,
        ProductSyncService,
        BookingSyncService,
        LoyaltySyncService,
        SyncAuditService,
        AutoRetryService,

        // Phase 1 Import Services (Phorest → Local DB)
        PhorestStaffImportService,
        PhorestProductImportService,
        PhorestServiceImportService,
        PhorestClientCategoryImportService,
        PhorestClientImportService,
        PhorestAppointmentImportService,

        // Processors for each queue
        GhlToPhorestClientSyncProcessor,
        PhorestToGhlClientSyncProcessor,
        AppointmentSyncProcessor,
        CheckinSyncProcessor,
        StaffSyncProcessor,
        // ClientUpdateSyncProcessor, // REMOVED: Merged into main client sync
        ProductSyncProcessor,
        BookingSyncProcessor,
        LoyaltySyncProcessor,
        SyncAuditProcessor,

        // Producer
        SyncJobProducer,
    ],
    exports: [
        SyncLogService,
        EntityMappingService,
        ReportedEntityService,
        ClientSyncService,
        AppointmentSyncService,
        CheckinSyncService,
        StaffSyncService,
        PhorestClientUpdateSyncService,
        ProductSyncService,
        BookingSyncService,
        LoyaltySyncService,
        SyncAuditService,
        SyncJobProducer,
        // Phase 1 Import Services
        PhorestStaffImportService,
        PhorestProductImportService,
        PhorestServiceImportService,
        PhorestClientCategoryImportService,
        PhorestClientImportService,
        PhorestAppointmentImportService,
    ],
})
export class SyncModule { }

