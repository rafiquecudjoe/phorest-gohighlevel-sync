/**
 * Cleanup Duplicate GHL Contacts
 * 
 * This script:
 * 1. Gets all GHL contacts
 * 2. Compares with entity mappings (known synced contacts)
 * 3. Finds orphaned contacts (in GHL but not in mappings)
 * 4. Checks if orphaned contacts have appointments
 * 5. Deletes only orphaned contacts WITHOUT appointments
 * 
 * Usage: npx ts-node scripts/cleanup-duplicate-contacts.ts
 */

require('dotenv').config();
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function getGhlToken(): Promise<string> {
    const token = await prisma.ghlOAuthToken.findFirst();
    if (!token?.accessToken) throw new Error('No GHL token found');
    return token.accessToken;
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllGhlContacts(token: string, locationId: string): Promise<{ id: string; firstName: string; lastName: string; email: string }[]> {
    const contacts: any[] = [];
    let hasMore = true;
    let startAfterId: string | undefined;
    let page = 0;

    console.log('📥 Fetching all GHL contacts...');

    while (hasMore) {
        try {
            const response = await axios.get(
                `${process.env.GHL_API_BASE_URL}/contacts/`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Version': '2021-07-28'
                    },
                    params: {
                        locationId,
                        limit: 100,
                        ...(startAfterId && { startAfterId })
                    }
                }
            );

            const batch = response.data?.contacts || [];
            contacts.push(...batch);
            page++;

            if (page % 20 === 0) {
                console.log(`   Page ${page}: ${contacts.length} contacts fetched...`);
            }

            if (batch.length < 100) {
                hasMore = false;
            } else {
                startAfterId = batch[batch.length - 1]?.id;
                if (!startAfterId) hasMore = false;
            }

            await sleep(50); // Rate limiting
        } catch (error: any) {
            console.error('Error fetching contacts:', error.response?.status || error.message);
            hasMore = false;
        }
    }

    console.log(`   ✅ Total contacts fetched: ${contacts.length}`);
    return contacts;
}

async function getAppointmentsForContact(token: string, contactId: string): Promise<number> {
    try {
        const response = await axios.get(
            `${process.env.GHL_API_BASE_URL}/contacts/${contactId}/appointments`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Version': '2021-07-28'
                }
            }
        );
        return response.data?.events?.length || 0;
    } catch {
        return 0;
    }
}

async function deleteContact(token: string, contactId: string): Promise<boolean> {
    try {
        await axios.delete(
            `${process.env.GHL_API_BASE_URL}/contacts/${contactId}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Version': '2021-07-28'
                }
            }
        );
        return true;
    } catch (error: any) {
        console.error(`   Failed to delete ${contactId}:`, error.response?.status);
        return false;
    }
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🧹 CLEANUP DUPLICATE GHL CONTACTS');
    console.log('═══════════════════════════════════════════════════════\n');

    const token = await getGhlToken();
    const locationId = process.env.GHL_LOCATION_ID!;

    // Step 1: Get all GHL contacts
    const allGhlContacts = await getAllGhlContacts(token, locationId);

    // Step 2: Get all entity mappings (known synced contacts)
    const mappings = await prisma.entityMapping.findMany({
        where: { entityType: 'client' },
        select: { ghlId: true }
    });
    const mappedGhlIds = new Set(mappings.map(m => m.ghlId));
    console.log(`\n📋 Entity mappings: ${mappedGhlIds.size}`);

    // Step 3: Find orphaned contacts (in GHL but NOT in mappings)
    const orphanedContacts = allGhlContacts.filter(c => !mappedGhlIds.has(c.id));
    console.log(`🔍 Orphaned contacts (not in mappings): ${orphanedContacts.length}`);

    if (orphanedContacts.length === 0) {
        console.log('\n✅ No orphaned contacts found! GHL is clean.');
        await cleanup();
        return;
    }

    // Step 4: Check each orphaned contact for appointments
    console.log('\n🔄 Checking orphaned contacts for appointments...');
    const safeToDelete: string[] = [];
    const hasAppointments: string[] = [];

    for (let i = 0; i < orphanedContacts.length; i++) {
        const contact = orphanedContacts[i];
        const apptCount = await getAppointmentsForContact(token, contact.id);

        if (apptCount === 0) {
            safeToDelete.push(contact.id);
        } else {
            hasAppointments.push(contact.id);
        }

        if ((i + 1) % 100 === 0) {
            console.log(`   Checked ${i + 1}/${orphanedContacts.length}... (${safeToDelete.length} safe to delete)`);
        }

        await sleep(50); // Rate limiting
    }

    console.log(`\n📊 Results:`);
    console.log(`   Safe to delete (no appointments): ${safeToDelete.length}`);
    console.log(`   Has appointments (keeping): ${hasAppointments.length}`);

    if (safeToDelete.length === 0) {
        console.log('\n✅ All orphaned contacts have appointments. Nothing to delete.');
        await cleanup();
        return;
    }

    // Step 5: Delete orphaned contacts without appointments
    console.log(`\n🗑️  Deleting ${safeToDelete.length} orphaned contacts...`);
    let deleted = 0;
    let failed = 0;

    for (let i = 0; i < safeToDelete.length; i++) {
        const success = await deleteContact(token, safeToDelete[i]);
        if (success) {
            deleted++;
        } else {
            failed++;
        }

        if ((i + 1) % 100 === 0) {
            console.log(`   Progress: ${i + 1}/${safeToDelete.length} (${deleted} deleted, ${failed} failed)`);
        }

        await sleep(100); // Rate limiting for deletes
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 CLEANUP SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Total GHL contacts before: ${allGhlContacts.length}`);
    console.log(`   Orphaned contacts found: ${orphanedContacts.length}`);
    console.log(`   Deleted (no appointments): ${deleted}`);
    console.log(`   Kept (has appointments): ${hasAppointments.length}`);
    console.log(`   Failed to delete: ${failed}`);
    console.log(`   Expected GHL contacts after: ${allGhlContacts.length - deleted}`);
    console.log('═══════════════════════════════════════════════════════');

    await cleanup();
}

async function cleanup() {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
}

main().catch(async (error) => {
    console.error('❌ Error:', error);
    await cleanup();
});
