/**
 * Debug GHL Appointment Delete 401
 * Run: npx ts-node scripts/debug-ghl-delete.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';

const GHL_BASE_URL = process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const TARGET_APPT_ID = '1ha6h7BzOBDtDiCsvVZP'; // From previous log

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    console.log('🕵️‍♀️ Debugging Delete 401...');

    const tokenDoc = await prisma.ghlOAuthToken.findUnique({ where: { locationId: GHL_LOCATION_ID } });
    if (!tokenDoc) throw new Error('No token found');

    console.log('Scopes:', tokenDoc.scopes);
    const token = tokenDoc.accessToken;

    const configs = [
        {
            name: 'Standard (2021-04-15) - /calendars/events/appointments/:id',
            url: `${GHL_BASE_URL}/calendars/events/appointments/${TARGET_APPT_ID}`,
            headers: { 'Authorization': `Bearer ${token}`, 'Version': '2021-04-15' },
            params: { locationId: GHL_LOCATION_ID }
        },
        {
            name: 'New Version (2021-07-28) - /calendars/events/appointments/:id',
            url: `${GHL_BASE_URL}/calendars/events/appointments/${TARGET_APPT_ID}`,
            headers: { 'Authorization': `Bearer ${token}`, 'Version': '2021-07-28' },
            params: { locationId: GHL_LOCATION_ID }
        },
        {
            name: 'Alternative URL - /calendars/events/:id',
            url: `${GHL_BASE_URL}/calendars/events/${TARGET_APPT_ID}`,
            headers: { 'Authorization': `Bearer ${token}`, 'Version': '2021-04-15' },
            params: { locationId: GHL_LOCATION_ID }
        },
        {
            name: 'No Version Header - /calendars/events/appointments/:id',
            url: `${GHL_BASE_URL}/calendars/events/appointments/${TARGET_APPT_ID}`,
            headers: { 'Authorization': `Bearer ${token}` }, // No Version
            params: { locationId: GHL_LOCATION_ID }
        }
    ];

    for (const config of configs) {
        console.log(`\nTesting: ${config.name}`);
        try {
            await axios.delete(config.url, { headers: config.headers, params: config.params });
            console.log('✅ SUCCESS! Deleted.');
            break; // Stop if successful
        } catch (error: any) {
            console.log(`❌ Failed: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`);
            if (error.response?.status === 404) {
                console.log('   (It might be already deleted or wrong ID)');
            }
        }
    }

    await prisma.$disconnect();
    await pool.end();
}

main();
