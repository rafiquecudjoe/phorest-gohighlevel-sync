# Phorest → GHL Data Sync Execution Plan

**Created:** December 24, 2025  
**Business:** Jazz Hair Studio

---

## 📋 Pre-Sync Checklist

- [ ] Verify `.env` has correct credentials (Phorest + GHL)
- [ ] Confirm `GHL_DEFAULT_CALENDAR_ID` is set to an **active** calendar
- [ ] Ensure GHL OAuth token has proper scopes
- [ ] Backup any existing GHL data if needed

---

## 🚀 Execution Phases

### Phase 1: Dependencies (Est. 1 min)
| Entity | Records | Command |
|--------|---------|---------|
| Staff | 25 | Auto-included in sync |
| Products | 1,206 | Auto-included in sync |

### Phase 2: Core Data (Est. 10-15 min)
| Entity | Records | Syncable |
|--------|---------|----------|
| Clients | 14,806 | 10,663 (72%) |

### Phase 3: Related Data (Est. 5 min)
| Entity | Records |
|--------|---------|
| Appointments (30d) | 849 |
| Loyalty Points | 10,663 |

---

## 🔧 Execution Commands

### Option A: Full Initial Sync (Recommended)
```bash
cd /home/rafique/Documents/small-business/api

# Run full initial sync (uses SYNC_MAX_RECORDS from .env or unlimited)
node -r ts-node/register -r tsconfig-paths/register run-initial-sync.ts
```

### Option B: Limited Test Sync (10 records each)
```bash
# Already configured for 10 records limit
node -r ts-node/register -r tsconfig-paths/register run-initial-sync.ts
```

### Option C: Individual Entity Sync (via API)
```bash
# Start the API server
npm run start:dev

# Trigger individual syncs via curl
curl -X POST http://localhost:3000/api/v1/sync/staff/phorest-to-ghl
curl -X POST http://localhost:3000/api/v1/sync/products/phorest-to-ghl
curl -X POST http://localhost:3000/api/v1/sync/clients/phorest-to-ghl -d '{"forceFullSync":true}'
curl -X POST http://localhost:3000/api/v1/sync/appointments/phorest-to-ghl
curl -X POST http://localhost:3000/api/v1/sync/loyalty/phorest-to-ghl
```

---

## 📊 Monitoring

### Check Bull Board (Job Queue Dashboard)
```
http://localhost:3000/admin/queues
```

### Watch Logs
```bash
# Logs will show sync progress in real-time
# Look for: "✅ Clients: X created, Y updated, Z skipped"
```

---

## ⚠️ Expected Outcomes

| Entity | Expected Synced | Notes |
|--------|-----------------|-------|
| Clients | ~10,663 | 28% skipped (no contact info) |
| Staff | 25 | All mapped |
| Products | 1,206 | Stored as tag references |
| Appointments | 849 | Last 30 days only |
| Loyalty | 10,663 | Updates client custom fields |

---

## 🔄 Post-Sync Verification

1. **Check GHL Contacts**: Verify new contacts appear
2. **Check Mappings DB**: Query `entity_mappings` table
3. **Review Sync Logs**: Check for any failed items
4. **Test Appointment Sync**: Confirm calendar events appear

---

## 📅 Ongoing Sync Schedule

After initial sync, configure recurring jobs:
- **Clients**: Every 15 minutes (incremental)
- **Appointments**: Every 5 minutes
- **Loyalty**: Daily at midnight
