import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { GhlOAuthModule } from '../ghl-oauth.module';

describe('GhlOAuthController (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [GhlOAuthModule],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('GET /api/v1/integrations/crm/oauth/authorize', () => {
        it('should return authorization URL', async () => {
            const response = await request(app.getHttpServer())
                .get('/api/v1/integrations/crm/oauth/authorize');

            expect(response.status).toEqual(200);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(true);
            expect(response.body.data.authorizationUrl).toBeDefined();
        });
    });

    describe('GET /api/v1/integrations/crm/oauth/status', () => {
        it('should return token status', async () => {
            const response = await request(app.getHttpServer())
                .get('/api/v1/integrations/crm/oauth/status');

            expect(response.status).toEqual(200);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(true);
            expect(typeof response.body.data.hasValidToken).toBe('boolean');
        });
    });

    describe('GET /api/v1/integrations/crm/oauth/callback', () => {
        it('should return error when no code provided', async () => {
            const response = await request(app.getHttpServer())
                .get('/api/v1/integrations/crm/oauth/callback');

            expect(response.status).toEqual(400);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(false);
        });

        it('should handle OAuth error from provider', async () => {
            const response = await request(app.getHttpServer())
                .get('/api/v1/integrations/crm/oauth/callback')
                .query({ error: 'access_denied', error_description: 'User denied access' });

            expect(response.status).toEqual(400);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(false);
        });
    });
});
