import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { WebhooksModule } from '../webhooks.module';

describe('GhlWebhooksController (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [WebhooksModule],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /api/v1/webhooks/ghl', () => {
        it('should accept valid webhook and queue it', async () => {
            // Note: This test requires GHL_LOCATION_ID to be set correctly
            const validPayload = {
                type: 'ContactCreate',
                locationId: process.env.GHL_LOCATION_ID || 'test-location',
                id: 'test-contact-id-123',
            };

            const response = await request(app.getHttpServer())
                .post('/api/v1/webhooks/ghl')
                .send(validPayload);

            // Always returns 200 to acknowledge receipt
            expect(response.status).toEqual(200);
            expect(response.body).toBeDefined();
        });

        it('should handle missing payload gracefully', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/webhooks/ghl')
                .send({});

            expect(response.status).toEqual(200);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(false);
        });

        it('should handle invalid locationId', async () => {
            const invalidPayload = {
                type: 'ContactCreate',
                locationId: 'invalid-location-id',
                id: 'test-contact-id',
            };

            const response = await request(app.getHttpServer())
                .post('/api/v1/webhooks/ghl')
                .send(invalidPayload);

            expect(response.status).toEqual(200);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Unauthorized');
        });
    });

    describe('GET /api/v1/webhooks/ghl/status', () => {
        it('should return queue status', async () => {
            const response = await request(app.getHttpServer())
                .get('/api/v1/webhooks/ghl/status');

            expect(response.status).toEqual(200);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeDefined();
            expect(typeof response.body.data.waiting).toBe('number');
            expect(typeof response.body.data.active).toBe('number');
        });
    });
});
