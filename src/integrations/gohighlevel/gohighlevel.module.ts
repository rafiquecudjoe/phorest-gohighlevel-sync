import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GhlApiClient } from './ghl-api.client';
import { GhlOAuthService } from './ghl-oauth.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
    imports: [ConfigModule],
    providers: [GhlApiClient, GhlOAuthService, PrismaService],
    exports: [GhlApiClient, GhlOAuthService],
})
export class GohighlevelModule { }
