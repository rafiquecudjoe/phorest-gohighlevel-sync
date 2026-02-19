// Queue names for BullMQ - Phorest/GHL Integration
// Each entity type gets its own queue for isolation and independent scaling
export enum QueueNames {
    // GHL → Phorest queues
    ghlToPhorestClients = 'ghl-to-phorest-clients-queue',

    // Phorest → GHL queues
    phorestToGhlAppointments = 'phorest-to-ghl-appointments-queue',
    phorestToGhlBookings = 'phorest-to-ghl-bookings-queue',
    phorestToGhlCheckins = 'phorest-to-ghl-checkins-queue',
    phorestToGhlClients = 'phorest-to-ghl-clients-queue',
    phorestToGhlLoyalty = 'phorest-to-ghl-loyalty-queue',
    phorestToGhlProducts = 'phorest-to-ghl-products-queue',
    phorestToGhlStaff = 'phorest-to-ghl-staff-queue',
    phorestToGhlClientUpdates = 'phorest-to-ghl-client-updates-queue',

    // Webhook processing queue
    ghlWebhooks = 'ghl-webhooks-queue',

    // Audit queue for data verification
    syncAudit = 'sync-audit-queue',

    // Legacy - kept for backward compatibility, will be removed
    phorestGhlSyncQueue = 'phorest-ghl-sync-queue',
}

// Phorest-GHL Sync Job Names
export enum SyncJobNames {
    // Phorest → GHL
    PHOREST_TO_GHL_CLIENTS = 'phorest-to-ghl-clients',
    PHOREST_TO_GHL_APPOINTMENTS = 'phorest-to-ghl-appointments',
    PHOREST_TO_GHL_BOOKINGS = 'phorest-to-ghl-bookings',
    PHOREST_TO_GHL_STAFF = 'phorest-to-ghl-staff',
    PHOREST_TO_GHL_PRODUCTS = 'phorest-to-ghl-products',
    PHOREST_TO_GHL_LOYALTY = 'phorest-to-ghl-loyalty',
    PHOREST_TO_GHL_CHECKINS = 'phorest-to-ghl-checkins',
    PHOREST_TO_GHL_CLIENT_UPDATES = 'phorest-to-ghl-client-updates',
    // GHL → Phorest
    GHL_TO_PHOREST_CLIENTS = 'ghl-to-phorest-clients',
    // Audit
    SYNC_AUDIT = 'sync-audit',
}

// Sync Direction
export type SyncDirection = 'phorest_to_ghl' | 'ghl_to_phorest';

// Entity Types for sync
export type SyncEntityType =
    | 'client'
    | 'appointment'
    | 'booking'
    | 'staff'
    | 'product'
    | 'loyalty'
    | 'checkin'
    | 'client_update'
    | 'audit';

// Sync Job Data
export interface SyncJobData {
    jobName: SyncJobNames;
    direction: SyncDirection;
    entityType: SyncEntityType;
    batchId: string;
    lastSyncTimestamp?: string;
    page?: number;
    pageSize?: number;
    fullSync?: boolean;
    entityId?: string; // Optional: For repairing specific single entities
}
