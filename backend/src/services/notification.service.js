import prisma from '../config/prisma.js';
import { AlertService } from './alert.service.js';
import logger from '../utils/logger.js';
const log = logger.scope('NotificationService');

export class NotificationService {
    /**
     * Create a new notification
     * @param {number} userId - ID of the user
     * @param {string} userType - Type of user ('investor', 'company_user', 'platform_admin')
     * @param {string} type - Notification type ('info', 'success', 'warning', 'error')
     * @param {string} title - Notification title
     * @param {string} message - Notification body
     * @param {string} [actionLink] - Optional link for action
     */
    static async createNotification(userId, userType, type, title, message, actionLink = null) {
        try {
            const notification = await prisma.notification.create({
                data: {
                    userId,
                    userType,
                    type,
                    title,
                    message,
                    actionLink,
                    isRead: false,
                },
            });
            return notification;
        } catch (error) {
            log.error('Error creating notification:', error);
            // Don't throw, just log - notifications shouldn't block main flow
            return null;
        }
    }

    /**
     * Get notifications for a user
     * @param {number} userId 
     * @param {string} userType 
     * @param {number} limit 
     * @param {number} offset 
     */
    static async getUserNotifications(userId, userType, limit = 20, offset = 0) {
        try {
            const notifications = await prisma.notification.findMany({
                where: {
                    userId,
                    userType,
                },
                orderBy: {
                    createdAt: 'desc',
                },
                take: limit,
                skip: offset,
            });

            const unreadCount = await prisma.notification.count({
                where: {
                    userId,
                    userType,
                    isRead: false,
                },
            });

            return { notifications, unreadCount };
        } catch (error) {
            log.error('Error fetching notifications:', error);
            throw error;
        }
    }

    /**
     * Mark notification as read
     * @param {number} id - Notification ID
     * @param {number} userId - To verify ownership
     * @param {string} userType - To verify ownership
     */
    static async markAsRead(id, userId, userType) {
        try {
            // First verify ownership
            const notification = await prisma.notification.findUnique({
                where: { id },
            });

            if (!notification) {
                throw new Error('Notification not found');
            }

            if (notification.userId !== userId || notification.userType !== userType) {
                throw new Error('Access denied');
            }

            return await prisma.notification.update({
                where: { id },
                data: { isRead: true },
            });
        } catch (error) {
            log.error('Error marking notification as read:', error);
            throw error;
        }
    }

    /**
     * Mark all notifications as read for a user
     */
    static async markAllAsRead(userId, userType) {
        try {
            return await prisma.notification.updateMany({
                where: {
                    userId,
                    userType,
                    isRead: false,
                },
                data: { isRead: true },
            });
        } catch (error) {
            log.error('Error marking all notifications as read:', error);
            throw error;
        }
    }
}
