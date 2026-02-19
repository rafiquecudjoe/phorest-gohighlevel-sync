import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class GhlOAuthValidator {
    validateAuthorizationCode(code: string | undefined): void {
        if (!code || typeof code !== 'string' || code.trim().length === 0) {
            throw new BadRequestException('Authorization code is required');
        }
    }

    validateScopes(scopes: string[]): void {
        if (!Array.isArray(scopes) || scopes.length === 0) {
            throw new BadRequestException('At least one scope is required');
        }

        const validScopes = [
            'contacts.readonly',
            'contacts.write',
            'calendars.readonly',
            'calendars.write',
            'calendars/events.readonly',
            'calendars/events.write',
            'users.readonly',
            'locations.readonly',
            'locations/customFields.readonly',
            'locations/customFields.write',
            'locations/tags.readonly',
            'locations/tags.write',
            'opportunities.readonly',
            'opportunities.write',
            'products.readonly',
            'products.write',
        ];

        for (const scope of scopes) {
            if (!validScopes.includes(scope)) {
                throw new BadRequestException(`Invalid scope: ${scope}`);
            }
        }
    }
}
