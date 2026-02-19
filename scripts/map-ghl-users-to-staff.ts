/**
 * Map GHL Users to Phorest Staff
 * Run: npx ts-node scripts/map-ghl-users-to-staff.ts
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

interface GhlUser {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    roles?: { type: string; role: string }[];
}

interface PhorestStaff {
    phorestId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    mobile: string | null;
}

async function getGhlToken(): Promise<string> {
    const token = await prisma.ghlOAuthToken.findUnique({ where: { locationId: GHL_LOCATION_ID } });
    if (!token) throw new Error('No GHL token found');
    return token.accessToken;
}

async function getGhlUsers(): Promise<GhlUser[]> {
    const token = await getGhlToken();

    const response = await axios.get(`${GHL_BASE_URL}/users/`, {
        params: { locationId: GHL_LOCATION_ID },
        headers: {
            'Authorization': `Bearer ${token}`,
            'Version': '2021-07-28',
            'Accept': 'application/json',
        },
    });

    return response.data.users || [];
}

async function getPhorestStaff(): Promise<PhorestStaff[]> {
    const staff = await prisma.phorestStaff.findMany({
        where: { deleted: false },
        select: {
            phorestId: true,
            firstName: true,
            lastName: true,
            email: true,
            mobile: true,
        },
    });
    return staff;
}

function normalizeString(str: string | null | undefined): string {
    return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function findBestMatch(phorestStaff: PhorestStaff, ghlUsers: GhlUser[]): { user: GhlUser | null, confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE', reason: string } {
    const phorestFullName = normalizeString(`${phorestStaff.firstName} ${phorestStaff.lastName}`);
    const phorestEmail = normalizeString(phorestStaff.email);

    for (const user of ghlUsers) {
        const ghlFullName = normalizeString(`${user.firstName} ${user.lastName}`);
        const ghlEmail = normalizeString(user.email);

        // Exact email match - HIGH confidence
        if (phorestEmail && ghlEmail && phorestEmail === ghlEmail) {
            return { user, confidence: 'HIGH', reason: 'Email match' };
        }

        // Exact full name match - HIGH confidence
        if (phorestFullName && ghlFullName && phorestFullName === ghlFullName) {
            return { user, confidence: 'HIGH', reason: 'Full name match' };
        }
    }

    // Second pass - partial matches
    for (const user of ghlUsers) {
        const phorestFirst = normalizeString(phorestStaff.firstName);
        const phorestLast = normalizeString(phorestStaff.lastName);
        const ghlFirst = normalizeString(user.firstName);
        const ghlLast = normalizeString(user.lastName);

        // First and last name match individually - MEDIUM confidence
        if (phorestFirst && ghlFirst && phorestFirst === ghlFirst &&
            phorestLast && ghlLast && phorestLast === ghlLast) {
            return { user, confidence: 'MEDIUM', reason: 'First+Last name match' };
        }

        // Just first name match - LOW confidence
        if (phorestFirst && ghlFirst && phorestFirst === ghlFirst && phorestFirst.length > 2) {
            return { user, confidence: 'LOW', reason: 'First name only' };
        }
    }

    return { user: null, confidence: 'NONE', reason: 'No match found' };
}

async function main() {
    console.log('🔍 Fetching GHL Users and Phorest Staff for mapping...\n');

    try {
        const [ghlUsers, phorestStaff] = await Promise.all([
            getGhlUsers(),
            getPhorestStaff(),
        ]);

        console.log(`📋 GHL Users: ${ghlUsers.length}`);
        console.log(`👥 Phorest Staff: ${phorestStaff.length}\n`);

        // Display GHL Users
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('GHL USERS (Team Members)');
        console.log('═══════════════════════════════════════════════════════════════════════');
        for (const user of ghlUsers) {
            console.log(`  ${user.firstName} ${user.lastName}`);
            console.log(`    ID: ${user.id}`);
            console.log(`    Email: ${user.email}`);
            console.log('');
        }

        // Display Phorest Staff
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('PHOREST STAFF');
        console.log('═══════════════════════════════════════════════════════════════════════');
        for (const staff of phorestStaff) {
            console.log(`  ${staff.firstName} ${staff.lastName}`);
            console.log(`    Phorest ID: ${staff.phorestId}`);
            console.log(`    Email: ${staff.email || '(none)'}`);
            console.log('');
        }

        // Attempt auto-mapping
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('AUTO-MAPPING RESULTS');
        console.log('═══════════════════════════════════════════════════════════════════════');

        const mappings: Array<{ phorestId: string; phorestName: string; ghlUserId: string | null; ghlUserName: string; confidence: string; reason: string }> = [];
        let highCount = 0, mediumCount = 0, lowCount = 0, noMatchCount = 0;

        for (const staff of phorestStaff) {
            const { user, confidence, reason } = findBestMatch(staff, ghlUsers);
            const phorestName = `${staff.firstName} ${staff.lastName}`;

            mappings.push({
                phorestId: staff.phorestId,
                phorestName,
                ghlUserId: user?.id || null,
                ghlUserName: user ? `${user.firstName} ${user.lastName}` : '(no match)',
                confidence,
                reason,
            });

            const icon = confidence === 'HIGH' ? '✅' : confidence === 'MEDIUM' ? '🟡' : confidence === 'LOW' ? '🟠' : '❌';
            console.log(`${icon} ${phorestName} → ${user ? `${user.firstName} ${user.lastName}` : '(no match)'}`);
            console.log(`   Confidence: ${confidence} | Reason: ${reason}`);
            console.log(`   Phorest ID: ${staff.phorestId}`);
            console.log(`   GHL User ID: ${user?.id || 'N/A'}`);
            console.log('');

            if (confidence === 'HIGH') highCount++;
            else if (confidence === 'MEDIUM') mediumCount++;
            else if (confidence === 'LOW') lowCount++;
            else noMatchCount++;
        }

        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log(`  ✅ High Confidence: ${highCount}`);
        console.log(`  🟡 Medium Confidence: ${mediumCount}`);
        console.log(`  🟠 Low Confidence: ${lowCount}`);
        console.log(`  ❌ No Match: ${noMatchCount}`);

        // Save high-confidence mappings to entityMapping table
        const highConfidenceMappings = mappings.filter(m => m.confidence === 'HIGH' && m.ghlUserId);

        if (highConfidenceMappings.length > 0) {
            console.log(`\n💾 Saving ${highConfidenceMappings.length} high-confidence mappings to database...`);

            for (const mapping of highConfidenceMappings) {
                // Update existing staff entity mapping to use GHL User ID instead of Contact ID
                await prisma.entityMapping.upsert({
                    where: { entityType_phorestId: { entityType: 'staff_user', phorestId: mapping.phorestId } },
                    create: {
                        entityType: 'staff_user',
                        phorestId: mapping.phorestId,
                        ghlId: mapping.ghlUserId!,
                        metadata: {
                            phorestName: mapping.phorestName,
                            ghlUserName: mapping.ghlUserName,
                            confidence: mapping.confidence,
                            mappedAt: new Date().toISOString(),
                        },
                    },
                    update: {
                        ghlId: mapping.ghlUserId!,
                        metadata: {
                            phorestName: mapping.phorestName,
                            ghlUserName: mapping.ghlUserName,
                            confidence: mapping.confidence,
                            mappedAt: new Date().toISOString(),
                        },
                    },
                });
            }

            console.log('✅ Mappings saved! Entity type: "staff_user"');
        }

    } catch (error: any) {
        console.error('❌ Error:', error.response?.data || error.message);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
