import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames, SyncJobNames, SyncJobData } from '../common/enums/queue.enum';
import { v4 as uuidv4 } from 'uuid';

/**
 * SyncJobProducer - Manages scheduling and triggering of sync jobs
 * Each entity type has its own dedicated queue for isolation
 */
@Injectable()
export class SyncJobProducer implements OnModuleInit {
    private readonly logger = new Logger(SyncJobProducer.name);

    constructor(
        // GHL → Phorest queues
        @InjectQueue(QueueNames.ghlToPhorestClients)
        private readonly ghlToPhorestClientsQueue: Queue<SyncJobData>,

        // Phorest → GHL queues
        @InjectQueue(QueueNames.phorestToGhlAppointments)
        private readonly phorestToGhlAppointmentsQueue: Queue<SyncJobData>,

        @InjectQueue(QueueNames.phorestToGhlBookings)
        private readonly phorestToGhlBookingsQueue: Queue<SyncJobData>,

        @InjectQueue(QueueNames.phorestToGhlCheckins)
        private readonly phorestToGhlCheckinsQueue: Queue<SyncJobData>,

        @InjectQueue(QueueNames.phorestToGhlLoyalty)
        private readonly phorestToGhlLoyaltyQueue: Queue<SyncJobData>,

        @InjectQueue(QueueNames.phorestToGhlProducts)
        private readonly phorestToGhlProductsQueue: Queue<SyncJobData>,

        @InjectQueue(QueueNames.phorestToGhlStaff)
        private readonly phorestToGhlStaffQueue: Queue<SyncJobData>,



        @InjectQueue(QueueNames.phorestToGhlClients)
        private readonly phorestToGhlClientsQueue: Queue<SyncJobData>,

        @InjectQueue(QueueNames.syncAudit)
        private readonly syncAuditQueue: Queue<SyncJobData>,
    ) { }

    async onModuleInit() {
        await this.scheduleRecurringSyncJobs();
    }

    /**
     * Schedule all recurring sync jobs
     * Currently ONLY Staff and Products are enabled
     */
    async scheduleRecurringSyncJobs(): Promise<void> {
        this.logger.log('Scheduling recurring sync jobs...');

        // Clear existing repeatable jobs from all queues
        await this.clearRepeatableJobs();

        // ============ ACTIVE SYNCS ============

        // Daily syncs (stable data that rarely changes)
        await this.schedulePhorestToGhlStaffSync();     // Daily at 6 AM
        await this.schedulePhorestToGhlProductsSync();  // Daily at 5 AM
        await this.schedulePhorestToGhlClientsSync();   // Daily at 4 AM

        // Hourly/frequent syncs (dynamic data)
        await this.schedulePhorestToGhlAppointmentsSync();    // Every hour
        await this.schedulePhorestToGhlBookingsSync();        // Every 2 hours (online bookings)
        await this.schedulePhorestToGhlCheckinsSync();        // Every 30 mins
        // await this.schedulePhorestToGhlClientUpdatesSync();   // DISABLED: Merged into main client sync
        await this.schedulePhorestToGhlLoyaltySync();         // Every 12 hours

        // Audit
        await this.scheduleSyncAudit();  // Daily at midnight

        this.logger.log('Recurring sync jobs scheduled (Staff, Products, Clients, Appointments, Bookings, Check-Ins, Loyalty & Audit)');
    }

    /**
     * Clear all repeatable jobs from all queues
     */
    private async clearRepeatableJobs(): Promise<void> {
        const queues = [
            this.ghlToPhorestClientsQueue,
            this.phorestToGhlAppointmentsQueue,
            this.phorestToGhlBookingsQueue,
            this.phorestToGhlCheckinsQueue,
            this.phorestToGhlLoyaltyQueue,
            this.phorestToGhlProductsQueue,
            this.phorestToGhlStaffQueue,
            this.phorestToGhlClientsQueue,  // Was missing!
            this.syncAuditQueue,            // Was missing!
        ];

        for (const queue of queues) {
            const existingJobs = await queue.getRepeatableJobs();
            for (const job of existingJobs) {
                await queue.removeRepeatableByKey(job.key);
            }
        }
    }

    // ============ TEMPORARILY DISABLED SYNCS ============
    // These methods are kept for future use when client syncs are re-enabled
    // @ts-ignore Temporarily unused
    private async scheduleGhlToPhorestClientsSync(): Promise<void> {
        await this.ghlToPhorestClientsQueue.add(
            SyncJobNames.GHL_TO_PHOREST_CLIENTS,
            {
                jobName: SyncJobNames.GHL_TO_PHOREST_CLIENTS,
                direction: 'ghl_to_phorest',
                entityType: 'client',
                batchId: `scheduled_${Date.now()}`,
            },
            {
                repeat: {
                    pattern: '0 0 * * *', // Once daily at midnight
                },
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log('Scheduled GHL → Phorest clients sync (once daily at midnight)');
    }

    // ============ Phorest → GHL Scheduling ============

    // @ts-ignore Temporarily unused
    private async schedulePhorestToGhlAppointmentsSync(): Promise<void> {
        await this.phorestToGhlAppointmentsQueue.add(
            SyncJobNames.PHOREST_TO_GHL_APPOINTMENTS,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_APPOINTMENTS,
                direction: 'phorest_to_ghl',
                entityType: 'appointment',
                batchId: `scheduled_${Date.now()}`,
            },
            {
                repeat: {
                    pattern: '5,15,25,35,45,55 * * * *', // Every 10 min at :05, :15, :25... (staggered to avoid collisions)
                },
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log('Scheduled Phorest → GHL appointments sync (every 10 min at :05, :15...)');
    }

    /**
     * Schedule Phorest → GHL bookings sync (every 2 hours)
     * Bookings = appointments made via online booking widget
     */
    private async schedulePhorestToGhlBookingsSync(): Promise<void> {
        await this.phorestToGhlBookingsQueue.add(
            SyncJobNames.PHOREST_TO_GHL_BOOKINGS,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_BOOKINGS,
                direction: 'phorest_to_ghl',
                entityType: 'booking',
                batchId: `scheduled_${Date.now()}`,
            },
            {
                repeat: {
                    pattern: '35 */2 * * *', // Every 2 hours at :35 (staggered)
                },
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log('Scheduled Phorest → GHL bookings sync (every 2 hours)');
    }

    // @ts-ignore Temporarily unused
    private async schedulePhorestToGhlCheckinsSync(): Promise<void> {
        await this.phorestToGhlCheckinsQueue.add(
            SyncJobNames.PHOREST_TO_GHL_CHECKINS,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_CHECKINS,
                direction: 'phorest_to_ghl',
                entityType: 'checkin',
                batchId: `scheduled_${Date.now()}`,
            },
            {
                repeat: {
                    pattern: '8,38 * * * *', // At :08 and :38 past hour (staggered)
                },
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log('Scheduled Phorest → GHL check-ins sync (every 30 min at :08, :38)');
    }

    /**
     * Schedule Phorest → GHL loyalty sync (every 6 hours)
     */
    private async schedulePhorestToGhlLoyaltySync(): Promise<void> {
        await this.phorestToGhlLoyaltyQueue.add(
            SyncJobNames.PHOREST_TO_GHL_LOYALTY,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_LOYALTY,
                direction: 'phorest_to_ghl',
                entityType: 'loyalty',
                batchId: `scheduled_${Date.now()}`,
            },
            {
                repeat: {
                    pattern: '45 */12 * * *', // Every 12 hours at :45 (staggered)
                },
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log('Scheduled Phorest → GHL loyalty sync (every 12 hours)');
    }

    /**
     * Schedule Phorest → GHL staff sync (every 1 hour)
     */
    private async schedulePhorestToGhlStaffSync(): Promise<void> {
        await this.phorestToGhlStaffQueue.add(
            SyncJobNames.PHOREST_TO_GHL_STAFF,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_STAFF,
                direction: 'phorest_to_ghl',
                entityType: 'staff',
                batchId: `scheduled_${Date.now()}`,
            },
            {
                repeat: {
                    pattern: '30 6 * * *', // Daily at 6:30 AM (staggered)
                },
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log('Scheduled Phorest → GHL staff sync (daily at 6:30 AM)');
    }

    // @ts-ignore Temporarily unused


    /**
     * Schedule Phorest → GHL products sync (every 3 hours)
     */
    private async schedulePhorestToGhlProductsSync(): Promise<void> {
        await this.phorestToGhlProductsQueue.add(
            SyncJobNames.PHOREST_TO_GHL_PRODUCTS,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_PRODUCTS,
                direction: 'phorest_to_ghl',
                entityType: 'product',
                batchId: `scheduled_${Date.now()}`,
            },
            {
                repeat: {
                    pattern: '15 5 * * *', // Daily at 5:15 AM (staggered)
                },
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log('Scheduled Phorest → GHL products sync (daily at 5:15 AM)');
    }

    /**
     * Schedule Phorest → GHL clients sync (every 2 hours)
     */
    private async schedulePhorestToGhlClientsSync(): Promise<void> {
        await this.phorestToGhlClientsQueue.add(
            SyncJobNames.PHOREST_TO_GHL_CLIENTS,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_CLIENTS,
                direction: 'phorest_to_ghl',
                entityType: 'client',
                batchId: `scheduled_${Date.now()}`,
            },
            {
                repeat: {
                    pattern: '2 */2 * * *', // Every 2 hours at :02 (staggered to avoid collisions)
                },
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log('Scheduled Phorest → GHL clients sync (every 2 hours at :02)');
    }

    /**
     * Schedule Sync Audit (daily at midnight)
     * Compares local DB with GHL to detect sync discrepancies
     */
    private async scheduleSyncAudit(): Promise<void> {
        await this.syncAuditQueue.add(
            SyncJobNames.SYNC_AUDIT,
            {
                jobName: SyncJobNames.SYNC_AUDIT,
                direction: 'phorest_to_ghl',
                entityType: 'audit',
                batchId: `scheduled_${Date.now()}`,
            },
            {
                repeat: {
                    pattern: '0 1 * * *', // Daily at 1:00 AM (staggered from midnight)
                },
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log('📋 Scheduled Sync Audit (daily at 1:00 AM)');
    }

    /**
     * Trigger an immediate Sync Audit
     */
    async triggerSyncAudit(): Promise<string> {
        const batchId = `manual_${uuidv4()}`;
        const job = await this.syncAuditQueue.add(
            SyncJobNames.SYNC_AUDIT,
            {
                jobName: SyncJobNames.SYNC_AUDIT,
                direction: 'phorest_to_ghl',
                entityType: 'audit',
                batchId,
            },
            {
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log(`🔍 Triggered manual sync audit: ${job.id}`);
        return job.id || batchId;
    }

    // ============ Manual Triggers ============

    /**
     * Trigger an immediate GHL → Phorest clients sync
     */
    /**
     * Trigger an immediate GHL → Phorest clients sync
     */
    async triggerGhlToPhorestClientsSync(options?: { fullSync?: boolean }): Promise<string> {
        const batchId = `manual_${uuidv4()}`;
        const job = await this.ghlToPhorestClientsQueue.add(
            SyncJobNames.GHL_TO_PHOREST_CLIENTS,
            {
                jobName: SyncJobNames.GHL_TO_PHOREST_CLIENTS,
                direction: 'ghl_to_phorest',
                entityType: 'client',
                batchId,
                fullSync: options?.fullSync,
            },
            {
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log(`Triggered manual GHL → Phorest clients sync (Job ID: ${job.id})`);
        return job.id!;
    }

    /**
     * Trigger a single Phorest client repair sync
     */
    async triggerPhorestToGhlSingleClientSync(clientId: string): Promise<string> {
        const batchId = `repair_${clientId}_${uuidv4()}`;
        // Use deterministic Job ID to prevent duplicates (Throttle/Debounce)
        const jobId = `repair-client-${clientId}`;

        // High priority job
        const job = await this.phorestToGhlClientsQueue.add(
            'repair-single-client',
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_CLIENTS,
                direction: 'phorest_to_ghl',
                entityType: 'client',
                batchId,
                entityId: clientId,
            },
            {
                jobId, // Set explicit Job ID for deduplication
                priority: 1, // Higher priority implies processed sooner
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
            },
        );
        this.logger.log(`🔧 Triggered single client repair sync for ${clientId} (Job ID: ${job.id})`);
        return job.id!;
    }

    /**
     * Trigger an immediate Phorest → GHL appointments sync
     */
    /**
     * Trigger an immediate Phorest → GHL appointments sync
     */
    async triggerPhorestToGhlAppointmentsSync(options?: { fullSync?: boolean }): Promise<string> {
        const batchId = `manual_${uuidv4()}`;
        const job = await this.phorestToGhlAppointmentsQueue.add(
            SyncJobNames.PHOREST_TO_GHL_APPOINTMENTS,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_APPOINTMENTS,
                direction: 'phorest_to_ghl',
                entityType: 'appointment',
                batchId,
                fullSync: options?.fullSync,
            },
            {
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log(`Triggered manual Phorest → GHL appointments sync (Job ID: ${job.id})`);
        return job.id!;
    }

    /**
     * Trigger an immediate Phorest → GHL products sync
     */
    /**
     * Trigger an immediate Phorest → GHL products sync
     */
    async triggerPhorestToGhlProductsSync(options?: { fullSync?: boolean }): Promise<string> {
        const batchId = `manual_${uuidv4()}`;
        const job = await this.phorestToGhlProductsQueue.add(
            SyncJobNames.PHOREST_TO_GHL_PRODUCTS,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_PRODUCTS,
                direction: 'phorest_to_ghl',
                entityType: 'product',
                batchId,
                fullSync: options?.fullSync,
            },
            {
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log(`Triggered manual Phorest → GHL products sync (Job ID: ${job.id})`);
        return job.id!;
    }

    /**
     * Trigger an immediate Phorest → GHL bookings sync
     */
    async triggerPhorestToGhlBookingsSync(options?: { fullSync?: boolean }): Promise<string> {
        const batchId = `manual_${uuidv4()}`;
        const job = await this.phorestToGhlBookingsQueue.add(
            SyncJobNames.PHOREST_TO_GHL_BOOKINGS,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_BOOKINGS,
                direction: 'phorest_to_ghl',
                entityType: 'booking',
                batchId,
                fullSync: options?.fullSync,
            },
            {
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log(`Triggered manual Phorest → GHL bookings sync (Job ID: ${job.id})`);
        return job.id!;
    }

    /**
     * Trigger an immediate Phorest → GHL loyalty points sync
     */
    /**
     * Trigger an immediate Phorest → GHL loyalty points sync
     */
    async triggerPhorestToGhlLoyaltySync(options?: { fullSync?: boolean }): Promise<string> {
        const batchId = `manual_${uuidv4()}`;
        const job = await this.phorestToGhlLoyaltyQueue.add(
            SyncJobNames.PHOREST_TO_GHL_LOYALTY,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_LOYALTY,
                direction: 'phorest_to_ghl',
                entityType: 'loyalty',
                batchId,
                fullSync: options?.fullSync,
            },
            {
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log(`Triggered manual Phorest → GHL loyalty sync (Job ID: ${job.id})`);
        return job.id!;
    }

    /**
     * Trigger an immediate Phorest → GHL staff sync
     */
    async triggerPhorestToGhlStaffSync(options?: { fullSync?: boolean }): Promise<string> {
        const batchId = `manual_${uuidv4()}`;
        const job = await this.phorestToGhlStaffQueue.add(
            SyncJobNames.PHOREST_TO_GHL_STAFF,
            {
                jobName: SyncJobNames.PHOREST_TO_GHL_STAFF,
                direction: 'phorest_to_ghl',
                entityType: 'staff',
                batchId,
                fullSync: options?.fullSync,
            },
            {
                removeOnComplete: 10,
                removeOnFail: 10,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );
        this.logger.log(`Triggered manual Phorest → GHL staff sync (Job ID: ${job.id})`);
        return job.id!;
    }

    /**
     * Trigger an immediate Phorest → GHL client updates sync (Sync All/Initial Sync)
     */


    // ============ Queue Status ============

    /**
     * Get combined status of all queues
     */
    async getQueueStatus(): Promise<{
        queues: Array<{
            name: string;
            waiting: number;
            active: number;
            completed: number;
            failed: number;
            delayed: number;
            repeatableJobs: Array<{ name: string; pattern: string; next: number }>;
        }>;
        totals: {
            waiting: number;
            active: number;
            completed: number;
            failed: number;
            delayed: number;
        };
    }> {
        const allQueues = [
            { queue: this.ghlToPhorestClientsQueue, name: 'GHL → Phorest Clients' },
            { queue: this.phorestToGhlAppointmentsQueue, name: 'Phorest → GHL Appointments' },
            { queue: this.phorestToGhlBookingsQueue, name: 'Phorest → GHL Bookings' },
            { queue: this.phorestToGhlCheckinsQueue, name: 'Phorest → GHL Check-ins' },
            { queue: this.phorestToGhlLoyaltyQueue, name: 'Phorest → GHL Loyalty' },
            { queue: this.phorestToGhlProductsQueue, name: 'Phorest → GHL Products' },
            { queue: this.phorestToGhlStaffQueue, name: 'Phorest → GHL Staff' },

        ];

        const queuesStatus = await Promise.all(
            allQueues.map(async ({ queue, name }) => {
                const [waiting, active, completed, failed, delayed, repeatableJobs] =
                    await Promise.all([
                        queue.getWaitingCount(),
                        queue.getActiveCount(),
                        queue.getCompletedCount(),
                        queue.getFailedCount(),
                        queue.getDelayedCount(),
                        queue.getRepeatableJobs(),
                    ]);

                return {
                    name,
                    waiting,
                    active,
                    completed,
                    failed,
                    delayed,
                    repeatableJobs: repeatableJobs.map((job) => ({
                        name: job.name,
                        pattern: job.pattern || '',
                        next: job.next ?? 0,
                    })),
                };
            }),
        );

        const totals = queuesStatus.reduce(
            (acc, q) => ({
                waiting: acc.waiting + q.waiting,
                active: acc.active + q.active,
                completed: acc.completed + q.completed,
                failed: acc.failed + q.failed,
                delayed: acc.delayed + q.delayed,
            }),
            { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        );

        return { queues: queuesStatus, totals };
    }

    // ============ Queue Control ============

    /**
     * Pause all sync queues
     */
    async pauseSync(): Promise<void> {
        await Promise.all([
            this.ghlToPhorestClientsQueue.pause(),
            this.phorestToGhlAppointmentsQueue.pause(),
            this.phorestToGhlBookingsQueue.pause(),
            this.phorestToGhlCheckinsQueue.pause(),
            this.phorestToGhlLoyaltyQueue.pause(),
            this.phorestToGhlProductsQueue.pause(),
            this.phorestToGhlStaffQueue.pause(),

        ]);
        this.logger.log('All sync queues paused');
    }

    /**
     * Resume all sync queues
     */
    async resumeSync(): Promise<void> {
        await Promise.all([
            this.ghlToPhorestClientsQueue.resume(),
            this.phorestToGhlAppointmentsQueue.resume(),
            this.phorestToGhlBookingsQueue.resume(),
            this.phorestToGhlCheckinsQueue.resume(),
            this.phorestToGhlLoyaltyQueue.resume(),
            this.phorestToGhlProductsQueue.resume(),
            this.phorestToGhlStaffQueue.resume(),

        ]);
        this.logger.log('All sync queues resumed');
    }
}
