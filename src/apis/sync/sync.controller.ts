import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
    ApiTags,
    ApiOperation,
    ApiHeader,
    ApiOkResponse,
    ApiInternalServerErrorResponse,
    ApiParam,
} from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { TriggerSyncDto } from './dto/sync.dto';
import {
    SyncStatusResponse,
    QueueStatusResponse,
    TriggerSyncResponse,
    SyncResultResponse,
    FailedRunsResponse,
    ResponseWithData,
} from './entities/sync.entity';

@Controller('api/v1/sync')
@ApiTags('Sync')
export class SyncController {
    constructor(private readonly syncService: SyncService) { }

    // ============ STATUS ENDPOINTS ============

    @Get('status')
    @ApiOperation({ summary: 'Get sync health status' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Sync status retrieved', type: SyncStatusResponse })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async getSyncStatus(@Res() res: Response) {
        const { status, ...responseData } = await this.syncService.getSyncStatus();
        return res.status(status).json(responseData);
    }

    @Get('queue')
    @ApiOperation({ summary: 'Get sync queue status' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Queue status retrieved', type: QueueStatusResponse })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async getQueueStatus(@Res() res: Response) {
        const { status, ...responseData } = await this.syncService.getQueueStatus();
        return res.status(status).json(responseData);
    }

    // ============ MANUAL SYNC ENDPOINTS ============

    @Post('clients/ghl-to-phorest')
    @ApiOperation({ summary: 'Trigger GHL → Phorest client sync (async job)' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Sync job triggered', type: TriggerSyncResponse })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async triggerGhlToPhorestClientSync(
        @Body() requestBody: TriggerSyncDto,
        @Res() res: Response,
    ) {
        const { status, ...responseData } = await this.syncService.triggerGhlToPhorestClientSync(requestBody);
        return res.status(status).json(responseData);
    }

    @Post('clients/ghl-to-phorest/immediate')
    @ApiOperation({ summary: 'Run immediate GHL → Phorest client sync (blocking)' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Sync completed', type: SyncResultResponse })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async runImmediateGhlToPhorestSync(@Res() res: Response) {
        const { status, ...responseData } = await this.syncService.runImmediateGhlToPhorestSync();
        return res.status(status).json(responseData);
    }

    @Post('clients/ghl-to-phorest/:contactId')
    @ApiOperation({ summary: 'Sync a single GHL contact to Phorest' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiParam({ name: 'contactId', description: 'GHL Contact ID' })
    @ApiOkResponse({ description: 'Contact synced', type: SyncResultResponse })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async syncSingleContact(
        @Param('contactId') contactId: string,
        @Res() res: Response,
    ) {
        const { status, ...responseData } = await this.syncService.syncSingleContact(contactId);
        return res.status(status).json(responseData);
    }

    // ============ APPOINTMENT SYNC ENDPOINTS ============

    @Post('appointments/phorest-to-ghl')
    @ApiOperation({ summary: 'Trigger Phorest → GHL appointment sync (async job)' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Sync job triggered', type: TriggerSyncResponse })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async triggerPhorestToGhlAppointmentSync(
        @Body() requestBody: TriggerSyncDto,
        @Res() res: Response,
    ) {
        const { status, ...responseData } = await this.syncService.triggerPhorestToGhlAppointmentSync(requestBody.forceFullSync);
        return res.status(status).json(responseData);
    }

    @Post('appointments/phorest-to-ghl/immediate')
    @ApiOperation({ summary: 'Run immediate Phorest → GHL appointment sync (blocking)' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Sync completed', type: SyncResultResponse })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async runImmediatePhorestToGhlAppointmentSync(@Res() res: Response) {
        const { status, ...responseData } = await this.syncService.runImmediatePhorestToGhlAppointmentSync();
        return res.status(status).json(responseData);
    }

    // ============ BOOKING SYNC ENDPOINTS ============

    @Post('bookings/phorest-to-ghl')
    @ApiOperation({ summary: 'Trigger Phorest → GHL booking sync (async job)' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Sync job triggered', type: TriggerSyncResponse })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async triggerPhorestToGhlBookingSync(
        @Body() requestBody: TriggerSyncDto,
        @Res() res: Response,
    ) {
        const { status, ...responseData } = await this.syncService.triggerPhorestToGhlBookingSync(requestBody.forceFullSync);
        return res.status(status).json(responseData);
    }

    // ============ LOYALTY SYNC ENDPOINTS ============

    @Post('loyalty/phorest-to-ghl')
    @ApiOperation({ summary: 'Trigger Phorest → GHL loyalty points sync (async job)' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Sync job triggered', type: TriggerSyncResponse })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async triggerPhorestToGhlLoyaltySync(
        @Body() requestBody: TriggerSyncDto,
        @Res() res: Response,
    ) {
        const { status, ...responseData } = await this.syncService.triggerPhorestToGhlLoyaltySync(requestBody.forceFullSync);
        return res.status(status).json(responseData);
    }

    // ============ STAFF SYNC ENDPOINTS ============

    @Post('staff/phorest-to-ghl')
    @ApiOperation({ summary: 'Trigger Phorest → GHL staff sync (async job)' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Sync job triggered', type: TriggerSyncResponse })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async triggerPhorestToGhlStaffSync(
        @Body() requestBody: TriggerSyncDto,
        @Res() res: Response,
    ) {
        const { status, ...responseData } = await this.syncService.triggerPhorestToGhlStaffSync(requestBody.forceFullSync);
        return res.status(status).json(responseData);
    }

    // ============ CLIENT SYNC ENDPOINTS ============

    // ============ CONTROL ENDPOINTS ============

    @Post('pause')
    @ApiOperation({ summary: 'Pause all sync jobs' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Sync paused', type: ResponseWithData })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async pauseSync(@Res() res: Response) {
        const { status, ...responseData } = await this.syncService.pauseSync();
        return res.status(status).json(responseData);
    }

    @Post('resume')
    @ApiOperation({ summary: 'Resume sync jobs' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Sync resumed', type: ResponseWithData })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async resumeSync(@Res() res: Response) {
        const { status, ...responseData } = await this.syncService.resumeSync();
        return res.status(status).json(responseData);
    }

    // ============ AUDIT ENDPOINTS ============

    @Get('runs/failed')
    @ApiOperation({ summary: 'Get recent failed sync runs' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Failed runs retrieved', type: FailedRunsResponse })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async getFailedRuns(@Res() res: Response) {
        const { status, ...responseData } = await this.syncService.getFailedRuns();
        return res.status(status).json(responseData);
    }

    @Get('runs/:runId/logs')
    @ApiOperation({ summary: 'Get sync logs for a specific run' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiParam({ name: 'runId', description: 'Sync Run ID' })
    @ApiOkResponse({ description: 'Sync logs retrieved', type: ResponseWithData })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async getSyncLogsForRun(
        @Param('runId') runId: string,
        @Res() res: Response,
    ) {
        const { status, ...responseData } = await this.syncService.getSyncLogsForRun(runId);
        return res.status(status).json(responseData);
    }

    @Get('logs/failed')
    @ApiOperation({ summary: 'Get recent failed sync items' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Failed logs retrieved', type: ResponseWithData })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async getRecentFailedLogs(@Res() res: Response) {
        const { status, ...responseData } = await this.syncService.getRecentFailedLogs();
        return res.status(status).json(responseData);
    }

    // ============ ERROR REPORTING ENDPOINTS ============

    @Get('errors/recent')
    @ApiOperation({ summary: 'Get recent error reports from failed sync operations' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Recent errors retrieved', type: ResponseWithData })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async getRecentErrors(@Res() res: Response) {
        const { status, ...responseData } = await this.syncService.getRecentErrors();
        return res.status(status).json(responseData);
    }

    @Get('errors/stats')
    @ApiOperation({ summary: 'Get error statistics (count by type and entity)' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Error statistics retrieved', type: ResponseWithData })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async getErrorStats(@Res() res: Response) {
        const { status, ...responseData } = await this.syncService.getErrorStats();
        return res.status(status).json(responseData);
    }

    // ============ AUDIT ENDPOINTS ============

    @Post('audit')
    @ApiOperation({ summary: 'Trigger a comprehensive sync audit (compares DB with GHL)' })
    @ApiHeader({ name: 'client-key' })
    @ApiHeader({ name: 'client-secret' })
    @ApiOkResponse({ description: 'Audit job triggered', type: ResponseWithData })
    @ApiInternalServerErrorResponse({ description: 'Internal server error', type: ResponseWithData })
    async triggerSyncAudit(@Res() res: Response) {
        const { status, ...responseData } = await this.syncService.triggerSyncAudit();
        return res.status(status).json(responseData);
    }
}
