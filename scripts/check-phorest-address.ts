/**
 * Quick script to fetch sample clients from Phorest API and check address data
 * Run with: npx ts-node scripts/check-phorest-address.ts
 */

import { config } from 'dotenv';
config();

const PHOREST_API_BASE_URL = process.env.PHOREST_API_BASE_URL;
const PHOREST_BUSINESS_ID = process.env.PHOREST_BUSINESS_ID;
const PHOREST_USERNAME = process.env.PHOREST_USERNAME;
const PHOREST_PASSWORD = process.env.PHOREST_PASSWORD;

async function main() {
    console.log('🔍 Fetching sample clients from Phorest API...\n');

    const auth = Buffer.from(`${PHOREST_USERNAME}:${PHOREST_PASSWORD}`).toString('base64');

    // The PHOREST_API_BASE_URL already includes the business ID, so we just append /client
    const url = `${PHOREST_API_BASE_URL}/${PHOREST_BUSINESS_ID}/client?size=10`;
    console.log(`URL: ${url}\n`);

    const response = await fetch(url, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
        },
    });

    if (!response.ok) {
        console.error(`API Error: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.error(text);
        return;
    }

    const data = await response.json();
    const clients = data._embedded?.clients || [];

    console.log(`Found ${clients.length} sample clients:\n`);
    console.log('='.repeat(80));

    for (const client of clients) {
        console.log(`\n👤 ${client.firstName} ${client.lastName} (${client.clientId})`);
        console.log(`   Email: ${client.email || '(none)'}`);
        console.log(`   Mobile: ${client.mobile || '(none)'}`);

        if (client.address) {
            console.log('   📍 Address:');
            console.log(`      Street1: ${client.address.streetAddress1 || client.address.street || '(empty)'}`);
            console.log(`      Street2: ${client.address.streetAddress2 || '(empty)'}`);
            console.log(`      City: ${client.address.city || '(empty)'}`);
            console.log(`      State: ${client.address.state || '(empty)'}`);
            console.log(`      Postal: ${client.address.postalCode || '(empty)'}`);
            console.log(`      Country: ${client.address.country || '(empty)'}`);
        } else {
            console.log('   📍 Address: (no address object)');
        }
    }

    console.log('\n' + '='.repeat(80));

    // Summary
    const withCity = clients.filter((c: any) => c.address?.city).length;
    const withCountry = clients.filter((c: any) => c.address?.country).length;

    console.log('\n📊 Sample Summary:');
    console.log(`   With City: ${withCity}/${clients.length}`);
    console.log(`   With Country: ${withCountry}/${clients.length}`);
}

main().catch(console.error);
