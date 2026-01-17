import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { api } from '@/lib/api';

interface Notification {
    id: number;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    actionLink?: string;
    isRead: boolean;
    createdAt: string;
}

export function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const fetchNotifications = async () => {
        // Don't fetch if user is not authenticated
        const token = localStorage.getItem('token');
        if (!token) {
            return;
        }

        try {
            const response = await api.get('/notifications?limit=10');
            if (response.data.success) {
                setNotifications(response.data.data.notifications);
                setUnreadCount(response.data.data.unreadCount);
            }
        } catch (error) {
            // Silently ignore auth errors - user may have just logged out
            if (error instanceof Error && error.message === 'Unauthorized') {
                return;
            }
            console.error('Failed to fetch notifications', error);
        }
    };

    // Poll for notifications every 30 seconds
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMarkAsRead = async (id: number) => {
        try {
            await api.put(`/notifications/${id}/read`, {});
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, isRead: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark as read', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            setLoading(true);
            await api.put('/notifications/read-all', {});
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read', error);
        } finally {
            setLoading(false);
        }
    };

    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.isRead) {
            await handleMarkAsRead(notification.id);
        }
        if (notification.actionLink) {
            setIsOpen(false);
            navigate(notification.actionLink);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                variant="ghost"
                size="icon"
                className="relative text-muted-foreground hover:text-white"
                onClick={() => setIsOpen(!isOpen)}
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
            </Button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 md:w-96 bg-slate-900 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden ring-1 ring-black ring-opacity-5 focus:outline-none backdrop-blur-xl">
                    <div className="p-3 border-b border-white/10 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">Notifications</h3>
                        {unreadCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-blue-400 hover:text-blue-300 h-6 px-2"
                                onClick={handleMarkAllAsRead}
                                disabled={loading}
                            >
                                Mark all read
                            </Button>
                        )}
                    </div>

                    <div className="max-h-[400px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                No notifications yet
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        onClick={() => handleNotificationClick(notification)}
                                        className={cn(
                                            "p-4 hover:bg-white/5 cursor-pointer transition-colors relative",
                                            !notification.isRead && "bg-blue-500/5"
                                        )}
                                    >
                                        {!notification.isRead && (
                                            <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1 h-12 bg-blue-500 rounded-full md:hidden" />
                                        )}
                                        <div className="flex gap-3">
                                            <div className={cn(
                                                "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                                                !notification.isRead ? "bg-blue-500" : "bg-transparent"
                                            )} />
                                            <div className="flex-1 space-y-1">
                                                <p className={cn("text-sm font-medium", !notification.isRead ? "text-white" : "text-muted-foreground")}>
                                                    {notification.title}
                                                </p>
                                                <p className="text-xs text-muted-foreground line-clamp-2">
                                                    {notification.message}
                                                </p>
                                                <p className="text-[10px] text-slate-500">
                                                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
