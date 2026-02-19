/**
 * Map Phorest Staff to existing GHL Users
 * Run: npx ts-node scripts/map-staff-to-users.ts
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
    console.log('🔗 Mapping Phorest Staff to existing GHL Users...\n');

    // 1. Get OAuth token
    const tokenDoc = await prisma.ghlOAuthToken.findUnique({ where: { locationId: GHL_LOCATION_ID } });
    if (!tokenDoc) throw new Error('No GHL token found');

    // 2. Fetch existing GHL Users
    console.log('=== Fetching GHL Users ===');
    const usersResponse = await axios.get(`${GHL_BASE_URL}/users/`, {
        headers: {
            'Authorization': `Bearer ${tokenDoc.accessToken}`,
            'Version': '2021-07-28'
        },
        params: { locationId: GHL_LOCATION_ID }
    });

    const ghlUsers = usersResponse.data.users || [];
    console.log(`Found ${ghlUsers.length} GHL Users:`);
    ghlUsers.forEach((u: any) => {
        console.log(`  - ${u.firstName} ${u.lastName} (${u.email}) [ID: ${u.id}]`);
    });

    // 3. Fetch Phorest Staff from database (via existing staff mappings)
    console.log('\n=== Fetching Phorest Staff ===');
    const staffMappings = await prisma.entityMapping.findMany({
        where: { entityType: 'staff' }
    });
    console.log(`Found ${staffMappings.length} Phorest staff members`);

    // 4. Try to match by email first, then by name
    console.log('\n=== Creating staff_user Mappings ===');
    let created = 0;
    let skipped = 0;
    let fallbackIndex = 0;

    for (const staff of staffMappings) {
        const meta = staff.metadata as any;
        const phorestEmail = meta?.phorestEmail?.toLowerCase();
        const phorestName = meta?.phorestName?.toLowerCase();

        // Check if mapping already exists
        const existingMapping = await prisma.entityMapping.findUnique({
            where: { entityType_phorestId: { entityType: 'staff_user', phorestId: staff.phorestId } }
        });

        if (existingMapping) {
            skipped++;
            continue;
        }

        // Try to find a matching GHL user
        let matchedUser = null;
        let matchConfidence = 'NONE';

        // Match by email
        if (phorestEmail) {
            matchedUser = ghlUsers.find((u: any) => u.email?.toLowerCase() === phorestEmail);
            if (matchedUser) matchConfidence = 'EMAIL';
        }

        // Match by name (if no email match)
        if (!matchedUser && phorestName) {
            matchedUser = ghlUsers.find((u: any) => {
                const ghlName = `${u.firstName} ${u.lastName}`.toLowerCase();
                return ghlName === phorestName ||
                    ghlName.includes(phorestName) ||
                    phorestName.includes(ghlName);
            });
            if (matchedUser) matchConfidence = 'NAME';
        }

        if (matchedUser) {
            // Create the mapping
            try {
                await prisma.entityMapping.create({
                    data: {
                        entityType: 'staff_user',
                        phorestId: staff.phorestId,
                        ghlId: matchedUser.id,
                        metadata: {
                            phorestName: meta?.phorestName,
                            ghlUserName: `${matchedUser.firstName} ${matchedUser.lastName}`,
                            ghlUserEmail: matchedUser.email,
                            confidence: matchConfidence,
                            mappedAt: new Date().toISOString()
                        }
                    }
                });
                console.log(`✅ Mapped: ${meta?.phorestName} → ${matchedUser.firstName} ${matchedUser.lastName} (${matchConfidence})`);
                created++;
            } catch (e: any) {
                if (e.code === 'P2002') {
                    console.log(`⚠️ Skipped (GHL User already mapped): ${meta?.phorestName}`);
                    skipped++;
                } else {
                    throw e;
                }
            }
        } else {
            // Fallback: Use round-robin distribution across available users
            const fallbackUser = ghlUsers[fallbackIndex % ghlUsers.length];
            fallbackIndex++;

            if (fallbackUser) {
                try {
                    await prisma.entityMapping.create({
                        data: {
                            entityType: 'staff_user',
                            phorestId: staff.phorestId,
                            ghlId: fallbackUser.id,
                            metadata: {
                                phorestName: meta?.phorestName,
                                ghlUserName: `${fallbackUser.firstName} ${fallbackUser.lastName}`,
                                ghlUserEmail: fallbackUser.email,
                                confidence: 'DEFAULT_FALLBACK',
                                mappedAt: new Date().toISOString()
                            }
                        }
                    });
                    console.log(`⚠️ Fallback: ${meta?.phorestName} → ${fallbackUser.firstName} ${fallbackUser.lastName} (DEFAULT)`);
                    created++;
                } catch (e: any) {
                    if (e.code === 'P2002') {
                        console.log(`⚠️ Skipped (GHL User already mapped): ${meta?.phorestName}`);
                        skipped++;
                    } else {
                        throw e;
                    }
                }
            } else {
                console.log(`❌ No match and no fallback: ${meta?.phorestName}`);
            }
        }
    }

    console.log(`\n📊 Summary: ${created} mappings created, ${skipped} skipped`);
    console.log(`   Note: Due to DB constraint, only one Phorest staff can map to each GHL User`);
    console.log(`   You have ${ghlUsers.length} GHL Users, so max ${ghlUsers.length} staff can be mapped`);

    await prisma.$disconnect();
    await pool.end();
}

main().catch(console.error);
