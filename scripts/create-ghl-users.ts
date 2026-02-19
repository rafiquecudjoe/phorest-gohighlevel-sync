/**
 * Create GHL Users for unmatched Phorest Staff
 * Run: npx ts-node scripts/create-ghl-users.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';
import * as crypto from 'crypto';

// Initialize Prisma
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const GHL_BASE_URL = process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;

async function getGhlToken(): Promise<string> {
    const token = await prisma.ghlOAuthToken.findUnique({ where: { locationId: GHL_LOCATION_ID } });
    if (!token) throw new Error('No GHL token found');
    return token.accessToken;
}

// Generate a secure random password
function generatePassword(): string {
    return crypto.randomBytes(8).toString('hex') + 'A1!';
}

async function createGhlUser(token: string, staff: any) {
    // Determine user data
    const firstName = staff.firstName;
    const lastName = staff.lastName;
    const email = staff.email;
    const password = generatePassword();

    // GHL requires companyId - we can usually get it from the /users/me endpoint or similar, 
    // but for POST /users/ it's a required field.
    // Alternatively, we can try to fetch an existing user to get the companyId.

    // Let's fetch the Location details to get the companyId
    console.log(`  🔍 Fetching company ID (from Location ${GHL_LOCATION_ID})...`);
    let companyId: string;
    try {
        const locationResponse = await axios.get(`${GHL_BASE_URL}/locations/${GHL_LOCATION_ID}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Version': '2021-07-28',
            },
        });

        const location = locationResponse.data.location;
        if (!location) {
            throw new Error('Could not find location details');
        }
        companyId = location.companyId;
    } catch (error: any) {
        console.error(`  ❌ Failed to fetch Company ID: ${error.message}`);
        if (error.response?.data) console.error('     Details:', JSON.stringify(error.response.data));
        return null;
    }

    if (!email) {
        console.log(`  ⏭️ Skipping ${firstName} ${lastName} - no email`);
        return null;
    }

    console.log(`  👤 Creating user: ${firstName} ${lastName} (${email})...`);

    try {
        const response = await axios.post(
            `${GHL_BASE_URL}/users/`,
            {
                companyId,
                firstName,
                lastName,
                email,
                password,
                type: 'account',
                role: 'user',
                locationIds: [GHL_LOCATION_ID],
                // permissions: {} // Optional: restrict permissions if needed
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Version': '2021-07-28',
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log(`  ✅ Created! ID: ${response.data.id || response.data.user?.id}`);
        return response.data.id || response.data.user?.id;
    } catch (error: any) {
        if (error.response?.data?.message?.includes('already exists')) {
            console.log(`  ⚠️ User already exists (by email)`);
            return null; // Handle manual mapping later
        }
        if (error.response?.data) {
            console.error('     Details:', JSON.stringify(error.response.data));
        }
        console.error(`  ❌ Failed: ${error.response?.data?.message || error.message}`);
        if (error.response?.status === 403) {
            console.error('     🚨 PERMISSION DENIED: Your token likely missing "users.write" scope');
            throw new Error('Missing users.write scope');
        }
        return null;
    }
}

async function main() {
    console.log('🚀 Starting GHL User Creation for Unmatched Staff...\n');

    try {
        const token = await getGhlToken();

        // 1. Get all Phorest staff who are NOT matched in entity_mappings (staff_user)
        const allStaff = await prisma.phorestStaff.findMany({ where: { deleted: false } });

        // Get existing mappings
        const mappings = await prisma.entityMapping.findMany({
            where: { entityType: 'staff_user' }
        });
        const mappedPhorestIds = new Set(mappings.map(m => m.phorestId));

        // Filter for unmatched
        const unmatchedStaff = allStaff.filter(s => !mappedPhorestIds.has(s.phorestId));

        console.log(`📋 Found ${unmatchedStaff.length} unmatched staff members.`);

        if (unmatchedStaff.length === 0) {
            console.log('✅ All staff are already mapped!');
            return;
        }

        // 2. Iterate and create users
        let createdCount = 0;

        for (const staff of unmatchedStaff) {
            if (!staff.email) continue;

            // Exclude obviously fake/generic ones
            if (staff.firstName.includes('Salon') || staff.lastName.includes('Salon')) continue;
            if (staff.email === 'info@jazzhairstudio.com') continue; // Skip generic email

            const userId = await createGhlUser(token, staff);

            if (userId) {
                // Save mapping immediately
                await prisma.entityMapping.create({
                    data: {
                        entityType: 'staff_user',
                        phorestId: staff.phorestId,
                        ghlId: userId,
                        metadata: {
                            phorestName: `${staff.firstName} ${staff.lastName}`,
                            ghlUserName: `${staff.firstName} ${staff.lastName}`,
                            confidence: 'CREATED',
                            mappedAt: new Date().toISOString(),
                        }
                    }
                });
                createdCount++;
            }
        }

        console.log(`\n✅ Finished! Created ${createdCount} new GHL users.`);

    } catch (error: any) {
        console.error('\n❌ Fatal Error:', error.message);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
