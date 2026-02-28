import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { useEffect, useState, useCallback } from 'react';

const DANNY_ADDRESS = 'opt1pp4j4gpqh2qesaz0uhs0rnu4n4q2xlj7cpgqqep2kl0g9fysd3lss2n0e0t';
const CHECKIN_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

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

    // Fetch status on load
    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000); // refresh every 30s
        return () => clearInterval(interval);
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            setStatus(data);
        } catch {
            // API not available — check localStorage fallback
            const stored = localStorage.getItem('danny_checkin');
            if (stored) {
                setStatus(JSON.parse(stored));
            }
        } finally {
            setLoading(false);
        }
    };

    const isDanny = walletAddress?.toLowerCase() === DANNY_ADDRESS.toLowerCase();
    const isAlive = status.lastCheckin !== null &&
        (Date.now() - status.lastCheckin) < CHECKIN_WINDOW_MS;

    const timeSince = status.lastCheckin
        ? formatTimeSince(status.lastCheckin)
        : null;

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

            if (!signature) {
                setError('Signing cancelled or failed');
                return;
            }

            // Try API first
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

                if (res.ok) {
                    setSuccess(true);
                    await fetchStatus();
                    return;
                }
            } catch {
                // API not available — use localStorage fallback
            }

            // Fallback: store locally
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

    // Live countdown
    const [, setTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTick(c => c + 1), 1000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="container">
            {/* Background grid */}
            <div className="grid-bg" />

            {/* Scanline effect */}
            <div className="scanline" />

            {/* Header */}
            <header className="header">
                <div className="header-tag">OPNET DEADMAN PROTOCOL</div>
                <div className="header-line" />
            </header>

            {/* Main status */}
            <main className="main">
                <div className={`status-orb ${isAlive ? 'alive' : 'missing'} ${loading ? 'loading' : ''}`}>
                    <div className="orb-ring" />
                    <div className="orb-ring ring-2" />
                    <div className="orb-core">
                        <div className="orb-icon">{isAlive ? '♥' : '✕'}</div>
                    </div>
                </div>

                <h1 className={`status-text ${isAlive ? 'alive' : 'missing'}`}>
                    {loading ? 'CHECKING...' : isAlive ? 'DANNY IS ALIVE' : 'DANNY IS MISSING'}
                </h1>

                <div className="status-sub">
                    {status.lastCheckin ? (
                        <>
                            <span className="label">LAST SIGNAL</span>
                            <span className="value">{timeSince}</span>
                            {isAlive && timeLeft && (
                                <>
                                    <span className="divider">|</span>
                                    <span className="label">EXPIRES IN</span>
                                    <span className="value countdown">{timeLeft}</span>
                                </>
                            )}
                        </>
                    ) : (
                        <span className="value">NO SIGNAL RECORDED</span>
                    )}
                </div>

                {/* EKG line */}
                <div className="ekg-container">
                    <svg viewBox="0 0 600 80" className={`ekg ${isAlive ? 'alive' : 'flat'}`}>
                        {isAlive ? (
                            <polyline
                                className="ekg-line"
                                points="0,40 80,40 100,40 115,10 130,70 145,20 160,50 175,40 200,40 280,40 300,40 315,10 330,70 345,20 360,50 375,40 400,40 480,40 500,40 515,10 530,70 545,20 560,50 575,40 600,40"
                                fill="none"
                                strokeWidth="2"
                            />
                        ) : (
                            <line className="ekg-flat" x1="0" y1="40" x2="600" y2="40" strokeWidth="2" />
                        )}
                    </svg>
                </div>
            </main>

            {/* Wallet section */}
            <section className="wallet-section">
                {!walletAddress ? (
                    <div className="connect-area">
                        <p className="connect-label">DANNY: PROVE YOU'RE ALIVE</p>
                        <div className="connect-buttons">
                            <button className="btn btn-primary" onClick={() => connectToWallet(SupportedWallets.OP_WALLET)}>
                                {connecting ? 'CONNECTING...' : 'CONNECT OP_WALLET'}
                            </button>
                            <button className="btn btn-secondary" onClick={openConnectModal}>
                                OTHER WALLET
                            </button>
                        </div>
                    </div>
                ) : !isDanny ? (
                    <div className="wrong-wallet">
                        <div className="warning-icon">⚠</div>
                        <p>UNAUTHORIZED WALLET</p>
                        <p className="small">Connected: {walletAddress.substring(0, 16)}...</p>
                        <p className="small">Only Danny's wallet can check in.</p>
                        <button className="btn btn-secondary" onClick={disconnect}>DISCONNECT</button>
                    </div>
                ) : (
                    <div className="danny-area">
                        <div className="identity-badge">
                            <span className="badge-icon">✓</span>
                            <span>DANNY IDENTIFIED</span>
                        </div>
                        <button
                            className="btn btn-checkin"
                            onClick={handleCheckin}
                            disabled={signing}
                        >
                            {signing ? 'SIGN THE MESSAGE...' : '⚡ I\'M ALIVE — CHECK IN'}
                        </button>
                        {error && <p className="error-msg">{error}</p>}
                        {success && <p className="success-msg">✓ CHECK-IN RECORDED</p>}
                        <button className="btn btn-secondary btn-small" onClick={disconnect}>DISCONNECT</button>
                    </div>
                )}
            </section>

            {/* Footer */}
            <footer className="footer">
                <div className="footer-line" />
                <div className="footer-content">
                    <span>DEADMAN PROTOCOL v1.0</span>
                    <span className="divider">•</span>
                    <span>48H CHECK-IN WINDOW</span>
                    <span className="divider">•</span>
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
