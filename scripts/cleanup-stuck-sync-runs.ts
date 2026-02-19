/**
 * Cleanup Stuck Sync Runs in Database
 * 
 * Marks sync runs that are stuck in "running" state as "failed"
 * 
 * Run: npx ts-node scripts/cleanup-stuck-sync-runs.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    console.log('🧹 Cleaning up stuck sync runs...\n');

    // Find stuck runs (status = 'running' for more than 10 minutes)
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);

    const stuckRuns = await prisma.syncRunSummary.findMany({
        where: {
            status: 'running',
            startedAt: { lt: tenMinsAgo }
        },
        orderBy: { startedAt: 'desc' }
    });

    console.log(`📋 Found ${stuckRuns.length} stuck sync runs:\n`);

    for (const run of stuckRuns) {
        console.log(`   - ${run.entityType} (${run.direction}) started ${run.startedAt.toISOString()}`);
    }

    if (stuckRuns.length === 0) {
        console.log('✅ No stuck runs found!');
        await prisma.$disconnect();
        await pool.end();
        return;
    }

    // Mark them as failed
    const result = await prisma.syncRunSummary.updateMany({
        where: {
            status: 'running',
            startedAt: { lt: tenMinsAgo }
        },
        data: {
            status: 'failed',
            lastError: 'Marked as failed - job was stuck/abandoned',
            completedAt: new Date()
        }
    });

    console.log(`\n✅ Updated ${result.count} stuck runs to 'failed' status`);

    await prisma.$disconnect();
    await pool.end();
}

main().catch(async (error) => {
    console.error('❌ Cleanup failed:', error.message);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
});

