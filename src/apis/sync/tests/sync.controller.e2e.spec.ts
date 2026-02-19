import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SyncApiModule } from '../sync.module';

describe('SyncController (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [SyncApiModule],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('GET /api/v1/sync/status', () => {
        it('should return sync status', async () => {
            const response = await request(app.getHttpServer())
                .get('/api/v1/sync/status');

            expect(response.status).toEqual(200);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(true);
            expect(response.body.data.queueStatus).toBeDefined();
        });
    });

    describe('POST /api/v1/sync/clients/ghl-to-phorest', () => {
        it('should trigger client sync job', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/sync/clients/ghl-to-phorest');

            expect(response.status).toEqual(200);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(true);
            expect(response.body.data.jobId).toBeDefined();
        });
    });

    describe('POST /api/v1/sync/appointments/phorest-to-ghl', () => {
        it('should trigger appointment sync job', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/sync/appointments/phorest-to-ghl');

            expect(response.status).toEqual(200);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(true);
            expect(response.body.data.jobId).toBeDefined();
        });
    });

    describe('POST /api/v1/sync/pause', () => {
        it('should pause sync queue', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/sync/pause');

            expect(response.status).toEqual(200);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(true);
        });
    });

    describe('POST /api/v1/sync/resume', () => {
        it('should resume sync queue', async () => {
            const response = await request(app.getHttpServer())
                .post('/api/v1/sync/resume');

            expect(response.status).toEqual(200);
            expect(response.body).toBeDefined();
            expect(response.body.success).toBe(true);
        });
    });
});
