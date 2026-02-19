import { Injectable, HttpStatus } from '@nestjs/common';
import * as joi from 'joi';

/**
 * Sync API Validator - Validates all sync-related requests
 */
@Injectable()
export class SyncValidator {
    /**
     * Validate trigger sync request
     */
    async validateTriggerSyncDto(dto: any): Promise<string> {
        const joiSchema = joi.object({
            entityType: joi.string().valid('client', 'appointment', 'staff', 'product').optional().label('Entity Type'),
            forceFullSync: joi.boolean().optional().label('Force Full Sync'),
        });

        const { error } = joiSchema.validate(dto, { abortEarly: true });
        if (error) {
            throw {
                message: error.details[0].message,
                statusCode: HttpStatus.BAD_REQUEST,
            };
        }

        return 'passed';
    }

    /**
     * Validate single contact sync request
     */
    async validateSyncSingleContactDto(contactId: string): Promise<string> {
        if (!contactId || contactId.trim() === '') {
            throw {
                message: 'Contact ID is required',
                statusCode: HttpStatus.BAD_REQUEST,
            };
        }

        // GHL contact IDs are typically alphanumeric
        if (!/^[a-zA-Z0-9]+$/.test(contactId)) {
            throw {
                message: 'Invalid Contact ID format',
                statusCode: HttpStatus.BAD_REQUEST,
            };
        }

        return 'passed';
    }

    /**
     * Validate run ID for log retrieval
     */
    async validateRunId(runId: string): Promise<string> {
        if (!runId || runId.trim() === '') {
            throw {
                message: 'Run ID is required',
                statusCode: HttpStatus.BAD_REQUEST,
            };
        }

        return 'passed';
    }
}
