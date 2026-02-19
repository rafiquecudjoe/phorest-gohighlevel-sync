// Phorest API Endpoints
// Note: Base URL already includes /api/business, so endpoints start with /{businessId}
export const PHOREST_ENDPOINTS = {
    // Client endpoints (at business level, not branch level)
    CLIENTS: (businessId: string) =>
        `/${businessId}/client`,
    CLIENT: (businessId: string, clientId: string) =>
        `/${businessId}/client/${clientId}`,
    CLIENT_SERVICE_HISTORIES: (businessId: string, clientId: string) =>
        `/${businessId}/client/${clientId}/service-histories`,
    CLIENT_BATCH: (businessId: string) =>
        `/${businessId}/client/batch`,
    WALK_IN_CLIENT: (businessId: string, branchId: string) =>
        `/${businessId}/branch/${branchId}/client/walk-in`,


    // Client Category endpoints (at business level, NOT branch level per API docs)
    CLIENT_CATEGORIES: (businessId: string) =>
        `/${businessId}/category/client`,
    CLIENT_CATEGORY: (businessId: string, categoryId: string) =>
        `/${businessId}/category/client/${categoryId}`,

    // Appointment endpoints
    APPOINTMENTS: (businessId: string, branchId: string) =>
        `/${businessId}/branch/${branchId}/appointment`,
    APPOINTMENT: (businessId: string, branchId: string, appointmentId: string) =>
        `/${businessId}/branch/${branchId}/appointment/${appointmentId}`,
    APPOINTMENT_CHECKIN: (businessId: string, branchId: string, appointmentId: string) =>
        `/${businessId}/branch/${branchId}/appointment/${appointmentId}/check-in`,
    APPOINTMENTS_CONFIRM: (businessId: string, branchId: string) =>
        `/${businessId}/branch/${branchId}/appointment/confirm`,
    APPOINTMENTS_CANCEL: (businessId: string, branchId: string) =>
        `/${businessId}/branch/${branchId}/appointment/cancel`,
    APPOINTMENT_NOTES: (businessId: string, branchId: string, appointmentId: string) =>
        `/${businessId}/branch/${branchId}/appointment/${appointmentId}/notes`,

    // Booking endpoints
    BOOKING: (businessId: string, branchId: string) =>
        `/${businessId}/branch/${branchId}/booking`,
    BOOKING_CANCEL: (businessId: string, branchId: string, bookingId: string) =>
        `/${businessId}/branch/${branchId}/booking/${bookingId}/cancel`,
    BOOKING_ACTIVATE: (businessId: string, branchId: string, bookingId: string) =>
        `/${businessId}/branch/${branchId}/booking/${bookingId}/activate`,
    BOOKING_NOTES: (businessId: string, branchId: string, bookingId: string) =>
        `/${businessId}/branch/${branchId}/booking/${bookingId}/notes`,

    // Check-in endpoint
    CHECKIN: (businessId: string, branchId: string) =>
        `/${businessId}/branch/${branchId}/check-in`,

    // Loyalty Points endpoint
    LOYALTY_POINTS: (businessId: string, branchId: string) =>
        `/${businessId}/branch/${branchId}/loyalty-points/change`,

    // Product endpoints
    PRODUCTS: (businessId: string, branchId: string) =>
        `/${businessId}/branch/${branchId}/product`,

    // Service endpoints
    SERVICES: (businessId: string, branchId: string) =>
        `/${businessId}/branch/${branchId}/service`,

    // Staff endpoints
    STAFF: (businessId: string, branchId: string) =>
        `/${businessId}/branch/${branchId}/staff`,
    STAFF_MEMBER: (businessId: string, branchId: string, staffId: string) =>
        `/${businessId}/branch/${branchId}/staff/${staffId}`,
    STAFF_BATCH: (businessId: string, branchId: string) =>
        `/${businessId}/branch/${branchId}/staff/batch`,

    // Branch endpoints
    BRANCHES: (businessId: string) =>
        `/${businessId}/branch`,
};
