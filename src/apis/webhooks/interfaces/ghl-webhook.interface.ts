export enum GhlWebhookEventType {
    CONTACT_CREATE = 'ContactCreate',
    CONTACT_UPDATE = 'ContactUpdate',
    CONTACT_DELETE = 'ContactDelete',
    APPOINTMENT_CREATE = 'AppointmentCreate',
    APPOINTMENT_UPDATE = 'AppointmentUpdate',
    APPOINTMENT_DELETE = 'AppointmentDelete',
}

export interface GhlContactWebhookPayload {
    type: string; // Event type
    locationId: string;
    id: string; // Contact ID
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    // ... other fields from GHL if needed
}

export interface GhlWebhookPayload {
    type: GhlWebhookEventType;
    locationId: string;
    id: string; // Entity ID (e.g. contactId)
    // Custom fields and other data are usually flat in the root or in a specific object depending on the event
    [key: string]: any;
}
