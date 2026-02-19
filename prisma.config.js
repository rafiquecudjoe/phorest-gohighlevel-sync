const path = require('node:path');

// Load .env file if present (local dev). In production (Docker/Coolify),
// DATABASE_URL is injected directly into process.env — dotenv is not needed.
try { require('dotenv').config(); } catch (_) { }

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
}

// Dependency-free Prisma 7 config for production CLI compatibility
module.exports = {
    schema: path.join(__dirname, 'prisma', 'schema.prisma'),
    datasource: {
        url: connectionString,
    },
};
