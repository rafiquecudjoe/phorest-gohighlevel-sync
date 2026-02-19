/**
 * Phase 1: Import all Phorest data to local database
 * 
 * Usage:
 *   npx ts-node run-phorest-import.ts
 *   npx ts-node run-phorest-import.ts --entity=staff
 *   npx ts-node run-phorest-import.ts --entity=products
 *   npx ts-node run-phorest-import.ts --entity=services
 *   npx ts-node run-phorest-import.ts --entity=clients --max=100
 *   npx ts-node run-phorest-import.ts --entity=client-categories
 *   npx ts-node run-phorest-import.ts --entity=appointments
 */

require('dotenv').config();
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PhorestStaffImportService } from '../src/sync/import/phorest-staff-import.service';
import { PhorestProductImportService } from '../src/sync/import/phorest-product-import.service';
import { PhorestServiceImportService } from '../src/sync/import/phorest-service-import.service';
import { PhorestClientImportService } from '../src/sync/import/phorest-client-import.service';
import { PhorestClientCategoryImportService } from '../src/sync/import/phorest-client-category-import.service';
import { PhorestAppointmentImportService } from '../src/sync/import/phorest-appointment-import.service';
import { PrismaService } from '../src/common/prisma.service';

async function bootstrap() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚀 PHASE 1: PHOREST → LOCAL DATABASE IMPORT');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Started: ${new Date().toISOString()}\n`);

    // Parse arguments
    const args = process.argv.slice(2);
    const entityArg = args.find(a => a.startsWith('--entity='));
    const maxArg = args.find(a => a.startsWith('--max='));

    const entity = entityArg?.split('=')[1];
    const maxRecords = maxArg ? parseInt(maxArg.split('=')[1]) : 0;

    if (entity) {
        console.log(`📋 Entity filter: ${entity}`);
    }
    if (maxRecords > 0) {
        console.log(`📋 Max records: ${maxRecords}`);
    }
    console.log('');

    const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const staffImport = app.get(PhorestStaffImportService);
    const productImport = app.get(PhorestProductImportService);
    const serviceImport = app.get(PhorestServiceImportService);
    const clientImport = app.get(PhorestClientImportService);
    const clientCategoryImport = app.get(PhorestClientCategoryImportService);
    const appointmentImport = app.get(PhorestAppointmentImportService);

    const results: Record<string, any> = {};

    try {
        // STAFF IMPORT
        if (!entity || entity === 'staff') {
            console.log('═══════════════════════════════════════');
            console.log('👤 IMPORTING STAFF');
            console.log('═══════════════════════════════════════\n');

            const staffResult = await staffImport.importAll();
            results.staff = staffResult;

            console.log(`   ✅ Total:   ${staffResult.total}`);
            console.log(`   ✨ Created: ${staffResult.created}`);
            console.log(`   🔄 Updated: ${staffResult.updated}`);
            console.log(`   ❌ Failed:  ${staffResult.failed}\n`);
        }

        // PRODUCTS IMPORT
        if (!entity || entity === 'products') {
            console.log('═══════════════════════════════════════');
            console.log('📦 IMPORTING PRODUCTS');
            console.log('═══════════════════════════════════════\n');

            const productResult = await productImport.importAll();
            results.products = productResult;

            console.log(`   ✅ Total:   ${productResult.total}`);
            console.log(`   ✨ Created: ${productResult.created}`);
            console.log(`   🔄 Updated: ${productResult.updated}`);
            console.log(`   ❌ Failed:  ${productResult.failed}\n`);
        }

        // SERVICES IMPORT
        if (!entity || entity === 'services') {
            console.log('═══════════════════════════════════════');
            console.log('💇 IMPORTING SERVICES');
            console.log('═══════════════════════════════════════\n');

            const serviceResult = await serviceImport.importAll();
            results.services = serviceResult;

            console.log(`   ✅ Total:   ${serviceResult.total}`);
            console.log(`   ✨ Created: ${serviceResult.created}`);
            console.log(`   🔄 Updated: ${serviceResult.updated}`);
            console.log(`   ❌ Failed:  ${serviceResult.failed}\n`);
        }

        // CLIENT CATEGORIES IMPORT
        if (!entity || entity === 'client-categories' || entity === 'categories') {
            console.log('═══════════════════════════════════════');
            console.log('🏷️ IMPORTING CLIENT CATEGORIES');
            console.log('═══════════════════════════════════════\n');

            const categoryResult = await clientCategoryImport.importAll();
            results.clientCategories = categoryResult;

            console.log(`   ✅ Total:   ${categoryResult.total}`);
            console.log(`   ✨ Created: ${categoryResult.created}`);
            console.log(`   🔄 Updated: ${categoryResult.updated}`);
            console.log(`   ❌ Failed:  ${categoryResult.failed}\n`);
        }

        // CLIENTS IMPORT
        if (!entity || entity === 'clients') {
            console.log('═══════════════════════════════════════');
            console.log('👥 IMPORTING CLIENTS');
            console.log('═══════════════════════════════════════\n');

            const clientResult = await clientImport.importAll({ maxRecords });
            results.clients = clientResult;

            console.log(`   ✅ Total:   ${clientResult.total}`);
            console.log(`   ✨ Created: ${clientResult.created}`);
            console.log(`   🔄 Updated: ${clientResult.updated}`);
            console.log(`   ❌ Failed:  ${clientResult.failed}\n`);
        }

        // APPOINTMENTS IMPORT
        if (!entity || entity === 'appointments') {
            console.log('═══════════════════════════════════════');
            console.log('📅 IMPORTING APPOINTMENTS (Last 30 days) & Deriving Bookings');
            console.log('═══════════════════════════════════════\n');

            const appointmentResult = await appointmentImport.importAll({ maxRecords });
            results.appointments = appointmentResult;

            console.log(`   ✅ Total:   ${appointmentResult.total}`);
            console.log(`   ✨ Created: ${appointmentResult.created}`);
            console.log(`   🔄 Updated: ${appointmentResult.updated}`);
            console.log(`   ❌ Failed:  ${appointmentResult.failed}\n`);
        }

        // BOOKINGS SUMMARY (Derived)
        if (!entity || entity === 'appointments' || entity === 'bookings') {
            try {
                // Count bookings in DB
                const bookingCount = await app.get(PrismaService).phorestBooking.count();
                console.log(`   📚 Total Bookings (Derived): ${bookingCount}\n`);
            } catch (e) {
                // Ignore if fails
            }
        }

        // SUMMARY
        console.log('═══════════════════════════════════════════════════════');
        console.log('📊 IMPORT SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`Completed: ${new Date().toISOString()}\n`);

        let totalCreated = 0;
        let totalUpdated = 0;
        let totalFailed = 0;

        for (const [name, result] of Object.entries(results)) {
            console.log(`${name.padEnd(16)} | Created: ${result.created.toString().padStart(5)} | Updated: ${result.updated.toString().padStart(5)} | Failed: ${result.failed.toString().padStart(3)}`);
            totalCreated += result.created;
            totalUpdated += result.updated;
            totalFailed += result.failed;
        }

        console.log('─────────────────────────────────────────────────────────');
        console.log(`${'TOTAL'.padEnd(16)} | Created: ${totalCreated.toString().padStart(5)} | Updated: ${totalUpdated.toString().padStart(5)} | Failed: ${totalFailed.toString().padStart(3)}`);
        console.log('═══════════════════════════════════════════════════════');

    } catch (error) {
        console.error('\n❌ IMPORT FAILED:', error);
    } finally {
        await app.close();
        process.exit(0);
    }
}

bootstrap();
