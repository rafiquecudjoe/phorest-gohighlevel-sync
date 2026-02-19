
require('dotenv').config();
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { StaffSyncService } from '../src/sync/services/staff-sync.service';
import { ProductSyncService } from '../src/sync/services/product-sync.service';
import { PhorestClientUpdateSyncService } from '../src/sync/services/phorest-client-update-sync.service';
import { AppointmentSyncService } from '../src/sync/services/appointment-sync.service';
import { BookingSyncService } from '../src/sync/services/booking-sync.service';
import { LoyaltySyncService } from '../src/sync/services/loyalty-sync.service';

// Force configuration for this run
process.env.SYNC_MAX_RECORDS = '10';

async function bootstrap() {
    console.log('🚀 Starting INITIAL DATA SYNC (Limit: 10 valid records/entity)');
    console.log('------------------------------------------------------');

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
    const bookingService = app.get(BookingSyncService);
    const loyaltyService = app.get(LoyaltySyncService);

    try {
        // 1. Dependencies
        console.log('\n📦 1. Syncing Dependencies (Staff & Products)...');

        console.log('   - Syncing Staff...');
        const staffResult = await staffService.syncPhorestToGhl();
        console.log(`     ✅ Staff: ${staffResult.created} created, ${staffResult.updated} updated, ${staffResult.skipped} skipped`);

        console.log('   - Syncing Products...');
        // Correct method name is syncPhorestProducts
        const prodResult = await (productService as any).syncPhorestProducts();
        console.log(`     ✅ Products: ${prodResult.created} created, ${prodResult.updated} updated, ${prodResult.skipped} skipped`);

        // 2. Core (Clients)
        console.log('\n👤 2. Syncing Core Data (Clients)...');
        // Cast options to any to avoid TS errors
        const clientResult = await clientService.syncPhorestToGhl({ fullSync: true } as any);
        console.log(`     ✅ Clients: ${clientResult.created} created, ${clientResult.updated} updated, ${clientResult.skipped} skipped`);

        if (clientResult.skipped > 0) {
            console.log('     ⚠️  Note: Skipped items likely lacked email or phone. Logic continued until 10 valid records found (or data exhausted).');
        }

        // 3. Related Entities (Dependent on Clients)
        console.log('\n📅 3. Syncing Related Data (Appointments, Bookings, Loyalty)...');

        console.log('   - Syncing Appointments...');
        const apptResult = await appointmentService.syncPhorestToGhl({ fullSync: true } as any);
        console.log(`     ✅ Appointments: ${apptResult.created} created, ${apptResult.updated} updated`);

        console.log('   - Syncing Bookings...');
        const bookingResult = await bookingService.syncPhorestToGhl({ fullSync: true } as any);
        console.log(`     ✅ Bookings: ${bookingResult.created} created, ${bookingResult.updated} updated`);

        console.log('   - Syncing Loyalty Points...');
        const loyaltyResult = await loyaltyService.syncPhorestToGhl({ fullSync: true } as any);
        console.log(`     ✅ Loyalty: ${(loyaltyResult as any).created || 0} created, ${(loyaltyResult as any).updated || 0} updated`);

        console.log('\n✨ Initial Sync Complete!');

    } catch (error) {
        console.error('❌ Sync Failed:', error);
    } finally {
        await app.close();
        process.exit(0);
    }
}

bootstrap();
