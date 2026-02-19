import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PhorestApiClient } from './phorest-api.client';

@Module({
    imports: [ConfigModule],
    providers: [PhorestApiClient],
    exports: [PhorestApiClient],
})
export class PhorestModule { }
