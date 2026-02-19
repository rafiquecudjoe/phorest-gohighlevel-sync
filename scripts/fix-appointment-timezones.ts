/**
 * Fix Appointment Timezones
 * Corrects appointment timestamps that were incorrectly imported as UTC instead of EST
 * 
 * Run: npx ts-node scripts/fix-appointment-timezones.ts
 * 
 * Options:
 *   --dry-run    Preview changes without making database updates
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import moment from 'moment-timezone';

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TIMEZONE = process.env.APP_TIMEZONE || 'America/New_York';

// Initialize Prisma
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    console.log(`🔄 Correcting Appointment Timezones (Mapping local string to ${TIMEZONE})...\n`);
    if (DRY_RUN) console.log('🧪 DRY RUN MODE - No database changes will be made\n');

    // Get all appointments
    // We only need to fix those where the sync status might be SYNCED or PENDING
    // but the actual stored UTC value is exactly the Phorest local hour
    const appointments = await prisma.phorestAppointment.findMany({
        where: {
            deleted: false,
        },
        select: {
            id: true,
            phorestId: true,
            startTime: true,
            endTime: true,
            appointmentDate: true,
        }
    });

    console.log(`📋 Found ${appointments.length} appointments to check\n`);

    let updatedCount = 0;

    for (const apt of appointments) {
        // The goal is to take the original "local" hour and re-parse it with the correct timezone
        // Since we don't have the original string here, we assume the stored UTC value
        // represents the "local string" hour.

        const originalLocalHour = moment.utc(apt.startTime).format('HH:mm:ss.SSS');
        const originalLocalDate = moment.utc(apt.appointmentDate).format('YYYY-MM-DD');

        // Correctively parse this "local string" into the actual intended UTC time
        const correctedStartTime = moment.tz(`${originalLocalDate}T${originalLocalHour}`, TIMEZONE).toDate();

        // Do the same for end time (keep duration consistency)
        const durationMs = apt.endTime.getTime() - apt.startTime.getTime();
        const correctedEndTime = new Date(correctedStartTime.getTime() + durationMs);

        // Check if there is even a difference (to avoid redundant updates)
        if (correctedStartTime.getTime() === apt.startTime.getTime()) {
            continue;
        }

        updatedCount++;

        if (DRY_RUN) {
            console.log(`[DRY RUN] Correcting appointment ${apt.phorestId}:`);
            console.log(`  From: ${apt.startTime.toISOString()}`);
            console.log(`  To:   ${correctedStartTime.toISOString()} (${TIMEZONE})`);
        } else {
            await prisma.phorestAppointment.update({
                where: { id: apt.id },
                data: {
                    startTime: correctedStartTime,
                    endTime: correctedEndTime,
                    syncStatus: 'PENDING', // Force a re-sync to GHL
                }
            });
        }
    }

    if (!DRY_RUN) {
        console.log(`\n✅ Successfully corrected and marked ${updatedCount} appointments for re-sync.`);
    } else {
        console.log(`\n🧪 Dry run complete. Would have corrected ${updatedCount} appointments.`);
    }

    await prisma.$disconnect();
    await pool.end();
}

main().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});
