import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { useEffect, useState, useCallback } from 'react';

const ALLOWED_ADDRESSES = [
    'opt1pp4j4gpqh2qesaz0uhs0rnu4n4q2xlj7cpgqqep2kl0g9fysd3lss2n0e0t',
    'opt1ppw62uk38kc6fpce0h2rm87zcyhhe9lxaqhdx6z3gu7qh8qzu5gxq7us3t4',
];
const CHECKIN_WINDOW_MS = 48 * 60 * 60 * 1000;

interface StatusData {
    lastCheckin: number | null;
    message: string | null;
}

export function DannyStatus() {
    const {
        walletAddress,
        walletInstance,
        connecting,
        connectToWallet,
        disconnect,
        openConnectModal,
    } = useWalletConnect();

    const [status, setStatus] = useState<StatusData>({ lastCheckin: null, message: null });
    const [loading, setLoading] = useState(true);
    const [signing, setSigning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            setStatus(data);
        } catch {
            const stored = localStorage.getItem('danny_checkin');
            if (stored) setStatus(JSON.parse(stored));
        } finally {
            setLoading(false);
        }
    };

    const isDanny = ALLOWED_ADDRESSES.some(a => walletAddress?.toLowerCase() === a.toLowerCase());
    const isAlive = status.lastCheckin !== null &&
        (Date.now() - status.lastCheckin) < CHECKIN_WINDOW_MS;

    const timeSince = status.lastCheckin ? formatTimeSince(status.lastCheckin) : null;
    const timeLeft = status.lastCheckin
        ? formatTimeLeft(status.lastCheckin + CHECKIN_WINDOW_MS - Date.now())
        : null;

    const handleCheckin = useCallback(async () => {
        if (!walletInstance || !isDanny) return;
        setSigning(true);
        setError(null);
        setSuccess(false);

        try {
            const timestamp = Date.now();
            const message = `Danny is alive. Timestamp: ${timestamp}`;
            const signature = await walletInstance.signMessage(message);
            if (!signature) { setError('Signing cancelled'); return; }

            try {
                const res = await fetch('/api/checkin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message,
                        signature: typeof signature === 'string' ? signature : JSON.stringify(signature),
                        timestamp,
                        address: walletAddress,
                    }),
                });
                if (res.ok) { setSuccess(true); await fetchStatus(); return; }
            } catch { /* API not available */ }

            const data: StatusData = { lastCheckin: timestamp, message };
            localStorage.setItem('danny_checkin', JSON.stringify(data));
            setStatus(data);
            setSuccess(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Signing failed');
        } finally {
            setSigning(false);
        }
    }, [walletInstance, isDanny, walletAddress]);

    // Live tick
    const [, setTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTick(c => c + 1), 1000);
        return () => clearInterval(t);
    }, []);

    const statusClass = loading ? 'loading' : isAlive ? 'alive' : 'missing';

    return (
        <div className={`container ${statusClass === 'missing' ? 'container-missing' : ''}`}>
            <div className="topo-bg" />
            <div className="noise" />
            {statusClass === 'missing' && <div className="red-vignette" />}

            {/* Header */}
            <header className="header">
                <div className={`header-classification ${statusClass === 'missing' ? 'hc-red' : ''}`}>
                    {statusClass === 'missing' ? '⚠ ALERT ⚠' : 'CLASSIFIED'}
                </div>
                <div className="header-title">OPNet Deadman Protocol</div>
                <div className="header-sub">Field Operative Status Monitor</div>
                <div className="header-line" />
            </header>

            <main className="main">
                {/* Dog tag + cross row */}
                <div className="tag-row">
                    {statusClass === 'missing' && !loading && (
                        <div className="missing-cross">
                            <div className="cross-v" />
                            <div className="cross-h" />
                        </div>
                    )}
                    <div className={`dog-tag ${statusClass === 'missing' ? 'dog-tag-missing' : ''}`}>
                        <div className="dog-tag-body">
                            <div className="dog-tag-notch" />
                            <div className="dog-tag-line name">DANNY</div>
                            <div className="dog-tag-line">OPNET CREATOR</div>
                            <div className="dog-tag-line callsign">CALLSIGN: GENESIS</div>
                            <div className="dog-tag-line callsign">ID: {ALLOWED_ADDRESSES[0].substring(0, 20)}...</div>
                        </div>
                    </div>
                </div>

                {/* MISSING dramatic stamp */}
                {statusClass === 'missing' && !loading && (
                    <div className="missing-drama">
                        <div className="missing-stamp">MIA</div>
                        <div className="missing-subtitle">MISSING IN ACTION</div>
                        <div className="missing-detail">
                            Last transmission: {timeSince ?? 'NEVER'}
                        </div>
                        <div className="missing-detail">
                            Check-in window expired. Operative has not reported.
                        </div>
                        <div className="missing-static">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="static-bar" style={{ animationDelay: `${i * 0.3}s` }} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Status badge */}
                <div className="status-display">
                    <div className={`status-badge ${statusClass}`}>
                        <div className={`status-indicator ${statusClass}`} />
                        {loading ? 'CHECKING...' : isAlive ? 'OPERATIVE ALIVE' : 'OPERATIVE MISSING'}
                    </div>
                </div>

                {/* Intel panel */}
                <div className="intel-panel">
                    <div className="intel-cell">
                        <div className="intel-label">Last Signal</div>
                        <div className="intel-value">{timeSince ?? '—'}</div>
                    </div>
                    <div className="intel-cell">
                        <div className="intel-label">Window</div>
                        <div className={`intel-value ${isAlive ? 'countdown' : 'expired'}`}>
                            {status.lastCheckin ? (isAlive ? timeLeft : 'EXPIRED') : '—'}
                        </div>
                    </div>
                    <div className="intel-cell">
                        <div className="intel-label">Protocol</div>
                        <div className="intel-value">48H</div>
                    </div>
                </div>

                {/* Signal line */}
                <div className="radio-line">
                    <svg viewBox="0 0 500 40" className="radio-svg" preserveAspectRatio="none">
                        {isAlive && !loading ? (
                            <polyline
                                className="signal-line alive"
                                points="0,20 60,20 80,20 90,5 100,35 110,8 118,25 126,20 160,20 220,20 240,20 250,5 260,35 270,8 278,25 286,20 320,20 380,20 400,20 410,5 420,35 430,8 438,25 446,20 500,20"
                            />
                        ) : (
                            <line className="signal-line flat" x1="0" y1="20" x2="500" y2="20" />
                        )}
                    </svg>
                </div>
            </main>

            {/* Comms panel */}
            <section className="comms-panel">
                <div className="comms-header">
                    <div className="comms-dot" />
                    Secure Communications Channel
                </div>
                <div className="comms-body">
                    {!walletAddress ? (
                        <>
                            <p className="connect-label">Authenticate to Check In</p>
                            <div className="connect-buttons">
                                <button className="btn btn-primary" onClick={() => connectToWallet(SupportedWallets.OP_WALLET)}>
                                    {connecting ? 'CONNECTING...' : '🪖 CONNECT OP_WALLET'}
                                </button>
                                <button className="btn btn-secondary" onClick={openConnectModal}>
                                    OTHER WALLET
                                </button>
                            </div>
                        </>
                    ) : !isDanny ? (
                        <div className="wrong-wallet">
                            <div className="warning-icon">⛔</div>
                            <p>ACCESS DENIED</p>
                            <p className="small">Wallet: {walletAddress}</p>
                            <p className="small">Expected: {ALLOWED_ADDRESSES[0].substring(0, 30)}...</p>
                            <p className="small">Only the field operative's wallet can transmit.</p>
                            <button className="btn btn-secondary" onClick={disconnect}>DISCONNECT</button>
                        </div>
                    ) : (
                        <div className="danny-area">
                            <div className="identity-badge">
                                <span className="badge-icon">✓</span>
                                <span>IDENTITY CONFIRMED</span>
                            </div>
                            <button
                                className="btn btn-checkin"
                                onClick={handleCheckin}
                                disabled={signing}
                            >
                                {signing ? 'SIGNING TRANSMISSION...' : '📡 TRANSMIT PROOF OF LIFE'}
                            </button>
                            {error && <p className="error-msg">⚠ {error}</p>}
                            {success && <p className="success-msg">✓ SIGNAL RECEIVED — STATUS UPDATED</p>}
                            <button className="btn btn-secondary btn-small" onClick={disconnect}>END TRANSMISSION</button>
                        </div>
                    )}
                </div>
            </section>

            {/* Footer */}
            <footer className="footer">
                <div className="footer-line" />
                <div className="footer-content">
                    <span>DEADMAN PROTOCOL v1.0</span>
                    <span className="sep">•</span>
                    <span>48H CHECK-IN WINDOW</span>
                    <span className="sep">•</span>
                    <span>OPNET NETWORK</span>
                </div>
            </footer>
        </div>
    );
}

function formatTimeSince(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h ago`;
    }
    if (hours > 0) return `${hours}h ${mins}m ago`;
    return `${mins}m ago`;
}

function formatTimeLeft(ms: number): string {
    if (ms <= 0) return 'EXPIRED';
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
}
