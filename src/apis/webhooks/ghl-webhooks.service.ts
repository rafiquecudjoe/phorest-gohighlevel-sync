import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from '../../common/enums/queue.enum';
import { GhlWebhooksValidator } from './ghl-webhooks.validator';
import { GhlWebhookPayload, GhlWebhookEventType } from './interfaces/ghl-webhook.interface';

export interface WebhookResponse {
    status: number;
    success: boolean;
    message: string;
    jobId?: string;
}

export interface WebhookJobData {
    eventType: GhlWebhookEventType;
    entityId: string;
    locationId: string;
    payload: GhlWebhookPayload;
    receivedAt: string;
}

/**
 * GHL Webhooks API Service - Business logic layer
 * All webhook processing is queued for reliability
 */
@Injectable()
export class GhlWebhooksService {
    private readonly logger = new Logger(GhlWebhooksService.name);

    constructor(
        @InjectQueue(QueueNames.ghlWebhooks)
        private readonly webhooksQueue: Queue<WebhookJobData>,
        private readonly validator: GhlWebhooksValidator,
    ) { }

    /**
     * Handle incoming webhook - validate and queue for processing
     */
    async handleWebhook(rawPayload: any): Promise<WebhookResponse> {
        try {
            // Validate payload structure
            const payload = this.validator.validatePayload(rawPayload);

            // Validate location ID
            if (!this.validator.validateLocationId(payload.locationId)) {
                this.logger.warn(`Unauthorized locationId in webhook: ${payload.locationId}`);
                return {
                    status: HttpStatus.OK, // Return 200 to prevent retries
                    success: false,
                    message: 'Unauthorized location',
                };
            }

            // Check if event type should be processed
            if (!this.validator.isProcessableEvent(payload.type)) {
                this.logger.debug(`Ignored webhook event type: ${payload.type}`);
                return {
                    status: HttpStatus.OK,
                    success: true,
                    message: `Event type ${payload.type} acknowledged but not processed`,
                };
            }

            // Queue the webhook for processing
            const job = await this.webhooksQueue.add(
                `webhook-${payload.type}`,
                {
                    eventType: payload.type,
                    entityId: payload.id,
                    locationId: payload.locationId,
                    payload,
                    receivedAt: new Date().toISOString(),
                },
                {
                    removeOnComplete: 50,
                    removeOnFail: 20,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 2000,
                    },
                },
            );

            this.logger.log(`Queued webhook ${payload.type} for entity ${payload.id} (Job: ${job.id})`);

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Webhook received and queued for processing',
                jobId: job.id,
            };
        } catch (error: any) {
            this.logger.error(`Webhook handling error: ${error.message}`);

            // Always return 200 to prevent webhook retries from GHL
            return {
                status: HttpStatus.OK,
                success: false,
                message: error.message || 'Webhook processing error',
            };
        }
    }

    /**
     * Get webhook queue status
     */
    async getQueueStatus() {
        const [waiting, active, completed, failed] = await Promise.all([
            this.webhooksQueue.getWaitingCount(),
            this.webhooksQueue.getActiveCount(),
            this.webhooksQueue.getCompletedCount(),
            this.webhooksQueue.getFailedCount(),
        ]);

        return {
            waiting,
            active,
            completed,
            failed,
        };
    }
}
