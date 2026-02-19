/**
 * Investigate Appointment Discrepancy: GHL vs Phorest/Local DB
 * 
 * This script analyzes why there are more appointments in GHL than in Phorest/Local DB
 * 
 * Run: npx ts-node scripts/investigate-appointment-discrepancy.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';

// Initialize Prisma
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const GHL_BASE_URL = process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const GHL_CALENDAR_ID = process.env.GHL_DEFAULT_CALENDAR_ID!;

interface GhlEvent {
    id: string;
    title?: string;
    startTime: string;
    endTime: string;
    contactId?: string;
    calendarId: string;
    status?: string;
    dateAdded?: string;
    notes?: string;
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
    // Query a wider range to capture all appointments
    const startTime = now - (365 * 24 * 60 * 60 * 1000); // 1 year ago
    const endTime = now + (365 * 24 * 60 * 60 * 1000); // 1 year ahead

    console.log(`📡 Fetching GHL appointments from ${new Date(startTime).toISOString().split('T')[0]} to ${new Date(endTime).toISOString().split('T')[0]}...`);

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

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔍 APPOINTMENT DISCREPANCY INVESTIGATION');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const token = await getGhlToken();

    // ============ STEP 1: Get Counts ============
    console.log('📊 STEP 1: Gathering Counts\n');

    // Count in local DB (PhorestAppointment table)
    const localAppointments = await prisma.phorestAppointment.findMany({
        select: {
            id: true,
            phorestId: true,
            serviceName: true,
            startTime: true,
            clientId: true,
            syncStatus: true,
            ghlEventId: true,
        }
    });
    console.log(`   📋 Local DB (PhorestAppointment): ${localAppointments.length} records`);

    // Count sync status breakdown
    const syncStatusCounts = localAppointments.reduce((acc, apt) => {
        acc[apt.syncStatus] = (acc[apt.syncStatus] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    console.log(`   📈 Sync Status Breakdown:`);
    for (const [status, count] of Object.entries(syncStatusCounts)) {
        console.log(`      - ${status}: ${count}`);
    }

    // Count entity mappings for appointments
    const appointmentMappings = await prisma.entityMapping.findMany({
        where: { entityType: 'appointment' }
    });
    console.log(`   🔗 Entity Mappings (appointment): ${appointmentMappings.length} records`);

    // Fetch GHL appointments
    const ghlAppointments = await fetchAllGhlAppointments(token);
    console.log(`   📅 GHL Appointments: ${ghlAppointments.length} records`);

    // ============ STEP 2: Discrepancy Analysis ============
    console.log('\n📊 STEP 2: Discrepancy Analysis\n');

    const discrepancy = ghlAppointments.length - appointmentMappings.length;
    console.log(`   🔢 Discrepancy: ${discrepancy} (GHL: ${ghlAppointments.length} - Mappings: ${appointmentMappings.length})`);

    if (discrepancy > 0) {
        console.log(`   ⚠️  There are ${discrepancy} MORE appointments in GHL than we have mappings for`);
    } else if (discrepancy < 0) {
        console.log(`   ⚠️  There are ${Math.abs(discrepancy)} FEWER appointments in GHL than we have mappings for`);
    } else {
        console.log(`   ✅ Counts match!`);
    }

    // ============ STEP 3: Find Orphaned GHL Appointments ============
    console.log('\n📊 STEP 3: Finding Orphaned GHL Appointments\n');

    // Create a Set of all mapped GHL IDs
    const mappedGhlIds = new Set(appointmentMappings.map(m => m.ghlId));

    // Find GHL appointments that don't have a mapping
    const orphanedGhlAppointments = ghlAppointments.filter(apt => !mappedGhlIds.has(apt.id));

    console.log(`   👻 Orphaned GHL Appointments (no mapping): ${orphanedGhlAppointments.length}`);

    if (orphanedGhlAppointments.length > 0) {
        console.log(`\n   📋 Sample of orphaned appointments (first 10):`);
        for (const apt of orphanedGhlAppointments.slice(0, 10)) {
            console.log(`      - ID: ${apt.id}`);
            console.log(`        Title: ${apt.title || 'N/A'}`);
            console.log(`        Start: ${apt.startTime}`);
            console.log(`        Contact: ${apt.contactId || 'N/A'}`);
            console.log(`        Status: ${apt.status || 'N/A'}`);
            console.log('');
        }
    }

    // ============ STEP 4: Find Duplicate Patterns ============
    console.log('\n📊 STEP 4: Analyzing Duplicate Patterns\n');

    // Group GHL appointments by startTime + contactId to find potential duplicates
    const duplicateGroups: Record<string, GhlEvent[]> = {};
    for (const apt of ghlAppointments) {
        const key = `${apt.startTime}_${apt.contactId || 'nocontact'}`;
        if (!duplicateGroups[key]) duplicateGroups[key] = [];
        duplicateGroups[key].push(apt);
    }

    const duplicateSets = Object.entries(duplicateGroups)
        .filter(([, group]) => group.length > 1)
        .sort((a, b) => b[1].length - a[1].length);

    console.log(`   🔄 Potential Duplicate Sets (same time + contact): ${duplicateSets.length}`);

    if (duplicateSets.length > 0) {
        console.log(`\n   📋 Top 5 Duplicate Sets:`);
        for (const [key, group] of duplicateSets.slice(0, 5)) {
            console.log(`\n      Key: ${key} (${group.length} duplicates)`);
            for (const apt of group) {
                const isMapped = mappedGhlIds.has(apt.id) ? '✓ MAPPED' : '✗ ORPHAN';
                console.log(`         - ${apt.id} | ${apt.title} | ${isMapped}`);
            }
        }
    }

    // ============ STEP 5: Check for Missing Mappings in Local DB ============
    console.log('\n📊 STEP 5: Local DB Records Without GHL Mapping\n');

    const localWithGhlId = localAppointments.filter(a => a.ghlEventId);
    const localWithoutGhlId = localAppointments.filter(a => !a.ghlEventId);
    const syncedWithMapping = localAppointments.filter(a => a.syncStatus === 'SYNCED');

    console.log(`   📋 Local records with ghlEventId column set: ${localWithGhlId.length}`);
    console.log(`   📋 Local records without ghlEventId: ${localWithoutGhlId.length}`);
    console.log(`   📋 Local records with SYNCED status: ${syncedWithMapping.length}`);

    // ============ STEP 6: Cross-Reference Analysis ============
    console.log('\n📊 STEP 6: Cross-Reference Analysis\n');

    // Check mappings that point to non-existent GHL appointments
    const ghlIdSet = new Set(ghlAppointments.map(a => a.id));
    const staleGhlMappings = appointmentMappings.filter(m => !ghlIdSet.has(m.ghlId));
    console.log(`   🗑️  Stale mappings (GHL appointment deleted): ${staleGhlMappings.length}`);

    // Check mappings that point to non-existent Phorest appointments
    const phorestIdSet = new Set(localAppointments.map(a => a.phorestId));
    const stalePhorestMappings = appointmentMappings.filter(m => !phorestIdSet.has(m.phorestId));
    console.log(`   🗑️  Stale mappings (Phorest appointment not in local DB): ${stalePhorestMappings.length}`);

    // ============ STEP 7: Date Analysis ============
    console.log('\n📊 STEP 7: GHL Appointment Creation Date Analysis\n');

    // Group by date added (if available) or by start date
    const appointmentsByDate: Record<string, number> = {};
    for (const apt of ghlAppointments) {
        const date = apt.startTime?.split('T')[0] || 'unknown';
        appointmentsByDate[date] = (appointmentsByDate[date] || 0) + 1;
    }

    // Show dates with most appointments (potential batch sync dates)
    const sortedDates = Object.entries(appointmentsByDate)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    console.log(`   📅 Top 10 dates by appointment count:`);
    for (const [date, count] of sortedDates) {
        console.log(`      ${date}: ${count} appointments`);
    }

    // ============ STEP 8: Recommendations ============
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📝 INVESTIGATION SUMMARY & RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`   📊 Summary:`);
    console.log(`      - GHL Appointments: ${ghlAppointments.length}`);
    console.log(`      - Entity Mappings: ${appointmentMappings.length}`);
    console.log(`      - Local DB Records: ${localAppointments.length}`);
    console.log(`      - Orphaned in GHL: ${orphanedGhlAppointments.length}`);
    console.log(`      - Duplicate Sets: ${duplicateSets.length}`);

    console.log(`\n   🔍 Likely Causes:`);

    if (orphanedGhlAppointments.length > 0) {
        console.log(`      1. ⚠️  ${orphanedGhlAppointments.length} orphaned appointments in GHL`);
        console.log(`         - These were created in GHL but mapping was lost or never saved`);
        console.log(`         - Could be from: retry script, failed syncs, or manual creation`);
    }

    if (duplicateSets.length > 0) {
        const totalDuplicates = duplicateSets.reduce((sum, [, group]) => sum + group.length - 1, 0);
        console.log(`      2. ⚠️  ${totalDuplicates} duplicate appointments detected`);
        console.log(`         - Same time + same contact = likely duplicate sync`);
        console.log(`         - Could be from: retry-failed-appointments.ts deleting mappings`);
    }

    if (staleGhlMappings.length > 0) {
        console.log(`      3. ⚠️  ${staleGhlMappings.length} stale mappings (GHL appointments deleted)`);
    }

    console.log(`\n   🛠️  Recommended Actions:`);
    console.log(`      1. Run cleanup script to delete orphaned GHL appointments`);
    console.log(`      2. Review and fix retry-failed-appointments.ts logic`);
    console.log(`      3. Add idempotency checks before creating GHL appointments`);
    console.log(`      4. Clean up duplicate appointments in GHL`);

    // Export orphaned IDs for cleanup
    if (orphanedGhlAppointments.length > 0) {
        console.log(`\n   💾 Exporting orphaned appointment IDs...`);
        const orphanedIds = orphanedGhlAppointments.map(a => a.id);
        console.log(`\n   Orphaned GHL Appointment IDs (for cleanup):`);
        console.log(`   ${JSON.stringify(orphanedIds.slice(0, 50), null, 2)}`);
        if (orphanedIds.length > 50) {
            console.log(`   ... and ${orphanedIds.length - 50} more`);
        }
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');

    await prisma.$disconnect();
    await pool.end();
}

main().catch(async (error) => {
    console.error('❌ Investigation failed:', error.message);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
});

