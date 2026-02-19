/**
 * Cleanup Orphaned GHL Appointments
 * 
 * This script deletes GHL appointments that have no corresponding mapping in the local DB.
 * These are typically duplicates created by retry scripts or failed syncs.
 * 
 * Run with --dry-run to preview: npx ts-node scripts/cleanup-orphaned-appointments.ts --dry-run
 * Run for real:                  npx ts-node scripts/cleanup-orphaned-appointments.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const GHL_BASE_URL = process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const GHL_CALENDAR_ID = process.env.GHL_DEFAULT_CALENDAR_ID!;

const DRY_RUN = process.argv.includes('--dry-run');

interface GhlEvent {
    id: string;
    title?: string;
    startTime: string;
    endTime: string;
    contactId?: string;
}

async function getGhlToken(): Promise<string> {
    const token = await prisma.ghlOAuthToken.findUnique({
        where: { locationId: GHL_LOCATION_ID }
    });
    if (!token) throw new Error('No GHL token found');
    return token.accessToken;
}

async function fetchAllGhlAppointments(token: string): Promise<GhlEvent[]> {
    const now = Date.now();
    const startTime = now - (365 * 24 * 60 * 60 * 1000);
    const endTime = now + (365 * 24 * 60 * 60 * 1000);

    const response = await axios.get(`${GHL_BASE_URL}/calendars/events`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Version': '2021-04-15',
        },
        params: {
            locationId: GHL_LOCATION_ID,
            calendarId: GHL_CALENDAR_ID,
            startTime,
            endTime,
        }
    });

    return response.data?.events || [];
}

async function deleteGhlAppointment(token: string, appointmentId: string): Promise<boolean> {
    try {
        await axios.delete(`${GHL_BASE_URL}/calendars/events/${appointmentId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Version': '2021-04-15',
            }
        });
        return true;
    } catch (error: any) {
        if (error.response?.status === 404) {
            return true; // Already deleted
        }
        console.error(`   ❌ Failed to delete ${appointmentId}: ${error.message}`);
        return false;
    }
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🧹 CLEANUP ORPHANED GHL APPOINTMENTS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (DRY_RUN) {
        console.log('🔍 DRY RUN MODE - No changes will be made\n');
    } else {
        console.log('⚠️  LIVE MODE - Appointments will be DELETED\n');
    }

    const token = await getGhlToken();

    // Step 1: Fetch all GHL appointments
    console.log('📡 Fetching all GHL appointments...');
    const ghlAppointments = await fetchAllGhlAppointments(token);
    console.log(`   Found ${ghlAppointments.length} appointments in GHL\n`);

    // Step 2: Get all appointment mappings
    console.log('🔗 Fetching entity mappings...');
    const mappings = await prisma.entityMapping.findMany({
        where: { entityType: 'appointment' }
    });
    const mappedGhlIds = new Set(mappings.map(m => m.ghlId));
    console.log(`   Found ${mappings.length} appointment mappings\n`);

    // Step 3: Find orphaned appointments
    const orphaned = ghlAppointments.filter(apt => !mappedGhlIds.has(apt.id));
    console.log(`👻 Found ${orphaned.length} orphaned appointments to delete\n`);

    if (orphaned.length === 0) {
        console.log('✅ No orphaned appointments found. Nothing to clean up.');
        await prisma.$disconnect();
        await pool.end();
        return;
    }

    // Step 4: Group by duplicate pattern (same time + contact)
    const duplicateGroups: Record<string, GhlEvent[]> = {};
    for (const apt of orphaned) {
        const key = `${apt.startTime}_${apt.contactId || 'nocontact'}`;
        if (!duplicateGroups[key]) duplicateGroups[key] = [];
        duplicateGroups[key].push(apt);
    }

    const duplicateSets = Object.entries(duplicateGroups).filter(([, g]) => g.length > 1);
    const singleOrphans = Object.entries(duplicateGroups).filter(([, g]) => g.length === 1);

    console.log(`📊 Breakdown:`);
    console.log(`   - Duplicate orphans (in sets): ${duplicateSets.reduce((s, [, g]) => s + g.length, 0)}`);
    console.log(`   - Single orphans: ${singleOrphans.length}\n`);

    // Step 5: Delete orphaned appointments
    let deleted = 0;
    let failed = 0;

    if (!DRY_RUN) {
        console.log('🗑️  Deleting orphaned appointments...\n');

        for (let i = 0; i < orphaned.length; i++) {
            const apt = orphaned[i];
            process.stdout.write(`   [${i + 1}/${orphaned.length}] Deleting ${apt.id}...`);

            const success = await deleteGhlAppointment(token, apt.id);
            if (success) {
                deleted++;
                console.log(' ✓');
            } else {
                failed++;
                console.log(' ✗');
            }

            // Rate limiting
            await sleep(100);

            // Progress update every 50
            if ((i + 1) % 50 === 0) {
                console.log(`   📊 Progress: ${deleted} deleted, ${failed} failed`);
            }
        }
    } else {
        console.log('📋 Orphaned appointments that would be deleted:\n');
        for (const apt of orphaned.slice(0, 20)) {
            console.log(`   - ${apt.id} | ${apt.title} | ${apt.startTime}`);
        }
        if (orphaned.length > 20) {
            console.log(`   ... and ${orphaned.length - 20} more`);
        }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📝 CLEANUP SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (DRY_RUN) {
        console.log(`   🔍 DRY RUN - Would delete ${orphaned.length} orphaned appointments`);
        console.log(`\n   Run without --dry-run to actually delete them.`);
    } else {
        console.log(`   ✅ Deleted: ${deleted}`);
        console.log(`   ❌ Failed: ${failed}`);
        console.log(`\n   GHL appointments should now match entity mappings.`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');

    await prisma.$disconnect();
    await pool.end();
}

main().catch(async (error) => {
    console.error('❌ Cleanup failed:', error.message);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
});

