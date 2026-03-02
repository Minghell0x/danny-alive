import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { useEffect, useState, useCallback } from 'react';

const ALLOWED_ADDRESSES = [
    'opt1pp4j4gpqh2qesaz0uhs0rnu4n4q2xlj7cpgqqep2kl0g9fysd3lss2n0e0t',
    'opt1ppw62uk38kc6fpce0h2rm87zcyhhe9lxaqhdx6z3gu7qh8qzu5gxq7us3t4',
];
const CHECKIN_WINDOW_MS = 24 * 60 * 60 * 1000;

interface HistoryEntry {
    timestamp: number;
    address: string;
    /** ms remaining in the 24h window at check-in time (negative = overdue) */
    remainingMs: number;
}

interface StatusData {
    lastCheckin: number | null;
    message: string | null;
    history: HistoryEntry[];
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

    const [status, setStatus] = useState<StatusData>({ lastCheckin: null, message: null, history: [] });
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
            setStatus({
                lastCheckin: data.lastCheckin ?? null,
                message: data.message ?? null,
                history: Array.isArray(data.history) ? data.history : [],
            });
        } catch {
            const stored = localStorage.getItem('danny_checkin');
            if (stored) {
                const parsed = JSON.parse(stored);
                setStatus({ lastCheckin: parsed.lastCheckin, message: parsed.message, history: [] });
            }
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

            const data: StatusData = { lastCheckin: timestamp, message, history: status.history };
            localStorage.setItem('danny_checkin', JSON.stringify(data));
            setStatus(data);
            setSuccess(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Signing failed');
        } finally {
            setSigning(false);
        }
    }, [walletInstance, isDanny, walletAddress, status.history]);

    // Live tick
    const [, setTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTick(c => c + 1), 1000);
        return () => clearInterval(t);
    }, []);

    const remaining = status.lastCheckin
        ? (status.lastCheckin + CHECKIN_WINDOW_MS - Date.now()) / 3600000
        : null;
    const statusClass = loading ? 'loading'
        : !isAlive ? 'missing'
        : remaining !== null && remaining <= 12 ? 'warning'
        : 'alive';
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
                <div className={`header-classification ${statusClass === 'missing' ? 'hc-red' : statusClass === 'warning' ? 'hc-amber' : ''}`}>
                    {statusClass === 'missing' ? '⚠ ALERT ⚠' : statusClass === 'warning' ? '⚠ CAUTION ⚠' : 'CLASSIFIED'}
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
                        {loading ? 'CHECKING...'
                            : statusClass === 'missing' ? 'OPERATIVE MISSING'
                            : statusClass === 'warning' ? 'SIGNAL FADING'
                            : 'OPERATIVE ALIVE'}
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
                        <div className={`intel-value ${!isAlive ? 'expired' : statusClass === 'warning' ? 'countdown-warn' : 'countdown'}`}>
                            {status.lastCheckin ? (isAlive ? timeLeft : 'EXPIRED') : '—'}
                        </div>
                    </div>
                    <div className="intel-cell">
                        <div className="intel-label">Protocol</div>
                        <div className="intel-value">24H</div>
                    </div>
                </div>

                {/* Signal line */}
                <div className="radio-line">
                    <svg viewBox="0 0 500 40" className="radio-svg" preserveAspectRatio="none">
                        {(isAlive || statusClass === 'warning') && !loading ? (
                            <polyline
                                className={`signal-line ${statusClass === 'warning' ? 'warning' : 'alive'}`}
                                points={generateHeartbeatPoints(remaining ?? 24)}
                                style={{ animationDuration: `${getAnimationSpeed(remaining ?? 24)}s` }}
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

            {/* Check-in History */}
            {status.history.length > 0 && (
                <section className="history-panel">
                    <div className="history-header">
                        <div className="comms-dot" />
                        Field Transmission Log
                    </div>
                    <div className="history-body">
                        {status.history.map((entry, i) => {
                            const rMs = typeof entry.remainingMs === 'number' ? entry.remainingMs : null;
                            const rH = rMs !== null ? rMs / 3600000 : null;
                            const comment = rMs !== null
                                ? getHistoryQuip(rMs, entry.timestamp)
                                : 'First recorded transmission. The legend begins.';
                            const tier = rH === null ? 'comfortable'
                                : rH < 0 ? 'overdue'
                                : rH < 1 ? 'critical'
                                : rH < 4 ? 'close'
                                : rH < 12 ? 'moderate'
                                : 'comfortable';

                            return (
                                <div key={entry.timestamp} className={`history-entry ${tier}`}>
                                    <div className="history-row">
                                        <span className={`history-dot dot-${tier}`} />
                                        <span className="history-time">
                                            {formatHistoryDate(entry.timestamp)}
                                        </span>
                                        <span className={`history-remaining remaining-${tier}`}>
                                            {rH === null ? '—'
                                                : rH < 0 ? `${Math.abs(Math.round(rH))}h overdue`
                                                : rH < 1 ? `${Math.max(1, Math.round((rMs ?? 0) / 60000))}m left`
                                                : `${Math.round(rH)}h left`
                                            }
                                        </span>
                                    </div>
                                    <div className="history-comment">{comment}</div>
                                    {i < status.history.length - 1 && <div className="history-divider" />}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Footer */}
            <footer className="footer">
                <div className="footer-line" />
                <div className="footer-content">
                    <span>DEADMAN PROTOCOL v1.0</span>
                    <span className="sep">•</span>
                    <span>24H CHECK-IN WINDOW</span>
                    <span className="sep">•</span>
                    <span>OPNET NETWORK</span>
                </div>
            </footer>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   History quips — based on remainingMs (time LEFT in window)
   ════════════════════════════════════════════════════════════════ */

function formatHistoryDate(timestamp: number): string {
    const d = new Date(timestamp);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')} UTC`;
}

function getHistoryQuip(remainingMs: number, seed: number): string {
    const pick = (arr: string[]) => arr[Math.abs(seed) % arr.length];
    const rH = remainingMs / 3600000;

    // ── OVERDUE: checked in after window expired ──
    if (remainingMs < 0) {
        const overdueH = Math.abs(rH);
        if (overdueH < 1) return pick([
            'Technically dead for a few minutes there. Welcome back.',
            'The MIA stamp was literally mid-air. That was TOO close.',
            'Clinically deceased, then un-deceased. A medical miracle.',
            'We had already started writing the obituary. Not kidding.',
        ]);
        if (overdueH < 4) return pick([
            'Rose from the dead like it was casual. Hours overdue.',
            'We were picking out memorial flowers. Glad we didn\'t commit.',
            'The afterlife clearly has WiFi because he checked in from it.',
            'Back from the shadow realm. Took his time about it too.',
        ]);
        return pick([
            'Days overdue. Lazarus himself would be impressed.',
            'We genuinely thought this was it. Danny said "lol no."',
            'Resurrection speedrun: failed. But he made it eventually.',
            'At this point we\'d already divided up his NFTs. Awkward.',
        ]);
    }

    // ── CRITICAL: under 1 hour left ──
    if (rH < 1) return pick([
        'THAT WAS A CLOSE ONE. Minutes. MINUTES.',
        'Checked in with the clock literally screaming. Heart attack material.',
        'Clutched it at the buzzer. NBA Finals energy.',
        'If this were a movie, the bomb timer would\'ve been at 00:03.',
        'Speed ran the check-in. We can feel our blood pressure normalizing.',
        'Photo finish. The MIA stamp was COCKED AND LOADED.',
    ]);

    // ── CLOSE: 1-4 hours left ──
    if (rH < 4) return pick([
        'That was a close one. Not "movie close," more like "heart palpitation close."',
        'Cutting it fine, Danny. Real fine. Our nerves are shot.',
        'Checked in with hours to spare. And by "hours" we mean barely.',
        'The amber warning light was SCREAMING. Just saying.',
        'Arrived fashionably late to his own alive-ness confirmation.',
        'Danny likes to live dangerously. Ironic, given the context.',
    ]);

    // ── MODERATE: 4-12 hours left ──
    if (rH < 12) return pick([
        'Reasonable timing. Not great, not terrible. The Chernobyl of check-ins.',
        'Half the window gone but who\'s counting. We are. Obsessively.',
        'Showed up in the middle third. Very centrist of him.',
        'Not early, not late. Aggressively average. We\'ll take it.',
        'The clock was ticking loud enough to hear. Danny: "what clock?"',
        'Solid B-minus effort on the timing front.',
    ]);

    // ── COMFORTABLE: 12-20 hours left ──
    if (rH < 20) return pick([
        'Early-ish. The community\'s collective anxiety barely registered.',
        'Checked in before anyone started sweating. How considerate.',
        'A responsible, timely check-in. Who is this person.',
        'Plenty of time to spare. Almost suspiciously responsible.',
        'Danny woke up and chose accountability. Unprecedented.',
        'The green light didn\'t even flicker. Boring. (Thank God.)',
    ]);

    // ── FRESH: 20-24 hours left ──
    return pick([
        'Speedrun check-in. Danny hammered that button like rent was due.',
        'Checked in so fast the previous check-in was still warm.',
        'Eager. Almost too eager. Are we sure he\'s not a bot?',
        'Immediate re-check-in. This man fears the MIA stamp.',
        'Basically checked in before he even needed to. Overachiever.',
        'Full 24 hours on the clock. Danny woke up and chose violence against doubt.',
    ]);
}

/* ════════════════════════════════════════════════════════════════
   Status quip (main display, based on current time vs last check-in)
   ════════════════════════════════════════════════════════════════ */

function getStatusQuip(lastCheckin: number | null): { quip: string; sub: string } {
    if (lastCheckin === null) {
        return {
            quip: 'No signal has ever been received.',
            sub: 'Either the operative never existed, or the paperwork got lost. Classic military.',
        };
    }

    const elapsed = Date.now() - lastCheckin;
    const hoursElapsed = elapsed / 3600000;
    const remaining = 24 - hoursElapsed;

    const minute = Math.floor(Date.now() / 60000);
    const pick = (arr: string[]) => arr[minute % arr.length];

    if (remaining > 20) return {
        quip: pick([
            'All systems nominal. Danny is presumably alive and doing Danny things.',
            'Signal strong. No reason to panic. Yet.',
            'Operative confirmed breathing. Possibly even productive.',
        ]),
        sub: 'Check-in window is wide open. Nothing to see here.',
    };

    if (remaining > 16) return {
        quip: pick([
            'Still well within parameters. Relax.',
            'Danny has plenty of time. Go touch grass.',
            'The clock is ticking but, like, very slowly.',
        ]),
        sub: 'Status: unremarkably alive.',
    };

    if (remaining > 12) return {
        quip: pick([
            'Clock is running. Nothing dramatic. Just... running.',
            'Danny checked in recently enough that we\'re not sweating. Emphasis on "enough".',
            'Still in the comfortable zone. For now.',
        ]),
        sub: 'No action required. But we wouldn\'t complain if Danny popped in.',
    };

    if (remaining > 8) return {
        quip: pick([
            'Under 12 hours. The signal is weakening. We can feel it.',
            'The green light is flickering. It doesn\'t like what it sees.',
            'We\'ve moved from "he\'s fine" to "he\'s probably fine." Note the probably.',
            'Half the window gone. The other half isn\'t looking too confident either.',
        ]),
        sub: 'This is the part where smart people start paying attention.',
    };

    if (remaining > 4) return {
        quip: pick([
            'Under 8 hours and the silence is getting loud.',
            'Danny, if you\'re reading this, the window is closing and we\'re not joking anymore.',
            'We\'re past "should we text him" and into "does anyone have his mom\'s number."',
            'The heartbeat monitor is stuttering. Figuratively. For now.',
        ]),
        sub: 'Genuinely starting to worry. Not a bit. Not a joke.',
    };

    if (remaining > 1) return {
        quip: pick([
            'HOURS. The kind that run out. Fast.',
            'Danny we are not asking anymore. We are begging. Check in.',
            'The countdown is giving the entire community a collective panic attack.',
            'This is not a vibe check. This is a welfare check.',
        ]),
        sub: 'If you know Danny personally, now is the time to reach out.',
    };

    if (remaining > 0) return {
        quip: pick([
            'UNDER ONE HOUR. THIS IS NOT A DRILL. REPEAT: NOT A DRILL.',
            'Danny. DANNY. The button. PRESS IT. The red stamp is LOADED.',
            'Minutes. We are counting in MINUTES now. Do you understand.',
            'The MIA stamp is inked, cocked, and ready to fire.',
        ]),
        sub: 'Every second that passes is a second closer to MIA status. Move.',
    };

    const overdue = hoursElapsed - 24;
    if (overdue < 1) return {
        quip: pick([
            'He\'s probably just getting coffee. A really long coffee.',
            'Technically overdue. But who\'s counting? We are. We\'re counting.',
            'Window expired but let\'s not jump to conclusions. He might be in a tunnel.',
        ]),
        sub: 'Give it a minute. Or 60 of them.',
    };

    if (overdue < 4) return {
        quip: pick([
            'His phone probably died. Phones die all the time. Right? RIGHT?',
            'Maybe he\'s on a plane. A very long plane ride. To Mars.',
            'Some people just forget things. Important things. Like proving they\'re alive.',
            'He\'s probably just touching grass. Aggressive, extended grass touching.',
        ]),
        sub: 'We\'re not worried. This is our not-worried face.',
    };

    if (overdue < 12) return {
        quip: pick([
            'Starting to rehearse "I\'m sure he\'s fine" with less conviction.',
            'We\'ve checked the hospitals. Just kidding. But we thought about it.',
            'This is the part of the movie where someone says "when did you last hear from him?"',
            'The "he\'s just busy" excuse is losing credibility fast.',
        ]),
        sub: 'The community is asking questions. We don\'t have answers.',
    };

    if (overdue < 24) return {
        quip: pick([
            'This is fine. 🔥 Everything is fine. 🔥🔥',
            'If Danny were a pizza delivery, we\'d have gotten it for free by now.',
            'A full day overdue. Even "fashionably late" has its limits.',
            'The protocol exists for a reason. This is the reason.',
        ]),
        sub: 'Someone go knock on his door. Does anyone know where he lives? Asking for a protocol.',
    };

    if (overdue < 48) return {
        quip: pick([
            'Two days without contact. We\'ve moved past denial into bargaining.',
            'We\'re officially in "should we call someone?" territory. Who do we call?',
            'The vibes are off. Severely, catastrophically off.',
            'Danny, if you\'re being held hostage, blink twice. Oh wait, this is a website.',
        ]),
        sub: 'At this point we\'d accept a smoke signal.',
    };

    if (overdue < 72) return {
        quip: pick([
            'Three days. Even Jesus came back after three days. Just saying.',
            'We\'ve started a support group. It meets here. Continuously.',
            'The green dot is a distant memory now. We barely remember what hope felt like.',
            'At this point the MIA stamp has been stamped so hard it\'s embossed.',
        ]),
        sub: 'OPNet is running itself apparently.',
    };

    if (overdue < 168) return {
        quip: pick([
            'It\'s been a week. We\'ve named the flatline. His name is Gerald.',
            'The dead man\'s switch has fully switched. We don\'t know what that means either.',
            'At this point we\'re considering hiring a private investigator. Or a medium.',
            'A full week. The milk in Danny\'s fridge has probably expired too.',
        ]),
        sub: 'Send help. Or Danny. Preferably Danny.',
    };

    if (overdue < 720) return {
        quip: pick([
            'We\'ve entered archaeological timescales. Future civilizations will study this.',
            'Legends say Danny once checked in. The elders remember.',
            'The status has been red so long the website is considering rebranding.',
            'If absence makes the heart grow fonder, our hearts are about to explode.',
        ]),
        sub: 'This page has become a memorial. Unintentionally.',
    };

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

/* ════════════════════════════════════════════════════════════════
   SVG helpers
   ════════════════════════════════════════════════════════════════ */

function generateHeartbeatPoints(remainingHours: number): string {
    const W = 500;
    const MID = 20;

    let beats: number;
    let amplitude: number;
    if (remainingHours > 20)      { beats = 6; amplitude = 16; }
    else if (remainingHours > 16) { beats = 5; amplitude = 15; }
    else if (remainingHours > 12) { beats = 4; amplitude = 14; }
    else if (remainingHours > 8)  { beats = 3; amplitude = 13; }
    else if (remainingHours > 4)  { beats = 2; amplitude = 11; }
    else if (remainingHours > 1)  { beats = 1; amplitude = 9; }
    else                          { beats = 1; amplitude = 6; }

    if (beats === 0) return `0,${MID} ${W},${MID}`;

    const points: string[] = [`0,${MID}`];
    const spacing = W / (beats + 1);

    for (let i = 1; i <= beats; i++) {
        const cx = Math.round(spacing * i);
        points.push(`${cx - 14},${MID}`);
        points.push(`${cx - 8},${MID}`);
        points.push(`${cx - 4},${MID - amplitude}`);
        points.push(`${cx},${MID + Math.round(amplitude * 0.85)}`);
        points.push(`${cx + 5},${MID - Math.round(amplitude * 0.4)}`);
        points.push(`${cx + 9},${MID}`);
        points.push(`${cx + 14},${MID}`);
    }

    points.push(`${W},${MID}`);
    return points.join(' ');
}

function getAnimationSpeed(remainingHours: number): number {
    if (remainingHours > 20) return 2;
    if (remainingHours > 16) return 2.5;
    if (remainingHours > 12) return 3;
    if (remainingHours > 8)  return 3.5;
    if (remainingHours > 4)  return 4.5;
    if (remainingHours > 1)  return 6;
    return 8;
}

/* ════════════════════════════════════════════════════════════════
   Formatting helpers
   ════════════════════════════════════════════════════════════════ */

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
