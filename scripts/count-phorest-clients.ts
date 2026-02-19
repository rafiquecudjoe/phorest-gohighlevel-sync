/**
 * Script to count total clients in Phorest
 */
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function countPhorestClients() {
    const baseUrl = process.env.PHOREST_API_BASE_URL;
    const businessId = process.env.PHOREST_BUSINESS_ID;
    const branchId = process.env.PHOREST_BRANCH_ID;
    const username = process.env.PHOREST_USERNAME;
    const password = process.env.PHOREST_PASSWORD;

    if (!baseUrl || !businessId || !branchId || !username || !password) {
        console.error('Missing Phorest configuration. Please check your .env file.');
        process.exit(1);
    }

    const client = axios.create({
        baseURL: `${baseUrl}/${businessId}`,
        auth: {
            username,
            password,
        },
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
    });

    try {
        // Request just 1 client to get the total count from pagination metadata
        const response = await client.get('/client', {
            params: {
                size: 1,
                page: 0,
            },
        });

        const pageInfo = response.data.page;

        // Also get staff count (staff is at branch level)
        const staffClient = axios.create({
            baseURL: `${baseUrl}/${businessId}/branch/${branchId}`,
            auth: { username, password },
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        });

        const staffResponse = await staffClient.get('/staff', {
            params: { size: 1, page: 0 },
        });

        const staffPageInfo = staffResponse.data.page;

        console.log('\n=== Phorest Counts ===');
        console.log(`Total Clients: ${pageInfo.totalElements.toLocaleString()}`);
        console.log(`Total Staff: ${staffPageInfo.totalElements.toLocaleString()}`);
        console.log('======================\n');
        console.log('Note: Clients and Staff are separate entities in Phorest.');

    } catch (error: any) {
        if (error.response) {
            console.error('API Error:', error.response.status, error.response.data);
        } else {
            console.error('Error:', error.message);
        }
        process.exit(1);
    }
}

countPhorestClients();
