/**
 * Backfill Client Sync Status
 * Marks all clients with a lastStylistName as PENDING so they are synced to GHL
 * 
 * Run: npx ts-node scripts/backfill-client-sync-status.ts
 * 
 * Options:
 *   --dry-run    Preview changes without making database updates
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// Initialize Prisma
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    console.log('🔄 Backfilling Client Sync Status for Stylist Names...\n');
    if (DRY_RUN) console.log('🧪 DRY RUN MODE - No database changes will be made\n');

    // Find all clients who have a lastStylistName but are already marked as SYNCED
    // (meaning they might have been skipped in previous syncs)
    const clients = await prisma.phorestClient.findMany({
        where: {
            lastStylistName: { not: null },
            syncStatus: 'SYNCED',
        },
        select: {
            phorestId: true,
            firstName: true,
            lastName: true,
            lastStylistName: true,
        },
    });

    console.log(`📋 Found ${clients.length} synced clients with stylist names that need a push\n`);

    if (clients.length === 0) {
        console.log('✅ Nothing to backfill.');
        return;
    }

    if (DRY_RUN) {
        console.log(`[DRY RUN] Would mark ${clients.length} clients as PENDING`);
    } else {
        const result = await prisma.phorestClient.updateMany({
            where: {
                lastStylistName: { not: null },
                syncStatus: 'SYNCED',
            },
            data: {
                syncStatus: 'PENDING',
            },
        });
        console.log(`✅ Successfully marked ${result.count} clients as PENDING`);
    }

    console.log('\n🚀 Done! Next time you run a client sync, these contacts will be updated in GHL.');

    await prisma.$disconnect();
    await pool.end();
}

main().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});
