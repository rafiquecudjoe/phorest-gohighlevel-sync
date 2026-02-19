import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);
    private pool: Pool;

    constructor() {
        const connectionString = PrismaService.getConnectionString();
        const pool = new Pool({ connectionString });
        const adapter = new PrismaPg(pool);

        super({ adapter });
        this.pool = pool;
    }

    /**
     * Get the database connection string
     * Uses _test database suffix when NODE_ENV is 'test'
     */
    static getConnectionString(): string {
        const baseConnectionString = process.env.DATABASE_URL;
        if (!baseConnectionString) {
            throw new Error('DATABASE_URL environment variable is not set');
        }

        const isTestEnv = process.env.NODE_ENV === 'test';
        if (!isTestEnv) {
            return baseConnectionString;
        }

        // Parse the connection string and append _test to the database name
        const url = new URL(baseConnectionString);
        const currentDbName = url.pathname.replace('/', '');

        // Don't double-suffix if already ends with _test
        if (currentDbName.endsWith('_test')) {
            console.log(`[PrismaService] Using test database: ${currentDbName}`);
            return baseConnectionString;
        }

        const testDbName = `${currentDbName}_test`;
        url.pathname = `/${testDbName}`;

        const testConnectionString = url.toString();
        console.log(`[PrismaService] Using test database: ${testDbName}`);
        return testConnectionString;
    }

    /**
     * Get test connection string (for use in tests without instantiating service)
     */
    static getTestConnectionString(): string {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'test';
        const connString = PrismaService.getConnectionString();
        process.env.NODE_ENV = originalEnv;
        return connString;
    }

    async onModuleInit() {
        await this.$connect();
        this.logger.log(`Connected to database (test mode: ${process.env.NODE_ENV === 'test'})`);
    }

    async onModuleDestroy() {
        await this.$disconnect();
        await this.pool.end();
    }
}
