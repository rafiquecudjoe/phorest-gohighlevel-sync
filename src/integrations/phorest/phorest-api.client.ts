import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import {
    PhorestConfig,
    PhorestClient,
    PhorestAppointment,
    PhorestStaff,
    PhorestProduct,
    PhorestService,
    PhorestClientCategory,
    PhorestPaginatedResponse,
    PhorestCreateClientRequest,
    PhorestUpdateClientRequest,
    PhorestCreateAppointmentRequest,
    PhorestCreateBookingRequest,
} from './interfaces/phorest.interfaces';
import { PHOREST_ENDPOINTS } from './constants/endpoints.constants';

@Injectable()
export class PhorestApiClient implements OnModuleInit {
    private readonly logger = new Logger(PhorestApiClient.name);
    private client: AxiosInstance;
    private config: PhorestConfig;

    constructor(private readonly configService: ConfigService) { }

    onModuleInit() {
        this.config = {
            baseUrl: this.configService.getOrThrow<string>('PHOREST_API_BASE_URL'),
            businessId: this.configService.getOrThrow<string>('PHOREST_BUSINESS_ID'),
            branchId: this.configService.getOrThrow<string>('PHOREST_BRANCH_ID'),
            username: this.configService.getOrThrow<string>('PHOREST_USERNAME'),
            password: this.configService.getOrThrow<string>('PHOREST_PASSWORD'),
        };

        this.client = axios.create({
            baseURL: this.config.baseUrl,
            auth: {
                username: this.config.username,
                password: this.config.password,
            },
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            timeout: 30000,
        });

        // Request interceptor for logging
        this.client.interceptors.request.use(
            (config) => {
                const paramsStr = config.params ? `?${new URLSearchParams(config.params).toString()}` : '';
                this.logger.debug(`Phorest API Request: ${config.method?.toUpperCase()} ${config.url}${paramsStr}`);
                return config;
            },
            (error) => {
                this.logger.error('Phorest API Request Error:', error);
                return Promise.reject(error);
            },
        );

        // Response interceptor for error handling
        this.client.interceptors.response.use(
            (response) => response,
            async (error: AxiosError) => {
                const status = error.response?.status;

                if (status === 429) {
                    // Rate limited - extract retry-after header if available
                    const retryAfter = error.response?.headers['retry-after'];
                    this.logger.warn(`Phorest API rate limited. Retry after: ${retryAfter || 'unknown'}`);
                } else if (status === 401) {
                    this.logger.error('Phorest API authentication failed. Check credentials.');
                } else if (status && status >= 500) {
                    this.logger.error(`Phorest API server error: ${status}`);
                }

                return Promise.reject(error);
            },
        );

        this.logger.log('Phorest API client initialized');
    }

    // ============ CLIENT ENDPOINTS ============

    async getClients(params?: {
        page?: number;
        size?: number;
        updatedSince?: string;
        email?: string;
        phone?: string;
    }): Promise<PhorestPaginatedResponse<PhorestClient>> {
        const { businessId } = this.config;
        const response = await this.client.get<PhorestPaginatedResponse<PhorestClient>>(
            PHOREST_ENDPOINTS.CLIENTS(businessId),
            { params },
        );
        return response.data;
    }

    /**
     * Finds a client by their phone number (Phorest uses 'phone' param for mobile search)
     */
    async findClientByPhone(phone: string): Promise<PhorestClient | null> {
        // Strip leading '+' if present for Phorest search
        const normalizedPhone = phone.startsWith('+') ? phone.substring(1) : phone;
        const result = await this.getClients({ phone: normalizedPhone, size: 1 });
        const clients = result._embedded?.clients || [];
        return clients.length > 0 ? clients[0] : null;
    }

    /**
     * Finds a client by their email address
     */
    async findClientByEmail(email: string): Promise<PhorestClient | null> {
        const result = await this.getClients({ email, size: 1 });
        const clients = result._embedded?.clients || [];
        return clients.length > 0 ? clients[0] : null;
    }

    async getClient(clientId: string): Promise<PhorestClient> {
        const { businessId } = this.config;
        const response = await this.client.get<PhorestClient>(
            PHOREST_ENDPOINTS.CLIENT(businessId, clientId),
        );
        return response.data;
    }

    async createClient(data: PhorestCreateClientRequest): Promise<PhorestClient> {
        const { businessId } = this.config;
        const response = await this.client.post<PhorestClient>(
            PHOREST_ENDPOINTS.CLIENTS(businessId),
            data,
        );
        return response.data;
    }

    async updateClient(clientId: string, data: PhorestUpdateClientRequest): Promise<PhorestClient> {
        const { businessId } = this.config;
        const response = await this.client.put<PhorestClient>(
            PHOREST_ENDPOINTS.CLIENT(businessId, clientId),
            { ...data, clientId },
        );
        return response.data;
    }

    async getClientsBatch(clientIds: string[]): Promise<PhorestClient[]> {
        const { businessId } = this.config;
        const response = await this.client.get<{ _embedded: { clients: PhorestClient[] } }>(
            PHOREST_ENDPOINTS.CLIENT_BATCH(businessId),
            { params: { clientIds: clientIds.join(',') } },
        );
        return response.data._embedded.clients;
    }

    // ============ CLIENT CATEGORY ENDPOINTS ============

    async getClientCategories(): Promise<PhorestClientCategory[]> {
        const { businessId } = this.config;
        const response = await this.client.get<{ _embedded: { clientCategories: PhorestClientCategory[] } }>(
            PHOREST_ENDPOINTS.CLIENT_CATEGORIES(businessId),
        );
        return response.data._embedded.clientCategories;
    }

    // ============ APPOINTMENT ENDPOINTS ============

    async getAppointments(params?: {
        page?: number;
        size?: number;
        startDate?: string;  // Will be mapped to from_date
        endDate?: string;    // Will be mapped to to_date
        staffId?: string;
        clientId?: string;
        updatedSince?: string;  // Will be mapped to updated_after
    }): Promise<PhorestPaginatedResponse<PhorestAppointment>> {
        const { businessId, branchId } = this.config;

        // Map parameter names to Phorest API expectations
        const apiParams: Record<string, any> = {};
        if (params?.page !== undefined) apiParams.page = params.page;
        if (params?.size !== undefined) apiParams.size = params.size;
        if (params?.startDate) apiParams.from_date = params.startDate;
        if (params?.endDate) apiParams.to_date = params.endDate;
        if (params?.staffId) apiParams.staffId = params.staffId;
        if (params?.clientId) apiParams.clientId = params.clientId;
        if (params?.updatedSince) apiParams.updated_after = params.updatedSince;

        const response = await this.client.get<PhorestPaginatedResponse<PhorestAppointment>>(
            PHOREST_ENDPOINTS.APPOINTMENTS(businessId, branchId),
            { params: apiParams },
        );
        return response.data;
    }

    async getAppointment(appointmentId: string): Promise<PhorestAppointment> {
        const { businessId, branchId } = this.config;
        const response = await this.client.get<PhorestAppointment>(
            PHOREST_ENDPOINTS.APPOINTMENT(businessId, branchId, appointmentId),
        );
        return response.data;
    }

    async createAppointment(data: PhorestCreateAppointmentRequest): Promise<PhorestAppointment> {
        const { businessId, branchId } = this.config;
        const response = await this.client.post<PhorestAppointment>(
            PHOREST_ENDPOINTS.APPOINTMENTS(businessId, branchId),
            data,
        );
        return response.data;
    }

    async createBooking(data: PhorestCreateBookingRequest): Promise<any> {
        const { businessId, branchId } = this.config;
        const response = await this.client.post(
            PHOREST_ENDPOINTS.BOOKING(businessId, branchId),
            data,
        );
        return response.data;
    }

    async checkInAppointment(appointmentId: string): Promise<void> {
        const { businessId, branchId } = this.config;
        await this.client.post(
            PHOREST_ENDPOINTS.APPOINTMENT_CHECKIN(businessId, branchId, appointmentId),
        );
    }

    async confirmAppointments(appointmentIds: string[]): Promise<void> {
        const { businessId, branchId } = this.config;
        await this.client.post(PHOREST_ENDPOINTS.APPOINTMENTS_CONFIRM(businessId, branchId), {
            appointmentIds,
        });
    }

    async cancelAppointments(appointmentIds: string[], reason?: string): Promise<void> {
        const { businessId, branchId } = this.config;
        await this.client.post(PHOREST_ENDPOINTS.APPOINTMENTS_CANCEL(businessId, branchId), {
            appointmentIds,
            reason,
        });
    }

    // ============ STAFF ENDPOINTS ============

    async getStaff(params?: {
        page?: number;
        size?: number;
        updatedSince?: string;
    }): Promise<PhorestPaginatedResponse<PhorestStaff>> {
        const { businessId, branchId } = this.config;
        const response = await this.client.get<PhorestPaginatedResponse<PhorestStaff>>(
            PHOREST_ENDPOINTS.STAFF(businessId, branchId),
            { params },
        );
        return response.data;
    }

    async getStaffMember(staffId: string): Promise<PhorestStaff> {
        const { businessId, branchId } = this.config;
        const response = await this.client.get<PhorestStaff>(
            PHOREST_ENDPOINTS.STAFF_MEMBER(businessId, branchId, staffId),
        );
        return response.data;
    }

    // ============ PRODUCT ENDPOINTS ============

    async getProducts(params?: {
        page?: number;
        size?: number;
        updatedSince?: string;
    }): Promise<PhorestPaginatedResponse<PhorestProduct>> {
        const { businessId, branchId } = this.config;
        const response = await this.client.get<PhorestPaginatedResponse<PhorestProduct>>(
            PHOREST_ENDPOINTS.PRODUCTS(businessId, branchId),
            { params },
        );
        return response.data;
    }

    // ============ SERVICE ENDPOINTS ============

    async getServices(params?: {
        page?: number;
        size?: number;
    }): Promise<PhorestPaginatedResponse<PhorestService>> {
        const { businessId, branchId } = this.config;
        const response = await this.client.get<PhorestPaginatedResponse<PhorestService>>(
            PHOREST_ENDPOINTS.SERVICES(businessId, branchId),
            { params },
        );
        return response.data;
    }

    // ============ LOYALTY POINTS ============

    async changeLoyaltyPoints(
        clientId: string,
        points: number,
        reason: string,
    ): Promise<void> {
        const { businessId, branchId } = this.config;
        await this.client.post(PHOREST_ENDPOINTS.LOYALTY_POINTS(businessId, branchId), {
            clientId,
            points,
            reason,
        });
    }

    // ============ UTILITY METHODS ============

    getConfig(): PhorestConfig {
        return { ...this.config };
    }

    async testConnection(): Promise<boolean> {
        try {
            const { businessId } = this.config;
            await this.client.get(PHOREST_ENDPOINTS.CLIENTS(businessId), {
                params: { size: 1 },
            });
            this.logger.log('Phorest API connection test successful');
            return true;
        } catch (error) {
            this.logger.error('Phorest API connection test failed:', error);
            return false;
        }
    }
}
