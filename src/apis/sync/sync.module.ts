import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncValidator } from './sync.validator';
import { SyncModule } from '../../sync/sync.module';

@Module({
    imports: [SyncModule],
    controllers: [SyncController],
    providers: [SyncService, SyncValidator],
    exports: [SyncService],
})
export class SyncApiModule { }
