/**
 * Add Users to Calendar Team
 * Run: npx ts-node scripts/add-users-to-calendar.ts
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

async function getGhlToken(): Promise<string> {
    const token = await prisma.ghlOAuthToken.findUnique({ where: { locationId: GHL_LOCATION_ID } });
    if (!token) throw new Error('No GHL token found');
    return token.accessToken;
}

async function main() {
    console.log(`🚀 Adding Mapped Users to Calendar ${GHL_CALENDAR_ID}...\n`);

    try {
        const token = await getGhlToken();

        // 1. Get current calendar details
        console.log('🔍 Fetching current calendar details...');
        const calResponse = await axios.get(`${GHL_BASE_URL}/calendars/${GHL_CALENDAR_ID}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Version': '2021-04-15' },
        });

        const calendar = calResponse.data.calendar;
        const currentTeamIds = new Set(calendar.teamMembers.map((m: any) => m.userId));

        console.log(`📋 Current Team Size: ${currentTeamIds.size}`);

        // 2. Get mapped users from DB
        const mappings = await prisma.entityMapping.findMany({
            where: { entityType: 'staff_user' }
        });

        const mappedUserIds = mappings.map(m => m.ghlId);
        console.log(`👥 Mapped Staff User IDs: ${mappedUserIds.length}`);

        // 3. Filter users not in calendar
        const newUsers = mappedUserIds.filter(id => !currentTeamIds.has(id));

        if (newUsers.length === 0) {
            console.log('✅ All mapped users are already in the calendar team!');
            return;
        }

        console.log(`➕ Adding ${newUsers.length} new users to team...`);

        // 4. Construct new teamMembers array
        const newTeamMembers = [...calendar.teamMembers];

        for (const userId of newUsers) {
            newTeamMembers.push({
                userId: userId,
                priority: 0.5, // Default priority
                isPrimary: false,
                meetingLocation: 'custom', // Default
                // minimalistic structure, GHL should fill defaults
            });
        }

        // 5. Update calendar
        // Note: The PUT body needs to match the required fields strictly or it might fail.
        // Usually safe to send back the whole object with modified teamMembers.

        const updateBody = {
            ...calendar,
            teamMembers: newTeamMembers,
        };

        // remove read-only fields if necessary
        delete updateBody.id;
        delete updateBody.locationId;
        delete updateBody.formSubmitRedirectUrl;
        delete updateBody.notifications; // often read-only or handled separately
        delete updateBody.availabilities; // often complex, maybe safe to keep but if empty/null causes issues

        // Also ensure formSubmitType is valid if present
        if (!updateBody.formSubmitType) delete updateBody.formSubmitType;

        await axios.put(
            `${GHL_BASE_URL}/calendars/${GHL_CALENDAR_ID}`,
            updateBody,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Version': '2021-04-15',
                    'Content-Type': 'application/json',
                }
            }
        );

        console.log('✅ Calendar Team Updated Successfully!');
        console.log(`   Total Team Members: ${newTeamMembers.length}`);

    } catch (error: any) {
        console.error('❌ Error:', error.response?.data || error.message);
        if (error.response?.data) {
            console.error('Details:', JSON.stringify(error.response.data));
        }
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
