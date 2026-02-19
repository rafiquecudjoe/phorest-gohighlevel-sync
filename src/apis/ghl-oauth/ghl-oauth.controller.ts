import {
    Controller,
    Get,
    Query,
    Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
    ApiTags,
    ApiOperation,
    ApiQuery,
    ApiOkResponse,
    ApiBadRequestResponse,
    ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { GhlOAuthApiService } from './ghl-oauth.service';

@Controller('api/v1/integrations/crm/oauth')
@ApiTags('CRM OAuth')
export class GhlOAuthController {
    constructor(private readonly oauthService: GhlOAuthApiService) { }

    @Get('authorize')
    @ApiOperation({ summary: 'Get GHL OAuth authorization URL' })
    @ApiOkResponse({ description: 'Authorization URL returned' })
    async getAuthorizationUrl(@Res() res: Response) {
        const { status, ...responseData } = await this.oauthService.getAuthorizationUrl();
        return res.status(status).json(responseData);
    }

    @Get('callback')
    @ApiOperation({ summary: 'OAuth callback handler' })
    @ApiQuery({ name: 'code', required: false, description: 'Authorization code from GHL' })
    @ApiQuery({ name: 'error', required: false, description: 'Error from OAuth provider' })
    @ApiOkResponse({ description: 'Token exchanged successfully' })
    @ApiBadRequestResponse({ description: 'Authorization failed or no code provided' })
    @ApiInternalServerErrorResponse({ description: 'Failed to exchange code for token' })
    async handleCallback(
        @Query('code') code: string,
        @Query('error') error: string,
        @Query('error_description') errorDescription: string,
        @Res() res: Response,
    ) {
        const { status, ...responseData } = await this.oauthService.handleCallback(
            code,
            error,
            errorDescription,
        );
        return res.status(status).json(responseData);
    }

    @Get('status')
    @ApiOperation({ summary: 'Check OAuth token status' })
    @ApiOkResponse({ description: 'Token status returned' })
    async getTokenStatus(@Res() res: Response) {
        const { status, ...responseData } = await this.oauthService.getTokenStatus();
        return res.status(status).json(responseData);
    }

    @Get('revoke')
    @ApiOperation({ summary: 'Revoke OAuth token' })
    @ApiOkResponse({ description: 'Token revoked' })
    async revokeToken(@Res() res: Response) {
        const { status, ...responseData } = await this.oauthService.revokeToken();
        return res.status(status).json(responseData);
    }
}
