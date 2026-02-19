/**
 * Get Calendar Details
 * Run: npx ts-node scripts/get-calendar-details.ts
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
    console.log(`🔍 Fetching details for Calendar ID: ${GHL_CALENDAR_ID}...\n`);

    try {
        const token = await getGhlToken();

        const response = await axios.get(`${GHL_BASE_URL}/calendars/${GHL_CALENDAR_ID}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Version': '2021-04-15',
            },
        });

        console.log('✅ Calendar Details:');
        console.log(JSON.stringify(response.data, null, 2));

    } catch (error: any) {
        console.error('❌ Error:', error.response?.data || error.message);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
