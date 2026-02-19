/**
 * Direct Appointment Sync from Local DB to GHL
 * Run: npx ts-node scripts/direct-appointment-sync.ts
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

interface SyncResult {
    totalProcessed: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
}

// Rate limiting configuration
const DELAY_BETWEEN_REQUESTS_MS = 200; // 200ms between requests (~5 req/sec)
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 2000; // 2 seconds

// Helper to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry wrapper with exponential backoff
async function withRetry<T>(
    fn: () => Promise<T>,
    retries = MAX_RETRIES,
    delayMs = INITIAL_RETRY_DELAY_MS
): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        if (error.response?.status === 429 && retries > 0) {
            console.log(`    ⏳ Rate limited, waiting ${delayMs / 1000}s before retry (${retries} retries left)...`);
            await sleep(delayMs);
            return withRetry(fn, retries - 1, delayMs * 2);
        }
        throw error;
    }
}

async function getGhlToken(): Promise<string> {
    const token = await prisma.ghlOAuthToken.findUnique({ where: { locationId: GHL_LOCATION_ID } });
    if (!token) throw new Error('No GHL token found');
    return token.accessToken;
}

async function syncAppointments(): Promise<SyncResult> {
    const result: SyncResult = { totalProcessed: 0, created: 0, updated: 0, skipped: 0, failed: 0 };

    // Get appointments from local DB (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    console.log(`📅 Fetching appointments from local DB (since ${thirtyDaysAgo.toISOString().split('T')[0]})...`);

    const appointments = await prisma.phorestAppointment.findMany({
        where: {
            deleted: false,
            appointmentDate: { gte: thirtyDaysAgo },
        },
        orderBy: { appointmentDate: 'asc' },
    });

    console.log(`📋 Found ${appointments.length} appointments in local DB`);

    if (appointments.length === 0) {
        console.log('ℹ️ No appointments to sync');
        return result;
    }

    const ghlToken = await getGhlToken();

    for (const apt of appointments) {
        result.totalProcessed++;

        try {
            // Skip if no client
            if (!apt.clientId) {
                console.log(`  ⏭️ Skipping ${apt.phorestId} - no client`);
                result.skipped++;
                continue;
            }

            // Find GHL contact mapping for this client
            const clientMapping = await prisma.entityMapping.findUnique({
                where: { entityType_phorestId: { entityType: 'client', phorestId: apt.clientId } }
            });

            if (!clientMapping) {
                console.log(`  ⏭️ Skipping ${apt.phorestId} - client ${apt.clientId} not synced`);
                result.skipped++;
                continue;
            }

            // Check if appointment already synced
            const existingMapping = await prisma.entityMapping.findUnique({
                where: { entityType_phorestId: { entityType: 'appointment', phorestId: apt.phorestId } }
            });

            // Assign all appointments to User V (v Milkovic)
            const assignedUserId = '8cr2w0O3pBm5PiH9q6h6';

            // Appointment data
            const startTime = apt.startTime.toISOString();
            const endTime = apt.endTime.toISOString();
            const title = apt.serviceName || 'Appointment from Phorest';

            if (existingMapping) {
                // Update existing
                await withRetry(() => axios.put(
                    `${GHL_BASE_URL}/calendars/events/appointments/${existingMapping.ghlId}`,
                    {
                        calendarId: GHL_CALENDAR_ID,
                        locationId: GHL_LOCATION_ID,
                        contactId: clientMapping.ghlId,
                        startTime,
                        endTime,
                        title,
                        appointmentStatus: apt.state === 'COMPLETED' ? 'confirmed' : 'new',
                        ignoreFreeSlotValidation: true,
                        ignoreDateRange: true,
                        assignedUserId,
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${ghlToken}`,
                            'Version': '2021-04-15',
                            'Content-Type': 'application/json',
                        }
                    }
                ));
                console.log(`  🔄 Updated: ${apt.phorestId} → ${existingMapping.ghlId}`);
                result.updated++;
                await sleep(DELAY_BETWEEN_REQUESTS_MS);;
            } else {
                // Create new
                const response = await withRetry(() => axios.post(
                    `${GHL_BASE_URL}/calendars/events/appointments`,
                    {
                        calendarId: GHL_CALENDAR_ID,
                        locationId: GHL_LOCATION_ID,
                        contactId: clientMapping.ghlId,
                        startTime,
                        endTime,
                        title,
                        appointmentStatus: 'new',
                        ignoreFreeSlotValidation: true,
                        ignoreDateRange: true,
                        assignedUserId,
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${ghlToken}`,
                            'Version': '2021-04-15',
                            'Content-Type': 'application/json',
                        }
                    }
                ));

                const ghlAptId = response.data.id || response.data.event?.id;

                // Save mapping
                await prisma.entityMapping.create({
                    data: {
                        entityType: 'appointment',
                        phorestId: apt.phorestId,
                        ghlId: ghlAptId,
                        metadata: { phorestClientId: apt.clientId, ghlContactId: clientMapping.ghlId },
                    }
                });

                // Update local appointment with GHL ID
                await prisma.phorestAppointment.update({
                    where: { phorestId: apt.phorestId },
                    data: {
                        ghlEventId: ghlAptId,
                        syncStatus: 'SYNCED',
                        lastSyncedAt: new Date(),
                    }
                });

                console.log(`  ✨ Created: ${apt.phorestId} → ${ghlAptId}`);
                result.created++;
                await sleep(DELAY_BETWEEN_REQUESTS_MS);
            }

        } catch (error: any) {
            console.error(`  ❌ Failed: ${apt.phorestId} - ${error.response?.data?.message || error.message}`);
            if (error.response?.data) {
                console.error(`     Details: ${JSON.stringify(error.response.data)}`);
            }

            // Update sync status to FAILED
            await prisma.phorestAppointment.update({
                where: { phorestId: apt.phorestId },
                data: {
                    syncStatus: 'FAILED',
                    syncError: error.response?.data?.message || error.message,
                }
            });

            result.failed++;
        }
    }

    return result;
}

async function main() {
    console.log('🚀 Starting Direct Appointment Sync (Local DB → GHL)...\n');

    if (!GHL_CALENDAR_ID) {
        console.error('❌ GHL_DEFAULT_CALENDAR_ID not set in .env!');
        process.exit(1);
    }

    console.log(`📍 Using Calendar ID: ${GHL_CALENDAR_ID}\n`);

    try {
        const result = await syncAppointments();

        console.log('\n═══════════════════════════════════════════');
        console.log('✅ Appointment Sync Complete!');
        console.log(`   📊 Total Processed: ${result.totalProcessed}`);
        console.log(`   ✨ Created: ${result.created}`);
        console.log(`   🔄 Updated: ${result.updated}`);
        console.log(`   ⏭️  Skipped: ${result.skipped}`);
        console.log(`   ❌ Failed: ${result.failed}`);
        console.log('═══════════════════════════════════════════');

    } catch (error: any) {
        console.error('❌ Sync failed:', error.message);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
