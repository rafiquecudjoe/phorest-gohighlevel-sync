/**
 * Add User V to Calendar Team
 * Run: npx ts-node scripts/add-user-v-to-calendar.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';

const GHL_BASE_URL = process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const GHL_CALENDAR_ID = process.env.GHL_DEFAULT_CALENDAR_ID!;
const USER_V_ID = '8cr2w0O3pBm5PiH9q6h6';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    console.log(`🚀 Adding User V to Calendar ${GHL_CALENDAR_ID}...\n`);

    const tokenDoc = await prisma.ghlOAuthToken.findUnique({ where: { locationId: GHL_LOCATION_ID } });
    if (!tokenDoc) throw new Error('No GHL token found');
    const token = tokenDoc.accessToken;

    // 1. Fetch current calendar
    console.log('📅 Fetching calendar details...');
    const calResponse = await axios.get(`${GHL_BASE_URL}/calendars/${GHL_CALENDAR_ID}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Version': '2021-04-15' },
    });

    const calendar = calResponse.data.calendar;
    const currentTeamIds = calendar.teamMembers.map((m: any) => m.userId);
    console.log('Current team members:', currentTeamIds.length);

    if (currentTeamIds.includes(USER_V_ID)) {
        console.log('✅ User V is already in the calendar team!');
        await prisma.$disconnect();
        await pool.end();
        return;
    }

    // 2. Add User V to team
    console.log('➕ Adding User V (v Milkovic) to calendar team...');
    const newTeamMembers = [...calendar.teamMembers, {
        userId: USER_V_ID,
        priority: 0.5,
        isPrimary: false,
        meetingLocation: 'custom',
    }];

    const updateBody = { ...calendar, teamMembers: newTeamMembers };
    delete updateBody.id;
    delete updateBody.locationId;
    delete updateBody.formSubmitRedirectUrl;
    delete updateBody.notifications;

    try {
        await axios.put(`${GHL_BASE_URL}/calendars/${GHL_CALENDAR_ID}`, updateBody, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Version': '2021-04-15',
                'Content-Type': 'application/json'
            }
        });
        console.log('✅ User V added to calendar team successfully!');
    } catch (error: any) {
        console.error('❌ Failed to update calendar:', error.response?.data || error.message);
    }

    await prisma.$disconnect();
    await pool.end();
}

main();
