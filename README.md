# Phorest-GHL Sync API

Two-way sync system between Phorest (salon management) and GoHighLevel (CRM/marketing).

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
npx prisma db push
npx prisma generate

# Start development server
pnpm run start:dev
```

## Architecture

```
Phorest → Local DB → GHL
```

**Two-Phase Sync:**
1. **Import Phase**: Phorest data → Local PostgreSQL (preserves original data)
2. **Sync Phase**: Local DB → GHL (transforms and syncs)

## Sync Schedules

All times are in server timezone. Jobs are staggered to avoid collisions.

| Sync | Cron | Schedule | Description |
|:---|:---|:---|:---|
| **Clients** | `2 */2 * * *` | Every 2 hours at :02 | Phorest clients → GHL contacts |
| **Appointments** | `5,15,25,35,45,55 * * * *` | Every 10 mins | Phorest appointments → GHL calendar |
| **Bookings** | `35 */2 * * *` | Every 2 hours at :35 | Online bookings sync |
| **Check-Ins** | `8,38 * * * *` | Every 30 mins at :08/:38 | Add notes for checked-in appointments |
| **Loyalty** | `45 */12 * * *` | Every 12 hours at :45 | Sync loyalty points to custom fields |
| **Staff** | `30 6 * * *` | Daily at 6:30 AM | Phorest staff → GHL contacts |
| **Products** | `15 5 * * *` | Daily at 5:15 AM | Phorest products → GHL tags |
| **Audit** | `0 1 * * *` | Daily at 1:00 AM | Verify sync counts match |

## Reliability Features

### 1. Auto-Repair
The system automatically detects if an appointment references a client that hasn't been synced to GHL yet.
- **Trigger**: Missing client detected during Appointment Sync.
- **Action**: Dispatches a high-priority `repair-single-client` job.
- **Optimization**: Performs a targeted, single-client fetch from Phorest (not a full sync) for sub-second resolution.

### 2. Thundering Herd Protection
- **Debouncing**: Prevents multiple repair jobs for the same client from queuing simultaneously using deterministic Job IDs.
- **Benefit**: Reduces API load when a missing client has multiple appointments processed at once.

### 3. Graceful Error Handling
- **422 (Unprocessable)**: Treated as "Skipped" (likely duplicate), preventing sync failure noise.
- **400 (Bad Request)**: Logged as a "Validation Warning" with specific details (e.g., "Missing Phone"), rather than a system crash.

## Key Services

| Service | Location | Purpose |
|:---|:---|:---|
| `SyncJobProducer` | `src/queues/` | Schedule and trigger syncs |
| `*SyncService` | `src/sync/services/` | Business logic per entity |
| `*Processor` | `src/queues/processors/` | BullMQ job handlers |
| `SyncAuditService` | `src/sync/services/` | Midnight data verification |

## Scripts

All manual scripts are in `scripts/`:

| Script | Usage |
|:---|:---|
| `run-full-sync.ts` | Trigger complete sync |
| `run-initial-sync.ts` | First-time import |
| `run-phorest-import.ts` | Import Phorest data to local DB |
| `rollback-sync.ts` | Delete synced GHL data |
| `direct-appointment-sync.ts` | Manual appointment sync |

Run with: `npx ts-node scripts/<script>.ts`

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Phorest API
PHOREST_API_BASE_URL=https://api.phorest.com/third-party-api-server/api
PHOREST_BUSINESS_ID=...
PHOREST_BRANCH_ID=...
PHOREST_CLIENT_ID=...
PHOREST_CLIENT_SECRET=...

# GoHighLevel API
GHL_API_BASE_URL=https://services.leadconnectorhq.com
GHL_LOCATION_ID=...
GHL_DEFAULT_CALENDAR_ID=...

# Redis (for BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Monitoring

**Bull Board UI**: `http://localhost:3000/admin/queues`

Shows all queue statuses, jobs, and failures.

## Maintenance

### Check Sync Status
```bash
# View latest audit results
SELECT * FROM sync_audit_logs ORDER BY audited_at DESC LIMIT 10;

# View recent sync runs
SELECT * FROM sync_run_summaries ORDER BY created_at DESC LIMIT 10;
```

### Trigger Manual Sync
```typescript
// In code or via Bull Board
producer.triggerPhorestToGhlClientsSync();
producer.triggerPhorestToGhlAppointmentsSync();
producer.triggerSyncAudit();
```

### Common Issues

| Issue | Solution |
|:---|:---|
| 401 Unauthorized (GHL) | Token expired - check `ghl_oauth_tokens` table |
| Rate limit (429) | Reduce batch size or add delays |
| Missing contacts | Run `triggerSyncAudit()` to identify gaps |
| 400 Validation Error | Check Logs; usually missing Email/Phone in Phorest |

## Database Schema

Key tables:
- `entity_mappings` - Phorest↔GHL ID links
- `sync_run_summaries` - Sync run stats
- `sync_logs` - Detailed operation logs
- `sync_audit_logs` - Nightly audit results
- `phorest_*` - Local Phorest data cache

## Entity Mapping

| Phorest | GHL |
|:---|:---|
| Client | Contact |
| Appointment | Calendar Event |
| Staff | Contact (with staff tag) |
| Product | Tag on Contact |
| Loyalty Points | Custom Field |
