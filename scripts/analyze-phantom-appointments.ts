
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GhlApiClient } from '../src/integrations/gohighlevel/ghl-api.client';
import { GhlOAuthService } from '../src/integrations/gohighlevel/ghl-oauth.service';
import { PrismaService } from '../src/common/prisma.service';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
    ],
    providers: [
        GhlApiClient,
        GhlOAuthService,
        PrismaService,
    ],
})
class InvestigationModule { }

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(InvestigationModule);
    const ghlClient = app.get(GhlApiClient);
    const prisma = app.get(PrismaService);
    const config = app.get(ConfigService);

    const LOCATION_ID = config.get('GHL_LOCATION_ID');
    const CALENDAR_ID = config.get('GHL_CALENDAR_ID');

    console.log(`🔧 Config check:`);
    console.log(`   Location ID: ${LOCATION_ID ? (LOCATION_ID.substring(0, 4) + '...') : 'MISSING'}`);
    console.log(`   Calendar ID: ${CALENDAR_ID ? (CALENDAR_ID.substring(0, 4) + '...') : 'MISSING'}`);

    if (!LOCATION_ID || !CALENDAR_ID) {
        console.error('❌ Missing required configuration (GHL_LOCATION_ID or GHL_CALENDAR_ID)');
        return;
    }

    // Reduce window to 7 days
    const now = Date.now();
    const future = now + (7 * 24 * 60 * 60 * 1000);
    const past = now - (2 * 24 * 60 * 60 * 1000);

    try {
        console.log(`📡 Requesting events from ${new Date(past).toISOString()} to ${new Date(future).toISOString()}`);

        const events = await ghlClient.getCalendarEvents({
            locationId: LOCATION_ID,
            calendarId: CALENDAR_ID,
            startTime: past,
            endTime: future,
        });

        console.log(`📊 Found ${events.length} appointments in GHL window.`);

        // Analyze sample
        const eventsToCheck = events.slice(0, 50);

        console.log(`\n🕵️ Analyzing sample of ${eventsToCheck.length} appointments:`);

        let unmappedCount = 0;
        let mappedCount = 0;

        for (const event of eventsToCheck) {
            const ghlId = event.id;
            const title = event.title || 'No Title';
            const startTime = event.startTime;

            // CORRECTED mapping check
            const mapping = await prisma.entityMapping.findFirst({
                where: {
                    ghlId: ghlId,
                    entityType: 'appointment'
                },
            });

            // Heuristic check
            const looseMatch = await prisma.phorestAppointment.findFirst({
                where: {
                    startTime: new Date(startTime),
                }
            });

            const isMapped = !!mapping;
            if (isMapped) mappedCount++; else unmappedCount++;

            if (!isMapped) {
                console.log(`\n❌ UNMAPPED [${ghlId}]`);
                console.log(`   Title: ${title} | Start: ${new Date(startTime).toISOString()}`);
                console.log(`   Local DB Match (Heuristic): ${looseMatch ? `✅ YES (Phorest ID: ${looseMatch.id})` : '⛔ NO MATCH'}`);
                console.log(`   Possible Duplicate? ${looseMatch ? 'LIKELY' : 'UNKNOWN'}`);
            }
        }

        console.log(`\n📉 Summary of Sample:`);
        console.log(`   Mapped: ${mappedCount}`);
        console.log(`   Unmapped: ${unmappedCount}`);

    } catch (err: any) {
        console.error('Failed to fetch:', err.message);
        if (err.response) {
            console.error('Status:', err.response.status);
            // Log full data for debugging 422
            console.error('Data:', JSON.stringify(err.response.data, null, 2));
        }
    }

    await app.close();
    process.exit(0);
}

bootstrap();
