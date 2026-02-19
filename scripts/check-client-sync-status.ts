/**
 * Quick script to check Phorest client sync status
 * Run with: npx ts-node scripts/check-client-sync-status.ts
 */

import { config } from 'dotenv';
config(); // Load .env file

import { PrismaClient } from '@prisma/client';

// @ts-ignore - Prisma 7 picks up DATABASE_URL from environment
const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Checking Phorest Client Sync Status...\n');

    // Get total counts by sync status
    const statusCounts = await prisma.phorestClient.groupBy({
        by: ['syncStatus'],
        _count: { syncStatus: true },
    });

    console.log('📊 Sync Status Summary:');
    console.log('========================');
    let total = 0;
    for (const status of statusCounts) {
        console.log(`  ${status.syncStatus || 'null'}: ${status._count.syncStatus}`);
        total += status._count.syncStatus;
    }
    console.log(`  TOTAL: ${total}\n`);

    // Get pending clients count
    const pendingCount = await prisma.phorestClient.count({
        where: { syncStatus: 'PENDING' },
    });

    const syncedCount = await prisma.phorestClient.count({
        where: { syncStatus: 'SYNCED' },
    });

    const failedCount = await prisma.phorestClient.count({
        where: { syncStatus: 'FAILED' },
    });

    console.log('📈 Quick Stats:');
    console.log('================');
    console.log(`  Pending: ${pendingCount} (${((pendingCount / total) * 100).toFixed(1)}%)`);
    console.log(`  Synced:  ${syncedCount} (${((syncedCount / total) * 100).toFixed(1)}%)`);
    console.log(`  Failed:  ${failedCount} (${((failedCount / total) * 100).toFixed(1)}%)`);
    console.log('');

    // Sample of pending clients
    if (pendingCount > 0) {
        console.log('📋 Sample of Pending Clients (first 10):');
        console.log('=========================================');
        const pendingClients = await prisma.phorestClient.findMany({
            where: { syncStatus: 'PENDING' },
            take: 10,
            select: {
                phorestId: true,
                firstName: true,
                lastName: true,
                email: true,
                createdAt: true,
            },
        });

        for (const client of pendingClients) {
            console.log(`  - ${client.firstName} ${client.lastName} (${client.phorestId})`);
        }
    }

    // Check entity mappings
    const mappedCount = await prisma.entityMapping.count({
        where: { entityType: 'client' },
    });

    console.log('\n🔗 Entity Mappings:');
    console.log('====================');
    console.log(`  Clients with GHL mapping: ${mappedCount}`);
    console.log(`  Clients without mapping:  ${total - mappedCount}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
