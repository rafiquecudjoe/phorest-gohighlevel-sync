import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlWebhookPayload, GhlWebhookEventType } from './interfaces/ghl-webhook.interface';

@Injectable()
export class GhlWebhooksValidator {
    constructor(private readonly configService: ConfigService) { }

    /**
     * Validate webhook payload structure
     */
    validatePayload(payload: any): GhlWebhookPayload {
        if (!payload) {
            throw new BadRequestException('Missing webhook payload');
        }

        if (!payload.type) {
            throw new BadRequestException('Missing webhook event type');
        }

        if (!payload.locationId) {
            throw new BadRequestException('Missing locationId in webhook payload');
        }

        return payload as GhlWebhookPayload;
    }

    /**
     * Validate that the webhook comes from our location
     */
    validateLocationId(locationId: string): boolean {
        const expectedLocationId = this.configService.get<string>('GHL_LOCATION_ID');
        return locationId === expectedLocationId;
    }

    /**
     * Check if this event type should be processed
     */
    isProcessableEvent(eventType: string): boolean {
        const processableEvents = [
            GhlWebhookEventType.CONTACT_CREATE,
            GhlWebhookEventType.CONTACT_UPDATE,
            GhlWebhookEventType.CONTACT_DELETE,
            GhlWebhookEventType.APPOINTMENT_CREATE,
            GhlWebhookEventType.APPOINTMENT_UPDATE,
        ];
        return processableEvents.includes(eventType as GhlWebhookEventType);
    }
}
