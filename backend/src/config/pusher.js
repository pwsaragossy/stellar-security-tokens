import Pusher from 'pusher';
import dotenv from 'dotenv';

dotenv.config();

const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: process.env.PUSHER_USE_TLS === 'true',
});

/**
 * Event wrapper to avoid broadcaster errors if Pusher is not configured
 * @param {string} channel 
 * @param {string} event 
 * @param {Object} data 
 */
export const broadcast = async (channel, event, data) => {
    if (!process.env.PUSHER_KEY || process.env.PUSHER_KEY === 'YOUR_PUSHER_KEY') {
        console.log(`[Pusher Mock] Channel: ${channel} | Event: ${event}`, data);
        return;
    }

    try {
        await pusher.trigger(channel, event, data);
    } catch (error) {
        console.error('[Pusher Error] Failed to broadcast event:', error);
    }
};

export default pusher;
