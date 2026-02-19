import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../common/prisma.service';
import { GhlOAuthTokenResponse, GhlConfig } from './interfaces/ghl.interfaces';

@Injectable()
export class GhlOAuthService {
    private readonly logger = new Logger(GhlOAuthService.name);
    private config: GhlConfig;

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        this.config = {
            baseUrl: this.configService.getOrThrow<string>('GHL_API_BASE_URL'),
            clientId: this.configService.getOrThrow<string>('GHL_CLIENT_ID'),
            clientSecret: this.configService.getOrThrow<string>('GHL_CLIENT_SECRET'),
            locationId: this.configService.getOrThrow<string>('GHL_LOCATION_ID'),
            redirectUri: this.configService.getOrThrow<string>('GHL_REDIRECT_URI'),
        };
    }

    /**
     * Get the OAuth authorization URL for user consent
     */
    getAuthorizationUrl(scopes: string[]): string {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            response_type: 'code',
            scope: scopes.join(' '),
        });

        return `https://marketplace.gohighlevel.com/oauth/chooselocation?${params.toString()}`;
    }

    /**
     * Exchange authorization code for access token
     */
    async exchangeCodeForToken(code: string): Promise<GhlOAuthTokenResponse> {
        try {
            const response = await axios.post<GhlOAuthTokenResponse>(
                `${this.config.baseUrl}/oauth/token`,
                {
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: this.config.redirectUri,
                },
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                },
            );

            const tokenData = response.data;
            await this.storeToken(tokenData);

            this.logger.log('Successfully exchanged authorization code for token');
            return tokenData;
        } catch (error) {
            this.logger.error('Failed to exchange authorization code:', error);
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshAccessToken(locationId?: string): Promise<GhlOAuthTokenResponse> {
        const targetLocationId = locationId || this.config.locationId;

        try {
            const storedToken = await this.prisma.ghlOAuthToken.findUnique({
                where: { locationId: targetLocationId },
            });

            if (!storedToken) {
                throw new Error(`No stored token found for location: ${targetLocationId}`);
            }

            const response = await axios.post<GhlOAuthTokenResponse>(
                `${this.config.baseUrl}/oauth/token`,
                {
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    grant_type: 'refresh_token',
                    refresh_token: storedToken.refreshToken,
                },
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                },
            );

            const tokenData = response.data;
            await this.storeToken(tokenData, targetLocationId);

            this.logger.log(`Successfully refreshed access token for location: ${targetLocationId}`);
            return tokenData;
        } catch (error) {
            this.logger.error(`Failed to refresh access token for location ${targetLocationId}:`, error);
            throw error;
        }
    }

    /**
     * Get valid access token (refreshing if needed)
     */
    async getValidAccessToken(locationId?: string): Promise<string> {
        const targetLocationId = locationId || this.config.locationId;

        const storedToken = await this.prisma.ghlOAuthToken.findUnique({
            where: { locationId: targetLocationId },
        });

        if (!storedToken) {
            throw new Error(
                `No OAuth token found for location: ${targetLocationId}. Please complete OAuth flow first.`,
            );
        }

        // Check if token is expired or will expire in the next 5 minutes
        const expiresAt = new Date(storedToken.expiresAt);
        const now = new Date();
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

        if (expiresAt <= fiveMinutesFromNow) {
            this.logger.debug('Access token expired or expiring soon, refreshing...');
            const newToken = await this.refreshAccessToken(targetLocationId);
            return newToken.access_token;
        }

        return storedToken.accessToken;
    }

    /**
     * Store OAuth token in database
     */
    private async storeToken(
        tokenData: GhlOAuthTokenResponse,
        locationId?: string,
    ): Promise<void> {
        const targetLocationId = locationId || tokenData.locationId || this.config.locationId;
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
        const scopes = tokenData.scope.split(' ');

        await this.prisma.ghlOAuthToken.upsert({
            where: { locationId: targetLocationId },
            update: {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt,
                scopes,
            },
            create: {
                locationId: targetLocationId,
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt,
                scopes,
            },
        });

        this.logger.debug(`Stored OAuth token for location: ${targetLocationId}`);
    }

    /**
     * Check if we have a valid token stored
     */
    async hasValidToken(locationId?: string): Promise<boolean> {
        const targetLocationId = locationId || this.config.locationId;

        try {
            const storedToken = await this.prisma.ghlOAuthToken.findUnique({
                where: { locationId: targetLocationId },
            });

            if (!storedToken) {
                return false;
            }

            // Token exists, it will be refreshed automatically if expired
            return true;
        } catch (error) {
            this.logger.error('Error checking token validity:', error);
            return false;
        }
    }

    /**
     * Revoke token (delete from storage)
     */
    async revokeToken(locationId?: string): Promise<void> {
        const targetLocationId = locationId || this.config.locationId;

        await this.prisma.ghlOAuthToken.deleteMany({
            where: { locationId: targetLocationId },
        });

        this.logger.log(`Revoked OAuth token for location: ${targetLocationId}`);
    }
}
