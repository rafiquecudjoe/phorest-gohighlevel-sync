
require('dotenv').config();
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { StaffSyncService } from '../src/sync/services/staff-sync.service';
import { ProductSyncService } from '../src/sync/services/product-sync.service';
import { PhorestClientUpdateSyncService } from '../src/sync/services/phorest-client-update-sync.service';
import { AppointmentSyncService } from '../src/sync/services/appointment-sync.service';
import { LoyaltySyncService } from '../src/sync/services/loyalty-sync.service';

// BATCH CONFIGURATION
const BATCH_SIZE = 100; // Records per batch
const PAUSE_BETWEEN_PHASES_MS = 2000; // 2 second pause between phases

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function bootstrap() {
    console.log('🚀 BATCHED FULL DATA SYNC');
    console.log('========================');
    console.log(`Started: ${new Date().toISOString()}`);
    console.log(`Batch Size: ${BATCH_SIZE} records\n`);

    const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    // Get Services
    const staffService = app.get(StaffSyncService);
    const productService = app.get(ProductSyncService);
    const clientService = app.get(PhorestClientUpdateSyncService);
    const appointmentService = app.get(AppointmentSyncService);
    const loyaltyService = app.get(LoyaltySyncService);

    const results: any = {};
    let hasErrors = false;

    try {
        // ========== PHASE 1: DEPENDENCIES ==========
        console.log('═══════════════════════════════════════');
        console.log('📦 PHASE 1: DEPENDENCIES (Staff + Products)');
        console.log('═══════════════════════════════════════\n');

        // Staff
        console.log('🔄 Syncing Staff...');
        try {
            const staffResult = await staffService.syncPhorestToGhl();
            results.staff = staffResult;
            console.log(`   ✅ Staff Complete: ${staffResult.created} created, ${staffResult.updated} updated, ${staffResult.skipped} skipped\n`);
        } catch (err: any) {
            console.error(`   ❌ Staff Failed: ${err.message}\n`);
            hasErrors = true;
            results.staff = { error: err.message };
        }

        await sleep(PAUSE_BETWEEN_PHASES_MS);

        // Products
        console.log('🔄 Syncing Products...');
        try {
            const prodResult = await (productService as any).syncPhorestProducts();
            results.products = prodResult;
            console.log(`   ✅ Products Complete: ${prodResult.created} created, ${prodResult.updated} updated, ${prodResult.skipped} skipped\n`);
        } catch (err: any) {
            console.error(`   ❌ Products Failed: ${err.message}\n`);
            hasErrors = true;
            results.products = { error: err.message };
        }

        await sleep(PAUSE_BETWEEN_PHASES_MS);

        // ========== PHASE 2: CORE DATA (CLIENTS) ==========
        console.log('═══════════════════════════════════════');
        console.log('👤 PHASE 2: CORE DATA (Clients)');
        console.log('═══════════════════════════════════════');
        console.log('   Expected: ~10,663 syncable records');
        console.log('   Note: 28% will be skipped (no contact info)\n');

        console.log('🔄 Syncing Clients (this may take 5-10 minutes)...');
        try {
            const clientResult = await clientService.syncPhorestToGhl({ fullSync: true } as any);
            results.clients = clientResult;
            console.log(`   ✅ Clients Complete:`);
            console.log(`      Created: ${clientResult.created}`);
            console.log(`      Updated: ${clientResult.updated}`);
            console.log(`      Skipped: ${clientResult.skipped}`);
            console.log(`      Failed:  ${clientResult.failed}`);
            if (clientResult.failed > 0) {
                console.log(`      ⚠️  Some clients failed - check logs for details\n`);
                hasErrors = true;
            } else {
                console.log('');
            }
        } catch (err: any) {
            console.error(`   ❌ Clients Failed: ${err.message}\n`);
            hasErrors = true;
            results.clients = { error: err.message };
        }

        await sleep(PAUSE_BETWEEN_PHASES_MS);

        // ========== PHASE 3: APPOINTMENTS ==========
        console.log('═══════════════════════════════════════');
        console.log('📅 PHASE 3: APPOINTMENTS (Last 30 days)');
        console.log('═══════════════════════════════════════\n');

        console.log('🔄 Syncing Appointments...');
        try {
            const apptResult = await appointmentService.syncPhorestToGhl({ fullSync: true } as any);
            results.appointments = apptResult;
            console.log(`   ✅ Appointments Complete: ${apptResult.created} created, ${apptResult.updated} updated\n`);
        } catch (err: any) {
            console.error(`   ❌ Appointments Failed: ${err.message}\n`);
            hasErrors = true;
            results.appointments = { error: err.message };
        }

        await sleep(PAUSE_BETWEEN_PHASES_MS);

        // ========== PHASE 4: LOYALTY ==========
        console.log('═══════════════════════════════════════');
        console.log('🎁 PHASE 4: LOYALTY POINTS');
        console.log('═══════════════════════════════════════\n');

        console.log('🔄 Syncing Loyalty Points...');
        try {
            const loyaltyResult = await loyaltyService.syncPhorestToGhl({ fullSync: true } as any);
            results.loyalty = loyaltyResult;
            console.log(`   ✅ Loyalty Complete: ${(loyaltyResult as any).created || 0} created, ${(loyaltyResult as any).updated || 0} updated\n`);
        } catch (err: any) {
            console.error(`   ❌ Loyalty Failed: ${err.message}\n`);
            hasErrors = true;
            results.loyalty = { error: err.message };
        }

        // ========== SUMMARY ==========
        console.log('═══════════════════════════════════════');
        console.log('📊 SYNC SUMMARY');
        console.log('═══════════════════════════════════════\n');
        console.log(`Completed: ${new Date().toISOString()}`);
        console.log(`Status: ${hasErrors ? '⚠️  COMPLETED WITH ERRORS' : '✅ SUCCESS'}\n`);
        console.log('Results:');
        console.log(JSON.stringify(results, null, 2));

        if (hasErrors) {
            console.log('\n⚠️  Some sync operations had errors. Review logs above for details.');
        } else {
            console.log('\n✨ All sync operations completed successfully!');
        }

    } catch (error) {
        console.error('\n❌ SYNC FAILED:', error);
    } finally {
        await app.close();
        process.exit(hasErrors ? 1 : 0);
    }
}

bootstrap();
