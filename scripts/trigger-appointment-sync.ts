/**
 * Trigger a manual Phorest → GHL Appointments sync
 * Run: npx ts-node scripts/trigger-appointment-sync.ts
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SyncJobProducer } from '../src/queues/sync-job.producer';

async function main() {
    console.log('🚀 Starting manual Appointments sync...\n');

    // Bootstrap the NestJS app
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    });

    try {
        const syncProducer = app.get(SyncJobProducer);

        console.log('📅 Triggering Phorest → GHL Appointments sync...');
        const jobId = await syncProducer.triggerPhorestToGhlAppointmentsSync({ fullSync: true });

        console.log(`\n✅ Sync job queued successfully!`);
        console.log(`   Job ID: ${jobId}`);
        console.log(`\n📋 Monitor progress via Bull Board or application logs.`);

    } catch (error: any) {
        console.error('❌ Failed to trigger sync:', error.message);
        if (error.stack) console.error(error.stack);
    } finally {
        await app.close();
    }
}

main();
