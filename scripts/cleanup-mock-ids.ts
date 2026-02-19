import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function cleanupMockIds() {
    console.log('🧹 Starting cleanup of mock IDs from Dry Run...');

    try {
        // 1. Delete EntityMappings with mock IDs
        const deletedMappings = await prisma.entityMapping.deleteMany({
            where: {
                ghlId: {
                    startsWith: 'mock-',
                },
            },
        });
        console.log(`✅ Deleted ${deletedMappings.count} mock mappings from EntityMapping table.`);

        // 2. Clear ghlContactId from PhorestClient where it starts with mock-
        const updatedClients = await prisma.phorestClient.updateMany({
            where: {
                ghlContactId: {
                    startsWith: 'mock-',
                },
            },
            data: {
                ghlContactId: null,
                syncStatus: 'PENDING', // Reset status so it tries to sync again
                lastSyncedAt: null,
            },
        });
        console.log(`✅ Reset ${updatedClients.count} clients with mock IDs in PhorestClient table.`);

        // 3. Clear ghlEventId from PhorestAppointment where it starts with mock-
        const updatedAppointments = await prisma.phorestAppointment.updateMany({
            where: {
                ghlEventId: {
                    startsWith: 'mock-',
                },
            },
            data: {
                ghlEventId: null,
                syncStatus: 'PENDING',
                lastSyncedAt: null,
            },
        });
        console.log(`✅ Reset ${updatedAppointments.count} appointments with mock IDs in PhorestAppointment table.`);

        // 4. Delete SyncLog entries with mock-related errors (clears dashboard errors)
        const deletedLogs = await prisma.syncLog.deleteMany({
            where: {
                OR: [
                    { entityId: { startsWith: 'mock-' } },
                    { errorMessage: { contains: 'mock-' } },
                ],
            },
        });
        console.log(`✅ Deleted ${deletedLogs.count} mock-related error entries from SyncLog table.`);

        console.log('🎉 Cleanup complete! Dashboard should now be free of mock errors.');
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

cleanupMockIds();
