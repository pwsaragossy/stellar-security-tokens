import api from './client';
import type { ApiResponse } from '@/types';

export interface Notification {
    id: number;
    user_id: number;
    type: string;
    title: string;
    message: string;
    read: boolean;
    data?: any;
    created_at: string;
}

export const notificationsApi = {
    getAll: async (params?: {
        limit?: number;
        offset?: number;
        userType?: 'investor' | 'company_user' | 'platform_admin';
    }): Promise<ApiResponse<Notification[]>> => {
        const response = await api.get('/notifications', { params });
        return response.data;
    },

    markAsRead: async (id: number): Promise<ApiResponse> => {
        const response = await api.put(`/notifications/${id}/read`);
        return response.data;
    },

    markAllAsRead: async (): Promise<ApiResponse> => {
        const response = await api.put('/notifications/read-all');
        return response.data;
    },
};
