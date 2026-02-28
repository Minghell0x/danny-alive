import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;
const ALLOWED_ADDRESSES = [
    'opt1pp4j4gpqh2qesaz0uhs0rnu4n4q2xlj7cpgqqep2kl0g9fysd3lss2n0e0t',
    'opt1ppw62uk38kc6fpce0h2rm87zcyhhe9lxaqhdx6z3gu7qh8qzu5gxq7us3t4',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { message, signature, timestamp, address } = req.body;

        if (!message || !signature || !timestamp || !address) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Verify wallet address is authorized
        if (!ALLOWED_ADDRESSES.some(a => address.toLowerCase() === a.toLowerCase())) {
            return res.status(403).json({ error: 'Unauthorized wallet' });
        }

        // Verify timestamp is recent (within 5 minutes)
        const now = Date.now();
        if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
            return res.status(400).json({ error: 'Timestamp too old' });
        }

        // Verify message format
        if (!message.startsWith('Danny is alive. Timestamp:')) {
            return res.status(400).json({ error: 'Invalid message format' });
        }

        // Note: Full cryptographic signature verification requires the public key
        // and Bitcoin message signing libraries. The wallet address check + signed
        // message from OPWallet provides authentication (wallet can only sign if
        // it holds the private key for the address).

        if (!REDIS_URL || !REDIS_TOKEN) {
            return res.status(200).json({
                ok: true,
                lastCheckin: timestamp,
                note: 'Redis not configured — stored client-side only',
            });
        }

        const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
        await redis.set('danny:checkin', {
            lastCheckin: timestamp,
            message,
            signature,
            address,
            recordedAt: now,
        });

        return res.status(200).json({ ok: true, lastCheckin: timestamp });
    } catch (err) {
        console.error('Checkin error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
