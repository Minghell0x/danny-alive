import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;
const WINDOW_MS = 24 * 60 * 60 * 1000;

interface HistoryEntry {
    timestamp: number;
    address: string;
    remainingMs: number;
}

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
                history: [],
            });
        }

        const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

        const [data, rawHistory] = await Promise.all([
            redis.get<{ lastCheckin: number; message: string }>('danny:checkin'),
            redis.lrange<Record<string, unknown>>('danny:checkin:history', 0, 49),
        ]);

        // Normalize: old entries have `gap` (ms since prev check-in), new have `remainingMs`
        const history: HistoryEntry[] = (rawHistory ?? []).map((entry) => {
            // New format: already has remainingMs
            if (typeof (entry as unknown as HistoryEntry).remainingMs === 'number') {
                return entry as unknown as HistoryEntry;
            }
            // Legacy format: gap = ms elapsed since prev check-in → remainingMs = window - gap
            const gap = (entry as { gap?: number }).gap;
            const remainingMs = gap != null ? WINDOW_MS - gap : WINDOW_MS;
            return {
                timestamp: entry.timestamp as number,
                address: (entry.address as string) ?? '',
                remainingMs,
            };
        });

        // If there's a current check-in but no history yet, seed first entry
        if (data?.lastCheckin && history.length === 0) {
            const seed = {
                timestamp: data.lastCheckin,
                address: (data as Record<string, unknown>).address as string ?? '',
            };
            history.push(seed as HistoryEntry);
            await redis.lpush('danny:checkin:history', seed).catch(() => {});
        }

        return res.status(200).json({
            lastCheckin: data?.lastCheckin ?? null,
            message: data?.message ?? null,
            history,
        });
    } catch (err) {
        console.error('Status error:', err);
        return res.status(200).json({ lastCheckin: null, message: null, history: [] });
    }
}
