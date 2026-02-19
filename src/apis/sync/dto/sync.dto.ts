import { ApiProperty } from '@nestjs/swagger';

// ============ Request DTOs ============

export class TriggerSyncDto {
    @ApiProperty({ description: 'Entity type to sync', example: 'client', required: false })
    entityType?: string;

    @ApiProperty({ description: 'Force full sync instead of incremental', default: false, required: false })
    forceFullSync?: boolean;
}

export class SyncSingleContactDto {
    @ApiProperty({ description: 'GHL Contact ID to sync', required: true })
    contactId: string;
}

// ============ Response DTOs ============

export class SyncResultDto {
    @ApiProperty({ description: 'Total records processed' })
    totalProcessed: number;

    @ApiProperty({ description: 'Records created' })
    created: number;

    @ApiProperty({ description: 'Records updated' })
    updated: number;

    @ApiProperty({ description: 'Records skipped' })
    skipped: number;

    @ApiProperty({ description: 'Records failed' })
    failed: number;

    @ApiProperty({ description: 'List of errors', type: [Object] })
    errors: Array<{ entityId: string; error: string }>;
}

export class TriggerSyncResponseDto {
    @ApiProperty({ description: 'Job ID for tracking' })
    jobId: string;

    @ApiProperty({ description: 'Status message' })
    message: string;
}

export class QueueStatusDto {
    @ApiProperty({ description: 'Jobs waiting in queue' })
    waiting: number;

    @ApiProperty({ description: 'Jobs currently processing' })
    active: number;

    @ApiProperty({ description: 'Completed jobs' })
    completed: number;

    @ApiProperty({ description: 'Failed jobs' })
    failed: number;

    @ApiProperty({ description: 'Delayed jobs' })
    delayed: number;

    @ApiProperty({ description: 'Scheduled recurring jobs', type: [Object] })
    repeatableJobs: Array<{ name: string; pattern: string; next: number }>;
}
