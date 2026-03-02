import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    try {
        if (!REDIS_URL || !REDIS_TOKEN) {
            return res.status(200).json({
                lastCheckin: null,
                message: null,
                note: 'Redis not configured — using client-side storage',
            });
        }

        const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
        const data = await redis.get<{ lastCheckin: number; message: string }>('danny:checkin');

        return res.status(200).json({
            lastCheckin: data?.lastCheckin ?? null,
            message: data?.message ?? null,
        });
    } catch (err) {
        console.error('Status error:', err);
        return res.status(200).json({ lastCheckin: null, message: null });
    }
}
