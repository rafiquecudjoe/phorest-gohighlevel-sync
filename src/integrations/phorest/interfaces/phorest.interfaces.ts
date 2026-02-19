// Phorest API Configuration
export interface PhorestConfig {
    baseUrl: string;
    businessId: string;
    branchId: string;
    username: string;
    password: string;
}

// Phorest API Response wrapper
export interface PhorestPaginatedResponse<T> {
    _embedded: {
        [key: string]: T[];
    };
    page: {
        size: number;
        totalElements: number;
        totalPages: number;
        number: number;
    };
}

// Phorest Client (matches API documentation - Dec 2024)
export interface PhorestClient {
    clientId: string;
    firstName: string;
    lastName: string;
    email?: string;
    mobile?: string;
    landLine?: string;
    linkedClientMobile?: string;
    gender?: 'MALE' | 'FEMALE' | string;
    birthDate?: string; // YYYY-MM-DD
    address?: PhorestAddress;
    clientCategoryIds?: string[];
    notes?: string;
    version?: number;

    // Status flags
    archived?: boolean;
    banned: boolean;
    deleted: boolean;

    // Timestamps
    clientSince?: string; // ISO-8601
    createdAt: string;
    updatedAt: string;
    firstVisit?: string;
    lastVisit?: string;

    // Additional fields from API docs
    photoUrl?: string;
    externalId?: string;
    preferredStaffId?: string;
    lastStylistName?: string;
    creatingBranchId?: string;
    mergedToClientId?: string;

    // Marketing consent flags
    smsMarketingConsent?: boolean;
    emailMarketingConsent?: boolean;
    smsReminderConsent?: boolean;
    emailReminderConsent?: boolean;

    // Credit account
    creditAccount?: PhorestCreditAccount;

    // Loyalty card/points
    loyaltyCard?: PhorestLoyaltyCard;
}

export interface PhorestAddress {
    streetAddress1?: string;
    streetAddress2?: string;
    street?: string; // Legacy field
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
}

export interface PhorestCreditAccount {
    outstandingBalance?: number;
    creditDays?: number;
    creditLimit?: number;
}

export interface PhorestLoyaltyCard {
    serial?: string;
    points?: number;
}

// Phorest Booking Status (from API docs)
export type PhorestBookingStatus = 'ACTIVE' | 'RESERVED' | 'CANCELED';

// Phorest Booking Service Schedule
export interface PhorestBookingServiceSchedule {
    serviceId: string;
    startTime: string;
    endTime?: string;
    appointmentId?: string;
    staffId?: string;
    roomId?: string;
    machineId?: string;
    branchServiceGroupId?: string;
    serviceGroupItemOptionId?: string;
    alternativeStaffMember?: boolean;
    staffRequest?: boolean;
    clientCourseItemId?: string;
    price?: number;
}

// Phorest Client Appointment Schedule
export interface PhorestClientAppointmentSchedule {
    clientId: string;
    serviceSchedules: PhorestBookingServiceSchedule[];
}

// Phorest Booking (response from POST /booking)
export interface PhorestBooking {
    bookingId?: string;
    bookingStatus: PhorestBookingStatus;
    clientId: string;
    note?: string;
    // Deprecated - use clientAppointmentSchedules instead
    schedules?: PhorestBookingServiceSchedule[];
    // New structure for client appointment schedules
    clientAppointmentSchedules?: PhorestClientAppointmentSchedule[];
    // Additional fields from appointment data
    source?: string;
    createdAt?: string;
    updatedAt?: string;
}

// Phorest Appointment State Enums (from API docs - Dec 2024)
export type PhorestAppointmentState =
    | 'BOOKED'
    | 'ARRIVED'
    | 'STARTED'
    | 'COMPLETED'
    | 'NO_SHOW'
    | 'CANCELLED'
    | 'CHECKED_IN'  // Legacy compatibility
    | 'PAID';       // Legacy compatibility

export type PhorestActivationState = 'ACTIVE' | 'ARCHIVED' | 'CANCELED';

// Phorest Appointment (matches API documentation - Dec 2024)
export interface PhorestAppointment {
    appointmentId: string;
    version?: number;
    branchId: string;
    bookingId?: string;

    // Client and staff
    clientId?: string;
    staffId?: string;

    // Service details
    serviceId?: string;
    serviceName?: string;

    // Room and machine
    roomId?: string;
    machineId?: string;

    // Timing
    appointmentDate?: string; // YYYY-MM-DD
    startTime: string;
    endTime: string;

    // Status
    state: PhorestAppointmentState;
    activationState: PhorestActivationState;
    confirmed?: boolean;
    deleted?: boolean;

    // Pricing
    price?: number;
    depositAmount?: number;
    depositDateTime?: string;

    // Staff preferences
    staffRequest?: boolean;
    preferredStaff?: boolean;

    // Course related
    courseId?: string;
    courseName?: string;
    clientCourseId?: string;
    clientCourseItemId?: string;

    // Service groups
    serviceGroupId?: string;
    serviceGroupItemOptionId?: string;
    parentServiceGroupId?: string;

    // Waiting list
    waitingListDateTime?: string;

    // Booking source
    source?: string; // 'API', 'WIDGET', 'PHOREST'
    groupBookingId?: string;
    purchasingBranchId?: string;

    // Rewards
    serviceRewardId?: string;

    // Internet service categories
    internetServiceCategories?: PhorestServiceCategory[];

    // Notes and timestamps
    notes?: string;
    createdAt: string;
    updatedAt: string;

    // Legacy field - array of services for backwards compatibility
    services?: PhorestAppointmentService[];
}

export interface PhorestAppointmentService {
    serviceId: string;
    serviceName: string;
    staffId: string;
    staffName: string;
    duration: number;
    price: number;
}

export interface PhorestServiceCategory {
    id: string;
    name: string;
}

// Phorest Staff (matches API documentation - Dec 2024)
export interface PhorestStaff {
    staffId: string;
    branchId?: string;
    userId?: string;
    staffCategoryId?: string;
    staffCategoryName?: string;

    // Personal info
    firstName: string;
    lastName: string;
    email?: string;
    mobile?: string;
    gender?: string;
    birthDate?: string;

    // Employment
    startDate?: string;
    selfEmployed?: boolean;
    position?: string; // Legacy field

    // Status
    active?: boolean;
    archived?: boolean;
    deleted?: boolean;

    // Profile
    notes?: string;
    onlineProfile?: string;
    imageUrl?: string;

    // Online booking settings
    hideFromOnlineBookings?: boolean;
    hideFromAppointmentScreen?: boolean;

    // Service restrictions
    disqualifiedServices?: string[];

    // Timestamps
    createdAt?: string;
    updatedAt?: string;
}

// Phorest Product
export interface PhorestProduct {
    productId: string;
    branchId?: string;
    name: string;
    description?: string;
    categoryId?: string;
    categoryName?: string;
    price: number;
    costPrice?: number;
    sku?: string;
    barcode?: string;
    active: boolean;
    archived?: boolean;
    deleted?: boolean;
    stockLevel?: number;
    reorderLevel?: number;
    taxRateId?: string;
    supplierId?: string;
    createdAt?: string;
    updatedAt?: string;
}

// Phorest Client Category
export interface PhorestClientCategory {
    clientCategoryId: string;
    name: string;
    description?: string;
}

// Phorest Service
export interface PhorestService {
    serviceId: string;
    branchId?: string;
    name: string;
    description?: string;
    categoryId?: string;
    categoryName?: string;
    duration: number;
    price: number;
    active: boolean;
    archived?: boolean;
    deleted?: boolean;
    bookable?: boolean;
    onlineBookable?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

// Phorest Booking Request
export interface PhorestCreateBookingRequest {
    clientId: string;
    branchId: string;
    startTime: string;
    services: {
        serviceId: string;
        staffId: string;
    }[];
    notes?: string;
    source?: string;
}

// Phorest Create/Update Client Request
export interface PhorestCreateClientRequest {
    firstName: string;
    lastName: string;
    email?: string;
    mobile?: string;
    landLine?: string;
    linkedClientMobile?: string;
    gender?: string;
    birthDate?: string;
    address?: PhorestAddress;
    clientCategoryIds?: string[];
    notes?: string;
    version?: number;
    externalId?: string;
    preferredStaffId?: string;
    // Required for creating new clients - the branch where they are being created
    creatingBranchId?: string;
    // Marketing consent
    smsMarketingConsent?: boolean;
    emailMarketingConsent?: boolean;
    smsReminderConsent?: boolean;
    emailReminderConsent?: boolean;
}

export type PhorestUpdateClientRequest = Partial<PhorestCreateClientRequest>;

// Phorest Create Appointment Request
export interface PhorestCreateAppointmentRequest {
    branchId: string;
    clientId: string;
    services: {
        serviceId: string;
        staffId: string;
        startTime: string; // ISO 8601
        endTime?: string;  // ISO 8601 (Optional if duration known)
    }[];
    notes?: string;
    ignoreWarnings?: boolean; // Often needed for programmatic booking
}
