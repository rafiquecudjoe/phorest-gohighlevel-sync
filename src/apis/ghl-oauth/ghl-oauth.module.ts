import { Module } from '@nestjs/common';
import { GhlOAuthController } from './ghl-oauth.controller';
import { GhlOAuthApiService } from './ghl-oauth.service';
import { GhlOAuthValidator } from './ghl-oauth.validator';
import { GohighlevelModule } from '../../integrations/gohighlevel/gohighlevel.module';

@Module({
    imports: [GohighlevelModule],
    controllers: [GhlOAuthController],
    providers: [GhlOAuthApiService, GhlOAuthValidator],
    exports: [GhlOAuthApiService],
})
export class GhlOAuthModule { }
