import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Initialize Prisma with pg adapter
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function check() {

    try {
        // Count local DB appointments
        const localCount = await prisma.phorestAppointment.count();
        const localSynced = await prisma.phorestAppointment.count({ where: { syncStatus: 'SYNCED' } });

        // Count entity mappings for appointments
        const mappingCount = await prisma.entityMapping.count({ where: { entityType: 'appointment' } });

        console.log('=== APPOINTMENT COUNTS ===');
        console.log('Local DB appointments:', localCount);
        console.log('Local DB synced:', localSynced);
        console.log('Entity mappings:', mappingCount);

        // Check if mappings > local (potential issue)
        if (mappingCount > localCount) {
            console.log('\n⚠️ WARNING: More mappings than local appointments!');
            console.log('Potential orphaned GHL appointments:', mappingCount - localCount);
        }

        // Recent sync runs
        const recentRuns = await prisma.syncRunSummary.findMany({
            where: { entityType: 'appointment' },
            orderBy: { startedAt: 'desc' },
            take: 5,
        });

        console.log('\n=== RECENT APPOINTMENT SYNC RUNS ===');
        recentRuns.forEach(r => {
            console.log(`${r.startedAt.toISOString()} - ${r.status}: ${r.totalRecords} total, ${r.successCount} success, ${r.failedCount} failed`);
        });

        // Check for duplicate GHL IDs in mappings
        const duplicateGhl = await prisma.$queryRaw`
            SELECT "ghl_id", COUNT(*) as count
            FROM "entity_mappings"
            WHERE "entity_type" = 'appointment'
            GROUP BY "ghl_id"
            HAVING COUNT(*) > 1
            LIMIT 10
        ` as any[];

        if (duplicateGhl.length > 0) {
            console.log('\n⚠️ DUPLICATE GHL IDs in mappings:');
            duplicateGhl.forEach((d: any) => console.log(`  GHL ID: ${d.ghl_id}, Count: ${d.count}`));
        }

    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

check().catch(console.error);

