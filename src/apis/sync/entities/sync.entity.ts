import { ApiProperty } from '@nestjs/swagger';

// ============ Response Entities ============

export class ResponseWithoutData {
    @ApiProperty({ description: 'HTTP status code' })
    status: number;

    @ApiProperty({ description: 'Response message' })
    message: string;

    @ApiProperty({ description: 'Success indicator' })
    success: boolean;
}

export class ResponseWithData extends ResponseWithoutData {
    @ApiProperty({ description: 'Response data' })
    data: any;
}

export class SyncStatusResponse extends ResponseWithoutData {
    @ApiProperty({ description: 'Sync status data' })
    data: {
        lastRun: string | null;
        status: 'healthy' | 'degraded' | 'failed' | 'no_runs';
        recentFailures: number;
        lastError: string | null;
    };
}

export class QueueStatusResponse extends ResponseWithoutData {
    @ApiProperty({ description: 'Queue status data' })
    data: {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
        repeatableJobs: Array<{ name: string; pattern: string; next: number }>;
    };
}

export class TriggerSyncResponse extends ResponseWithoutData {
    @ApiProperty({ description: 'Trigger sync data' })
    data: {
        jobId: string;
    };
}

export class SyncResultResponse extends ResponseWithoutData {
    @ApiProperty({ description: 'Sync result data' })
    data: {
        totalProcessed: number;
        created: number;
        updated: number;
        skipped: number;
        failed: number;
        errors: Array<{ entityId: string; error: string }>;
    };
}

export class FailedRunsResponse extends ResponseWithoutData {
    @ApiProperty({ description: 'Failed runs list' })
    data: Array<{
        id: string;
        batchId: string;
        direction: string;
        entityType: string;
        status: string;
        failedCount: number;
        lastError: string | null;
        createdAt: string;
    }>;
}
