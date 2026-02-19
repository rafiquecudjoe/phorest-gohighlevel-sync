import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { GhlOAuthApiService } from '../ghl-oauth.service';
import { GhlOAuthValidator } from '../ghl-oauth.validator';
import { GohighlevelModule } from '../../../integrations/gohighlevel/gohighlevel.module';

describe('GhlOAuthApiService', () => {
    let module: TestingModule;
    let service: GhlOAuthApiService;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                GohighlevelModule,
            ],
            providers: [GhlOAuthApiService, GhlOAuthValidator],
        }).compile();

        service = module.get<GhlOAuthApiService>(GhlOAuthApiService);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getAuthorizationUrl', () => {
        it('should return authorization URL', async () => {
            const result = await service.getAuthorizationUrl();

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.status).toBe(200);
            expect(result.data?.authorizationUrl).toBeDefined();
            expect(result.data?.authorizationUrl).toContain('oauth/chooselocation');
        });
    });

    describe('getTokenStatus', () => {
        it('should return token status', async () => {
            const result = await service.getTokenStatus();

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.status).toBe(200);
            expect(typeof result.data?.hasValidToken).toBe('boolean');
        });
    });

    describe('handleCallback', () => {
        it('should return error when OAuth provider returns error', async () => {
            const result = await service.handleCallback(
                undefined,
                'access_denied',
                'User denied access',
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(false);
            expect(result.status).toBe(400);
            expect(result.data?.error).toBe('access_denied');
        });

        it('should return error when no code is provided', async () => {
            const result = await service.handleCallback(undefined);

            expect(result).toBeDefined();
            expect(result.success).toBe(false);
        });
    });
});
