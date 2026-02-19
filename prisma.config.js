const path = require('node:path');
const { defineConfig } = require('prisma/config');

// Load .env file if present (local dev). In production (Docker/Coolify),
// DATABASE_URL is injected directly into process.env — dotenv is not needed.
try { require('dotenv').config(); } catch (_) { }

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
}

module.exports = defineConfig({
    schema: path.join(__dirname, 'prisma', 'schema.prisma'),
    datasource: {
        url: connectionString,
    },
});
