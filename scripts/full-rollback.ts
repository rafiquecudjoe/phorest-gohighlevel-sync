/**
 * FULL GHL Rollback: Delete ALL contacts and appointments
 * 
 * ⚠️  WARNING: This will delete ALL data from GHL for this location!
 * 
 * Run: npx ts-node scripts/full-rollback.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const GHL_BASE_URL = process.env.GHL_API_BASE_URL!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getToken(): Promise<string> {
    const token = await prisma.ghlOAuthToken.findFirst();
    if (!token?.accessToken) throw new Error('No GHL token found');
    return token.accessToken;
}

async function deleteAllAppointments(token: string) {
    console.log('\n📅 DELETING ALL APPOINTMENTS...');

    const calendarId = process.env.GHL_DEFAULT_CALENDAR_ID!;
    const now = Date.now();
    const startTime = now - (365 * 24 * 60 * 60 * 1000); // 1 year ago
    const endTime = now + (365 * 24 * 60 * 60 * 1000); // 1 year ahead

    // Fetch all calendar events
    const response = await axios.get(
        `${GHL_BASE_URL}/calendars/events`,
        {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Version': '2021-04-15'
            },
            params: {
                locationId: GHL_LOCATION_ID,
                calendarId,
                startTime,
                endTime
            }
        }
    );

    const events = response.data?.events || [];
    console.log(`   Found ${events.length} appointments to delete`);

    let deleted = 0;
    let failed = 0;

    for (let i = 0; i < events.length; i++) {
        try {
            await axios.delete(
                `${GHL_BASE_URL}/calendars/events/${events[i].id}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Version': '2021-04-15'
                    }
                }
            );
            deleted++;
        } catch (error: any) {
            if (error.response?.status !== 404) {
                failed++;
            }
        }

        if ((i + 1) % 50 === 0) {
            console.log(`   Progress: ${i + 1}/${events.length} (${deleted} deleted)`);
        }

        await sleep(100);
    }

    console.log(`   ✅ Appointments deleted: ${deleted}, failed: ${failed}`);

    // Clear appointment entity mappings
    const cleared = await prisma.entityMapping.deleteMany({
        where: { entityType: 'appointment' }
    });
    console.log(`   ✅ Cleared ${cleared.count} appointment mappings`);
}

async function deleteAllContacts(token: string) {
    console.log('\n👤 DELETING ALL CONTACTS...');

    let hasMore = true;
    let totalDeleted = 0;
    let totalFailed = 0;
    let batch = 0;

    while (hasMore) {
        batch++;

        // Fetch contacts (always get first page since we're deleting)
        const response = await axios.get(
            `${GHL_BASE_URL}/contacts/`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Version': '2021-07-28'
                },
                params: {
                    locationId: GHL_LOCATION_ID,
                    limit: 100
                }
            }
        );

        const contacts = response.data?.contacts || [];

        if (contacts.length === 0) {
            hasMore = false;
            break;
        }

        console.log(`   Batch ${batch}: Deleting ${contacts.length} contacts...`);

        for (const contact of contacts) {
            try {
                await axios.delete(
                    `${GHL_BASE_URL}/contacts/${contact.id}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Version': '2021-07-28'
                        }
                    }
                );
                totalDeleted++;
            } catch (error: any) {
                if (error.response?.status !== 404) {
                    totalFailed++;
                }
            }

            await sleep(50);
        }

        console.log(`   Total deleted: ${totalDeleted}`);

        // Safety: if we've processed 50 batches with failures, check
        if (batch > 500) {
            console.log('   ⚠️  Safety limit reached (50,000 contacts)');
            break;
        }
    }

    console.log(`   ✅ Contacts deleted: ${totalDeleted}, failed: ${totalFailed}`);

    // Clear client entity mappings
    const cleared = await prisma.entityMapping.deleteMany({
        where: { entityType: 'client' }
    });
    console.log(`   ✅ Cleared ${cleared.count} client mappings`);
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔙 FULL GHL ROLLBACK');
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  This will DELETE ALL appointments and contacts!\n');

    const token = await getToken();

    // 1. Delete all appointments first (they depend on contacts)
    await deleteAllAppointments(token);

    // 2. Delete all contacts
    await deleteAllContacts(token);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ ROLLBACK COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\nYou can now re-run the sync to start fresh.');

    await prisma.$disconnect();
    await pool.end();
}

main().catch(async (error) => {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
});
