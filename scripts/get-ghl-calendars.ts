/**
 * Quick script to list all GHL calendars and get the Calendar ID
 * Run: npx ts-node scripts/get-ghl-calendars.ts
 */
import 'dotenv/config';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Initialize Prisma with the adapter
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function getCalendars() {
    const baseUrl = process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com';
    const locationId = process.env.GHL_LOCATION_ID;

    if (!locationId) {
        console.error('❌ GHL_LOCATION_ID not set in .env');
        process.exit(1);
    }

    try {
        // Fetch the stored token from database
        const storedToken = await prisma.ghlOAuthToken.findUnique({
            where: { locationId },
        });

        if (!storedToken) {
            console.error('❌ No stored token found for location:', locationId);
            process.exit(1);
        }

        console.log('🔍 Fetching GHL Calendars...\n');

        const response = await axios.get(`${baseUrl}/calendars/`, {
            params: { locationId },
            headers: {
                'Authorization': `Bearer ${storedToken.accessToken}`,
                'Version': '2021-04-15',
                'Accept': 'application/json',
            },
        });

        const calendars = response.data.calendars || [];

        if (calendars.length === 0) {
            console.log('⚠️ No calendars found in this location.');
            console.log('   Create a calendar in GHL first, then run this again.');
            return;
        }

        console.log('📅 Available Calendars:\n');
        console.log('─'.repeat(80));

        calendars.forEach((cal: any, index: number) => {
            console.log(`${index + 1}. ${cal.name}`);
            console.log(`   ID: ${cal.id}`);
            console.log(`   Description: ${cal.description || '(none)'}`);
            console.log(`   Type: ${cal.calendarType || 'unknown'}`);
            console.log('─'.repeat(80));
        });

        console.log('\n✅ Add this to your .env file:');
        console.log(`GHL_DEFAULT_CALENDAR_ID=${calendars[0].id}`);
        console.log('\n(Use the ID of the calendar you want for appointments)');

    } catch (error: any) {
        console.error('❌ Error fetching calendars:', error.response?.data || error.message);
        if (error.response?.status === 401) {
            console.error('\n💡 Token may be expired. Try refreshing via the OAuth flow.');
        }
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

getCalendars();
