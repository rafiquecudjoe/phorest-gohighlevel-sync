import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';

// Initialize Prisma with pg adapter
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-04-15';

interface CheckinComparison {
    phorestAppointmentId: string;
    ghlContactId: string;
    checkinTime: string | null;
    hasNoteInGhl: boolean;
    noteContent?: string;
}

async function getGhlToken(): Promise<string> {
    const token = await prisma.ghlOAuthToken.findFirst({
        where: { locationId: process.env.GHL_LOCATION_ID },
    });
    if (!token) throw new Error('No GHL token found');
    return token.accessToken;
}

async function getContactNotes(contactId: string, token: string): Promise<any[]> {
    try {
        const response = await axios.get(`${GHL_API_BASE}/contacts/${contactId}/notes`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Version: GHL_API_VERSION,
            },
        });
        return response.data.notes || [];
    } catch (error: any) {
        if (error.response?.status === 404) {
            return [];
        }
        throw error;
    }
}

async function main() {
    console.log('📊 CHECKIN NOTES COMPARISON: Local DB vs GHL\n');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Get all checkin mappings from local DB
    const checkinMappings = await prisma.entityMapping.findMany({
        where: { entityType: 'checkin' },
        orderBy: { createdAt: 'desc' },
        take: 50, // Sample last 50
    });

    console.log(`📁 Total checkin mappings in DB: ${await prisma.entityMapping.count({ where: { entityType: 'checkin' } })}`);
    console.log(`🔍 Checking last ${checkinMappings.length} check-ins...\n`);

    const token = await getGhlToken();

    let matched = 0;
    let missing = 0;
    let errors = 0;
    const missingDetails: CheckinComparison[] = [];

    for (let i = 0; i < checkinMappings.length; i++) {
        const mapping = checkinMappings[i];
        const metadata = mapping.metadata as any;

        process.stdout.write(`\rChecking ${i + 1}/${checkinMappings.length}...`);

        try {
            const notes = await getContactNotes(mapping.ghlId, token);

            // Check if any note contains the Phorest appointment ID
            const hasCheckinNote = notes.some((note: any) =>
                note.body?.includes(mapping.phorestId) ||
                note.body?.includes('Checked in')
            );

            if (hasCheckinNote) {
                matched++;
            } else {
                missing++;
                missingDetails.push({
                    phorestAppointmentId: mapping.phorestId,
                    ghlContactId: mapping.ghlId,
                    checkinTime: metadata?.checkinTime || null,
                    hasNoteInGhl: false,
                });
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error: any) {
            errors++;
            console.error(`\nError checking ${mapping.phorestId}: ${error.message}`);
        }
    }

    console.log('\n\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✅ Matched (note exists in GHL): ${matched}`);
    console.log(`⚠️  Missing (no note in GHL): ${missing}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('');

    if (missingDetails.length > 0) {
        console.log('📋 Missing check-in notes (first 10):');
        console.log('───────────────────────────────────────────────────────────────');
        missingDetails.slice(0, 10).forEach(item => {
            console.log(`  Phorest Apt: ${item.phorestAppointmentId}`);
            console.log(`  GHL Contact: ${item.ghlContactId}`);
            console.log(`  Check-in Time: ${item.checkinTime || 'N/A'}`);
            console.log('  ---');
        });
    }

    // Also show local DB stats
    console.log('\n📁 LOCAL DB STATS:');
    console.log('───────────────────────────────────────────────────────────────');

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const checkedInCount = await prisma.phorestAppointment.count({
        where: {
            state: { in: ['CHECKED_IN', 'PAID'] },
            appointmentDate: { gte: sevenDaysAgo },
            deleted: false,
        },
    });

    const checkinMappingCount = await prisma.entityMapping.count({
        where: { entityType: 'checkin' },
    });

    console.log(`  Checked-in appointments (7 days): ${checkedInCount}`);
    console.log(`  Checkin mappings: ${checkinMappingCount}`);

    if (checkinMappingCount >= checkedInCount) {
        console.log(`  ✅ All recent check-ins have mappings`);
    } else {
        console.log(`  ⚠️  ${checkedInCount - checkinMappingCount} check-ins without mappings`);
    }

    await prisma.$disconnect();
    await pool.end();
}

main().catch(console.error);

