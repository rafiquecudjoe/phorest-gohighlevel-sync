/**
 * Retry Failed Appointments
 * 
 * FIXED: Now properly handles existing mappings and GHL appointments to prevent duplicates.
 * 
 * Run: npx ts-node scripts/retry-failed-appointments.ts
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

async function deleteGhlAppointment(ghlToken: string, ghlAptId: string): Promise<boolean> {
    try {
        await axios.delete(`${GHL_BASE_URL}/calendars/events/${ghlAptId}`, {
            headers: {
                'Authorization': `Bearer ${ghlToken}`,
                'Version': '2021-04-15',
            }
        });
        return true;
    } catch (error: any) {
        if (error.response?.status === 404) {
            return true; // Already deleted
        }
        console.log(`   ⚠️ Could not delete old GHL appointment: ${error.message}`);
        return false;
    }
}

async function main() {
    const tokenDoc = await prisma.ghlOAuthToken.findUnique({ where: { locationId: GHL_LOCATION_ID } });
    const ghlToken = tokenDoc?.accessToken;

    if (!ghlToken) {
        console.error('❌ No GHL token found');
        process.exit(1);
    }

    // Get failed appointments
    const failed = await prisma.phorestAppointment.findMany({
        where: { syncStatus: 'FAILED' }
    });

    console.log(`🔄 Retrying ${failed.length} failed appointments...\n`);

    let success = 0;
    let skipped = 0;
    let errors = 0;

    for (const apt of failed) {
        console.log(`📍 Processing: ${apt.phorestId} - ${apt.serviceName}`);

        // Find client mapping
        if (!apt.clientId) {
            console.log('   ⏭️ Skipping - no client');
            skipped++;
            continue;
        }

        const clientMapping = await prisma.entityMapping.findUnique({
            where: { entityType_phorestId: { entityType: 'client', phorestId: apt.clientId } }
        });

        if (!clientMapping) {
            console.log('   ⏭️ Skipping - client not synced');
            skipped++;
            continue;
        }

        // Check if there's an existing mapping for this appointment
        const existingMapping = await prisma.entityMapping.findUnique({
            where: { entityType_phorestId: { entityType: 'appointment', phorestId: apt.phorestId } }
        });

        // If mapping exists, delete the OLD GHL appointment first to prevent duplicates
        if (existingMapping) {
            console.log(`   🗑️ Deleting old GHL appointment: ${existingMapping.ghlId}`);
            await deleteGhlAppointment(ghlToken, existingMapping.ghlId);
            
            // Delete the stale mapping
            await prisma.entityMapping.delete({
                where: { id: existingMapping.id }
            });
        }

        try {
            const response = await axios.post(
                `${GHL_BASE_URL}/calendars/events/appointments`,
                {
                    calendarId: GHL_CALENDAR_ID,
                    locationId: GHL_LOCATION_ID,
                    contactId: clientMapping.ghlId,
                    startTime: apt.startTime.toISOString(),
                    endTime: apt.endTime.toISOString(),
                    title: apt.serviceName || 'Appointment from Phorest',
                    appointmentStatus: 'new',
                    ignoreFreeSlotValidation: true,
                    ignoreDateRange: true,
                    assignedUserId: USER_V_ID,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${ghlToken}`,
                        'Version': '2021-04-15',
                        'Content-Type': 'application/json'
                    }
                }
            );

            const ghlAptId = response.data.id || response.data.event?.id;

            // Save mapping
            await prisma.entityMapping.create({
                data: {
                    entityType: 'appointment',
                    phorestId: apt.phorestId,
                    ghlId: ghlAptId,
                    metadata: { phorestClientId: apt.clientId, ghlContactId: clientMapping.ghlId }
                }
            });

            // Update local appointment
            await prisma.phorestAppointment.update({
                where: { phorestId: apt.phorestId },
                data: {
                    ghlEventId: ghlAptId,
                    syncStatus: 'SYNCED',
                    lastSyncedAt: new Date(),
                    syncError: null
                }
            });

            console.log(`   ✅ Created: ${ghlAptId}`);
            success++;
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.response?.data?.message || error.message}`);
            errors++;
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`✅ Retry Complete!`);
    console.log(`   ✨ Created: ${success}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Failed: ${errors}`);
    console.log(`═══════════════════════════════════════════`);

    await prisma.$disconnect();
    await pool.end();
}

main();
