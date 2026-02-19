/**
 * Script to clean up check-in notes from GHL contacts
 * Run with: npx ts-node scripts/cleanup-checkin-notes.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import axios from 'axios';

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter } as any);

    // Get fresh token from database
    const tokenRecord = await prisma.ghlOAuthToken.findFirst({
        orderBy: { updatedAt: 'desc' },
    });

    if (!tokenRecord) {
        console.log('❌ No OAuth token found. Please re-authenticate.');
        return;
    }

    const token = tokenRecord.accessToken;
    console.log('✅ Using token updated at:', tokenRecord.updatedAt);

    // Get all contacts that have check-in notes (from checkin mappings)
    const checkinMappings = await prisma.entityMapping.findMany({
        where: { entityType: 'checkin' },
        select: { ghlId: true },
    });

    // Get unique contact IDs
    const contactIds = [...new Set(checkinMappings.map(m => m.ghlId))];
    console.log(`Found ${contactIds.length} contacts with check-in notes`);

    let deletedCount = 0;
    let errorCount = 0;

    for (const contactId of contactIds) {
        try {
            // Get notes for this contact
            const notesRes = await axios.get(
                `${GHL_BASE_URL}/contacts/${contactId}/notes`,
                { headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28' } }
            );

            const notes = notesRes.data.notes || [];

            // Find check-in notes (they contain "✅ Checked in")
            const checkinNotes = notes.filter((n: any) =>
                n.body?.includes('✅ Checked in') || n.body?.includes('Checked in:')
            );

            for (const note of checkinNotes) {
                try {
                    await axios.delete(
                        `${GHL_BASE_URL}/contacts/${contactId}/notes/${note.id}`,
                        { headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28' } }
                    );
                    deletedCount++;
                    process.stdout.write(`\rDeleted ${deletedCount} notes...`);
                } catch (e: any) {
                    errorCount++;
                }
            }

            // Rate limiting
            await new Promise(r => setTimeout(r, 100));
        } catch (e: any) {
            if (e.response?.status === 404) {
                // Contact not found, skip
            } else {
                errorCount++;
            }
        }
    }

    console.log(`\n✅ Deleted ${deletedCount} check-in notes`);
    if (errorCount > 0) {
        console.log(`⚠️ ${errorCount} errors encountered`);
    }

    // Clear checkin mappings
    const cleared = await prisma.entityMapping.deleteMany({
        where: { entityType: 'checkin' },
    });
    console.log(`✅ Cleared ${cleared.count} check-in mappings`);
    console.log('🔄 Restart server and run check-in sync for fresh notes!');

    await prisma.$disconnect();
    await pool.end();
}

main().catch(console.error);
