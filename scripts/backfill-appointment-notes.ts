/**
 * Backfill Appointment Notes with Stylist Name
 * Updates all synced GHL appointments to include the stylist first name in notes
 * 
 * Run: npx ts-node scripts/backfill-appointment-notes.ts
 * 
 * Options:
 *   --dry-run    Preview changes without making API calls
 *   --limit=N    Limit to N appointments
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

// Initialize Prisma
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const GHL_BASE_URL = process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;

async function getGhlToken(): Promise<string> {
    const token = await prisma.ghlOAuthToken.findUnique({ where: { locationId: GHL_LOCATION_ID } });
    if (!token) throw new Error('No GHL token found');
    return token.accessToken;
}

async function main() {
    console.log('🔄 Backfilling Appointment Notes with Stylist Names...\n');
    if (DRY_RUN) console.log('🧪 DRY RUN MODE - No API calls will be made\n');
    if (LIMIT > 0) console.log(`📊 Limited to ${LIMIT} appointments\n`);

    const token = await getGhlToken();

    // Get all synced appointments that have a GHL event ID and a staff ID
    const appointments = await prisma.phorestAppointment.findMany({
        where: {
            ghlEventId: { not: null },
            staffId: { not: null },
            syncStatus: 'SYNCED',
        },
        select: {
            phorestId: true,
            ghlEventId: true,
            staffId: true,
            serviceName: true,
        },
        take: LIMIT > 0 ? LIMIT : undefined,
    });

    console.log(`📋 Found ${appointments.length} synced appointments with staff\n`);

    // Get all staff in one query for efficiency
    const staffIds = [...new Set(appointments.map(a => a.staffId!))];
    const staffRecords = await prisma.phorestStaff.findMany({
        where: { phorestId: { in: staffIds } },
        select: { phorestId: true, firstName: true },
    });
    const staffMap = new Map(staffRecords.map(s => [s.phorestId, s.firstName]));

    console.log(`👥 Found ${staffRecords.length} staff members\n`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const apt of appointments) {
        const staffName = staffMap.get(apt.staffId!);

        if (!staffName) {
            console.log(`⏭️  Skipped ${apt.phorestId} - no staff name found`);
            skipped++;
            continue;
        }

        if (DRY_RUN) {
            console.log(`[DRY RUN] Would update ${apt.ghlEventId} → notes: "${staffName}"`);
            updated++;
            continue;
        }

        try {
            await axios.put(
                `${GHL_BASE_URL}/calendars/events/${apt.ghlEventId}`,
                { notes: staffName },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Version': '2021-04-15',
                        'Content-Type': 'application/json',
                    },
                }
            );
            console.log(`✅ Updated ${apt.ghlEventId} → notes: "${staffName}"`);
            updated++;

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 100));
        } catch (error: any) {
            const msg = error.response?.data?.message || error.message;
            console.error(`❌ Failed ${apt.ghlEventId}: ${msg}`);
            failed++;
        }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log(`📊 Summary:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log('═══════════════════════════════════════════\n');

    await prisma.$disconnect();
    await pool.end();
}

main().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});
