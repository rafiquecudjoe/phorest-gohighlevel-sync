import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames } from '../../common/enums/queue.enum';
import { WebhookJobData } from '../../apis/webhooks/ghl-webhooks.service';
import { GhlWebhookEventType } from '../../apis/webhooks/interfaces/ghl-webhook.interface';
import { ClientSyncService } from '../../sync/services/client-sync.service';

/**
 * Processor for GHL Webhooks Queue
 * Handles contact and appointment webhook events
 */
@Processor(QueueNames.ghlWebhooks)
export class GhlWebhooksProcessor extends WorkerHost {
    private readonly logger = new Logger(GhlWebhooksProcessor.name);

    constructor(
        private readonly clientSyncService: ClientSyncService,
    ) {
        super();
    }

    async process(job: Job<WebhookJobData>) {
        this.logger.log(`Processing webhook job ${job.id}: ${job.data.eventType} for ${job.data.entityId}`);

        const { eventType, entityId } = job.data;

        try {
            switch (eventType) {
                case GhlWebhookEventType.CONTACT_CREATE:
                case GhlWebhookEventType.CONTACT_UPDATE:
                    return await this.handleContactEvent(entityId, eventType);

                case GhlWebhookEventType.CONTACT_DELETE:
                    return await this.handleContactDelete(entityId);

                case GhlWebhookEventType.APPOINTMENT_CREATE:
                case GhlWebhookEventType.APPOINTMENT_UPDATE:
                    // For now, log appointment events - can be expanded later
                    this.logger.log(`Appointment event ${eventType} for ${entityId} - acknowledged`);
                    return { processed: true, eventType };

                default:
                    this.logger.debug(`Unhandled event type: ${eventType}`);
                    return { processed: false, reason: 'Unhandled event type' };
            }
        } catch (error) {
            this.logger.error(`Webhook processing failed for ${eventType}:${entityId}`, error);
            throw error;
        }
    }

    private async handleContactEvent(contactId: string, eventType: GhlWebhookEventType) {
        this.logger.log(`Processing ${eventType} for contact ${contactId}`);

        const result = await this.clientSyncService.syncSingleContact(contactId);

        this.logger.log(
            `Contact sync completed for ${contactId}: ${result.created + result.updated} success, ${result.failed} failed`
        );

        return {
            processed: true,
            eventType,
            contactId,
            result,
        };
    }

    private async handleContactDelete(contactId: string) {
        // For deletes, we could mark the mapping as deleted or remove it
        this.logger.log(`Contact ${contactId} was deleted in GHL - acknowledged`);
        // Future: Mark mapping as deleted or sync deletion to Phorest
        return {
            processed: true,
            eventType: GhlWebhookEventType.CONTACT_DELETE,
            contactId,
        };
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<WebhookJobData>) {
        this.logger.log(`Webhook job ${job.id} completed: ${job.data.eventType}`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<WebhookJobData>, error: Error) {
        this.logger.error(
            `Webhook job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`
        );
    }
}
