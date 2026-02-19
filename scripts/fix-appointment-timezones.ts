import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import moment from 'moment-timezone';
import pLimit from 'p-limit';

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TIMEZONE = process.env.APP_TIMEZONE || 'America/New_York';
const CONCURRENCY = 20;

// Initialize Prisma
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    console.log(`🔄 Correcting Appointment Timezones (Mapping local string to ${TIMEZONE})...\n`);
    if (DRY_RUN) console.log('🧪 DRY RUN MODE - No database changes will be made\n');

    const appointments = await prisma.phorestAppointment.findMany({
        where: { deleted: false },
        select: { id: true, phorestId: true, startTime: true, endTime: true, appointmentDate: true }
    });

    console.log(`📋 Found ${appointments.length} appointments to process`);
    const limit = pLimit(CONCURRENCY);
    let updatedCount = 0;
    let processedCount = 0;

    const tasks = appointments.map((apt) => limit(async () => {
        const originalLocalHour = moment.utc(apt.startTime).format('HH:mm:ss.SSS');
        const originalLocalDate = moment.utc(apt.appointmentDate).format('YYYY-MM-DD');

        const correctedStartTime = moment.tz(`${originalLocalDate}T${originalLocalHour}`, TIMEZONE).toDate();
        const durationMs = apt.endTime.getTime() - apt.startTime.getTime();
        const correctedEndTime = new Date(correctedStartTime.getTime() + durationMs);

        processedCount++;
        if (processedCount % 500 === 0) {
            console.log(`⏳ Progress: ${processedCount}/${appointments.length} checked...`);
        }

        // Use a 1-second threshold to avoid floating point or slight DB precision mismatches
        if (Math.abs(correctedStartTime.getTime() - apt.startTime.getTime()) > 1000) {
            updatedCount++;
            if (!DRY_RUN) {
                await prisma.phorestAppointment.update({
                    where: { id: apt.id },
                    data: {
                        startTime: correctedStartTime,
                        endTime: correctedEndTime,
                        syncStatus: 'PENDING',
                    }
                });
            }
        }
    }));

    await Promise.all(tasks);

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
