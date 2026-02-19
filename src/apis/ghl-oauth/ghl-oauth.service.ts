import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { GhlOAuthService } from '../../integrations/gohighlevel/ghl-oauth.service';
import { GhlOAuthValidator } from './ghl-oauth.validator';

export interface OAuthResponse {
    status: number;
    success: boolean;
    message: string;
    data?: any;
}

/**
 * GHL OAuth API Service - Business logic layer
 */
@Injectable()
export class GhlOAuthApiService {
    private readonly logger = new Logger(GhlOAuthApiService.name);

    private readonly defaultScopes = [
        'contacts.readonly',
        'contacts.write',
        'calendars.readonly',
        'calendars.write',
        'calendars/events.readonly',
        'calendars/events.write',
        'users.readonly',
        'users.write',
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

    constructor(
        private readonly ghlOAuthService: GhlOAuthService,
        private readonly validator: GhlOAuthValidator,
    ) { }

    /**
     * Get authorization URL
     */
    async getAuthorizationUrl(scopes?: string[]): Promise<OAuthResponse> {
        try {
            const scopesToUse = scopes || this.defaultScopes;
            if (scopes) {
                this.validator.validateScopes(scopesToUse);
            }

            const authUrl = this.ghlOAuthService.getAuthorizationUrl(scopesToUse);

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'Open this URL in your browser to authorize the app',
                data: { authorizationUrl: authUrl },
            };
        } catch (error: any) {
            this.logger.error(`getAuthorizationUrl: ${error.message}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Handle OAuth callback
     */
    async handleCallback(
        code: string | undefined,
        error?: string,
        errorDescription?: string,
    ): Promise<OAuthResponse> {
        // Handle error from OAuth provider
        if (error) {
            return {
                status: HttpStatus.BAD_REQUEST,
                success: false,
                message: 'OAuth authorization failed',
                data: { error, errorDescription },
            };
        }

        try {
            this.validator.validateAuthorizationCode(code);

            const tokenData = await this.ghlOAuthService.exchangeCodeForToken(code!);

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'OAuth authorization successful! Token stored.',
                data: {
                    locationId: tokenData.locationId,
                    scopes: tokenData.scope.split(' '),
                },
            };
        } catch (error: any) {
            this.logger.error(`handleCallback: ${error.message}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Get token status
     */
    async getTokenStatus(): Promise<OAuthResponse> {
        try {
            const hasToken = await this.ghlOAuthService.hasValidToken();

            return {
                status: HttpStatus.OK,
                success: true,
                message: hasToken
                    ? 'OAuth token is valid and ready for API calls'
                    : 'No valid OAuth token found. Please complete the OAuth flow.',
                data: { hasValidToken: hasToken },
            };
        } catch (error: any) {
            this.logger.error(`getTokenStatus: ${error.message}`);
            return this.generateErrorResponse(error);
        }
    }

    /**
     * Revoke token
     */
    async revokeToken(): Promise<OAuthResponse> {
        try {
            await this.ghlOAuthService.revokeToken();

            return {
                status: HttpStatus.OK,
                success: true,
                message: 'OAuth token revoked successfully',
            };
        } catch (error: any) {
            this.logger.error(`revokeToken: ${error.message}`);
            return this.generateErrorResponse(error);
        }
    }

    private generateErrorResponse(error: any): OAuthResponse {
        const statusCode = error?.statusCode || error?.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const message = error?.response?.data?.message || error?.message || 'An unexpected error occurred';

        return {
            status: statusCode,
            success: false,
            message,
        };
    }
}
