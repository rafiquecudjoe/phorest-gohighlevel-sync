// GoHighLevel API Configuration
export interface GhlConfig {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    locationId: string;
    redirectUri: string;
}

// GoHighLevel Contact (matches API documentation - Dec 2024)
export interface GhlContact {
    id: string;
    locationId: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    emailLowerCase?: string;
    phone?: string;
    companyName?: string;
    website?: string;
    address1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    dateOfBirth?: string;
    gender?: string;
    timezone?: string;
    dnd?: boolean;
    dndSettings?: GhlDndSettings;
    tags?: string[];
    customFields?: GhlCustomFieldValue[];
    source?: string;
    type?: string;
    assignedTo?: string;
    dateAdded?: string;
    dateUpdated?: string;

    // Lowercase search fields (system-generated)
    firstNameLowerCase?: string;
    lastNameLowerCase?: string;
    fullNameLowerCase?: string;

    // Additional fields from API docs
    attachments?: string;
    ssn?: string;
    keyword?: string;
    lastActivity?: string;
    businessId?: string;
    visitorId?: string;

    // Attribution tracking
    attributionSource?: GhlAttributionSource;
    lastAttributionSource?: GhlAttributionSource;
}

export interface GhlDndSettings {
    Call?: GhlDndChannel;
    Email?: GhlDndChannel;
    SMS?: GhlDndChannel;
    WhatsApp?: GhlDndChannel;
    GMB?: GhlDndChannel;
    FB?: GhlDndChannel;
}

export interface GhlDndChannel {
    status: string;
    message?: string;
    code?: string;
}

export interface GhlAttributionSource {
    url?: string;
    campaign?: string;
    utmSource?: string;
    utmMedium?: string;
    utmContent?: string;
    referrer?: string;
    campaignId?: string;
    fbclid?: string;
    gclid?: string;
    msclikid?: string;
    dclid?: string;
    fbc?: string;
    fbp?: string;
    fbEventId?: string;
    userAgent?: string;
    ip?: string;
    medium?: string;
    mediumId?: string;
}

export interface GhlCustomFieldValue {
    id: string;
    key?: string;
    value: string | number | boolean | string[];
}

// GoHighLevel Create/Update Contact Request
export interface GhlCreateContactRequest {
    locationId: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    phone?: string;
    companyName?: string;
    website?: string;
    address1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    dateOfBirth?: string;
    gender?: string;
    timezone?: string;
    tags?: string[];
    customFields?: GhlCustomFieldValue[];
    source?: string;
    assignedTo?: string;
    dnd?: boolean;
    dndSettings?: GhlDndSettings;
}

export type GhlUpdateContactRequest = Partial<GhlCreateContactRequest>;

// GoHighLevel Upsert Contact Request
export interface GhlUpsertContactRequest extends GhlCreateContactRequest {
    // Upsert will match on email or phone
}

// GoHighLevel Calendar
export interface GhlCalendar {
    id: string;
    locationId: string;
    name: string;
    description?: string;
    slug?: string;
    isActive: boolean;
}

// GoHighLevel Appointment
export interface GhlAppointment {
    id: string;
    calendarId: string;
    locationId: string;
    contactId: string;
    title?: string;
    startTime: string;
    endTime: string;
    status: string;
    appointmentStatus: string;
    assignedUserId?: string;
    address?: string;
    notes?: string;
    rrule?: string;
    dateAdded?: string;
    dateUpdated?: string;
}

// GoHighLevel Create Appointment Request
export interface GhlCreateAppointmentRequest {
    calendarId: string;
    locationId: string;
    contactId: string;
    startTime: string;
    endTime?: string;
    title?: string;
    description?: string; // Stylist name (accessible via {{appointment.description}})
    appointmentStatus?: string;
    assignedUserId?: string;
    address?: string;
    notes?: string;
    customFields?: Array<{ id: string; value: string }>;
    ignoreFreeSlotValidation?: boolean;
    ignoreDateRange?: boolean;
}

export type GhlUpdateAppointmentRequest = Partial<GhlCreateAppointmentRequest>;

// GoHighLevel Custom Field
export interface GhlCustomField {
    id: string;
    name: string;
    fieldKey: string;
    dataType: string;
    position: number;
}

// GoHighLevel User
export interface GhlUser {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    roles: {
        type: string;
        role: string;
        locationIds: string[];
    };
    companyId?: string;
}

export interface GhlCreateUserRequest {
    companyId: string;
    firstName: string;
    lastName: string;
    email: string;
    password?: string;
    phone?: string;
    type: 'account' | 'agency';
    role: 'user' | 'admin';
    locationIds: string[];
    permissions?: Record<string, boolean>;
}

export interface GhlLocation {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    companyId: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    website?: string;
    timezone?: string;
    settings?: any;
}

// GoHighLevel Opportunity
export interface GhlOpportunity {
    id: string;
    name: string;
    pipelineId: string;
    pipelineStageId: string;
    contactId: string;
    status: string;
    monetaryValue?: number;
    createdAt: string;
    updatedAt: string;
}

// GoHighLevel OAuth Token Response
export interface GhlOAuthTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
    locationId?: string;
    companyId?: string;
    userId?: string;
}

// GoHighLevel API Response wrapper
export interface GhlPaginatedResponse<T> {
    contacts?: T[];
    calendars?: T[];
    events?: T[];
    meta?: {
        total: number;
        currentPage: number;
        nextPage?: number;
        prevPage?: number;
    };
}

// Search Contacts Request/Response
export interface GhlSearchContactsRequest {
    locationId: string;
    query?: string;
    limit?: number;
    skip?: number;
}

export interface GhlSearchContactsResponse {
    contacts: GhlContact[];
    count: number;
}

// GoHighLevel Product
export interface GhlProduct {
    _id: string;
    name: string;
    description?: string;
    productType: 'PHYSICAL' | 'DIGITAL' | 'SERVICE';
    locationId: string;
    image?: string;
    availableInStore?: boolean;
    statementDescriptor?: string;
    createdAt?: string;
    updatedAt?: string;
}

// GoHighLevel Create Product Request
export interface GhlCreateProductRequest {
    name: string;
    locationId: string;
    description?: string;
    productType: 'PHYSICAL' | 'DIGITAL' | 'SERVICE';
    image?: string;
    availableInStore?: boolean;
    statementDescriptor?: string;
}

export type GhlUpdateProductRequest = Partial<GhlCreateProductRequest>;

