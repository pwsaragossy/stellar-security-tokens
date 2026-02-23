import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import { NotificationService } from '../services/notification.service.js';

const log = logger.scope('NotificationController');

export class NotificationController {
    static async getNotifications(req, res) {
        try {
            const { userType } = req.params; // 'investor', 'company_user', 'platform_admin'
            const userId = req.user.userId || req.user.id; // Adjust based on user object structure
            const { limit, offset } = req.query;

            // Basic validation to ensure user is requesting their own type
            // req.user.role vs userType param
            // Mapping:
            // req.user.role 'investor' -> userType 'investor'
            // req.user.role 'company_user' -> userType 'company_user'
            // req.user.role 'platform_admin' -> userType 'platform_admin'

            let actualUserType = userType;
            // If userType not provided in params, infer from token
            if (!actualUserType) {
                if (req.user.role === 'company_user') actualUserType = 'company_user';
                else if (req.user.role === 'platform_admin') actualUserType = 'platform_admin';
                else actualUserType = 'investor';
            }

            const result = await NotificationService.getUserNotifications(
                userId,
                actualUserType,
                parseInt(limit) || 20,
                parseInt(offset) || 0
            );

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            log.error('Error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
        }
    }

    static async markAsRead(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.userId || req.user.id;

            let userType = 'investor';
            if (req.user.role === 'company_user') userType = 'company_user';
            else if (req.user.role === 'platform_admin') userType = 'platform_admin';

            await NotificationService.markAsRead(parseInt(id), userId, userType);

            res.json({ success: true });
        } catch (error) {
            log.error('Error:', error);
            res.status(500).json({ success: false, error: 'Failed to mark as read' });
        }
    }

    static async markAllAsRead(req, res) {
        try {
            const userId = req.user.userId || req.user.id;

            let userType = 'investor';
            if (req.user.role === 'company_user') userType = 'company_user';
            else if (req.user.role === 'platform_admin') userType = 'platform_admin';

            await NotificationService.markAllAsRead(userId, userType);

            res.json({ success: true });
        } catch (error) {
            log.error('Error:', error);
            res.status(500).json({ success: false, error: 'Failed to mark all as read' });
        }
    }
}
