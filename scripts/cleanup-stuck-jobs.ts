/**
 * Cleanup Stuck/Stale Queue Jobs
 * 
 * This script removes jobs that are stuck in "running" state (active but not progressing)
 * 
 * Run: npx ts-node scripts/cleanup-stuck-jobs.ts
 */
import 'dotenv/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const QUEUE_NAMES = [
    'ghl-to-phorest-clients-queue',
    'phorest-to-ghl-appointments-queue',
    'phorest-to-ghl-bookings-queue',
    'phorest-to-ghl-checkins-queue',
    'phorest-to-ghl-loyalty-queue',
    'phorest-to-ghl-products-queue',
    'phorest-to-ghl-staff-queue',
    'phorest-to-ghl-client-updates-queue',
    'phorest-to-ghl-clients-queue',
    'sync-audit-queue',
    'ghl-webhooks-queue',
];

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🧹 CLEANUP STUCK QUEUE JOBS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

    let totalCleaned = 0;

    for (const queueName of QUEUE_NAMES) {
        const queue = new Queue(queueName, { connection });

        try {
            // Get active (running) jobs
            const activeJobs = await queue.getActive();
            
            // Get waiting jobs
            const waitingJobs = await queue.getWaiting();
            
            // Get delayed jobs
            const delayedJobs = await queue.getDelayed();

            const activeCount = activeJobs.length;
            const waitingCount = waitingJobs.length;
            const delayedCount = delayedJobs.length;

            if (activeCount > 0 || waitingCount > 0 || delayedCount > 0) {
                console.log(`📋 ${queueName}:`);
                console.log(`   Active (stuck): ${activeCount}`);
                console.log(`   Waiting: ${waitingCount}`);
                console.log(`   Delayed: ${delayedCount}`);

                // Remove stuck active jobs
                if (activeCount > 0) {
                    for (const job of activeJobs) {
                        console.log(`   🗑️  Removing stuck job: ${job.id} (${job.name})`);
                        await job.remove();
                        totalCleaned++;
                    }
                }

                // Optionally drain waiting jobs too
                // Uncomment if you want to clear the entire queue:
                // await queue.drain();
                
                console.log('');
            }
        } catch (error: any) {
            console.error(`   ❌ Error processing ${queueName}: ${error.message}`);
        }

        await queue.close();
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✅ Cleanup complete! Removed ${totalCleaned} stuck jobs.`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    await connection.quit();
    process.exit(0);
}

main().catch(async (error) => {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
});

