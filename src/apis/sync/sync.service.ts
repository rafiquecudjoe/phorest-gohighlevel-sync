import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { SyncValidator } from './sync.validator';
import { ClientSyncService } from '../../sync/services/client-sync.service';
import { AppointmentSyncService } from '../../sync/services/appointment-sync.service';
import { SyncLogService } from '../../sync/services/sync-log.service';
import { ReportedEntityService } from '../../sync/services/reported-entity.service';
import { SyncJobProducer } from '../../queues';
import { TriggerSyncDto } from './dto/sync.dto';
import { ResponseWithData } from './entities/sync.entity';

/**
 * Sync Service - Business logic layer for sync API endpoints
 */
@Injectable()
export class SyncService {
    private readonly logger = new Logger(SyncService.name);

    constructor(
        private readonly syncValidator: SyncValidator,
        private readonly clientSyncService: ClientSyncService,
        private readonly appointmentSyncService: AppointmentSyncService,
        private readonly syncLogService: SyncLogService,
        private readonly reportedEntityService: ReportedEntityService,
        private readonly syncJobProducer: SyncJobProducer,
    ) { }

    /**
     * Get sync health status
     */
    async getSyncStatus(): Promise<ResponseWithData> {
        try {
            const status = await this.syncLogService.getSyncStatus();

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Sync status retrieved successfully',
                data: status,
            };
        } catch (error) {
            this.logger.error(`getSyncStatus: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Get queue status
     */
    async getQueueStatus(): Promise<ResponseWithData> {
        try {
            const queueStatus = await this.syncJobProducer.getQueueStatus();

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Queue status retrieved successfully',
                data: queueStatus,
            };
        } catch (error) {
            this.logger.error(`getQueueStatus: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Trigger GHL → Phorest client sync (async job)
     */
    async triggerGhlToPhorestClientSync(dto?: TriggerSyncDto): Promise<ResponseWithData> {
        try {
            if (dto) {
                await this.syncValidator.validateTriggerSyncDto(dto);
            }

            const jobId = await this.syncJobProducer.triggerGhlToPhorestClientsSync();

            return {
                status: HttpStatus.ACCEPTED,
                success: true,
                message: 'GHL → Phorest client sync triggered',
                data: { jobId },
            };
        } catch (error) {
            this.logger.error(`triggerGhlToPhorestClientSync: ${JSON.stringify(dto)} ==> ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Run immediate GHL → Phorest sync (blocking)
     */
    async runImmediateGhlToPhorestSync(): Promise<ResponseWithData> {
        try {
            const result = await this.clientSyncService.syncGhlToPhorest();

            return {
                status: HttpStatus.OK,
                success: true,
                message: `Sync completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed`,
                data: result,
            };
        } catch (error) {
            this.logger.error(`runImmediateGhlToPhorestSync: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Sync a single GHL contact to Phorest
     */
    async syncSingleContact(contactId: string): Promise<ResponseWithData> {
        try {
            await this.syncValidator.validateSyncSingleContactDto(contactId);

            const result = await this.clientSyncService.syncSingleContact(contactId);

            return {
                status: HttpStatus.OK,
                success: true,
                message: result.failed > 0 ? 'Sync failed' : 'Contact synced successfully',
                data: result,
            };
        } catch (error) {
            this.logger.error(`syncSingleContact: ${contactId} ==> ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Trigger Phorest → GHL appointment sync (async job)
     */
    /**
     * Trigger Phorest → GHL appointment sync (async job)
     */
    async triggerPhorestToGhlAppointmentSync(fullSync: boolean = false): Promise<ResponseWithData> {
        try {
            const jobId = await this.syncJobProducer.triggerPhorestToGhlAppointmentsSync({ fullSync });

            return {
                status: HttpStatus.ACCEPTED,
                success: true,
                message: 'Phorest → GHL appointment sync triggered',
                data: { jobId },
            };
        } catch (error) {
            this.logger.error(`triggerPhorestToGhlAppointmentSync: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Run immediate Phorest → GHL appointment sync (blocking)
     */
    async runImmediatePhorestToGhlAppointmentSync(): Promise<ResponseWithData> {
        try {
            const result = await this.appointmentSyncService.syncPhorestToGhl();

            return {
                status: HttpStatus.OK,
                success: true,
                message: `Sync completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed`,
                data: result,
            };
        } catch (error) {
            this.logger.error(`runImmediatePhorestToGhlAppointmentSync: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Trigger Phorest → GHL booking sync (async job)
     */
    /**
     * Trigger Phorest → GHL booking sync (async job)
     */
    async triggerPhorestToGhlBookingSync(fullSync: boolean = false): Promise<ResponseWithData> {
        try {
            const jobId = await this.syncJobProducer.triggerPhorestToGhlBookingsSync({ fullSync });

            return {
                status: HttpStatus.ACCEPTED,
                success: true,
                message: 'Phorest → GHL booking sync triggered',
                data: { jobId },
            };
        } catch (error) {
            this.logger.error(`triggerPhorestToGhlBookingSync: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Trigger Phorest → GHL loyalty sync (async job)
     */
    /**
     * Trigger Phorest → GHL loyalty sync (async job)
     */
    async triggerPhorestToGhlLoyaltySync(fullSync: boolean = false): Promise<ResponseWithData> {
        try {
            const jobId = await this.syncJobProducer.triggerPhorestToGhlLoyaltySync({ fullSync });

            return {
                status: HttpStatus.ACCEPTED,
                success: true,
                message: 'Phorest → GHL loyalty points sync triggered',
                data: { jobId },
            };
        } catch (error) {
            this.logger.error(`triggerPhorestToGhlLoyaltySync: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Trigger Phorest → GHL staff sync (async job)
     */
    async triggerPhorestToGhlStaffSync(fullSync: boolean = false): Promise<ResponseWithData> {
        try {
            const jobId = await this.syncJobProducer.triggerPhorestToGhlStaffSync({ fullSync });

            return {
                status: HttpStatus.ACCEPTED,
                success: true,
                message: 'Phorest → GHL staff sync triggered',
                data: { jobId },
            };
        } catch (error) {
            this.logger.error(`triggerPhorestToGhlStaffSync: ${error}`);
            return this.generateErrorResponse(error);
        }
    }



    /**
     * Pause all sync jobs
     */
    async pauseSync(): Promise<ResponseWithData> {
        try {
            await this.syncJobProducer.pauseSync();

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Sync paused',
                data: null,
            };
        } catch (error) {
            this.logger.error(`pauseSync: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Resume sync jobs
     */
    async resumeSync(): Promise<ResponseWithData> {
        try {
            await this.syncJobProducer.resumeSync();

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Sync resumed',
                data: null,
            };
        } catch (error) {
            this.logger.error(`resumeSync: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Get recent failed sync runs
     */
    async getFailedRuns(): Promise<ResponseWithData> {
        try {
            const failedRuns = await this.syncLogService.getFailedRuns(10);

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Failed runs retrieved successfully',
                data: failedRuns,
            };
        } catch (error) {
            this.logger.error(`getFailedRuns: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Get sync logs for a specific run
     */
    async getSyncLogsForRun(runId: string): Promise<ResponseWithData> {
        try {
            await this.syncValidator.validateRunId(runId);

            const logs = await this.syncLogService.getSyncLogs(runId);

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Sync logs retrieved successfully',
                data: logs,
            };
        } catch (error) {
            this.logger.error(`getSyncLogsForRun: ${runId} ==> ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Get recent failed sync items
     */
    async getRecentFailedLogs(): Promise<ResponseWithData> {
        try {
            const failedLogs = await this.syncLogService.getRecentFailedLogs(50);

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Failed logs retrieved successfully',
                data: failedLogs,
            };
        } catch (error) {
            this.logger.error(`getRecentFailedLogs: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Trigger comprehensive sync audit
     * Compares local DB with GHL to detect discrepancies
     */
    async triggerSyncAudit(): Promise<ResponseWithData> {
        try {
            const jobId = await this.syncJobProducer.triggerSyncAudit();
            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Sync audit job triggered successfully',
                data: { jobId },
            };
        } catch (error) {
            this.logger.error(`triggerSyncAudit: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Get recent error reports
     */
    async getRecentErrors(): Promise<ResponseWithData> {
        try {
            const errors = await this.reportedEntityService.getRecentFailures(50);

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Recent errors retrieved successfully',
                data: errors,
            };
        } catch (error) {
            this.logger.error(`getRecentErrors: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Get error statistics
     */
    async getErrorStats(): Promise<ResponseWithData> {
        try {
            const stats = await this.reportedEntityService.getErrorStats();

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Error statistics retrieved successfully',
                data: stats,
            };
        } catch (error) {
            this.logger.error(`getErrorStats: ${error}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Generate error response
     */
    private generateErrorResponse(error: any): ResponseWithData {
        const statusCode = error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
        const message = error?.message || 'An unexpected error occurred';

        return {
            status: statusCode,
            success: false,
            message,
            data: null,
        };
    }
}
