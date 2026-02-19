/**
 * Check GHL Tags
 * Run: npx ts-node scripts/check-ghl-tags.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';

const GHL_BASE_URL = process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
    console.log('🕵️‍♀️ Fetching GHL Contacts to check Tags...\n');

    const tokenDoc = await prisma.ghlOAuthToken.findUnique({ where: { locationId: GHL_LOCATION_ID } });
    if (!tokenDoc) throw new Error('No token found');

    try {
        const response = await axios.get(`${GHL_BASE_URL}/contacts/`, {
            headers: {
                'Authorization': `Bearer ${tokenDoc.accessToken}`,
                'Version': '2021-07-28'
            },
            params: {
                locationId: GHL_LOCATION_ID,
                limit: 50,
            }
        });

        const contacts = response.data.contacts || [];
        const taggedContacts = contacts.filter((c: any) => c.tags && c.tags.length > 0);

        console.log(`Found ${contacts.length} recent contacts.`);
        console.log(`Found ${taggedContacts.length} contacts WITH TAGS.\n`);

        taggedContacts.slice(0, 10).forEach((c: any) => {
            console.log(`👤 ${c.firstName} ${c.lastName || ''} (${c.email || 'No Email'})`);
            console.log(`   🏷️  Tags: ${c.tags.join(', ')}\n`);
        });

        if (taggedContacts.length === 0) {
            console.log('No contacts with tags found in the last 50 updated.');
        }

    } catch (error: any) {
        console.error('❌ API Error:', error.response?.data || error.message);
    }

    await prisma.$disconnect();
    await pool.end();
}

main();
