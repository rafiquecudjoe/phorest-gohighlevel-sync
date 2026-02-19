# Phorest Data Inventory Report

**Generated:** December 24, 2025  
**Business:** Jazz Hair Studio (Belleville, Ontario)

---

## 📊 Entity Counts

| Entity | Total Records | Syncable | Status |
|--------|---------------|----------|--------|
| **Clients** | 14,806 | 10,663 (72%) | ✅ Ready |
| **Staff** | 25 | 25 | ✅ Ready |
| **Products** | 1,206 | 1,206 | ✅ Ready |
| **Appointments** | 849 (30d) | 849 | ✅ Ready |
| **Client Categories** | 10 | 10 | ✅ Ready |
| **Branches** | 1 | 1 | ✅ Ready |
| **Clients w/ Loyalty Cards** | 14,806 | 10,663 | ✅ Ready |

---

## 📞 Client Contact Quality

| Metric | Count | Percentage |
|--------|-------|------------|
| Total Clients | 14,806 | 100% |
| With Email | 2,150 | 14.5% |
| With Phone | 9,720 | 65.6% |
| **NO Email & NO Phone** | 4,143 | **28.0%** ⚠️ |
| **Syncable (Email OR Phone)** | 10,663 | **72.0%** ✅ |

---

## 🔄 Sync Services Status

| Service | Data Source | Records | Sync Method |
|---------|-------------|---------|-------------|
| **ClientSyncService** | `/client` endpoint | 10,663 | Direct fetch → GHL Contact |
| **StaffSyncService** | `/staff` endpoint | 25 | Direct fetch → GHL User mapping |
| **ProductSyncService** | `/product` endpoint | 1,206 | Direct fetch → GHL Tags |
| **AppointmentSyncService** | `/appointment` endpoint | 849 | Direct fetch → GHL Calendar |
| **BookingSyncService** | Appointments with `bookingId` | ~TBD | Filter from Appointments |
| **CheckInSyncService** | Appointments with `state=CHECKED_IN` | ~TBD | Filter from Appointments |
| **LoyaltySyncService** | Client `loyaltyCard` field | 14,806 | From Clients → GHL Custom Fields |

---

## 🎯 Initial Sync Recommendation

For a controlled initial sync, process in this order:

1. **Staff** (25 records) - Required for appointment assignment
2. **Products** (1,206 records) - Required for purchase history tags
3. **Clients** (10,663 syncable) - Core contact data
4. **Appointments** (849 records) - Last 30 days
5. **Loyalty** (10,663 records) - Custom fields update

**Estimated Time:** ~15-20 minutes for full initial sync

---

## ⚠️ Data Quality Notes

1. **28% of clients lack contact info** - These will be skipped during sync
2. **All clients have loyalty card objects** - But many have `points: 0`
3. **Client Categories** are at business level (not branch)
4. **Bookings/Check-Ins** are derived from Appointment states (not separate entities)
