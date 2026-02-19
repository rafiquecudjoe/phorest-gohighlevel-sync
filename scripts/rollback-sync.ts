/**
 * Rollback Sync: Delete created Users and Appointments
 * Run: npx ts-node scripts/rollback-sync.ts
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

const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;

async function refreshAccessToken(refreshToken: string) {
    console.log('🔄 Refreshing Access Token...');
    try {
        const response = await axios.post(
            'https://services.leadconnectorhq.com/oauth/token',
            new URLSearchParams({
                client_id: GHL_CLIENT_ID!,
                client_secret: GHL_CLIENT_SECRET!,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const data = response.data;
        // Update DB
        await prisma.ghlOAuthToken.update({
            where: { locationId: GHL_LOCATION_ID },
            data: {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                // expiresIn: data.expires_in, // Column might not exist or be named differnetly
                expiresAt: new Date(Date.now() + (data.expires_in * 1000)),
            }
        });

        console.log('✅ Token Refreshed!');
        return data.access_token;
    } catch (error: any) {
        console.error('❌ Refresh Failed:', error.response?.data || error.message);
        throw error;
    }
}



async function main() {
    console.log('🔙 Starting Rollback...\n');

    try {
        let tokenDoc = await prisma.ghlOAuthToken.findUnique({ where: { locationId: GHL_LOCATION_ID } });
        if (!tokenDoc) throw new Error('No token found');

        let token = tokenDoc.accessToken;

        // Force Refresh to ensure valid token for DELETE operations
        console.log('🔄 Forcing Token Refresh...');
        token = await refreshAccessToken(tokenDoc.refreshToken);

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Version': '2021-07-28', // Appointments uses 2021-04-15 usually? Verification needed.
        };

        const timeThreshold = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago just to be safe

        // 1. Delete Appointments
        const appointmentMappings = await prisma.entityMapping.findMany({
            where: {
                entityType: 'appointment',
                createdAt: { gt: timeThreshold }
            }
        });

        console.log(`📅 Found ${appointmentMappings.length} appointments to delete.`);

        for (const mapping of appointmentMappings) {
            console.log(`   Deleting Appointment ${mapping.ghlId}...`);
            try {
                await axios.delete(`${GHL_BASE_URL}/calendars/events/${mapping.ghlId}`, {
                    headers: { ...headers, 'Version': '2021-04-15' },
                    params: { locationId: GHL_LOCATION_ID }
                });
                // Delete mapping
                await prisma.entityMapping.delete({ where: { id: mapping.id } });
            } catch (error: any) {
                if (error.response?.status === 404) {
                    console.log('   Already deleted.');
                    await prisma.entityMapping.delete({ where: { id: mapping.id } });
                } else if (error.response?.status === 401) {
                    console.error('   ❌ 401 Unauthorized during delete - aborting to prevent loops.');
                    break;
                } else {
                    console.error(`   ❌ Failed: ${error.message}`);
                }
            }
        }

        // 2. Delete Staff Users using staff_user mapping
        // We only want to delete the ones we created.
        // The script added confidence: 'CREATED' to metadata. 
        // But older mappings (manual) don't have that.
        // Let's filter by createdAt AND metadata confidence just to be super safe.

        const staffMappings = await prisma.entityMapping.findMany({
            where: {
                entityType: 'staff_user',
                createdAt: { gt: timeThreshold },
                // metadata contains "confidence": "CREATED"
            }
        });


        // Filter: Just trust createdAt since metadata was overwritten
        const createdStaffMappings = staffMappings;

        console.log(`\n👤 Found ${createdStaffMappings.length} Staff Users to delete.`);

        for (const mapping of createdStaffMappings) {
            console.log(`   Deleting User ${mapping.ghlId} (${(mapping.metadata as any)?.ghlUserName})...`);
            try {
                // DELETE /users/{id}
                await axios.delete(`${GHL_BASE_URL}/users/${mapping.ghlId}`, {
                    headers: { ...headers, 'Version': '2021-07-28' }
                });

                // Delete mapping
                await prisma.entityMapping.delete({ where: { id: mapping.id } });
            } catch (error: any) {
                if (error.response?.status === 404) {
                    console.log('   Already deleted.');
                    await prisma.entityMapping.delete({ where: { id: mapping.id } });
                } else {
                    console.error(`   ❌ Failed: ${error.message}`);
                }
            }
        }

        console.log('\n✅ Rollback Complete.');

    } catch (error: any) {
        console.error('\n❌ Fatal Error:', error.message);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
