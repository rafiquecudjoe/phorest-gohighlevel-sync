import {
    GhlContact,
    GhlUpsertContactRequest,
    GhlCustomFieldValue,
    GhlDndSettings,
} from '../../integrations/gohighlevel/interfaces/ghl.interfaces';
import {
    PhorestClient,
    PhorestCreateClientRequest,
    PhorestUpdateClientRequest,
} from '../../integrations/phorest/interfaces/phorest.interfaces';

/**
 * Sanitize phone number for GHL
 * GHL has a max length limit for phone numbers (typically 15-20 chars)
 */
function sanitizePhoneNumber(phone: string | undefined | null): string | undefined {
    if (!phone) return undefined;

    // Remove all non-digit characters except + at the start
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Ensure + is only at the start
    if (cleaned.includes('+')) {
        cleaned = '+' + cleaned.replace(/\+/g, '');
    }

    // GHL max phone length is typically 15 characters (E.164 standard)
    // Truncate if too long
    const MAX_PHONE_LENGTH = 15;
    if (cleaned.length > MAX_PHONE_LENGTH) {
        cleaned = cleaned.substring(0, MAX_PHONE_LENGTH);
    }

    // Must have at least 7 digits to be valid
    const digitCount = cleaned.replace(/\D/g, '').length;
    if (digitCount < 7) return undefined;

    return cleaned || undefined;
}

/**
 * Sanitize email for GHL
 * Removes whitespace and validates format
 */
function sanitizeEmail(email: string | undefined | null): string | undefined {
    if (!email) return undefined;

    // Trim whitespace
    const cleaned = email.trim().toLowerCase();

    // Skip if empty after cleaning
    if (!cleaned) return undefined;

    // Basic email validation - GHL is stricter
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(cleaned)) return undefined;

    // Max length for email
    if (cleaned.length > 254) return undefined;

    return cleaned;
}

/**
 * Maps GoHighLevel Contact to Phorest Client format
 */
export function mapGhlContactToPhorestClient(
    contact: GhlContact,
): PhorestCreateClientRequest {
    return {
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        email: contact.email,
        mobile: contact.phone,
        // Map GHL address fields
        address: {
            street: contact.address1,
            city: contact.city,
            state: contact.state,
            postalCode: contact.postalCode,
            country: contact.country,
        },
        // Map GHL custom field for gender if available
        gender: getCustomFieldValue(contact, 'gender') as string | undefined,
        birthDate: contact.dateOfBirth,
        // Map GHL tags to Phorest category IDs (requires category lookup)
        // This will be handled separately by the sync service
        notes: getCustomFieldValue(contact, 'phorest_notes') as string | undefined,
    };
}

/**
 * Maps GoHighLevel Contact to Phorest Update format (partial)
 */
export function mapGhlContactToPhorestUpdate(
    contact: Partial<GhlContact>,
    existingClient?: PhorestClient,
): PhorestUpdateClientRequest {
    // Phorest requires firstName and lastName even in updates
    const update: PhorestUpdateClientRequest = {
        firstName: existingClient?.firstName || contact.firstName || '',
        lastName: existingClient?.lastName || contact.lastName || '',
    };

    // Protect name fields: only update Phorest names if they are currently empty
    // (Logic above handles this: if existingClient has a value, it projects it back to Phorest)

    // Email and mobile are always updated if present in GHL
    if (contact.email) update.email = contact.email;
    if (contact.phone) update.mobile = contact.phone;
    if (contact.dateOfBirth) update.birthDate = contact.dateOfBirth;

    if (contact.address1 || contact.city || contact.state || contact.postalCode) {
        update.address = {
            street: contact.address1,
            city: contact.city,
            state: contact.state,
            postalCode: contact.postalCode,
            country: contact.country,
        };
    }

    return update;
}

/**
 * Maps Phorest Client to GHL Contact format for update
 */
export function mapPhorestClientToGhlContact(
    client: PhorestClient,
    locationId: string,
): {
    locationId: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    address1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    dateOfBirth?: string;
    customFields?: { key: string; value: string | number }[];
} {
    const customFields: { key: string; value: string | number }[] = [
        { key: 'phorest_id', value: client.clientId },
        { key: 'phorest_updated', value: client.updatedAt },
    ];

    // Add optional fields
    if (client.gender) customFields.push({ key: 'gender', value: client.gender });
    if (client.notes) customFields.push({ key: 'phorest_notes', value: client.notes });

    // Add loyalty points if available
    if (client.loyaltyCard?.points !== undefined) {
        customFields.push({ key: 'loyalty_points', value: client.loyaltyCard.points });
    }
    if (client.loyaltyCard?.serial) {
        customFields.push({ key: 'loyalty_card_serial', value: client.loyaltyCard.serial });
    }

    return {
        locationId,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.mobile,
        address1: client.address?.streetAddress1 || client.address?.street,
        city: client.address?.city,
        state: client.address?.state,
        postalCode: client.address?.postalCode,
        country: client.address?.country,
        dateOfBirth: client.birthDate,
        customFields,
    };
}

/**
 * Maps Phorest Client to GHL Upsert Contact Request (full sync)
 * Includes tags, custom fields, DND settings based on consent flags
 */
export function mapPhorestClientToGhlUpsert(
    client: PhorestClient,
    locationId: string,
    categoryMap?: Map<string, string>, // Map of categoryId -> categoryName
    customFieldMap?: Map<string, string>, // Map of fieldKey -> fieldId
): GhlUpsertContactRequest {
    // Build tags from client categories
    const tags: string[] = [];

    if (client.clientCategoryIds && categoryMap) {
        for (const categoryId of client.clientCategoryIds) {
            const categoryName = categoryMap.get(categoryId);
            if (categoryName) {
                tags.push(`phorest:${categoryName.toLowerCase().replace(/\s+/g, '-')}`);
            }
        }
    }

    // Add status tags
    if (client.banned) tags.push('phorest:banned');
    if (client.archived) tags.push('phorest:archived');

    // Build custom fields
    const customFields: GhlCustomFieldValue[] = [];

    // Helper to add custom field if ID exists
    const addCustomField = (key: string, value: any) => {
        const fieldId = customFieldMap?.get(key);
        if (fieldId) {
            customFields.push({ id: fieldId, value });
        }
    };

    addCustomField('phorest_id', client.clientId);
    addCustomField('phorest_last_sync', new Date().toISOString());

    if (client.loyaltyCard?.points !== undefined) {
        addCustomField('loyalty_points', client.loyaltyCard.points);
    }
    if (client.loyaltyCard?.serial) {
        addCustomField('loyalty_card_serial', client.loyaltyCard.serial);
    }
    if (client.externalId) {
        addCustomField('external_id', client.externalId);
    }
    if (client.preferredStaffId) {
        addCustomField('preferred_staff_id', client.preferredStaffId);
    }
    if (client.lastStylistName) {
        addCustomField('stylist_name', client.lastStylistName);
    }
    if (client.creditAccount?.outstandingBalance !== undefined) {
        addCustomField('credit_balance', client.creditAccount.outstandingBalance);
    }
    if (client.notes) {
        addCustomField('phorest_notes', client.notes);
    }

    // Map marketing consent to DND settings
    // GHL expects 'active' (DND ON) or 'inactive' (DND OFF)
    // Phorest consent=true means DND should be OFF ('inactive')
    const dndSettings: GhlDndSettings = {};
    if (client.smsMarketingConsent !== undefined) {
        dndSettings.SMS = { status: client.smsMarketingConsent ? 'inactive' : 'active' };
    }
    if (client.emailMarketingConsent !== undefined) {
        dndSettings.Email = { status: client.emailMarketingConsent ? 'inactive' : 'active' };
    }

    return {
        locationId,
        firstName: client.firstName,
        lastName: client.lastName,
        name: `${client.firstName} ${client.lastName}`.trim(),
        email: sanitizeEmail(client.email),
        phone: sanitizePhoneNumber(client.mobile),
        address1: client.address?.streetAddress1 || client.address?.street,
        city: client.address?.city,
        state: client.address?.state,
        postalCode: client.address?.postalCode,
        country: client.address?.country,
        dateOfBirth: client.birthDate,
        gender: client.gender,
        tags,
        customFields: customFields.length > 0 ? customFields : undefined,
        dndSettings: Object.keys(dndSettings).length > 0 ? dndSettings : undefined,
        source: 'phorest',
    };
}

/**
 * Extracts custom field value from GHL contact
 */
function getCustomFieldValue(
    contact: GhlContact,
    key: string,
): string | number | boolean | string[] | undefined {
    if (!contact.customFields) return undefined;

    const field = contact.customFields.find(
        (f) => f.key === key || f.id === key,
    );
    return field?.value;
}

/**
 * Extract Phorest ID from GHL contact custom fields
 */
export function getPhorestIdFromGhlContact(contact: GhlContact): string | undefined {
    return getCustomFieldValue(contact, 'phorest_id') as string | undefined;
}

/**
 * Determines if a GHL contact should be synced to Phorest
 */
export function shouldSyncGhlContact(contact: GhlContact): boolean {
    // Require at least name for sync
    if (!contact.firstName && !contact.lastName) {
        return false;
    }

    // Skip if already synced (has phorest_id) and not updated
    // This will be handled at the service level with timestamp comparison

    return true;
}

/**
 * Determines if a Phorest client should be synced to GHL
 */
export function shouldSyncPhorestClient(client: PhorestClient): boolean {
    // Skip deleted clients
    if (client.deleted) return false;

    // Require at least name
    if (!client.firstName && !client.lastName) return false;

    // Check if we have at least one VALID contact method after sanitization
    const validEmail = sanitizeEmail(client.email);
    const validPhone = sanitizePhoneNumber(client.mobile);

    // GHL requires at least email or phone
    if (!validEmail && !validPhone) return false;

    return true;
}

/**
 * Compare two dates to determine if sync is needed
 */
export function needsSync(
    sourceUpdatedAt: string | undefined,
    lastSyncedAt: Date | undefined,
): boolean {
    if (!sourceUpdatedAt) return true;
    if (!lastSyncedAt) return true;

    const sourceDate = new Date(sourceUpdatedAt);
    return sourceDate > lastSyncedAt;
}
