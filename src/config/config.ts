import 'dotenv/config';

export const config = {
  // Application
  nodeEnvironment: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  // Database
  databaseUrl: process.env.DATABASE_URL!,

  // Redis
  redisUrl: process.env.REDIS_URL,
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),

  // Phorest API
  phorestApiBaseUrl: process.env.PHOREST_API_BASE_URL!,
  phorestBusinessId: process.env.PHOREST_BUSINESS_ID!,
  phorestBranchId: process.env.PHOREST_BRANCH_ID!,
  phorestUsername: process.env.PHOREST_USERNAME!,
  phorestPassword: process.env.PHOREST_PASSWORD!,

  // GoHighLevel API
  ghlApiBaseUrl: process.env.GHL_API_BASE_URL!,
  ghlClientId: process.env.GHL_CLIENT_ID!,
  ghlClientSecret: process.env.GHL_CLIENT_SECRET!,
  ghlLocationId: process.env.GHL_LOCATION_ID!,
  ghlRedirectUri: process.env.GHL_REDIRECT_URI!,

  // Sync Configuration
  syncPollingIntervalMs: parseInt(process.env.SYNC_POLLING_INTERVAL_MS || '300000', 10),
  syncBatchSize: parseInt(process.env.SYNC_BATCH_SIZE || '100', 10),
  syncRetryAttempts: parseInt(process.env.SYNC_RETRY_ATTEMPTS || '3', 10),
  syncRetryDelayMs: parseInt(process.env.SYNC_RETRY_DELAY_MS || '5000', 10),
  // Set to 0 for unlimited (production), or a number for testing (e.g., 5)
  syncMaxRecords: parseInt(process.env.SYNC_MAX_RECORDS || '0', 10),

  // Retry Configuration for Network Errors
  maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10),
  retryInitialDelayMs: parseInt(process.env.RETRY_INITIAL_DELAY_MS || '1000', 10),
  retryMaxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '30000', 10),
};
