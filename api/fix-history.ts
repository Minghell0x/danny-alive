import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

/**
 * One-shot cleanup: wipe the bad seeded history entry.
 * Call POST /api/fix-history once, then delete this file.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST only' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');

    if (!REDIS_URL || !REDIS_TOKEN) {
        return res.status(200).json({ error: 'No Redis' });
    }

    const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

    // Delete the entire history list (only had 1 bad seeded entry)
    await redis.del('danny:checkin:history');

    return res.status(200).json({ ok: true, message: 'History cleared. Will rebuild from next check-in.' });
}
