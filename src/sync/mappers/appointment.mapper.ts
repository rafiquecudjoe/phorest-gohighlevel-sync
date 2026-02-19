import { PhorestAppointment, PhorestAppointmentState, PhorestActivationState } from '../../integrations/phorest/interfaces/phorest.interfaces';
import {
    GhlCreateAppointmentRequest,
    GhlUpdateAppointmentRequest,
} from '../../integrations/gohighlevel/interfaces/ghl.interfaces';

/**
 * Maps a Phorest Appointment to a GHL Create Appointment request
 */
export function mapPhorestAppointmentToGhlCreate(
    appointment: PhorestAppointment,
    ghlContactId: string,
    calendarId: string,
    locationId: string,
    staffName?: string, // Stylist first name (e.g. 'Sarah')
): GhlCreateAppointmentRequest {
    // Build a title from the services
    const serviceNames = appointment.services?.map(s => s.serviceName).join(', ')
        || appointment.serviceName
        || 'Appointment';

    // Ensure dates are in ISO 8601 format - always parse through Date object
    const startTime = new Date(appointment.startTime).toISOString();
    const endTime = new Date(appointment.endTime).toISOString();

    // Use stylist name as description (for automations: {{appointment.description}} = 'Sarah')
    const description = staffName?.trim() || undefined;

    return {
        calendarId,
        locationId,
        contactId: ghlContactId,
        startTime,
        endTime,
        title: serviceNames,
        description,
        appointmentStatus: mapPhorestStateToGhlStatus(appointment.state, appointment.activationState),
        assignedUserId: '8cr2w0O3pBm5PiH9q6h6', // Default to User V
        ignoreFreeSlotValidation: true,
        ignoreDateRange: true,
    };
}


/**
 * Maps a Phorest Appointment to a GHL Update Appointment request
 */
export function mapPhorestAppointmentToGhlUpdate(
    appointment: PhorestAppointment,
    staffName?: string, // Stylist first name (e.g. 'Sarah')
): GhlUpdateAppointmentRequest {
    const serviceNames = appointment.services?.map(s => s.serviceName).join(', ')
        || appointment.serviceName
        || 'Appointment';

    // Ensure dates are in ISO 8601 format - always parse through Date object
    const startTime = new Date(appointment.startTime).toISOString();
    const endTime = new Date(appointment.endTime).toISOString();

    // Use stylist name as description (for automations: {{appointment.description}} = 'Sarah')
    const description = staffName?.trim() || undefined;

    return {
        startTime,
        endTime,
        title: serviceNames,
        description,
        appointmentStatus: mapPhorestStateToGhlStatus(appointment.state, appointment.activationState),
        assignedUserId: '8cr2w0O3pBm5PiH9q6h6', // User V
        ignoreFreeSlotValidation: true,
        ignoreDateRange: true,
    };
}

/**
 * Maps Phorest appointment state to GHL appointment status
 * Phorest states: BOOKED, ARRIVED, STARTED, COMPLETED, NO_SHOW, CANCELLED, CHECKED_IN, PAID
 * GHL statuses: confirmed, showed, noshow, cancelled, invalid
 */
function mapPhorestStateToGhlStatus(
    state: PhorestAppointmentState,
    activationState: PhorestActivationState,
): string {
    // Handle cancellation states first
    if (activationState === 'CANCELED' || activationState === 'ARCHIVED') {
        return 'cancelled';
    }
    if (state === 'CANCELLED') {
        return 'cancelled';
    }

    switch (state) {
        case 'BOOKED':
            return 'confirmed';
        case 'ARRIVED':
        case 'CHECKED_IN':
            return 'showed';
        case 'STARTED':
        case 'COMPLETED':
        case 'PAID':
            return 'showed';
        case 'NO_SHOW':
            return 'noshow';
        default:
            return 'confirmed';
    }
}


/**
 * Check if a Phorest appointment should be synced
 */
export function shouldSyncPhorestAppointment(appointment: PhorestAppointment): boolean {
    // Skip appointments that are deleted (if that field exists)
    // For now, we sync all appointments to keep GHL in sync
    // Using appointment to satisfy lint - can add more conditions later
    return !!appointment.appointmentId;
}
