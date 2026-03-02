import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

export interface CheckinRecord {
    timestamp: number;
    address: string;
    /** milliseconds since previous check-in (null for the first ever) */
    gap: number | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    try {
        if (!REDIS_URL || !REDIS_TOKEN) {
            return res.status(200).json({ history: [] });
        }

        const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

        // Fetch last 50 check-ins (newest first)
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const raw = await redis.lrange<CheckinRecord>('danny:checkin:history', 0, limit - 1);

        return res.status(200).json({ history: raw ?? [] });
    } catch (err) {
        console.error('History error:', err);
        return res.status(200).json({ history: [] });
    }
}
