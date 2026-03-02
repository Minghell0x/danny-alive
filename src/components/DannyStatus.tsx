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
    const { quip, sub: quipSub } = loading
        ? { quip: '', sub: '' }
        : getStatusQuip(status.lastCheckin);

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

                {/* Status quip */}
                {!loading && (
                    <div className="status-quip">
                        <p className={`quip-text ${statusClass}`}>{quip}</p>
                        <p className="quip-sub">{quipSub}</p>
                    </div>
                )}

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

function getStatusQuip(lastCheckin: number | null): { quip: string; sub: string } {
    if (lastCheckin === null) {
        return {
            quip: 'No signal has ever been received.',
            sub: 'Either the operative never existed, or the paperwork got lost. Classic military.',
        };
    }

    const elapsed = Date.now() - lastCheckin;
    const hoursElapsed = elapsed / 3600000;
    const remaining = 48 - hoursElapsed;

    // Rotate quips per minute so they don't flicker every second
    const minute = Math.floor(Date.now() / 60000);
    const pick = (arr: string[]) => arr[minute % arr.length];

    // ── ALIVE: plenty of time (44h-48h remaining) ──
    if (remaining > 44) return {
        quip: pick([
            'All systems nominal. Danny is presumably alive and doing Danny things.',
            'Signal strong. No reason to panic. Yet.',
            'Operative confirmed breathing. Possibly even productive.',
        ]),
        sub: 'Check-in window is wide open. Nothing to see here.',
    };

    // ── ALIVE: comfortable (36h-44h) ──
    if (remaining > 36) return {
        quip: pick([
            'Still well within parameters. Relax.',
            'Danny has plenty of time. Go touch grass.',
            'The clock is ticking but, like, very slowly.',
        ]),
        sub: 'Status: unremarkably alive.',
    };

    // ── ALIVE: starting to notice (24h-36h) ──
    if (remaining > 24) return {
        quip: pick([
            'Clock is running. Nothing dramatic. Just... running.',
            'Danny checked in recently enough that we\'re not sweating. Emphasis on "enough".',
            'Over a third of the window used. Mathematically unremarkable. Emotionally noted.',
        ]),
        sub: 'No action required. But we wouldn\'t complain if Danny popped in.',
    };

    // ── ALIVE: getting nervous (12h-24h) ──
    if (remaining > 12) return {
        quip: pick([
            'Under 24 hours remaining. We\'re not worried. You\'re worried.',
            'Would be a great day for Danny to remember this website exists.',
            'Clock\'s ticking. Casually. Very casually.',
            'The window is narrowing. Like Danny\'s chances of remembering.',
        ]),
        sub: 'Totally not refreshing this page every 5 minutes.',
    };

    // ── ALIVE: sweating (6h-12h) ──
    if (remaining > 6) return {
        quip: pick([
            'Single digit hours remaining. This is fine. Everything is fine.',
            'Danny, if you\'re reading this... now would be good.',
            'We\'re entering "should we text him?" territory.',
            'Less than 12 hours. The EKG line is getting nervous.',
        ]),
        sub: 'Someone check if Danny\'s phone is charged.',
    };

    // ── ALIVE: panic mode (1h-6h) ──
    if (remaining > 1) return {
        quip: pick([
            'HOURS. Not days. HOURS.',
            'Danny please. We are begging. The green dot needs you.',
            'The countdown is giving anxiety and I\'m a website.',
            'Community members are starting to draft eulogies. Just kidding. Maybe.',
        ]),
        sub: 'Seriously Danny. One click. That\'s all we ask.',
    };

    // ── ALIVE: final hour (<1h) ──
    if (remaining > 0) return {
        quip: pick([
            'UNDER ONE HOUR. THIS IS NOT A DRILL.',
            'Danny. DANNY. The button. Press it. NOW.',
            'We can see the light at the end of the tunnel and it\'s red.',
            'The MIA stamp is warming up. It\'s stretching. It\'s ready.',
        ]),
        sub: 'Every second counts. Literally. Look at the countdown.',
    };

    // ── MISSING: just expired (0-2h overdue) ──
    const overdue = hoursElapsed - 48;
    if (overdue < 2) return {
        quip: pick([
            'He\'s probably just getting coffee. A really long coffee.',
            'Technically overdue. But who\'s counting? We are. We\'re counting.',
            'Window expired but let\'s not jump to conclusions. He might be in a tunnel.',
        ]),
        sub: 'Give it a minute. Or 120 of them.',
    };

    // ── MISSING: few hours (2-6h overdue) ──
    if (overdue < 6) return {
        quip: pick([
            'His phone probably died. Phones die all the time. Right? RIGHT?',
            'Maybe he\'s on a plane. A very long plane ride. To Mars.',
            'Some people just forget things. Important things. Like proving they\'re alive.',
            'He\'s probably just touching grass. Aggressive, extended grass touching.',
        ]),
        sub: 'We\'re not worried. This is our not-worried face.',
    };

    // ── MISSING: half day (6-12h overdue) ──
    if (overdue < 12) return {
        quip: pick([
            'Starting to rehearse "I\'m sure he\'s fine" with less conviction.',
            'We\'ve checked the hospitals. Just kidding. But we thought about it.',
            'This is the part of the movie where someone says "when did you last hear from him?"',
            'Half a day overdue. The "he\'s just busy" excuse is losing credibility.',
        ]),
        sub: 'The community is asking questions. We don\'t have answers.',
    };

    // ── MISSING: one day (12-24h overdue) ──
    if (overdue < 24) return {
        quip: pick([
            'This is fine. 🔥 Everything is fine. 🔥🔥',
            'If Danny were a pizza delivery, we\'d have gotten it for free by now.',
            'Over 12 hours late. Even "fashionably late" has its limits.',
            'The protocol exists for a reason. This is the reason.',
        ]),
        sub: 'Someone go knock on his door. Does anyone know where he lives? Asking for a protocol.',
    };

    // ── MISSING: two days (24-48h overdue) ──
    if (overdue < 48) return {
        quip: pick([
            'It\'s been over a day. We\'ve moved past denial into bargaining.',
            'We\'re officially in "should we call someone?" territory. Who do we call?',
            'The vibes are off. Severely, catastrophically off.',
            'Danny, if you\'re being held hostage, blink twice. Oh wait, this is a website.',
        ]),
        sub: 'At this point we\'d accept a smoke signal.',
    };

    // ── MISSING: 3+ days (48-72h overdue) ──
    if (overdue < 72) return {
        quip: pick([
            'Three days. Even Jesus came back after three days. Just saying.',
            'We\'ve started a support group. It meets here. Continuously.',
            'The green dot is a distant memory now. We barely remember what hope felt like.',
            'At this point the MIA stamp has been stamped so hard it\'s embossed.',
        ]),
        sub: 'OPNet is running itself apparently.',
    };

    // ── MISSING: 1 week (72-168h overdue) ──
    if (overdue < 168) return {
        quip: pick([
            'It\'s been a week. We\'ve named the flatline. His name is Gerald.',
            'The dead man\'s switch has fully switched. We don\'t know what that means either.',
            'At this point we\'re considering hiring a private investigator. Or a medium.',
            'A full week. The milk in Danny\'s fridge has probably expired too.',
        ]),
        sub: 'Send help. Or Danny. Preferably Danny.',
    };

    // ── MISSING: 2+ weeks (168h+ overdue) ──
    if (overdue < 720) return {
        quip: pick([
            'We\'ve entered archaeological timescales. Future civilizations will study this.',
            'Legends say Danny once checked in. The elders remember.',
            'The status has been red so long the website is considering rebranding.',
            'If absence makes the heart grow fonder, our hearts are about to explode.',
        ]),
        sub: 'This page has become a memorial. Unintentionally.',
    };

    // ── MISSING: 30+ days ──
    return {
        quip: pick([
            'At this point this website is basically a digital tombstone.',
            'Month(s) without contact. The protocol has spoken. We\'re just the messenger.',
            'Danny has achieved a level of absence that most people only dream of.',
            'We\'ve stopped counting. The counter hasn\'t. It\'s the only one still trying.',
        ]),
        sub: 'If you know Danny, please remind him the internet is waiting.',
    };
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
