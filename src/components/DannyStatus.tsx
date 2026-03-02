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
    const [historyPage, setHistoryPage] = useState(1);
    const HISTORY_PER_PAGE = 10;
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

            {/* Check-in History */}
            {status.history.length > 0 && (() => {
                const visible = status.history.slice(0, historyPage * HISTORY_PER_PAGE);
                const hasMore = status.history.length > visible.length;
                const totalPages = Math.ceil(status.history.length / HISTORY_PER_PAGE);

                return (
                    <section className="history-panel">
                        <div className="history-header">
                            <div className="comms-dot" />
                            Field Transmission Log
                            <span className="history-count">
                                {status.history.length} transmission{status.history.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="history-body">
                            {visible.map((entry) => {
                                const globalIdx = status.history.indexOf(entry);
                                const rMs = typeof entry.remainingMs === 'number' ? entry.remainingMs : null;
                                const rH = rMs !== null ? rMs / 3600000 : null;
                                const tier = getHistoryTier(rH);
                                const quip = getHistoryQuip(rMs, entry.timestamp, status.history, globalIdx);
                                const d = new Date(entry.timestamp);

                                return (
                                    <div key={entry.timestamp} className={`history-entry ${tier}`}>
                                        <div className="history-entry-header">
                                            <span className={`history-dot ${tier}`} />
                                            <span className="history-date">
                                                {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                            <span className="history-time">
                                                {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} UTC
                                            </span>
                                            <span className={`history-gap ${tier}`}>
                                                {rH === null ? 'first'
                                                    : rH < 0 ? `${Math.abs(Math.round(rH))}h overdue`
                                                    : rH < 1 ? `${Math.max(1, Math.round((rMs ?? 0) / 60000))}m left`
                                                    : `${Math.round(rH)}h left`
                                                }
                                            </span>
                                        </div>
                                        <div className={`history-quip ${tier}`}>{quip}</div>
                                    </div>
                                );
                            })}
                        </div>
                        {(hasMore || historyPage > 1) && (
                            <div className="history-footer">
                                {historyPage > 1 && (
                                    <button
                                        className="btn btn-secondary btn-small"
                                        onClick={() => setHistoryPage(1)}
                                    >
                                        ▲ SHOW LESS
                                    </button>
                                )}
                                {hasMore && (
                                    <button
                                        className="btn btn-secondary btn-small"
                                        onClick={() => setHistoryPage(p => p + 1)}
                                    >
                                        ▼ OLDER TRANSMISSIONS ({status.history.length - visible.length} more)
                                    </button>
                                )}
                                {totalPages > 1 && (
                                    <span className="history-page-info">
                                        Page {historyPage} of {totalPages}
                                    </span>
                                )}
                            </div>
                        )}
                    </section>
                );
            })()}

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

function getHistoryTier(rH: number | null): string {
    if (rH === null) return 'first';
    if (rH < 0) return 'overdue';
    if (rH < 2) return 'clutch';
    if (rH < 4) return 'close';
    if (rH < 12) return 'normal';
    return 'early';
}


function getHistoryQuip(
    remainingMs: number | null,
    seed: number,
    history: HistoryEntry[],
    index: number,
): string {
    const pick = (arr: string[]) => arr[Math.abs(seed) % arr.length];

    // First ever check-in
    if (remainingMs === null || history.length === 0) {
        return pick([
            'The first transmission. The legend begins. The anxiety begins harder.',
            'Day zero. The protocol awakens. It will never sleep again.',
            'Genesis signal. We had no idea what we were signing up for.',
            'The very first proof of life. We were so innocent back then.',
        ]);
    }

    const rH = remainingMs / 3600000;

    // ── Context analysis ──
    // Previous entry is index+1 (history is newest-first)
    const prev = index < history.length - 1 ? history[index + 1] : null;
    const prevRH = prev?.remainingMs != null ? prev.remainingMs / 3600000 : null;

    // Pattern detection
    const recentEntries = history.slice(Math.max(0, index - 4), index + 1);
    const closeCallCount = recentEntries.filter(e => e.remainingMs != null && e.remainingMs < 4 * 3600000).length;
    const _overdueCount = recentEntries.filter(e => e.remainingMs != null && e.remainingMs < 0).length; void _overdueCount;
    const earlyCount = recentEntries.filter(e => e.remainingMs != null && e.remainingMs > 12 * 3600000).length;
    const isImprovement = prevRH !== null && rH > prevRH;
    const isWorse = prevRH !== null && rH < prevRH;
    const wasOverdue = prevRH !== null && prevRH < 0;
    const wasClutch = prevRH !== null && prevRH < 2;

    // ── OVERDUE: checked in after window expired ──
    if (remainingMs < 0) {
        const overdueH = Math.abs(rH);
        if (wasOverdue) return pick([
            'Overdue AGAIN. This is becoming a pattern and we don\'t like the pattern.',
            'Two in a row?? Danny is treating "alive" like a suggestion, not a requirement.',
            'Back-to-back overdue. At this point the MIA stamp has a reserved parking spot.',
            'Consecutive late check-ins. The protocol is filing a formal complaint.',
        ]);
        if (prevRH !== null && prevRH > 12) return pick([
            'Went from early to OVERDUE. What happened between then and now, Danny?',
            'Last time: responsible citizen. This time: legally dead for a bit. Character development.',
            'The whiplash from last check-in to this one gave us actual whiplash.',
            'Previous: green and happy. Now: flatline. We\'re getting emotional damage.',
        ]);
        if (overdueH < 1) return pick([
            'Technically dead for a few minutes there. Welcome back from the void.',
            'The MIA stamp was literally mid-air. We could hear it whistling down.',
            'Clinically deceased, then un-deceased. A medical miracle, or just Danny things.',
            'We had already started writing the obituary. It was GOOD too. Shame.',
            'The flatline played for a full minute. The community aged 10 years.',
        ]);
        if (overdueH < 4) return pick([
            'Rose from the dead like it was a casual Tuesday. Hours overdue.',
            'We were picking out memorial flowers. Went with lilies. Glad we can return them.',
            'The afterlife clearly has WiFi because he checked in from it.',
            'Back from the shadow realm. Took the scenic route apparently.',
            'Danny said "I\'ll check in later" and meant it VERY literally.',
        ]);
        return pick([
            'Days overdue. Lazarus himself took notes on this comeback.',
            'We genuinely thought this was it. Danny said "lol no" from beyond.',
            'Resurrection speedrun any%. Failed. Catastrophically. But he\'s here.',
            'At this point we\'d already divided up his NFTs. Give them back? Fine.',
            'The memorial page was drafted, reviewed, and nearly published. DANNY.',
        ]);
    }

    // ── CRITICAL: under 1 hour left ──
    if (rH < 1) {
        if (closeCallCount >= 3) return pick([
            'ANOTHER sub-1-hour finish. Danny is doing this on PURPOSE at this point.',
            'Third close call in recent memory. Our cardiologist bills are YOUR fault, Danny.',
            'Danny has a type and it\'s "giving the community heart failure repeatedly."',
            'The pattern is clear: Danny waits until the protocol is literally crying.',
        ]);
        if (wasOverdue) return pick([
            'Last time he was LATE. This time: barely made it. The trajectory concerns us.',
            'Going from overdue to "made it by minutes" is NOT the improvement arc we wanted.',
            'Previously: dead. Now: almost dead again. Danny, the bar is IN the ground.',
        ]);
        if (wasClutch) return pick([
            'Back-to-back buzzer beaters. Danny thinks this is the NBA playoffs.',
            'Another last-second save. At this rate we\'re installing a defibrillator on this page.',
            'Two clutch saves in a row. Danny is speedrunning our collective anxiety disorder.',
        ]);
        return pick([
            'THAT WAS A CLOSE ONE. Minutes. MINUTES. We can taste the adrenaline.',
            'Checked in with the clock literally screaming. Our therapists send their regards.',
            'Clutched it at the buzzer. The MIA stamp was LOADED, COCKED, and SWEATING.',
            'If this were a movie, the bomb timer would\'ve been at 00:03. With dramatic music.',
            'The entire community collectively stopped breathing. We\'re still lightheaded.',
            'Photo finish. Danny crossed the line horizontal, gasping, on fire. But he crossed it.',
        ]);
    }

    // ── CLOSE: 1-4 hours left ──
    if (rH < 4) {
        if (closeCallCount >= 2) return pick([
            'Close call AGAIN. Danny treats the 24h window like a 23h nap opportunity.',
            'Another close one. We\'re sensing a theme. The theme is cardiovascular distress.',
            'Danny\'s consistent at exactly one thing: giving us anxiety.',
            'Pattern recognized: Danny checks in when the amber light is already a lifestyle.',
        ]);
        if (isImprovement && wasClutch) return pick([
            'Marginally less terrifying than last time. Progress? We\'ll take crumbs.',
            'Improved from "nearly dead" to "cutting it close." The growth is... something.',
            'Baby steps. Last time was worse. Our standards have been lowered permanently.',
        ]);
        if (isWorse && prevRH !== null && prevRH > 12) return pick([
            'Was doing so well last time. Then chose violence. Classic Danny arc.',
            'Went from responsible to "that was a close one" in one check-in cycle. Impressive.',
            'Last check-in: early and responsible. This one: community panic mode. Pick a lane.',
        ]);
        return pick([
            'That was a close one. Not "movie close," more like "heart palpitation close."',
            'Cutting it fine, Danny. Real fine. Our nerves are filing a class action lawsuit.',
            'Checked in with hours to spare. And by "hours" we mean "barely hours." Plural is generous.',
            'The amber warning light was SCREAMING so loud the neighbors complained.',
            'Arrived fashionably late to his own alive-ness confirmation. Bold choice.',
            'Danny likes to live dangerously. Ironic, given THIS is a page about whether he\'s alive.',
            'The protocol was warming up the red stamp. Danny walked in like nothing happened.',
        ]);
    }

    // ── MODERATE: 4-12 hours left ──
    if (rH < 12) {
        if (wasOverdue) return pick([
            'Massive improvement over literally being dead last time. The bar was underground.',
            'From overdue to mid-window. Danny discovered the concept of "on time." Growth.',
            'Last time: MIA. This time: showed up with half a window. We\'re almost proud.',
        ]);
        if (wasClutch) return pick([
            'Better than last time\'s heart attack delivery. Our blood pressure thanks you.',
            'Upgraded from "emergency" to "meh." Danny is learning. Slowly. Very slowly.',
            'Last time we nearly died. This time we only sweated. Improvement.',
        ]);
        if (earlyCount >= 3) return pick([
            'After a streak of early check-ins, Danny has relaxed. Maybe too much.',
            'The responsible era appears to be ending. We saw this coming.',
            'Danny got comfortable. Comfort breeds complacency. Complacency breeds amber lights.',
        ]);
        return pick([
            'Reasonable timing. Not great, not terrible. The Chernobyl of check-ins.',
            'Half the window gone but who\'s counting. We are. Obsessively. It\'s our whole job.',
            'Showed up in the middle third. Very centrist of him. Both sides can\'t complain.',
            'Not early, not late. Aggressively average. The beige of alive-ness confirmation.',
            'The clock was ticking loud enough to hear. Danny: "what clock? I was napping."',
            'Solid B-minus effort. The kind of grade that says "I did the homework on the bus."',
            'Danny rolled in at the halfway point like it was a hotel checkout. "Late checkout, please."',
        ]);
    }

    // ── COMFORTABLE: 12-20 hours left ──
    if (rH < 20) {
        if (wasOverdue) return pick([
            'From DEAD to EARLY? Who is this person and what did they do with Danny?',
            'Last check-in: literally overdue. This one: responsible. We\'re suspicious.',
            'Danny went from obituary-ready to teacher\'s pet in one cycle. Unhinged character arc.',
        ]);
        if (wasClutch) return pick([
            'After last time\'s near-death experience, Danny chose responsibility. Trauma works.',
            'Turns out almost going MIA is motivating. Who knew? Not Danny, until now.',
            'Last time we aged 10 years. This time: peace. Danny learned from the pain.',
        ]);
        if (earlyCount >= 3) return pick([
            'Consistent early check-ins. Danny is in his responsible era and we are HERE for it.',
            'Three-peat of early check-ins. Either Danny reformed or he automated this.',
            'Danny is on a streak. The protocol is bored. We love being bored.',
        ]);
        return pick([
            'Early-ish. The community\'s collective anxiety barely registered on the meter.',
            'Checked in before anyone started sweating. How uncharacteristically considerate.',
            'A responsible, timely check-in. Who is this person. Show yourself.',
            'Plenty of time to spare. Almost suspiciously responsible. Are we being catfished?',
            'Danny woke up and chose accountability. Unprecedented. We\'re framing this one.',
            'The green light didn\'t even flicker. Boring. (Thank God. Boring is alive.)',
        ]);
    }

    // ── FRESH: 20-24 hours left ──
    if (wasOverdue) return pick([
        'From LITERALLY DEAD to checking in within MINUTES? The guilt hit DIFFERENT.',
        'Danny went from ghost to overeager in one cycle. Overcompensation level: maximum.',
        'Previously: MIA for hours. Now: hammering the button like it owes him money. Trauma.',
    ]);
    if (wasClutch) return pick([
        'Last time: buzzer beater. This time: first in line. Danny has been scared straight.',
        'Went from "made it by seconds" to "made it instantly." Therapy or paranoia? Either way, progress.',
        'The near-death experience cured whatever was wrong. Danny is EARLY. Write this down.',
    ]);
    return pick([
        'Speedrun check-in. Danny hammered that button like rent was due YESTERDAY.',
        'Checked in so fast the previous check-in was still warm. Overachiever energy.',
        'Eager. Almost too eager. Are we sure this isn\'t a bot wearing Danny\'s wallet?',
        'Immediate re-check-in. This man fears the MIA stamp and it SHOWS.',
        'Basically checked in before he even needed to. The protocol is impressed and confused.',
        'Full 24 hours on the clock. Danny woke up and chose violence against doubt.',
        'Danny hit the button so fast his wallet barely had time to load. Relax, king.',
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
