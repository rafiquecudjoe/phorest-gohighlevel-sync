import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { GhlOAuthService } from './ghl-oauth.service';
import {
    GhlConfig,
    GhlContact,
    GhlCreateContactRequest,
    GhlUpdateContactRequest,
    GhlUpsertContactRequest,
    GhlSearchContactsResponse,
    GhlAppointment,
    GhlCreateAppointmentRequest,
    GhlUpdateAppointmentRequest,
    GhlCalendar,
    GhlCustomField,
    GhlUser,
    GhlCreateUserRequest,
    GhlLocation,
    GhlProduct,
    GhlCreateProductRequest,
} from './interfaces/ghl.interfaces';
import { GHL_ENDPOINTS } from './constants/endpoints.constants';

@Injectable()
export class GhlApiClient implements OnModuleInit {
    private readonly logger = new Logger(GhlApiClient.name);
    private client: AxiosInstance;
    private config: GhlConfig;

    constructor(
        private readonly configService: ConfigService,
        private readonly oauthService: GhlOAuthService,
    ) { }

    onModuleInit() {
        this.config = {
            baseUrl: this.configService.getOrThrow<string>('GHL_API_BASE_URL'),
            clientId: this.configService.getOrThrow<string>('GHL_CLIENT_ID'),
            clientSecret: this.configService.getOrThrow<string>('GHL_CLIENT_SECRET'),
            locationId: this.configService.getOrThrow<string>('GHL_LOCATION_ID'),
            redirectUri: this.configService.getOrThrow<string>('GHL_REDIRECT_URI'),
        };

        this.client = axios.create({
            baseURL: this.config.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Version: '2021-07-28', // GHL API version
            },
            timeout: 30000,
        });

        // Request interceptor to add auth header
        this.client.interceptors.request.use(
            async (config) => {
                try {
                    const accessToken = await this.oauthService.getValidAccessToken();
                    config.headers.Authorization = `Bearer ${accessToken}`;
                } catch (error) {
                    this.logger.error('Failed to get access token:', error);
                    throw error;
                }

                this.logger.debug(`GHL API Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                this.logger.error('GHL API Request Error:', error);
                return Promise.reject(error);
            },
        );

        // Response interceptor for error handling and token refresh
        this.client.interceptors.response.use(
            (response) => response,
            async (error: AxiosError) => {
                const status = error.response?.status;
                const originalRequest = error.config;

                // Handle 401 - attempt token refresh
                if (status === 401 && originalRequest && !(originalRequest as any)._retry) {
                    (originalRequest as any)._retry = true;

                    try {
                        this.logger.warn('GHL API 401 - attempting token refresh');
                        await this.oauthService.refreshAccessToken();
                        const newToken = await this.oauthService.getValidAccessToken();
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;
                        return this.client(originalRequest);
                    } catch (refreshError) {
                        this.logger.error('Token refresh failed:', refreshError);
                        return Promise.reject(refreshError);
                    }
                }

                // Handle 429 - Rate limit with exponential backoff
                if (status === 429 && originalRequest && !(originalRequest as any)._rateLimitRetry) {
                    const retryCount = (originalRequest as any)._retryCount || 0;
                    const maxRetries = 3;

                    if (retryCount < maxRetries) {
                        (originalRequest as any)._rateLimitRetry = true;
                        (originalRequest as any)._retryCount = retryCount + 1;

                        // Get retry-after header or calculate exponential backoff
                        const retryAfterHeader = error.response?.headers['retry-after'];
                        let waitTime: number;

                        if (retryAfterHeader) {
                            // Retry-After can be seconds or a date
                            waitTime = isNaN(Number(retryAfterHeader))
                                ? Math.max(0, new Date(retryAfterHeader).getTime() - Date.now())
                                : Number(retryAfterHeader) * 1000;
                        } else {
                            // Exponential backoff: 2^retry * 1000ms + random jitter (0-500ms)
                            waitTime = Math.pow(2, retryCount) * 1000 + Math.random() * 500;
                        }

                        this.logger.warn(`GHL API rate limited. Retry ${retryCount + 1}/${maxRetries} after ${waitTime}ms`);

                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        (originalRequest as any)._rateLimitRetry = false; // Allow retry chain
                        return this.client(originalRequest);
                    } else {
                        this.logger.error(`GHL API rate limit: Max retries (${maxRetries}) exceeded`);
                    }
                }

                // Handle transient network and server errors with retry
                const isTransientError = this.isTransientError(error, status);
                if (isTransientError && originalRequest && !(originalRequest as any)._networkRetry) {
                    const retryCount = (originalRequest as any)._networkRetryCount || 0;
                    const maxRetries = 3;

                    if (retryCount < maxRetries) {
                        (originalRequest as any)._networkRetry = true;
                        (originalRequest as any)._networkRetryCount = retryCount + 1;

                        // Exponential backoff: 2^retry * 1000ms + random jitter (0-500ms)
                        const waitTime = Math.pow(2, retryCount) * 1000 + Math.random() * 500;

                        const errorType = this.getErrorType(error, status);
                        this.logger.warn(
                            `GHL API transient error (${errorType}). Retry ${retryCount + 1}/${maxRetries} after ${waitTime}ms`
                        );

                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        (originalRequest as any)._networkRetry = false; // Allow retry chain
                        return this.client(originalRequest);
                    } else {
                        const errorType = this.getErrorType(error, status);
                        this.logger.error(
                            `GHL API transient error (${errorType}): Max retries (${maxRetries}) exceeded`
                        );
                    }
                } else if (status && status >= 500) {
                    this.logger.error(`GHL API server error: ${status}`);
                }

                return Promise.reject(error);
            },
        );

        this.logger.log('GoHighLevel API client initialized');
    }

    /**
     * Check if error is transient and should be retried
     */
    private isTransientError(error: AxiosError, status?: number): boolean {
        // Server errors that are typically transient
        if (status === 502 || status === 503 || status === 520) {
            return true;
        }

        // Network errors (no response from server)
        if (!error.response) {
            const code = (error as any).code;
            // Timeouts, connection resets, aborted connections, socket hang ups
            if (
                code === 'ETIMEDOUT' ||
                code === 'ECONNRESET' ||
                code === 'ECONNABORTED' ||
                code === 'ENOTFOUND' ||
                code === 'EAI_AGAIN' ||
                error.message?.includes('socket hang up') ||
                error.message?.includes('timeout') ||
                error.message?.includes('ECONNRESET')
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get human-readable error type for logging
     */
    private getErrorType(error: AxiosError, status?: number): string {
        if (status === 502) return '502 Bad Gateway';
        if (status === 503) return '503 Service Unavailable';
        if (status === 520) return '520 Cloudflare Error';

        const code = (error as any).code;
        if (code === 'ETIMEDOUT') return 'Request Timeout';
        if (code === 'ECONNRESET') return 'Connection Reset';
        if (code === 'ECONNABORTED') return 'Connection Aborted';
        if (code === 'ENOTFOUND') return 'DNS Resolution Failed';
        if (code === 'EAI_AGAIN') return 'DNS Lookup Failed';
        if (error.message?.includes('socket hang up')) return 'Socket Hang Up';
        if (error.message?.includes('timeout')) return 'Timeout';

        return status ? `HTTP ${status}` : 'Network Error';
    }

    // ============ CONTACT ENDPOINTS ============

    async getContact(contactId: string): Promise<GhlContact> {
        const response = await this.client.get<{ contact: GhlContact }>(
            GHL_ENDPOINTS.CONTACT(contactId),
        );
        return response.data.contact;
    }

    async createContact(data: GhlCreateContactRequest): Promise<GhlContact> {
        const response = await this.client.post<{ contact: GhlContact }>(
            GHL_ENDPOINTS.CONTACTS,
            data,
        );
        return response.data.contact;
    }

    async updateContact(contactId: string, data: GhlUpdateContactRequest): Promise<GhlContact> {
        const response = await this.client.put<{ contact: GhlContact }>(
            GHL_ENDPOINTS.CONTACT(contactId),
            data,
        );
        return response.data.contact;
    }

    async upsertContact(data: GhlUpsertContactRequest): Promise<GhlContact> {
        const response = await this.client.post<{ contact: GhlContact }>(
            GHL_ENDPOINTS.CONTACT_UPSERT,
            data,
        );
        return response.data.contact;
    }

    async deleteContact(contactId: string): Promise<void> {
        await this.client.delete(GHL_ENDPOINTS.CONTACT(contactId));
    }

    async addContactNote(contactId: string, body: string): Promise<{ id: string }> {
        const response = await this.client.post(
            GHL_ENDPOINTS.CONTACT_NOTES(contactId),
            { body },
            { headers: { Version: '2021-07-28' } },
        );
        return response.data.note || response.data;
    }

    /**
     * Get all notes for a contact
     */
    async getContactNotes(contactId: string): Promise<Array<{ id: string; body: string; dateAdded: string }>> {
        const response = await this.client.get(
            GHL_ENDPOINTS.CONTACT_NOTES(contactId),
            { headers: { Version: '2021-07-28' } },
        );
        return response.data.notes || [];
    }

    /**
     * List contacts using GET /contacts/ endpoint
     * Uses cursor-based pagination (startAfterId) - NOT skip/offset
     */
    async listContacts(params: {
        locationId: string;
        limit?: number;
        startAfterId?: string;
    }): Promise<GhlSearchContactsResponse> {
        // Build params object, excluding undefined values
        const queryParams: Record<string, string | number> = {
            locationId: params.locationId,
        };
        if (params.limit) queryParams.limit = params.limit;
        if (params.startAfterId) queryParams.startAfterId = params.startAfterId;

        const response = await this.client.get<GhlSearchContactsResponse>(
            GHL_ENDPOINTS.CONTACTS,
            { params: queryParams },
        );
        return response.data;
    }

    /**
     * Search contacts using POST /contacts/search endpoint
     * Use this when you need to search by query
     */
    async searchContacts(params: {
        locationId: string;
        query?: string;
        limit?: number;
        skip?: number;
    }): Promise<GhlSearchContactsResponse> {
        const response = await this.client.get<GhlSearchContactsResponse>(
            GHL_ENDPOINTS.CONTACTS_SEARCH,
            { params },
        );
        return response.data;
    }

    // ============ LOCATION ENDPOINTS ============

    async getLocation(locationId: string): Promise<GhlLocation> {
        const response = await this.client.get<{ location: GhlLocation }>(
            GHL_ENDPOINTS.LOCATION(locationId),
            { headers: { Version: '2021-07-28' } },
        );
        return response.data.location;
    }

    // ============ CALENDAR ENDPOINTS ============

    async getCalendars(locationId?: string): Promise<GhlCalendar[]> {
        const response = await this.client.get<{ calendars: GhlCalendar[] }>(
            GHL_ENDPOINTS.CALENDARS,
            {
                params: { locationId: locationId || this.config.locationId },
                headers: { Version: '2021-04-15' }
            },
        );
        return response.data.calendars;
    }

    async getCalendar(calendarId: string): Promise<GhlCalendar> {
        const response = await this.client.get<{ calendar: GhlCalendar }>(
            GHL_ENDPOINTS.CALENDAR(calendarId),
            { headers: { Version: '2021-04-15' } },
        );
        return response.data.calendar;
    }

    // ============ APPOINTMENT ENDPOINTS ============

    async getAppointment(appointmentId: string): Promise<GhlAppointment> {
        const response = await this.client.get<{ event: GhlAppointment }>(
            GHL_ENDPOINTS.APPOINTMENT(appointmentId),
            { headers: { Version: '2021-04-15' } },
        );
        return response.data.event;
    }

    async createAppointment(data: GhlCreateAppointmentRequest): Promise<GhlAppointment> {
        const response = await this.client.post<{ event?: GhlAppointment; id?: string }>(
            GHL_ENDPOINTS.APPOINTMENTS,
            data,
            { headers: { Version: '2021-04-15' } },
        );

        // Handle different response structures
        const appointment = response.data.event || (response.data as any);

        if (!appointment?.id) {
            this.logger.error(`GHL Create Appointment failed to return ID. Response: ${JSON.stringify(response.data)}`);
            throw new Error('GHL Create Appointment failed: No ID returned');
        }

        return appointment;
    }

    async updateAppointment(
        appointmentId: string,
        data: GhlUpdateAppointmentRequest,
    ): Promise<GhlAppointment> {
        const response = await this.client.put<{ event: GhlAppointment }>(
            GHL_ENDPOINTS.APPOINTMENT(appointmentId),
            data,
            { headers: { Version: '2021-04-15' } },
        );
        return response.data.event;
    }

    async deleteAppointment(appointmentId: string): Promise<void> {
        await this.client.delete(GHL_ENDPOINTS.APPOINTMENT(appointmentId));
    }

    /**
     * Create a note on an appointment
     * GHL treats appointment notes as a separate resource
     */
    async createAppointmentNote(
        appointmentId: string,
        body: string,
    ): Promise<{ id: string; body: string }> {
        const response = await this.client.post<{ note: { id: string; body: string } }>(
            GHL_ENDPOINTS.APPOINTMENT_NOTES(appointmentId),
            { body },
            { headers: { Version: '2021-04-15' } },
        );
        return response.data.note;
    }

    /**
     * Get calendar events for a date range
     * Note: startTime and endTime must be in MILLISECONDS
     */
    async getCalendarEvents(params: {
        locationId: string;
        calendarId: string;
        startTime: number; // milliseconds
        endTime: number; // milliseconds
    }): Promise<GhlAppointment[]> {
        const response = await this.client.get<{ events: GhlAppointment[] }>(
            GHL_ENDPOINTS.CALENDAR_EVENTS,
            { params },
        );
        return response.data.events || [];
    }

    // ============ CUSTOM FIELD ENDPOINTS ============

    async getCustomFields(locationId?: string): Promise<GhlCustomField[]> {
        const targetLocationId = locationId || this.config.locationId;
        const response = await this.client.get<{ customFields: GhlCustomField[] }>(
            GHL_ENDPOINTS.CUSTOM_FIELDS(targetLocationId),
        );
        return response.data.customFields;
    }

    async createCustomField(
        locationId: string,
        data: { name: string; dataType: string },
    ): Promise<GhlCustomField> {
        const response = await this.client.post<{ customField: GhlCustomField }>(
            GHL_ENDPOINTS.CUSTOM_FIELDS(locationId),
            data,
        );
        return response.data.customField;
    }

    // ============ USER ENDPOINTS ============

    async getUsers(locationId?: string): Promise<GhlUser[]> {
        const response = await this.client.get<{ users: GhlUser[] }>(GHL_ENDPOINTS.USERS, {
            params: { locationId: locationId || this.config.locationId },
        });
        return response.data.users;
    }

    async getUser(userId: string): Promise<GhlUser> {
        const response = await this.client.get<{ user: GhlUser }>(GHL_ENDPOINTS.USER(userId));
        return response.data.user;
    }

    async createUser(data: GhlCreateUserRequest): Promise<GhlUser> {
        const response = await this.client.post<any>(
            GHL_ENDPOINTS.USERS,
            data,
            { headers: { Version: '2021-07-28' } },
        );
        return response.data.user || response.data.id || response.data;
    }

    // ============ PRODUCT ENDPOINTS ============

    async getProducts(locationId?: string): Promise<GhlProduct[]> {
        const response = await this.client.get<{ products: GhlProduct[] }>(GHL_ENDPOINTS.PRODUCTS, {
            params: { locationId: locationId || this.config.locationId },
        });
        return response.data.products || [];
    }

    async getProduct(productId: string): Promise<GhlProduct> {
        const response = await this.client.get<{ product: GhlProduct }>(GHL_ENDPOINTS.PRODUCT(productId));
        return response.data.product;
    }

    async createProduct(data: GhlCreateProductRequest): Promise<GhlProduct> {
        const response = await this.client.post<{ product: GhlProduct }>(
            GHL_ENDPOINTS.PRODUCTS,
            {
                ...data,
                locationId: data.locationId || this.config.locationId,
            },
        );
        return response.data.product || (response.data as any);
    }

    async updateProduct(productId: string, data: Partial<GhlCreateProductRequest>): Promise<GhlProduct> {
        const response = await this.client.put<{ product: GhlProduct }>(
            GHL_ENDPOINTS.PRODUCT(productId),
            data,
        );
        return response.data.product || (response.data as any);
    }

    async deleteProduct(productId: string): Promise<void> {
        await this.client.delete(GHL_ENDPOINTS.PRODUCT(productId));
    }

    /**
     * List products with search capability
     */
    async listProducts(params: {
        locationId: string;
        limit?: number;
        offset?: number;
        search?: string;
    }): Promise<{ products: any[]; total?: number }> {
        const response = await this.client.get<{ products: any[]; total?: number }>(
            GHL_ENDPOINTS.PRODUCTS,
            {
                params,
                headers: { Version: '2021-07-28' }
            },
        );
        return response.data;
    }

    // ============ UTILITY METHODS ============

    getConfig(): GhlConfig {
        return { ...this.config };
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.getCalendars();
            this.logger.log('GoHighLevel API connection test successful');
            return true;
        } catch (error) {
            this.logger.error('GoHighLevel API connection test failed:', error);
            return false;
        }
    }

    // ============ BULK OPERATIONS ============

    /**
     * Bulk delete contacts by date
     * @param targetDate - Date string in YYYY-MM-DD format
     * @param dryRun - If true, only count contacts without deleting
     * @param onProgress - Callback for progress updates
     */
    async bulkDeleteContactsByDate(
        targetDate: string,
        dryRun = false,
        onProgress?: (progress: { deleted: number; failed: number; total: number }) => void,
    ): Promise<{ deleted: number; failed: number; errors: Array<{ id: string; error: string }> }> {
        const locationId = this.config.locationId;
        let deleted = 0;
        let failed = 0;
        const errors: Array<{ id: string; error: string }> = [];
        let startAfterId: string | undefined = undefined;
        const batchSize = 100;
        let totalScanned = 0;

        this.logger.log(`Starting bulk delete for contacts added on ${targetDate} (dryRun=${dryRun})`);

        while (true) {
            // Fetch a batch of contacts
            const result = await this.listContacts({
                locationId,
                limit: batchSize,
                startAfterId,
            });

            const contacts = result.contacts || [];
            if (contacts.length === 0) break;

            totalScanned += contacts.length;

            // Filter contacts by date and delete
            for (const contact of contacts) {
                if (contact.dateAdded) {
                    const contactDate = contact.dateAdded.split('T')[0];
                    if (contactDate === targetDate) {
                        if (dryRun) {
                            deleted++;
                        } else {
                            try {
                                await this.deleteContact(contact.id);
                                deleted++;

                                // Small delay to avoid rate limiting
                                await new Promise(r => setTimeout(r, 50));
                            } catch (error: any) {
                                failed++;
                                errors.push({
                                    id: contact.id,
                                    error: error.response?.data?.message || error.message,
                                });
                            }
                        }

                        // Report progress
                        if (onProgress) {
                            onProgress({ deleted, failed, total: totalScanned });
                        }
                    }
                }
            }

            // Set cursor for next page
            if (contacts.length < batchSize) break;
            startAfterId = contacts[contacts.length - 1].id;

            this.logger.debug(`Bulk delete progress: ${deleted} deleted, ${failed} failed, ${totalScanned} scanned`);
        }

        this.logger.log(`Bulk delete complete: ${deleted} deleted, ${failed} failed`);
        return { deleted, failed, errors: errors.slice(0, 100) }; // Limit errors to first 100
    }

    /**
     * Bulk delete ALL contacts (dangerous!)
     * @param dryRun - If true, only count contacts without deleting
     */
    async bulkDeleteAllContacts(
        dryRun = false,
        onProgress?: (progress: { deleted: number; failed: number; total: number }) => void,
    ): Promise<{ deleted: number; failed: number; errors: Array<{ id: string; error: string }> }> {
        const locationId = this.config.locationId;
        let deleted = 0;
        let failed = 0;
        const errors: Array<{ id: string; error: string }> = [];
        let startAfterId: string | undefined = undefined;
        const batchSize = 100;

        this.logger.warn(`Starting bulk delete of ALL contacts (dryRun=${dryRun})`);

        while (true) {
            const result = await this.listContacts({
                locationId,
                limit: batchSize,
                startAfterId,
            });

            const contacts = result.contacts || [];
            if (contacts.length === 0) break;

            for (const contact of contacts) {
                if (dryRun) {
                    deleted++;
                } else {
                    try {
                        await this.deleteContact(contact.id);
                        deleted++;
                        await new Promise(r => setTimeout(r, 50)); // Rate limit protection
                    } catch (error: any) {
                        failed++;
                        errors.push({
                            id: contact.id,
                            error: error.response?.data?.message || error.message,
                        });
                    }
                }

                if (onProgress) {
                    onProgress({ deleted, failed, total: deleted + failed });
                }
            }

            if (contacts.length < batchSize) break;
            startAfterId = contacts[contacts.length - 1].id;
        }

        this.logger.log(`Bulk delete ALL complete: ${deleted} deleted, ${failed} failed`);
        return { deleted, failed, errors: errors.slice(0, 100) };
    }
}
