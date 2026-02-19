// GoHighLevel API v2 Endpoints
export const GHL_ENDPOINTS = {
    // OAuth endpoints
    OAUTH_TOKEN: '/oauth/token',

    // Contact endpoints
    CONTACTS: '/contacts/',
    CONTACT: (contactId: string) => `/contacts/${contactId}`,
    CONTACT_UPSERT: '/contacts/upsert',
    CONTACTS_SEARCH: '/contacts/search',
    CONTACT_NOTES: (contactId: string) => `/contacts/${contactId}/notes`,

    // Calendar endpoints
    CALENDARS: '/calendars/',
    CALENDAR: (calendarId: string) => `/calendars/${calendarId}`,
    CALENDAR_FREE_SLOTS: (calendarId: string) => `/calendars/${calendarId}/free-slots`,

    // Appointment endpoints
    APPOINTMENTS: '/calendars/events/appointments',
    APPOINTMENT: (eventId: string) => `/calendars/events/appointments/${eventId}`,
    APPOINTMENT_NOTES: (appointmentId: string) => `/calendars/appointments/${appointmentId}/notes`,
    CALENDAR_EVENTS: '/calendars/events',

    // Custom Field endpoints
    CUSTOM_FIELDS: (locationId: string) => `/locations/${locationId}/customFields`,
    CUSTOM_FIELD: (locationId: string, fieldId: string) =>
        `/locations/${locationId}/customFields/${fieldId}`,

    // User endpoints
    USERS: '/users/',
    USER: (userId: string) => `/users/${userId}`,
    USERS_SEARCH: '/users/search',

    // Opportunity endpoints
    OPPORTUNITIES: '/opportunities/',
    OPPORTUNITY: (opportunityId: string) => `/opportunities/${opportunityId}`,
    OPPORTUNITY_UPSERT: '/opportunities/upsert',

    // Location endpoints
    LOCATIONS: '/locations/',
    LOCATION: (locationId: string) => `/locations/${locationId}`,

    // Product endpoints
    PRODUCTS: '/products/',
    PRODUCT: (productId: string) => `/products/${productId}`,
};
