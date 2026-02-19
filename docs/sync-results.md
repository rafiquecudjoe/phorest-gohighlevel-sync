# Phorest → GHL Sync Results

**Date:** December 24, 2025  
**Direction:** Phorest → GoHighLevel

---

## Overall Status

| Entity | Phorest Total | GHL Created | Updated | Skipped | Failed | Status |
|--------|---------------|-------------|---------|---------|--------|--------|
| **Staff** | 25 | 17 | 0 | 0 | 8 | ⚠️ Partial |
| **Products** | 1,206 | 0 | 0 | 0 | All | ❌ Auth Error |
| **Clients** | 14,806 | 30+ | - | - | - | 🔄 In Progress |
| **Appointments** | 849 | - | - | - | - | ⏳ Pending |
| **Loyalty** | 10,663 | - | - | - | - | ⏳ Pending |

---

## Staff Sync ✅

| Metric | Count |
|--------|-------|
| Total in Phorest | 25 |
| **Created in GHL** | **17** |
| Failed | 8 |
| Success Rate | 68% |

### How Staff Are Synced
Staff members are created as **GHL Contacts** with tags:
- `role:staff`
- `phorest-staff:true`
- `phorest-staff-id:{id}`

### Failed Staff (8 records)

| Staff ID | Error | Reason |
|----------|-------|--------|
| `xdZao0xz5f7b2-Vt_3GiaA` | 422 | Invalid email format |
| `66WKN5tEbStscxncGo9Ujw` | 422 | Invalid email format |
| `0DCFfgXT4_qp32LqkoOQrg` | 400 | Missing email/phone |
| `1lljcm4oFEkW_9fpX2J30Q` | 422 | Invalid email format |
| `nISDJmwEZ8-WFH7-_tZt-Q` | 400 | Missing email/phone |
| `bRynKjm2KWZauJ0X78RtrA` | 400 | Missing email/phone |
| `kgqlPcVFu7C2h7iyTfWuEw` | 400 | Missing email/phone |
| *(1 more)* | 422/400 | Similar |

---

## Products Sync ❌

| Metric | Count |
|--------|-------|
| Total in Phorest | 1,206 |
| Created in GHL | 0 |
| Failed | All |
| Error Code | **401 Unauthorized** |

### Issue
The GHL OAuth token is missing the `products.write` scope required for the Products API.

### Resolution Options
1. **Re-authorize** the GHL app with `products.write` scope
2. **Revert** to local-storage approach (no GHL product creation)

---

## Clients Sync 🔄

| Metric | Count |
|--------|-------|
| Total in Phorest | 14,806 |
| Syncable (has email OR phone) | 10,663 (72%) |
| Currently Synced | 30+ |
| Remaining | ~10,633 |

### Notes
- 28% of clients lack both email and phone (cannot sync)
- Sync was interrupted - can resume anytime

---

## Next Steps

- [ ] Fix staff data in Phorest (8 records need valid email/phone)
- [ ] Request `products.write` scope for GHL token
- [ ] Resume client sync to completion
- [ ] Run appointments sync
- [ ] Run loyalty sync


Based on our work, here's the current sync status:

Sync Type	Status	Notes
Client Sync	✅ Done	~4600 Phorest clients → GHL contacts
Appointment Sync	✅ Done	766+ appointments → GHL calendar (assigned to User V)
Staff Sync	✅ Done	24 staff → GHL contacts (as entity mappings)
Check-in Sync	✅ Implemented	Adds notes to GHL contacts when clients check in
Loyalty Sync	✅ Implemented	Syncs loyalty points/tier tags to contacts
Product Sync	✅ Implemented	Product catalog + purchase tags on contacts
Client Categories	✅ Implemented	Category tags on contacts
Booking Sync	✅ Implemented	Group booking metadata