import Pusher from 'pusher-js';

const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY || 'YOUR_PUSHER_KEY';
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER || 'YOUR_PUSHER_CLUSTER';

/**
 * Singleton Pusher instance for the frontend.
 * Gracefully handles missing credentials by not attempting a real connection.
 */
let pusherInstance: Pusher | null = null;

export const getPusher = (): Pusher | null => {
    if (!PUSHER_KEY || PUSHER_KEY === 'YOUR_PUSHER_KEY') {
        console.warn('[Pusher Mock] No Pusher key provided, real-time sync will be disabled.');
        return null;
    }

    if (!pusherInstance) {
        pusherInstance = new Pusher(PUSHER_KEY, {
            cluster: PUSHER_CLUSTER,
            forceTLS: true
        });
        console.log('[Pusher] Initialized real-time sync client');
    }
    return pusherInstance;
};

/**
 * Custom hook wrapper for Pusher subscriptions
 */
import { useEffect } from 'react';

export const usePusherSubscription = (channelName: string, eventName: string, callback: (data: any) => void) => {
    useEffect(() => {
        const pusher = getPusher();
        if (!pusher) return;

        const channel = pusher.subscribe(channelName);
        channel.bind(eventName, callback);

        return () => {
            channel.unbind(eventName, callback);
            pusher.unsubscribe(channelName);
        };
    }, [channelName, eventName, callback]);
};
