import {
    Controller,
    Post,
    Get,
    Body,
    HttpCode,
    HttpStatus,
    Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { GhlWebhooksService } from './ghl-webhooks.service';
import { GhlWebhookPayload } from './interfaces/ghl-webhook.interface';

@ApiTags('Webhooks')
@Controller('api/v1/webhooks/ghl')
export class GhlWebhooksController {
    constructor(private readonly webhooksService: GhlWebhooksService) { }

    @Post()
    @HttpCode(HttpStatus.OK) // Always return 200 to acknowledge receipt
    @ApiOperation({ summary: 'Receive GoHighLevel webhooks' })
    @ApiBody({
        description: 'GHL Webhook Payload',
        examples: {
            contactCreate: {
                value: {
                    type: 'ContactCreate',
                    locationId: 'PE1EsziwtUTMVZlN4MN5',
                    id: 'N2GET5FgTpptVrKoyobV',
                },
            },
        },
    })
    async handleWebhook(@Body() payload: GhlWebhookPayload) {
        const response = await this.webhooksService.handleWebhook(payload);
        return {
            success: response.success,
            message: response.message,
            jobId: response.jobId,
        };
    }

    @Get('status')
    @ApiOperation({ summary: 'Get webhook queue status' })
    @ApiOkResponse({ description: 'Queue status returned' })
    async getQueueStatus(@Res() res: Response) {
        const queueStatus = await this.webhooksService.getQueueStatus();
        return res.status(HttpStatus.OK).json({
            success: true,
            message: 'Webhook queue status',
            data: queueStatus,
        });
    }
}
