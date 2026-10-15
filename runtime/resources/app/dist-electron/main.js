"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_stream_1 = require("node:stream");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
// Named import, never a default one: electron-updater marks itself __esModule but exports
// no `default`, so `import electronUpdater from ...` compiles to an undefined binding and
// every autoUpdater access throws. `autoUpdater` itself is a lazy getter that builds the
// platform updater on first access, so it must stay untouched until the app is ready.
const electron_updater_1 = require("electron-updater");
const encoder_1 = require("./encoder");
const notify_1 = require("./notify");
const chat_engine_1 = require("./chat-engine");
const tiktok_live_connector_1 = require("tiktok-live-connector");
electron_1.protocol.registerSchemesAsPrivileged([
    {
        scheme: 'rerun-media',
        privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true },
    },
]);
let mainWindow = null;
const mediaTokens = new Map();
// Give up only after a long run of failures: a TikTok-side outage can last minutes.
const MAX_RESTART_ATTEMPTS = 12;
const RESTART_HEALTHY_AFTER_MS = 90000;
// See the watchdog in startFfmpeg: with -re a healthy stream sits just under 1.0x, so
// "falling behind" has to mean clearly below that band, sustained for 45s rather than 20.
// drawtext reload interval in frames for the clocks that still need a file. At 30fps this
// is 3 reads a second instead of 30 — Thai date and weekday text changes once a minute at
// the fastest, so nothing visible is lost.
const CLOCK_RELOAD_FRAMES = 10;
const LIVE_SPEED_FLOOR = 0.8;
const LIVE_SPEED_STREAK = 8;
// The speed watchdog above only ever runs when a `speed=` line arrives, so it cannot see
// the failure where FFmpeg stops printing altogether. That happens when TikTok's ingest
// stops draining the socket without closing it — common enough behind carrier NAT — and
// FFmpeg blocks in the socket write forever: alive, silent, publishing nothing. Viewers
// see a frozen frame while the app still says กำลังไลฟ์, because every existing check
// (connect watchdog cleared at first frame, speed streak, process exit) has nothing to
// fire on. Silence for this long while live is therefore its own failure signal.
// 20s is comfortably above the ~1/s progress cadence but well under the point where a
// seller notices the freeze themselves.
const LIVE_STALL_TIMEOUT_MS = 20000;
const LIVE_STALL_POLL_MS = 5000;
// TikTok ingest can occasionally take longer than a normal local RTMP server to accept a
// freshly-created Streamer Desktop room, especially from a remote server. Keep the start
// watchdog patient enough that we do not kill FFmpeg while TikTok is still opening the
// publish socket.
const RTMP_CONNECT_TIMEOUT_MS = 75000;
// Handed to FFmpeg as -rw_timeout (microseconds) on the RTMP output, so it abandons a
// write that cannot complete instead of blocking in it forever. Measured against a local
// RTMP sink stopped with SIGSTOP — the closest reproduction of an ingest that stops
// reading without closing:
//   no timeout  -> never exits; only LIVE_STALL_TIMEOUT_MS recovers it, at ~37s
//   5s          -> exits on its own at ~26s
//   10s         -> ~41s, worse than not setting it at all
// Most of that span is FFmpeg draining its buffers while still reporting a healthy
// ~0.997x, which no setting here can shorten. 5s survived a 75s soak of a full-spec
// 1080x1920 6000k stream where the longest gap between progress reports was 0.6s, so it
// has two orders of magnitude of headroom against normal jitter. A write that cannot
// land for 5 straight seconds at 6 Mbps is already ~30 Mbit behind — that live is broken
// whatever this value says, and the reconnect path resumes it without lowering the user's
// configured quality.
const RTMP_WRITE_TIMEOUT_US = 5_000_000;
// Kept for older diagnostic references only. Reconnect recovery must never silently lower
// the bitrate selected in the LIVE setup screen.
const NETWORK_BACKOFF_AFTER_DROPS = 3;
const MIN_BACKOFF_BITRATE_KBPS = 2000;
// `-progress pipe:2` writes its machine-readable key=value lines to the SAME stderr
// stream every real FFmpeg error/warning goes to, and it always ends a run with a final
// block whose last line is literally "progress=end" — even a connection that failed
// instantly still gets that closing marker. Every "quote the last line of stderr"
// diagnostic below was therefore picking that marker (or an unhelpful frame=/fps=/
// bitrate= line) instead of the real "Connection refused" / "Server error: 4xx" / TLS
// text FFmpeg had already printed a moment earlier — a customer whose stream key was
// rejected saw "(progress=end)" and nothing else. This strips progress lines first.
const PROGRESS_STDERR_LINE = /^(frame|fps|stream_\d+_\d+_q|bitrate|total_size|out_time_us|out_time_ms|out_time|dup_frames|drop_frames|speed|progress)=/;
const NOISY_FFMPEG_WARNING = /Unknown cover type/i;
const FFMPEG_METADATA_LINE = /^\s*(major_brand|minor_version|compatible_brands|creation_time|Hw|bitrate|maxrate|te_is_reencode|encoder|handler_name|vendor_id)\s*:/i;
const FFMPEG_CONTEXT_LINE = /^\s*(Metadata:|Input #|Output #|Stream #|Duration:|Stream mapping:|Press \[q\])/i;
function lastMeaningfulStderrLine(stderr) {
    const lines = stderr
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 &&
        !PROGRESS_STDERR_LINE.test(line) &&
        !NOISY_FFMPEG_WARNING.test(line) &&
        !FFMPEG_METADATA_LINE.test(line) &&
        !FFMPEG_CONTEXT_LINE.test(line));
    return lines.pop() || '';
}
function describeRtmpOutput(outputUrl) {
    try {
        const parsed = new URL(outputUrl);
        return `${parsed.protocol}//${parsed.host}`;
    }
    catch {
        return 'unknown';
    }
}
function effectiveStreamConfig(config) {
    // The setup screen is the source of truth. A previous TikTok-only server cap forced
    // 6,000 kbps down to 3,000 kbps, making the live quality contradict the user's setting.
    return config;
}
// One live per TikTok account can run concurrently, so every piece of per-stream
// state (ffmpeg process, clock file/timer, status, TikTok room) lives in its own
// session struct keyed by accountId instead of a single set of module globals.
const streamSessions = new Map();
const lastStreamConfigs = new Map();
const streamScheduleRuns = new Map();
const streamScheduleCycleState = new Map();
let streamScheduleTimer = null;
// Set once the encoder benchmark has run (first live of the app run). Until then the
// core-count estimate below is all we have.
let measuredStreamCapacity = null;
// Guardrail: cap simultaneous lives so one machine isn't oversubscribed.
//
// Three limits, whichever is tightest:
//  - cores: roughly one live per two CPUs. os.cpus() counts LOGICAL processors, so this
//    overcounts on Hyper-Threading — kept only as the estimate used before the first
//    benchmark exists, and superseded by the measured figure as soon as one does.
//  - measured: what this machine actually encoded during the startup benchmark. Immune to
//    the SMT overcount, and also reflects clock speed, thermals, and GPU availability.
//  - RAM: every concurrent live adds a hidden TikTok LIVE Manager window (a full Chromium
//    renderer, ~350MB) plus an ffmpeg process (~140MB measured). RAM runs out before the
//    CPU cap does on small machines, and nothing else guards it.
function hardwareConcurrentStreams() {
    const cores = node_os_1.default.cpus()?.length || 2;
    const coreCap = Math.max(1, Math.min(8, Math.floor(cores / 2)));
    // Keep 40% of RAM for the OS and whatever else the seller is running; ~800MB covers the
    // app's own window and main process, ~600MB covers each additional live.
    const usableBytes = node_os_1.default.totalmem() * 0.6 - 800 * 1024 * 1024;
    const ramCap = Math.max(1, Math.floor(usableBytes / (600 * 1024 * 1024)));
    return Math.max(1, Math.min(coreCap, ramCap, measuredStreamCapacity ?? coreCap));
}
// The package limit is per licensed username. The hardware limit above is the only
// shared cap; one customer's package must not consume another customer's channel.
function activeWebStreamOwner() {
    const status = typeof global.__npWebLicenseStatus === 'function' ? global.__npWebLicenseStatus() : null;
    const raw = String(status?.username || status?.displayName || '').trim();
    return raw ? normalizeAccountId(raw) : null;
}
function activePackageChannelLimit() {
    const status = typeof global.__npWebLicenseStatus === 'function' ? global.__npWebLicenseStatus() : null;
    if (status) {
        return Number.isFinite(status.channelLimit) ? Math.max(1, Math.floor(status.channelLimit)) : null;
    }
    if (Number.isFinite(global.__npActiveChannelLimit))
        return Math.max(1, Math.floor(global.__npActiveChannelLimit));
    return null;
}
// How many accounts currently hold a live pipeline (ffmpeg running or a TikTok room open).
// When an owner is supplied, only that username's scoped sessions are counted.
function activeStreamCount(owner = null) {
    const prefix = owner ? `${normalizeAccountId(owner)}__` : '';
    let count = 0;
    for (const session of streamSessions.values()) {
        const occupied = session.ffmpegProcess || session.room || session.retry?.timer || session.status?.state === 'starting' || session.status?.state === 'live' || session.status?.state === 'stopping';
        if ((!prefix || String(session.accountId).startsWith(prefix)) && occupied)
            count += 1;
    }
    return count;
}
function maxConcurrentStreams() {
    return hardwareConcurrentStreams();
}
function isStreamBusy(accountId) {
    const session = peekStreamSession(accountId);
    return Boolean(session?.ffmpegProcess || session?.room || session?.retry?.timer || session?.status?.state === 'live' || session?.status?.state === 'starting');
}
function streamScheduleDir() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'stream-schedule');
}
function streamSchedulePath(accountId) {
    return node_path_1.default.join(streamScheduleDir(), `${normalizeAccountId(accountId)}.json`);
}
function lastStreamConfigDir() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'stream-config');
}
function lastStreamConfigPath(accountId) {
    return node_path_1.default.join(lastStreamConfigDir(), `${normalizeAccountId(accountId)}.json`);
}
function streamRuntimeDir() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'stream-runtime');
}
function streamRuntimePath(accountId) {
    return node_path_1.default.join(streamRuntimeDir(), `${normalizeAccountId(accountId)}.json`);
}
function defaultStreamSchedule() {
    return {
        enabled: false,
        liveHours: 0,
        liveMinutes: 0,
        restMinutes: 0,
        videoQueueItems: [],
        videoQueuePaths: [],
    };
}
function sanitizeInt(value, fallback, min, max) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number))
        return fallback;
    return Math.min(max, Math.max(min, number));
}
function sanitizeOptionalInt(value, fallback, min, max) {
    if (value === '' || value === null || value === undefined)
        return 0;
    return sanitizeInt(value, fallback, min, max);
}
function sanitizeSchedule(value) {
    const input = value && typeof value === 'object' ? value : {};
    const defaults = defaultStreamSchedule();
    const rawItems = Array.isArray(input.videoQueueItems)
        ? input.videoQueueItems
        : [];
    const videoQueueItems = rawItems
        .filter((item) => item && typeof item === 'object' && typeof item.path === 'string' && item.path.length > 0)
        .map((item) => ({
        path: item.path,
        liveHours: sanitizeOptionalInt(item.liveHours, defaults.liveHours, 0, 23),
        liveMinutes: sanitizeOptionalInt(item.liveMinutes, defaults.liveMinutes, 0, 59),
        restMinutes: sanitizeOptionalInt(item.restMinutes, defaults.restMinutes, 0, 1440),
    }))
        .slice(0, 30);
    const videoQueuePaths = videoQueueItems.length
        ? videoQueueItems.map((item) => item.path)
        : Array.isArray(input.videoQueuePaths)
            ? input.videoQueuePaths.filter((item) => typeof item === 'string' && item.length > 0).slice(0, 30)
            : [];
    return {
        enabled: input.enabled === true,
        liveHours: sanitizeOptionalInt(input.liveHours, defaults.liveHours, 0, 23),
        liveMinutes: sanitizeOptionalInt(input.liveMinutes, defaults.liveMinutes, 0, 59),
        restMinutes: sanitizeOptionalInt(input.restMinutes, defaults.restMinutes, 0, 1440),
        videoQueueItems,
        videoQueuePaths,
    };
}
function readStreamSchedule(accountId) {
    try {
        const raw = JSON.parse((0, node_fs_1.readFileSync)(streamSchedulePath(accountId), 'utf8'));
        return sanitizeSchedule(raw);
    }
    catch {
        return defaultStreamSchedule();
    }
}
function saveStreamSchedule(accountId, value) {
    const schedule = sanitizeSchedule(value);
    (0, node_fs_1.mkdirSync)(streamScheduleDir(), { recursive: true });
    (0, node_fs_1.writeFileSync)(streamSchedulePath(accountId), JSON.stringify(schedule, null, 2), 'utf8');
    ensureStreamScheduler();
    return schedule;
}
function rememberStreamConfig(config) {
    const saved = validateConfig(config);
    lastStreamConfigs.set(saved.accountId, saved);
    try {
        (0, node_fs_1.mkdirSync)(lastStreamConfigDir(), { recursive: true });
        (0, node_fs_1.writeFileSync)(lastStreamConfigPath(saved.accountId), JSON.stringify(saved, null, 2), 'utf8');
    }
    catch {
        // A missed cache write should not block a live.
    }
    return saved;
}
function clearStreamConfig(accountId) {
    const id = normalizeAccountId(accountId);
    lastStreamConfigs.delete(id);
    try {
        (0, node_fs_1.unlinkSync)(lastStreamConfigPath(id));
    }
    catch {
        // Already gone, or not created yet.
    }
    try {
        const runtime = readStreamRuntime(id);
        if (runtime) {
            (0, node_fs_1.mkdirSync)(streamRuntimeDir(), { recursive: true });
            (0, node_fs_1.writeFileSync)(streamRuntimePath(id), JSON.stringify({
                ...runtime,
                config: null,
                updatedAt: Date.now(),
            }, null, 2), 'utf8');
        }
    }
    catch {
        // Clearing stale video state must not break the UI.
    }
    return { cleared: true, accountId: id };
}
function readLastStreamConfig(accountId) {
    const id = normalizeAccountId(accountId);
    const cached = lastStreamConfigs.get(id);
    if (cached)
        return cached;
    try {
        const config = validateConfig(JSON.parse((0, node_fs_1.readFileSync)(lastStreamConfigPath(id), 'utf8')));
        lastStreamConfigs.set(id, config);
        return config;
    }
    catch {
        return null;
    }
}
function listJsonAccountIds(dirPath) {
    try {
        return (0, node_fs_1.readdirSync)(dirPath)
            .filter((file) => file.endsWith('.json'))
            .map((file) => normalizeAccountId(file.replace(/\.json$/i, '')));
    }
    catch {
        return [];
    }
}
function readStreamRuntime(accountId) {
    const id = normalizeAccountId(accountId);
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(streamRuntimePath(id), 'utf8'));
        if (!parsed || typeof parsed !== 'object')
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function persistStreamRuntime(sessionState, status) {
    try {
        (0, node_fs_1.mkdirSync)(streamRuntimeDir(), { recursive: true });
        const config = readLastStreamConfig(sessionState.accountId);
        const payload = {
            accountId: sessionState.accountId,
            status,
            config,
            updatedAt: Date.now(),
        };
        (0, node_fs_1.writeFileSync)(streamRuntimePath(sessionState.accountId), JSON.stringify(payload, null, 2), 'utf8');
    }
    catch {
        // Runtime recovery is a safety net; a failed write must never interrupt a live.
    }
}
function knownStreamAccountIds() {
    return Array.from(new Set([
        ...listJsonAccountIds(lastStreamConfigDir()),
        ...listJsonAccountIds(streamRuntimeDir()),
        ...Array.from(streamSessions.keys()).map((id) => normalizeAccountId(id)),
    ]));
}
function storedStreamStatus(accountId) {
    const id = normalizeAccountId(accountId);
    const session = peekStreamSession(id);
    if (session)
        return session.status;
    const runtime = readStreamRuntime(id);
    const status = runtime?.status;
    if (status && ['starting', 'stopping'].includes(status.state)) {
        const recovered = idleStatus();
        persistStreamRuntime({ accountId: id }, recovered);
        return recovered;
    }
    if (status && status.state === 'live') {
        return {
            ...status,
            state: 'error',
            recoverable: true,
            previousState: status.state,
            updatedAt: runtime.updatedAt,
            message: 'Server ถูกรีสตาร์ตระหว่างไลฟ์ ข้อมูลงานยังอยู่ กรุณากดเริ่มไลฟ์อีกครั้งเพื่อส่งต่อ',
        };
    }
    if (status && status.state === 'error' && /\(Metadata:\)/i.test(String(status.message ?? ''))) {
        const recovered = idleStatus();
        persistStreamRuntime({ accountId: id }, recovered);
        return recovered;
    }
    return status ?? idleStatus();
}
function streamConfigSnapshot(accountId) {
    const id = normalizeAccountId(accountId);
    const runtime = readStreamRuntime(id);
    const config = readLastStreamConfig(id) ?? runtime?.config ?? null;
    if (!config)
        return null;
    const videoPaths = Array.isArray(config.videoPaths) ? config.videoPaths : [];
    return {
        accountId: id,
        config,
        status: storedStreamStatus(id),
        updatedAt: runtime?.updatedAt ?? 0,
        videos: videoPaths.map((filePath) => ({
            path: filePath,
            name: node_path_1.default.basename(filePath),
            mediaUrl: mediaUrl(filePath),
        })),
    };
}
function listScheduledAccountIds() {
    try {
        return (0, node_fs_1.readdirSync)(streamScheduleDir())
            .filter((file) => file.endsWith('.json'))
            .map((file) => normalizeAccountId(file.replace(/\.json$/i, '')));
    }
    catch {
        return [];
    }
}
function scheduledQueueItems(schedule, config) {
    if (Array.isArray(schedule?.videoQueueItems) && schedule.videoQueueItems.length)
        return schedule.videoQueueItems;
    const paths = Array.isArray(schedule?.videoQueuePaths) && schedule.videoQueuePaths.length
        ? schedule.videoQueuePaths
        : [];
    return paths.map((path) => ({
        path,
        liveHours: schedule.liveHours,
        liveMinutes: schedule.liveMinutes,
        restMinutes: schedule.restMinutes,
    }));
}
function currentScheduleItem(schedule, config, state) {
    const items = scheduledQueueItems(schedule, config);
    if (!items.length)
        return {
            path: '',
            liveHours: schedule.liveHours,
            liveMinutes: schedule.liveMinutes,
            restMinutes: schedule.restMinutes,
        };
    const index = Number.isInteger(state?.activeQueueIndex) ? state.activeQueueIndex : 0;
    return items[((index % items.length) + items.length) % items.length] || items[0];
}
function scheduleDurationMs(schedule, config, state) {
    const item = currentScheduleItem(schedule, config, state);
    const totalMinutes = item.liveHours * 60 + item.liveMinutes;
    return totalMinutes > 0 ? totalMinutes * 60 * 1000 : 0;
}
function scheduleRestMinutes(schedule, config, state) {
    return currentScheduleItem(schedule, config, state).restMinutes;
}
function rotateScheduledConfig(accountId, config, schedule) {
    const queue = scheduledQueueItems(schedule, config);
    if (!Array.isArray(queue) || queue.length <= 1)
        return config;
    const id = normalizeAccountId(accountId);
    const state = streamScheduleCycleState.get(id) ?? {};
    const index = Number.isInteger(state.nextVideoIndex) ? state.nextVideoIndex : 1;
    const start = ((index % queue.length) + queue.length) % queue.length;
    const ordered = [...queue.slice(start), ...queue.slice(0, start)];
    const videoPaths = ordered.map((item) => item.path);
    streamScheduleCycleState.set(id, { ...state, activeQueueIndex: start, nextVideoIndex: (start + 1) % queue.length });
    return { ...config, videoPaths };
}
async function runStreamScheduleTick() {
    const now = Date.now();
    for (const accountId of listScheduledAccountIds()) {
        const schedule = readStreamSchedule(accountId);
        const id = normalizeAccountId(accountId);
        const state = streamScheduleCycleState.get(id) ?? {};
        const session = peekStreamSession(id);
        const running = Boolean(session?.ffmpegProcess || session?.room || session?.retry?.timer);
        if (!schedule.enabled) {
            if (Object.keys(state).length)
                streamScheduleCycleState.delete(id);
            continue;
        }
        if (running) {
            const startedAt = Number(session?.status?.startedAt) || now;
            const config = readLastStreamConfig(id);
            const stopAfterMs = scheduleDurationMs(schedule, config, state);
            if (stopAfterMs <= 0)
                continue;
            if (!state.stopping && now - startedAt >= stopAfterMs) {
                const restMinutes = scheduleRestMinutes(schedule, config, state);
                const hasNextQueuedVideo = scheduledQueueItems(schedule, config).length > 1;
                const shouldRestart = restMinutes > 0 && hasNextQueuedVideo;
                const restartAt = shouldRestart ? now + restMinutes * 60 * 1000 : null;
                streamScheduleCycleState.set(id, { ...state, stopping: true, restartAt });
                stopFfmpeg(id).catch((error) => emitChatEvent(id, {
                    kind: 'system',
                    id: (0, node_crypto_1.randomUUID)(),
                    text: `ลงไลฟ์สดตามรอบไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
                    at: Date.now(),
                }));
                emitChatEvent(id, {
                    kind: 'system',
                    id: (0, node_crypto_1.randomUUID)(),
                    text: shouldRestart
                        ? `ครบเวลาตามรอบแล้ว ลงไลฟ์สดและจะรอ ${restMinutes} นาที ก่อนขึ้นไลฟ์สดใหม่`
                        : 'ครบเวลาตามรอบแล้ว ลงไลฟ์สดเรียบร้อย ไม่มีคิววิดีโอถัดไปหรือไม่ได้ตั้งเวลารอก่อนขึ้นใหม่',
                    at: Date.now(),
                });
            }
            continue;
        }
        if (state.stopping && (!state.restartAt || now < state.restartAt))
            continue;
        if (state.stopping && state.restartAt && now >= state.restartAt) {
            streamScheduleCycleState.set(id, { ...state, stopping: false, restartAt: null });
            const config = readLastStreamConfig(id);
            if (config) {
                startStream(rotateScheduledConfig(id, config, schedule)).catch((error) => emitChatEvent(id, {
                    kind: 'system',
                    id: (0, node_crypto_1.randomUUID)(),
                    text: `ขึ้นไลฟ์สดรอบใหม่ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
                    at: Date.now(),
                }));
            }
            else {
                emitChatEvent(id, {
                    kind: 'system',
                    id: (0, node_crypto_1.randomUUID)(),
                    text: 'ขึ้นไลฟ์สดรอบใหม่ไม่ได้: ยังไม่มีค่าช่อง/วิดีโอล่าสุด ให้กดเริ่มไลฟ์สดเองสักครั้งก่อน',
                    at: Date.now(),
                });
            }
        }
    }
}
function ensureStreamScheduler() {
    if (streamScheduleTimer)
        return;
    streamScheduleTimer = setInterval(() => void runStreamScheduleTick(), 20000);
    streamScheduleTimer.unref();
}
function idleStatus() {
    return { state: 'idle', message: 'พร้อมใช้งาน' };
}
function outputFpsForFrame(downscale) {
    if (!downscale)
        return 30;
    if (downscale.width <= 360)
        return 12;
    return 15;
}
function getStreamSession(accountId) {
    const id = normalizeAccountId(accountId);
    let sessionState = streamSessions.get(id);
    if (!sessionState) {
        sessionState = {
            accountId: id,
            ffmpegProcess: null,
            clockTimers: [],
            clockTextPaths: [],
            status: idleStatus(),
            room: null,
            liveTitle: '',
            degradeLevel: 0,
            tech: '',
            degradeRestartPending: false,
            stallReason: null,
            applySwitchTimer: null,
            applyRestartPending: false,
            stopGeneration: 0,
            retry: null,
        };
        streamSessions.set(id, sessionState);
    }
    return sessionState;
}
function peekStreamSession(accountId) {
    return streamSessions.get(normalizeAccountId(accountId)) ?? null;
}
function unpackedBinary(binaryPath) {
    if (!binaryPath)
        return null;
    return electron_1.app.isPackaged ? binaryPath.replace('app.asar', 'app.asar.unpacked') : binaryPath;
}
function ffmpegBinary() {
    const override = String(process.env.NP_FFMPEG_PATH || '').trim();
    if (override && (0, node_fs_1.existsSync)(override))
        return override;
    const bundledRuntimeFfmpeg = '/home/nynum/rerun_tiktok/bin/ffmpeg';
    if (process.platform === 'linux' && (0, node_fs_1.existsSync)(bundledRuntimeFfmpeg))
        return bundledRuntimeFfmpeg;
    return unpackedBinary(ffmpeg_static_1.default);
}
function mediaUrl(filePath) {
    const token = (0, node_crypto_1.randomUUID)();
    mediaTokens.set(token, filePath);
    return `/media/${token}`;
}
function mediaMimeType(filePath) {
    switch (node_path_1.default.extname(filePath).toLowerCase()) {
        case '.mp4':
        case '.m4v':
            return 'video/mp4';
        case '.mov':
            return 'video/quicktime';
        case '.mkv':
            return 'video/x-matroska';
        case '.webm':
            return 'video/webm';
        case '.png':
            return 'image/png';
        case '.webp':
            return 'image/webp';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        default:
            return 'application/octet-stream';
    }
}
function assertTrustedSender(event) {
    const senderUrl = event.senderFrame?.url ?? '';
    if (senderUrl.startsWith('file://') || senderUrl.startsWith('http://localhost:5173'))
        return;
    throw new Error('คำขอนี้ไม่ได้มาจากหน้าต่างหลักของแอป');
}
function updateStatus(sessionState, next) {
    const previous = sessionState.status;
    sessionState.status = next;
    persistStreamRuntime(sessionState, next);
    mainWindow?.webContents.send('stream:status-changed', { accountId: sessionState.accountId, status: next });
    notifyStatusTransition(sessionState, previous.state, next);
    recordHistoryTransition(sessionState, previous, next);
    if (next.state === 'live' && previous.state !== 'live') {
        setTimeout(() => {
            try {
                restartPinRotation(sessionState.accountId);
            }
            catch (error) {
                emitChatEvent(sessionState.accountId, {
                    kind: 'system',
                    id: (0, node_crypto_1.randomUUID)(),
                    text: `เริ่มปักสินค้าอัตโนมัติไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
                    at: Date.now(),
                });
            }
        }, 1500).unref?.();
    }
    else if ((next.state === 'idle' || next.state === 'error') && previous.state !== next.state) {
        stopPinRotation(sessionState.accountId);
    }
    return next;
}
// Fire a LINE push on meaningful stream-state transitions (only on the *edge*, so we don't
// spam on repeated same-state updates). Best-effort and non-blocking.
function notifyStatusTransition(sessionState, previous, next) {
    const config = getLineConfig();
    if (!config.enabled)
        return;
    const label = sessionState.liveTitle.trim() || sessionState.accountId;
    // retry.everLive is only true once this live has been on air before, and it is set
    // *after* the first live transition — so it exactly distinguishes an auto-reconnect
    // (stay quiet) from a genuinely new live (notify).
    const isReconnect = sessionState.retry?.everLive === true;
    if (next.state === 'live' && previous !== 'live' && !isReconnect && config.notifyOnLive) {
        void pushLine(config, `🟢 เริ่มไลฟ์แล้ว\nบัญชี: ${label}\nเวลา: ${nowText()}`);
    }
    else if (next.state === 'idle' && (previous === 'live' || previous === 'stopping') && config.notifyOnStop) {
        void pushLine(config, `⚪️ ไลฟ์จบแล้ว\nบัญชี: ${label}\nเวลา: ${nowText()}`);
    }
    else if (next.state === 'error' && previous !== 'error' && config.notifyOnError) {
        void pushLine(config, `🔴 ไลฟ์มีปัญหา\nบัญชี: ${label}\n${next.message}\nเวลา: ${nowText()}`);
    }
}
function nowText() {
    return new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}
function pushLine(config, text) {
    return (0, notify_1.sendLineMessage)(config, text).then(() => undefined);
}
function normalizeAccountId(value) {
    if (typeof value !== 'string')
        return 'main';
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 48);
    return normalized || 'main';
}
const chromeSessionScope = normalizeAccountId(process.env.NP_CHROME_SCOPE || process.env.NP_TENANT_ID || 'local');
function tikTokPartition(accountId) {
    return `persist:tiktok-${chromeSessionScope}-${normalizeAccountId(accountId)}`;
}
function tikTokAuthPath(accountId) {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'tiktok-auth', `${normalizeAccountId(accountId)}.json`);
}
function saveTikTokAuth(accountId, snapshot) {
    const filePath = tikTokAuthPath(accountId);
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true });
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600 });
}
function tikTokAuthRequestScore(requestUrl) {
    try {
        const url = new URL(requestUrl);
        const host = url.hostname.replace(/^www\./, '');
        if (!host.endsWith('tiktok.com') && !host.endsWith('tiktokv.com'))
            return 0;
        let score = 1;
        if (url.pathname.includes('/webcast/'))
            score += 20;
        if (url.pathname.includes('/passport/web/auth_broadcast/'))
            score += 15;
        if (url.searchParams.has('device_id'))
            score += 8;
        if (url.searchParams.has('aid'))
            score += 6;
        if (url.searchParams.has('msToken'))
            score += 6;
        if (url.searchParams.has('X-Bogus') || url.searchParams.has('X-Gnarly'))
            score += 6;
        if (!url.search)
            score -= 10;
        if (host.endsWith('tiktokshop.com'))
            score -= 20;
        return score;
    }
    catch {
        return 0;
    }
}
function isUsableTikTokAuthSnapshot(snapshot) {
    return Boolean(snapshot && tikTokAuthRequestScore(snapshot.requestUrl) >= 12);
}
function loadTikTokAuth(accountId) {
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(tikTokAuthPath(accountId), 'utf8'));
        if (parsed.version !== 1 || typeof parsed.requestUrl !== 'string' || typeof parsed.userAgent !== 'string')
            return null;
        return {
            version: 1,
            requestUrl: parsed.requestUrl,
            userAgent: parsed.userAgent,
            referer: typeof parsed.referer === 'string' ? parsed.referer : 'https://www.tiktok.com/',
            capturedAt: Number(parsed.capturedAt) || 0,
        };
    }
    catch {
        return null;
    }
}
function chatConfigPath(accountId) {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'chat-config', `${normalizeAccountId(accountId)}.json`);
}
const AI_PROVIDER_MODELS = {
    gemini: 'gemini-3-flash-preview',
    openai: 'gpt-6-astra',
    claude: 'claude-haiku-4-5',
};
function normalizeAiProvider(value) {
    return value === 'claude' ? 'claude' : value === 'openai' ? 'openai' : 'gemini';
}
function sanitizeAiKeys(value) {
    return Array.isArray(value)
        ? value
            .filter((key) => typeof key === 'string')
            .map((key) => key.trim().slice(0, 200))
            .filter(Boolean)
            .slice(0, 20)
        : [];
}
function aiKeyMatchesProvider(provider, key) {
    if (!key)
        return false;
    if (provider === 'gemini')
        return /^AIza[A-Za-z0-9_-]{10,}/.test(key);
    if (provider === 'claude')
        return /^sk-ant-[A-Za-z0-9_-]{10,}/.test(key);
    return /^sk-(?!ant-)[A-Za-z0-9_-]{10,}/.test(key);
}
function sanitizeProviderAiConfig(provider, value) {
    const input = value && typeof value === 'object' ? value : {};
    const rawApiKey = typeof input.apiKey === 'string' ? input.apiKey.trim().slice(0, 4000) : '';
    const rawKeys = sanitizeAiKeys(input.apiKeys);
    const candidateKeys = rawKeys.length ? rawKeys : rawApiKey
        .split(/[\r\n,]+/)
        .map((key) => key.trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 20);
    const apiKeys = candidateKeys.filter((key) => aiKeyMatchesProvider(provider, key));
    const apiKey = apiKeys.join('\n');
    const defaultModel = AI_PROVIDER_MODELS[provider] ?? AI_PROVIDER_MODELS.gemini;
    const rawModel = typeof input.model === 'string' ? input.model.trim() : '';
    return {
        apiKey,
        apiKeys,
        model: rawModel && !['gemini-2.0-flash', 'gemini-flash-latest'].includes(rawModel)
            ? rawModel.slice(0, 80)
            : defaultModel,
    };
}
function buildAiProviderConfigs(ai, previousAi, provider, rawSignApiKey) {
    const defaults = (0, chat_engine_1.defaultChatConfig)().ai.providerConfigs ?? {};
    const sourceConfigs = ai.providerConfigs && typeof ai.providerConfigs === 'object' ? ai.providerConfigs : {};
    const previousConfigs = previousAi?.providerConfigs && typeof previousAi.providerConfigs === 'object' ? previousAi.providerConfigs : {};
    const providerConfigs = {};
    for (const key of ['gemini', 'openai', 'claude']) {
        providerConfigs[key] = sanitizeProviderAiConfig(key, {
            ...(defaults[key] ?? {}),
            ...(previousConfigs[key] ?? {}),
            ...(sourceConfigs[key] ?? {}),
        });
    }
    const legacyPatch = {};
    if (typeof ai.apiKey === 'string')
        legacyPatch.apiKey = ai.apiKey;
    if (Array.isArray(ai.apiKeys))
        legacyPatch.apiKeys = ai.apiKeys;
    if (typeof ai.model === 'string')
        legacyPatch.model = ai.model;
    const signKeyLooksLikeOpenAi = /^sk-(proj-|)[A-Za-z0-9_-]{20,}/.test(rawSignApiKey);
    if (signKeyLooksLikeOpenAi && !legacyPatch.apiKey && provider === 'openai')
        legacyPatch.apiKey = rawSignApiKey;
    if (Object.keys(legacyPatch).length) {
        providerConfigs[provider] = sanitizeProviderAiConfig(provider, {
            ...providerConfigs[provider],
            ...legacyPatch,
        });
    }
    return providerConfigs;
}
function sanitizeChatConfig(value, previousConfig) {
    const base = (0, chat_engine_1.defaultChatConfig)();
    if (!value || typeof value !== 'object')
        return base;
    const input = value;
    const rules = Array.isArray(input.rules)
        ? input.rules
            .filter((item) => Boolean(item && typeof item === 'object'))
            .map((item) => ({
            id: typeof item.id === 'string' && item.id ? item.id : (0, node_crypto_1.randomUUID)(),
            keyword: typeof item.keyword === 'string' ? item.keyword.slice(0, 120) : '',
            reply: typeof item.reply === 'string' ? item.reply.slice(0, 500) : '',
            enabled: item.enabled !== false,
        }))
            .slice(0, 100)
        : base.rules;
    const ai = input.ai && typeof input.ai === 'object' ? input.ai : {};
    const rawSignApiKey = typeof input.signApiKey === 'string' ? input.signApiKey.trim().slice(0, 200) : '';
    const signKeyLooksLikeOpenAi = /^sk-(proj-|)[A-Za-z0-9_-]{20,}/.test(rawSignApiKey);
    const provider = normalizeAiProvider(ai.provider);
    const providerConfigs = buildAiProviderConfigs(ai, previousConfig?.ai, provider, rawSignApiKey);
    const activeAi = providerConfigs[provider] ?? providerConfigs.gemini;
    return {
        enabled: input.enabled === true,
        rules,
        ai: {
            enabled: ai.enabled === true,
            provider,
            // Backward compatible: the old UI stores one string, but sellers can paste
            // several keys separated by new lines/commas until the UI grows a proper list.
            apiKey: activeAi.apiKey,
            // A common setup mistake is pasting an OpenAI sk-* key into the Euler sign box.
            // Treat it as an AI key instead of sending it to Euler and breaking chat reads
            // with a hard 401.
            apiKeys: activeAi.apiKeys,
            providerConfigs,
            // gemini-2.0-flash was our shipped default until Google retired it (404 on every
            // call). Configs still carrying it are silently moved to the tracking alias; a model
            // the seller typed themselves is left alone.
            // Both earlier shipped defaults get migrated: gemini-2.0-flash was retired by
            // Google, and gemini-flash-latest routes to a pool that hit sustained "high demand".
            // A model the seller typed themselves is left alone.
            model: activeAi.model,
            // 24k, up from 4k: a seller pasted a ~10k-char shop FAQ and the old cap silently
            // ate more than half of it mid-sentence — the model then answered as if those
            // questions had never been covered. Gemini Flash takes this size without blinking.
            context: typeof ai.context === 'string' ? ai.context.slice(0, 24000) : '',
            useProducts: ai.useProducts !== false,
        },
        replyCooldownMs: Math.min(60000, Math.max(0, Number(input.replyCooldownMs) || base.replyCooldownMs)),
        // 30000 was the shipped default, never a choice anyone made — it gets migrated to the
        // new default along with everything unset. A value the seller actually set survives.
        perUserCooldownMs: Number(input.perUserCooldownMs) === 30000
            ? base.perUserCooldownMs
            : Math.min(600000, Math.max(0, Number(input.perUserCooldownMs) || base.perUserCooldownMs)),
        signApiKey: signKeyLooksLikeOpenAi ? '' : rawSignApiKey,
        hostUsername: typeof input.hostUsername === 'string' ? input.hostUsername.trim().replace(/^@/, '').slice(0, 80) : '',
    };
}
// Chat settings are per-account (each shop account has its own keyword rules and
// BYOK AI key), lazily loaded from disk and cached here.
const chatConfigs = new Map();
function getChatConfig(accountId) {
    const id = normalizeAccountId(accountId);
    let config = chatConfigs.get(id);
    if (!config) {
        try {
            config = sanitizeChatConfig(JSON.parse((0, node_fs_1.readFileSync)(chatConfigPath(id), 'utf8')));
        }
        catch {
            config = (0, chat_engine_1.defaultChatConfig)();
        }
        chatConfigs.set(id, config);
    }
    return config;
}
function saveChatConfig(accountId, value) {
    const id = normalizeAccountId(accountId);
    const previousConfig = getChatConfig(id);
    let nextValue = value;
    if (value && typeof value === 'object') {
        const input = value;
        const ai = input.ai && typeof input.ai === 'object' ? input.ai : null;
        const nextProvider = ai ? normalizeAiProvider(ai.provider) : previousConfig.ai.provider;
        const hasProviderConfigs = Boolean(ai?.providerConfigs && typeof ai.providerConfigs === 'object');
        const switchedProvider = nextProvider !== previousConfig.ai.provider;
        if (ai && switchedProvider && !hasProviderConfigs) {
            const { apiKey: _apiKey, apiKeys: _apiKeys, model: _model, ...aiWithoutLegacyKeys } = ai;
            nextValue = {
                ...input,
                ai: {
                    ...aiWithoutLegacyKeys,
                    provider: nextProvider,
                    providerConfigs: previousConfig.ai.providerConfigs,
                },
            };
        }
    }
    const config = sanitizeChatConfig(nextValue, previousConfig);
    chatConfigs.set(id, config);
    const filePath = chatConfigPath(id);
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true });
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
    // Apply changes to an active live immediately. If the chat connector died earlier
    // (for example from a bad Euler key), updateChatConfig has nothing to update, so start
    // a fresh connector with the new settings.
    const sessionState = peekStreamSession(id);
    if (sessionState?.status.state === 'live' || sessionState?.status.state === 'starting') {
        cancelChatRetry(id);
        if (config.enabled) {
            void (async () => {
                await (0, chat_engine_1.stopChatEngine)(id);
                await startRoomChat(id, sessionState.room?.roomId ?? null);
            })();
        }
        else {
            void (0, chat_engine_1.stopChatEngine)(id);
        }
    }
    else {
        if (!config.enabled) {
            void (0, chat_engine_1.stopChatEngine)(id);
            stopWebcastChatPoller(id);
            stopDomChatPoller(id);
        }
        else if ((0, chat_engine_1.isChatEngineRunning)(id)) {
            (0, chat_engine_1.updateChatConfig)(id, config);
        }
        else {
            void (async () => {
                try {
                    await warmChatSenderWindow(id);
                    await (0, chat_engine_1.startDomChatEngine)({
                        accountId: id,
                        config,
                        emit: (event) => emitChatEvent(id, event),
                        send: async (text) => {
                            try {
                                await sendChatViaApi(id, null, text);
                            }
                            catch {
                                await sendChatViaWindow(id, text);
                            }
                        },
                    });
                    startWebcastChatPoller(id, null);
                    startDomChatPoller(id);
                    void refreshChatProducts(id);
                }
                catch (error) {
                    emitChatEvent(id, {
                        kind: 'system',
                        id: (0, node_crypto_1.randomUUID)(),
                        text: `เปิดระบบตอบแชทจากหน้า LIVE Manager ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
                        at: Date.now(),
                    });
                }
            })();
        }
    }
    if (config.enabled && config.ai.enabled && config.ai.useProducts)
        void refreshChatProducts(id);
    return config;
}
function emitChatEvent(accountId, event) {
    mainWindow?.webContents.send('chat:event', { accountId: normalizeAccountId(accountId), event });
}
const liveChatEventSeen = new Map();
function emitLiveChatComment(accountId, comment) {
    const id = normalizeAccountId(accountId);
    const text = String(comment?.text ?? '').trim();
    if (!text)
        return;
    const user = String(comment?.user || 'ผู้ชม');
    const key = String(comment?.key || `${comment?.userId || user}|${text}`);
    const now = Date.now();
    const seen = liveChatEventSeen.get(id) ?? new Map();
    liveChatEventSeen.set(id, seen);
    const lastSeen = seen.get(key) ?? 0;
    if (now - lastSeen < 30000)
        return;
    seen.set(key, now);
    for (const [oldKey, oldAt] of seen) {
        if (seen.size <= 500 && now - oldAt <= 120000)
            break;
        seen.delete(oldKey);
    }
    const event = { kind: 'incoming', id: (0, node_crypto_1.randomUUID)(), user, text, at: now };
    if (comment?.source)
        event.source = String(comment.source);
    if (comment?.type)
        event.type = String(comment.type);
    emitChatEvent(id, event);
}
// LINE notification config is workspace-level (one setting for the whole app), not per
// account, so it lives in a single file and a single cached value.
let lineConfigCache = null;
function lineConfigPath() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'line-config.json');
}
function getLineConfig() {
    if (!lineConfigCache) {
        try {
            lineConfigCache = (0, notify_1.sanitizeLineConfig)(JSON.parse((0, node_fs_1.readFileSync)(lineConfigPath(), 'utf8')));
        }
        catch {
            lineConfigCache = (0, notify_1.defaultLineConfig)();
        }
    }
    return lineConfigCache;
}
function saveLineConfig(value) {
    const config = (0, notify_1.sanitizeLineConfig)(value);
    lineConfigCache = config;
    const filePath = lineConfigPath();
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true });
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
    return config;
}
const HISTORY_LIMIT = 200;
let historyCache = null;
function historyPath() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'live-history.json');
}
function getHistory() {
    if (!historyCache) {
        try {
            const parsed = JSON.parse((0, node_fs_1.readFileSync)(historyPath(), 'utf8'));
            historyCache = Array.isArray(parsed) ? parsed : [];
        }
        catch {
            historyCache = [];
        }
    }
    return historyCache;
}
function writeHistory(entries) {
    historyCache = entries.slice(-HISTORY_LIMIT);
    const filePath = historyPath();
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true });
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(historyCache), { encoding: 'utf8', mode: 0o600 });
}
function historyLegacyOwnerPath() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'live-history-owner.json');
}
function isOwnerScopedAccountId(accountId) {
    return /^[a-z0-9_-]+__.+$/i.test(String(accountId || ''));
}
function ownerScopedAccountId(owner, accountId) {
    const normalizedOwner = normalizeAccountId(owner);
    const id = normalizeAccountId(accountId);
    if (!normalizedOwner || normalizedOwner === 'main')
        return id;
    const prefix = `${normalizedOwner}__`;
    return id.startsWith(prefix) ? id : `${prefix}${id}`;
}
function adoptLegacyHistoryForOwner(owner) {
    const normalizedOwner = normalizeAccountId(owner);
    if (!normalizedOwner || normalizedOwner === 'main')
        return;
    const markerPath = historyLegacyOwnerPath();
    let marker = null;
    try {
        marker = JSON.parse((0, node_fs_1.readFileSync)(markerPath, 'utf8'));
    }
    catch { }
    if (marker?.owner)
        return;
    const history = getHistory();
    let changed = false;
    const next = history.map((item) => {
        if (isOwnerScopedAccountId(item.accountId))
            return item;
        changed = true;
        return {
            ...item,
            accountId: ownerScopedAccountId(normalizedOwner, item.accountId || 'main'),
            legacyAccountId: item.accountId || 'main',
        };
    });
    if (changed)
        writeHistory(next);
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(markerPath), { recursive: true });
    (0, node_fs_1.writeFileSync)(markerPath, JSON.stringify({ owner: normalizedOwner, adoptedAt: new Date().toISOString() }, null, 2), { encoding: 'utf8', mode: 0o600 });
}
// Append a history entry when a live run ends (naturally/stopped) or errors out. Only
// records sessions that actually reached air, or a starting session that errored.
function recordHistoryTransition(sessionState, previous, next) {
    const wasLive = previous.state === 'live' || previous.state === 'stopping';
    const endedNow = next.state === 'idle' && wasLive;
    const erroredNow = next.state === 'error' && previous.state !== 'error';
    if (!endedNow && !erroredNow)
        return;
    if (erroredNow && previous.state !== 'live' && previous.state !== 'starting' && previous.state !== 'stopping')
        return;
    const endedAt = Date.now();
    const startedAt = previous.startedAt ?? endedAt;
    const entry = {
        id: (0, node_crypto_1.randomUUID)(),
        accountId: sessionState.accountId,
        title: sessionState.liveTitle.trim() || sessionState.accountId,
        startedAt,
        endedAt,
        durationSec: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
        reason: erroredNow ? 'error' : 'ended',
        message: next.message,
        ...(sessionState.tech ? { tech: sessionState.tech } : {}),
    };
    writeHistory([...getHistory(), entry]);
    mainWindow?.webContents.send('history:changed');
    // Then try to attach TikTok's figures. Deliberately after the write: the history entry is
    // the record that a live happened, and it must not depend on the console still being
    // reachable. If the read works, patch the entry in place and tell the dashboard.
    void (async () => {
        try {
            const stats = (await runInLiveConsole(sessionState.accountId, liveStatsScript()));
            if (stats?.gmv === null && stats?.itemsSold === null)
                return;
            const history = getHistory();
            const index = history.findIndex((item) => item.id === entry.id);
            if (index === -1)
                return;
            history[index] = {
                ...history[index],
                ...(typeof stats.gmv === 'number' ? { gmv: stats.gmv } : {}),
                ...(typeof stats.itemsSold === 'number' ? { itemsSold: stats.itemsSold } : {}),
            };
            writeHistory(history);
            mainWindow?.webContents.send('history:changed');
        }
        catch {
            // The console may already be gone; the live itself is still recorded.
        }
    })();
}
function defaultPinConfig() {
    return { enabled: false, intervalMinutes: 5, includeCoupon: false, products: [] };
}
function pinConfigPath(accountId) {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'pin-config', `${normalizeAccountId(accountId)}.json`);
}
function pinAiProductsPath(accountId) {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'pin-ai-products', `${normalizeAccountId(accountId)}.json`);
}
const MAX_PIN_PRODUCTS = 250;
function latestProductBatchOnly(products) {
    return products;
}
function sanitizePinConfig(value) {
    const base = defaultPinConfig();
    if (!value || typeof value !== 'object')
        return base;
    const input = value;
    const products = Array.isArray(input.products)
        ? input.products
            .filter((item) => Boolean(item && typeof item === 'object'))
            .map((item) => ({
            id: typeof item.id === 'string' && item.id ? item.id : (0, node_crypto_1.randomUUID)(),
            name: typeof item.name === 'string' ? item.name.slice(0, 200) : '',
            enabled: item.enabled !== false,
            // https only, and stored as a plain URL — the thumbnail is fetched by the
            // renderer when it paints the row, so anything else here would be a way to
            // point the app at a local file or a script URL.
            ...(typeof item.image === 'string' && /^https:\/\//.test(item.image)
                ? { image: item.image.slice(0, 500) }
                : {}),
        }))
            .filter((item) => item.name)
            // Reject container blobs left behind by the extraction bug above. Do not cap by
            // length here: real TikTok product names are often long and must stay in the latest
            // fetched batch.
            .filter((item) => !/Product list in this LIVE|All categories|All stock/i.test(item.name))
            .slice(0, MAX_PIN_PRODUCTS)
        : base.products;
    const currentProducts = latestProductBatchOnly(products);
    const uniqueProducts = currentProducts.map((product, index) => ({
        ...product,
        id: `${String(product.id || 'pin').replace(/-\d+$/, '')}-${index + 1}`,
    }));
    const aiProducts = Array.isArray(input.aiProducts)
        ? input.aiProducts
            .map((item, index) => ({
            cart: Number(item?.cart) || index + 1,
            text: String(item?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
        }))
            .filter((item) => item.text)
            .slice(0, MAX_PIN_PRODUCTS)
        : [];
    return {
        enabled: input.enabled === true,
        // One minute is the floor: TikTok needs a moment to settle after a pin, and a faster
        // cycle would spend the live re-pinning rather than selling.
        intervalMinutes: Math.min(120, Math.max(1, Math.round(Number(input.intervalMinutes) || base.intervalMinutes))),
        includeCoupon: input.includeCoupon === true,
        products: uniqueProducts,
        ...(aiProducts.length ? { aiProducts } : {}),
    };
}
const pinConfigs = new Map();
function getPinConfig(accountId) {
    const id = normalizeAccountId(accountId);
    let config = pinConfigs.get(id);
    if (!config) {
        try {
            config = sanitizePinConfig(JSON.parse((0, node_fs_1.readFileSync)(pinConfigPath(id), 'utf8')));
        }
        catch {
            config = defaultPinConfig();
        }
        pinConfigs.set(id, config);
    }
    return config;
}
function readPinAiProducts(accountId) {
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(pinAiProductsPath(accountId), 'utf8'));
        return Array.isArray(parsed)
            ? parsed
                .map((item, index) => ({
                cart: Number(item?.cart) || index + 1,
                text: String(item?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
            }))
                .filter((item) => item.text)
                .slice(0, MAX_PIN_PRODUCTS)
            : [];
    }
    catch {
        return [];
    }
}
function writePinAiProducts(accountId, items) {
    const clean = (Array.isArray(items) ? items : [])
        .map((item, index) => ({
        cart: Number(item?.cart) || index + 1,
        text: String(item?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
    }))
        .filter((item) => item.text)
        .slice(0, MAX_PIN_PRODUCTS);
    const filePath = pinAiProductsPath(accountId);
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true });
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(clean), { encoding: 'utf8', mode: 0o600 });
    return clean;
}
function getPinConfigForClient(accountId) {
    const id = normalizeAccountId(accountId);
    const config = getPinConfig(id);
    const savedAiProducts = readPinAiProducts(id);
    if (savedAiProducts.length === normalizePinProducts(config.products).length)
        return { ...config, aiProducts: savedAiProducts };
    const fallbackAiProducts = normalizePinProducts(config.products)
        .map((product, index) => ({
        cart: index + 1,
        text: summarizeProductOptionsForPanel(`ตัวเลือกที่มี: ${product.name}`, index + 1),
    }))
        .filter((item) => !/ยังไม่พบตัวเลือก/.test(item.text));
    if (fallbackAiProducts.length)
        writePinAiProducts(id, fallbackAiProducts);
    return { ...config, aiProducts: fallbackAiProducts };
}
function savePinConfig(accountId, value) {
    const id = normalizeAccountId(accountId);
    const config = sanitizePinConfig(value);
    pinConfigs.set(id, config);
    const filePath = pinConfigPath(id);
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true });
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
    // Apply immediately to a live that is already running, the way chat settings do.
    restartPinRotation(id);
    return config;
}
function normalizePinProducts(products) {
    return Array.isArray(products)
        ? products
            .filter((product) => product?.name)
            .map((product, index) => ({
            id: `${String(product.id || `live-${Date.now()}`).replace(/-\d+$/, '')}-${index + 1}`,
            name: String(product.name).replace(/\s+/g, ' ').trim().slice(0, 200),
            enabled: product.enabled !== false,
            ...(typeof product.image === 'string' && /^https:\/\//.test(product.image) ? { image: product.image.slice(0, 500) } : {}),
        }))
            .filter((product) => product.name)
            .slice(0, MAX_PIN_PRODUCTS)
        : [];
}
function saveDiscoveredPinProducts(accountId, products, note = true) {
    const id = normalizeAccountId(accountId);
    const discovered = normalizePinProducts(products);
    const current = getPinConfig(id);
    const nextConfig = sanitizePinConfig({ ...current, products: discovered });
    pinConfigs.set(id, nextConfig);
    const filePath = pinConfigPath(id);
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true });
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(nextConfig), { encoding: 'utf8', mode: 0o600 });
    pinCursors.set(id, 0);
    if (note) {
        const text = discovered.length
            ? `รีเซตรายการปักหมุดจากไลฟ์ปัจจุบัน ${discovered.length} รายการแล้ว เริ่มวนจากตะกร้า 1`
            : 'รีเซตรายการปักหมุดแล้ว แต่ยังไม่พบสินค้าในไลฟ์ปัจจุบัน';
        emitChatEvent(id, { kind: 'system', id: (0, node_crypto_1.randomUUID)(), text, at: Date.now() });
    }
    restartPinRotation(id);
    return nextConfig;
}
function cachedPinProductsResult(accountId, reason = 'cache') {
    const id = normalizeAccountId(accountId);
    const products = normalizePinProducts(getPinConfig(id).products).map((product, index) => ({
        id: product.id,
        name: product.name,
        cartIndex: index + 1,
        text: `ตะกร้า ${index + 1} | ${product.name}`,
        image: product.image || '',
        pinned: false,
    }));
    return {
        ok: products.length > 0,
        source: 'cache',
        stableFallback: true,
        reason,
        url: LIVE_MANAGER_URL,
        title: products.length ? 'ใช้รายการสินค้าล่าสุดที่บันทึกไว้' : 'ยังไม่มีรายการสินค้าสำรอง',
        products,
    };
}
// Read the product list out of the LIVE console. Separate from the diagnostic scan because
// this one has to be stable enough to drive a feature: name, price and stock only.
function liveProductsScript() {
    return `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const cap = (s, n) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, n)
    const seen = (el) => {
      if (!el.getClientRects || el.getClientRects().length === 0) return false
      const style = window.getComputedStyle(el)
      return style.visibility !== 'hidden' && style.display !== 'none'
    }
    const dismissBlockingDialogs = async () => {
      const ok = /^(ดำเนินการต่อ|จัดการภายหลัง|ต่อไป|ตกลง|continue|got it|ok)$/i
      for (let i = 0; i < 3; i += 1) {
        const button = [...document.querySelectorAll('button, [role="button"]')]
          .find((el) => seen(el) && ok.test(cap(el.textContent, 40)))
        if (!button) break
        button.click()
        await sleep(350)
      }
    }
    await dismissBlockingDialogs()
    // Exact label, not a substring. "\\bpin\\b" also matched stray prose, and it MISSED
    // "Unpin" — so a product that was already pinned vanished from the list entirely.
    const pinLabel = (el) => cap([
      el.textContent,
      el.getAttribute && el.getAttribute('aria-label'),
      el.getAttribute && el.getAttribute('title'),
    ].filter(Boolean).join(' '), 80)
    const isPin = (el) => /(^|[^a-z])(pin|unpin)([^a-z]|$)|ปัก|เลิกปัก/i.test(pinLabel(el))
    // Walk UP from the Pin button to its product card. Scanning every div for one that
    // holds both the stock line and a single Pin picked the innermost wrapper — which has
    // "In stock: 18.9K … Pin" but not the product name, so every card came back nameless
    // and nothing could be matched later. The card is the first ancestor that carries a
    // price AND the stock line: that pair only appears once the name is inside too.
    const cardFor = (button) => {
      let node = button.parentElement
      for (let i = 0; node && node !== document.body && i < 8; i += 1) {
        const t = cap(node.textContent, 400)
        // Price and stock line are necessary but nowhere near sufficient: the container
        // holding the whole product column has both, and walking up to it produced a
        // "product" named "AllAll categoriesAll stockProduct list in this LIVE+11Pin…"
        // whose Pin button was the PIN-WHOLE-LIST control. Rotating onto that name pinned
        // the entire list on a real broadcast. A product card contains exactly one Pin.
        const owned = [...node.querySelectorAll('button, [role="button"]')].filter(isPin).length
        if (owned > 1) return null
        const generic = /all products|product list|สินค้าทั้งหมด|รายการสินค้า|categories|หมวดหมู่/i.test(t)
        const productish = /[฿$]|THB|In stock|คงเหลือ|Requested demo|เพิ่มลงตะกร้า|Add to cart|สินค้า/i.test(t)
        if (owned === 1 && !generic && productish && t.length >= 20 && t.length <= 800) {
          return node
        }
        node = node.parentElement
      }
      return null
    }
    const cards = []
    const usedCards = []
    const seenNames = []
    // Counters, so an empty result can say WHY. The first version returned an empty list
    // and nothing else, which on a real broadcast meant the button appeared to do nothing
    // and left no way to tell a wrong page from a changed layout from a naming miss.
    const why = { pinButtons: 0, noCard: 0, duplicate: 0, noName: 0, passes: 0 }

    // The element that scrolls the product column, found via a real product card.
    const scroller = () => {
      const anchor = [...document.querySelectorAll('button, [role="button"]')]
        .filter((el) => seen(el) && isPin(el))
        .map(cardFor)
        .filter(Boolean)[0]
      let node = anchor
      for (let i = 0; node && i < 8; i += 1) {
        if (node.scrollHeight > node.clientHeight + 40) return node
        node = node.parentElement
      }
      return null
    }

    const collect = () => {
    for (const button of [...document.querySelectorAll('button, [role="button"]')]) {
      if (!seen(button) || !isPin(button)) continue
      why.pinButtons += 1
      const card = cardFor(button)
      // No card means this Pin belongs to something else — the "Product list in this LIVE"
      // control, or a coupon — and is not a product row.
      if (!card) {
        why.noCard += 1
        continue
      }
      if (usedCards.indexOf(card) !== -1) {
        why.duplicate += 1
        continue
      }
      usedCards.push(card)
      const text = cap(card.textContent, 400)
      const heading = [...card.querySelectorAll('h1,h2,h3,h4,[class*="title" i],[class*="name" i]')]
        .map((el) => cap(el.textContent, 180))
        .find((value) => value && !/all products|product list|สินค้าทั้งหมด|รายการสินค้า|pin|unpin/i.test(value))
      const name = heading || cap(text
        .split(/LIVE only|LIVE Specials|Hot deals|฿|\$|THB/i)[0]
        .replace(/(In stock|คงเหลือ|Requested demo|Add to cart|เพิ่มลงตะกร้า).*$/i, ''), 160)
      if (!name) {
        why.noName += 1
        continue
      }
      // The card's own thumbnail. srcset first — TikTok serves a sharper variant there —
      // then src. Anything that is not an https URL is dropped rather than passed on.
      let image = ''
      const img = card.querySelector('img')
      if (img) {
        const srcset = (img.getAttribute('srcset') || '').split(',')[0].trim().split(' ')[0]
        const candidate = srcset || img.getAttribute('src') || img.src || ''
        // Plain prefix test, not a regex: this string is emitted into a template literal,
        // which eats the backslashes in /^https:\\/\\// and leaves /^https:/// — a regex
        // that closes early and turns the rest of the line into a comment, breaking the
        // whole script with a SyntaxError the page never reports back.
        if (candidate.indexOf('https://') === 0) image = candidate
      }
      let url = ''
      const link = card.querySelector('a[href*="/product/"], a[href*="/pdp/"], a[href*="product_id="]')
      if (link) {
        try {
          const href = link.getAttribute('href') || link.href || ''
          const absolute = new URL(href, location.origin).toString()
          if (absolute.indexOf('https://shop.tiktok.com/') === 0) url = absolute
        } catch {}
      }
      if (seenNames.indexOf(name) !== -1) {
        why.duplicate += 1
        continue
      }
      seenNames.push(name)
      cards.push({ name, text, image, url, pinned: /unpin|เลิกปัก/i.test(cap(button.textContent, 40)) })
      if (cards.length >= ${MAX_PIN_PRODUCTS}) break
    }
    }

    // The console keeps only the visible slice of a long product list in the DOM, so a
    // single pass sees whatever happens to be on screen — a seller with 6 products got 5,
    // with 5 got 4, and with 15 got 4. Scroll the column and collect again until nothing
    // new turns up, the same way pinning already scrolls to reach its target.
    // TikTok often paints the product column after did-stop-loading. Give React a short
    // settling window before declaring an empty list, otherwise the first click looks like
    // a successful read but returns nothing while the seller can already see the products.
    for (let attempt = 0; attempt < 10 && cards.length === 0; attempt += 1) {
      collect()
      if (cards.length) break
      await sleep(250)
    }
    const box = scroller()
    if (box) {
      const previousTop = box.scrollTop
      box.scrollTop = 0
      await sleep(150)
      collect()
      for (let step = 0; step < 90 && cards.length < ${MAX_PIN_PRODUCTS}; step += 1) {
        const before = cards.length
        const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 4
        box.scrollTop = Math.min(box.scrollHeight, box.scrollTop + box.clientHeight * 0.75)
        await sleep(150)
        why.passes += 1
        collect()
        if (atBottom && cards.length === before) break
      }
      // Put the seller's own scroll position back; this is a read, and it should not leave
      // their product list somewhere they did not put it.
      box.scrollTop = previousTop
    }

    return {
      ok: true,
      url: location.href,
      title: cap(document.title, 120),
      // A console that has not finished rendering its product column looks identical to a
      // console on the wrong page unless we say how much of the page we could see.
      buttons: document.querySelectorAll('button, [role="button"]').length,
      why,
      products: cards,
    }
  })()`;
}
// Click the Pin button on the card whose name matches. The console virtualises its product
// list, so the target may not be mounted: scroll the scroller that holds the cards and look
// again before giving up. Clicks exactly one button, chosen by the card it belongs to —
// never "the last button on screen", which is how the chat composer once nearly hit Mute.
function pinProductScript(target) {
    return `(async () => {
    const target = ${JSON.stringify(target)}
    const wanted = typeof target === 'object' && target ? (target.name || '') : String(target || '')
    const wantedId = typeof target === 'object' && target ? String(target.id || '').replace(/-\\d+$/, '') : ''
    const wantedCart = typeof target === 'object' && target ? String(target.cartIndex || target.id || '').match(/-(\\d+)$/)?.[1] || '' : ''
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase()
    const cap = (s, n) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, n)
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const seen = (el) => {
      if (!el.getClientRects || el.getClientRects().length === 0) return false
      const st = window.getComputedStyle(el)
      return st.visibility !== 'hidden' && st.display !== 'none'
    }
    const dismissBlockingDialogs = async () => {
      const ok = /^(ดำเนินการต่อ|จัดการภายหลัง|ต่อไป|ตกลง|continue|got it|ok)$/i
      for (let i = 0; i < 3; i += 1) {
        const button = [...document.querySelectorAll('button, [role="button"]')]
          .find((el) => seen(el) && ok.test(cap(el.textContent, 40)))
        if (!button) break
        button.click()
        await sleep(350)
      }
    }
    await dismissBlockingDialogs()
    // Exact label, not a substring. "\\bpin\\b" also matched stray prose, and it MISSED
    // "Unpin" — so a product that was already pinned vanished from the list entirely.
    const isPin = (el) => /^(pin|unpin|ปัก|เลิกปัก)$/i.test(cap(el.textContent, 20))

    // Same card resolution as the product listing: up from the button, not down from the
    // page, so the container actually contains the product name we are matching against.
    const cardFor = (button) => {
      let node = button.parentElement
      for (let i = 0; node && node !== document.body && i < 8; i += 1) {
        const t = cap(node.textContent, 400)
        // Price and stock line are necessary but nowhere near sufficient: the container
        // holding the whole product column has both, and walking up to it produced a
        // "product" named "AllAll categoriesAll stockProduct list in this LIVE+11Pin…"
        // whose Pin button was the PIN-WHOLE-LIST control. Rotating onto that name pinned
        // the entire list on a real broadcast. A product card contains exactly one Pin.
        const owned = [...node.querySelectorAll('button, [role="button"]')].filter(isPin).length
        if (owned > 1) return null
        if (owned === 1 && /[฿$]/.test(t) && /In stock|คงเหลือ|Requested demo/i.test(t) && t.length >= 40) {
          return node
        }
        node = node.parentElement
      }
      return null
    }
    const findCard = () => {
      for (const button of [...document.querySelectorAll('button, [role="button"]')]) {
        if (!seen(button) || !isPin(button)) continue
        const card = cardFor(button)
        if (!card) continue
        const text = norm(cap(card.textContent, 500))
        const nameHit = wanted && text.includes(norm(wanted).slice(0, 40))
        const idHit = wantedId && text.includes(wantedId)
        const cartHit = wantedCart && new RegExp('(^|\\\\D)' + wantedCart + '(\\\\D|$)').test(text)
        if (nameHit || idHit || cartHit) {
          return { card, button }
        }
      }
      return null
    }

    // The element that actually scrolls the product column.
    const scroller = () => {
      const anchor = [...document.querySelectorAll('button, [role="button"]')]
        .filter((el) => seen(el) && isPin(el))
        .map(cardFor)
        .filter(Boolean)[0]
      let node = anchor
      for (let i = 0; node && i < 8; i += 1) {
        if (node.scrollHeight > node.clientHeight + 40) return node
        node = node.parentElement
      }
      return null
    }

    let hit = findCard()
    if (!hit) {
      const box = scroller()
      if (box) {
        for (let step = 0; step < 12 && !hit; step += 1) {
          box.scrollTop = Math.min(box.scrollHeight, box.scrollTop + box.clientHeight * 0.8)
          await sleep(220)
          hit = findCard()
        }
      }
    }
    if (!hit) return { ok: false, reason: 'not-found' }
    if (/unpin|เลิกปัก/i.test(cap(hit.button.textContent, 40))) return { ok: true, already: true }
    if (hit.button.disabled || hit.button.getAttribute('aria-disabled') === 'true') {
      return { ok: false, reason: 'disabled' }
    }
    hit.button.scrollIntoView({ block: 'center' })
    await sleep(120)
    hit.button.click()
    await sleep(900)
    return { ok: true, already: false, label: cap(hit.button.textContent, 40) }
  })()`;
}
async function runInLiveConsole(accountId, script, options = {}) {
    const id = normalizeAccountId(accountId);
    if (isStreamBusy(id) && options.allowWhileLive !== true) {
        throw new Error('live-safe: ข้ามการสแกนหน้า TikTok ขณะกำลังไลฟ์ เพื่อลดการกระตุก');
    }
    await warmChatSenderWindow(id);
    const window = chatSenderWindow(id);
    if (window.webContents.isLoading()) {
        await new Promise((resolve) => {
            const done = () => resolve();
            window.webContents.once('did-stop-loading', done);
            setTimeout(done, 8000).unref?.();
        });
    }
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, Math.min(45000, options.timeoutMs)) : 10000;
    return executeTikTokJavaScript(window, script, timeoutMs, 'อ่านหน้า TikTok ไม่ทันเวลา');
}
async function executeTikTokJavaScript(window, script, timeoutMs, timeoutMessage) {
    return Promise.race([
        window.webContents.executeJavaScript(script, true),
        new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
            timer.unref?.();
        }),
    ]);
}
async function runTikTokApiInLiveConsole(accountId, script) {
    const id = normalizeAccountId(accountId);
    await warmChatSenderWindow(id);
    const window = chatSenderWindow(id);
    if (window.webContents.isLoading()) {
        await new Promise((resolve) => {
            const done = () => resolve();
            window.webContents.once('did-stop-loading', done);
            setTimeout(done, 8000).unref?.();
        });
    }
    return executeTikTokJavaScript(window, script, 10000, 'TikTok API ตอบกลับไม่ทันเวลา');
}
function tikTokApiScript(method, apiPath, body) {
    return `(async () => {
    const method = ${JSON.stringify(method)}
    const apiPath = ${JSON.stringify(apiPath)}
    const body = ${JSON.stringify(body ?? null)}
    const url = new URL(apiPath, location.origin)
    const headers = { 'Accept': 'application/json' }
    const options = { method, credentials: 'include', headers }
    if (body !== null && body !== undefined) {
      headers['Content-Type'] = 'application/json'
      options.body = JSON.stringify(body)
    }
    const response = await fetch(url.toString(), options)
    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch {}
    return { ok: response.ok, status: response.status, url: url.toString(), data, text: data ? '' : text.slice(0, 500) }
  })()`;
}
function currentRoomIdScript() {
    return `(() => {
    const fromResources = () => {
      const resources = performance.getEntriesByType('resource')
        .map((entry) => entry.name || '')
        .filter(Boolean)
        .reverse()
      for (const item of resources) {
        try {
          const url = new URL(item)
          const value = url.searchParams.get('room_id')
          if (value && /\\d{8,}/.test(value)) return value
        } catch {}
      }
      return ''
    }
    const fromText = () => {
      const text = document.documentElement?.innerHTML || ''
      const match = text.match(/"room_id"\\s*:\\s*"?(\\d{8,})"?/) || text.match(/room_id=(\\d{8,})/)
      return match ? match[1] : ''
    }
    const fromLocation = () => {
      try {
        const url = new URL(location.href)
        return url.searchParams.get('room_id') || ''
      } catch {
        return ''
      }
    }
    const roomId = fromLocation() || fromResources() || fromText()
    return { ok: Boolean(roomId), roomId }
  })()`;
}
async function resolveActiveRoomId(accountId, fallbackRoomId) {
    if (fallbackRoomId)
        return String(fallbackRoomId);
    try {
        const result = await runTikTokApiInLiveConsole(accountId, currentRoomIdScript());
        if (result?.roomId)
            return String(result.roomId);
    }
    catch {
        // The hidden LIVE Manager can be redirected by TikTok; fall through to the API probe.
    }
    const status = await fetchActiveShopRoomStatus(accountId).catch(() => null);
    return status?.roomId ? String(status.roomId) : '';
}
function normalizeApiProduct(product, index = 0) {
    const productInfo = product?.product_info ?? product?.product ?? product?.item ?? {};
    const productId = String(product?.product_id ?? product?.productId ?? product?.item_id ?? product?.itemId ?? product?.id ?? productInfo?.product_id ?? productInfo?.id ?? '');
    const title = String(product?.title ?? product?.name ?? product?.product_name ?? product?.product_title ?? product?.item_title ?? productInfo?.title ?? productInfo?.name ?? '').replace(/\s+/g, ' ').trim();
    const price = String(product?.format_available_price ?? product?.format_price ?? product?.price ?? '').replace(/\s+/g, ' ').trim();
    const originPrice = String(product?.format_origin_price ?? product?.price_hovered?.PriceBefore ?? '').replace(/\s+/g, ' ').trim();
    const stock = String(product?.stock_num ?? product?.available_stock ?? product?.stock ?? '').replace(/\s+/g, ' ').trim();
    const category = [
        product?.category_info?.name,
        ...(Array.isArray(product?.category_info?.option_children) ? product.category_info.option_children.map((item) => item?.name) : []),
    ].filter(Boolean).join(' > ');
    const selling = Array.isArray(product?.streamer_selling_view?.steamer_selling_items)
        ? product.streamer_selling_view.steamer_selling_items.map((item) => item?.opt_show_text || item?.show_text).filter(Boolean).join(', ')
        : '';
    const labels = Array.isArray(product?.labels) ? product.labels.map((item) => item?.text).filter(Boolean).join(', ') : '';
    const parts = [
        `ตะกร้า ${index + 1}`,
        title,
        price ? `ราคาไลฟ์ ${price}` : '',
        originPrice && originPrice !== price ? `จาก ${originPrice}` : '',
        stock ? `สต็อก ${stock}` : '',
        category ? `หมวด ${category}` : '',
        selling ? `คะแนน/ยอดขาย ${selling}` : '',
        labels ? `ป้าย ${labels}` : '',
    ];
    const text = parts.filter(Boolean).join(' | ');
    const image = product?.cover?.thumb_url_list?.[0] ?? product?.cover?.url_list?.[0] ?? product?.cover?.image_url ?? product?.image ?? product?.image_url ?? productInfo?.cover?.thumb_url_list?.[0] ?? '';
    const rawUrl = product?.url ?? product?.product_url ?? product?.detail_url ?? product?.share_url ?? product?.pdp_url ?? '';
    const url = typeof rawUrl === 'string' && /^https:\/\/shop\.tiktok\.com\//.test(rawUrl)
        ? rawUrl
        : productId
            ? `https://shop.tiktok.com/view/product/${encodeURIComponent(productId)}`
            : '';
    return {
        id: productId,
        name: title,
        cartIndex: index + 1,
        price,
        originPrice,
        stock,
        category,
        selling,
        labels,
        text,
        image: typeof image === 'string' && /^https:\/\//.test(image) ? image : '',
        url,
        pinned: Boolean(product?.is_pinned ?? product?.pinned),
    };
}
function apiProductList(data) {
    const candidates = [
        data?.data?.products,
        data?.data?.product_list,
        data?.data?.productList,
        data?.data?.items,
        data?.products,
        data?.product_list,
        data?.productList,
        data?.items,
        Array.isArray(data) ? data : null,
    ];
    return candidates.find((items) => Array.isArray(items) && items.length > 0) ?? [];
}
const productDetailCache = new Map();
const chatProductContextCache = new Map();
const productConsoleQueues = new Map();
function queueProductConsoleJob(accountId, label, work) {
    const id = normalizeAccountId(accountId);
    const previous = productConsoleQueues.get(id) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(() => work());
    productConsoleQueues.set(id, task.finally(() => {
        if (productConsoleQueues.get(id) === task) {
            productConsoleQueues.delete(id);
        }
    }));
    return task;
}
const PRODUCT_DETAIL_CACHE_VERSION = 2;
const CHAT_PRODUCT_CONTEXT_CACHE_VERSION = 1;
const CHAT_PRODUCT_CONTEXT_TTL_MS = 6 * 60 * 60 * 1000;
function compactProductText(value, max = 900) {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}
function productContextSignature(products) {
    return (Array.isArray(products) ? products : [])
        .map((product, index) => [
        String(product?.id ?? ''),
        String(product?.cartIndex ?? index + 1),
        String(product?.name ?? ''),
        String(product?.price ?? ''),
        String(product?.originPrice ?? ''),
        String(product?.stock ?? ''),
        String(product?.image ?? ''),
        String(product?.url ?? ''),
    ].map((part) => part.replace(/\s+/g, ' ').trim()).join('~'))
        .join('|');
}
function chatProductContextKey(accountId) {
    return `${CHAT_PRODUCT_CONTEXT_CACHE_VERSION}:${normalizeAccountId(accountId)}`;
}
function hasDetailedProductContext(lines) {
    return (Array.isArray(lines) ? lines : []).some((line) => /ตัวเลือก\/SKU:|ตัวเลือกที่มี:|สเปก:|รายละเอียด\/วิธีใช้\/ส่วนผสม:/.test(String(line ?? '')));
}
function readCachedChatProductLines(accountId, products) {
    const signature = productContextSignature(products);
    if (!signature)
        return [];
    const cached = chatProductContextCache.get(chatProductContextKey(accountId));
    if (!cached || cached.signature !== signature || Date.now() - cached.at > CHAT_PRODUCT_CONTEXT_TTL_MS)
        return [];
    return Array.isArray(cached.lines) ? cached.lines.filter(Boolean) : [];
}
function saveCachedChatProductLines(accountId, products, lines) {
    const signature = productContextSignature(products);
    const cleanLines = (Array.isArray(lines) ? lines : []).filter(Boolean);
    if (!signature || !cleanLines.length || !hasDetailedProductContext(cleanLines))
        return;
    chatProductContextCache.set(chatProductContextKey(accountId), { at: Date.now(), signature, lines: cleanLines });
}
function summarizeProductOptionsForPanel(line, cart) {
    const text = String(line ?? '').replace(/\s+/g, ' ').trim();
    const skuMatch = /ตัวเลือก\/SKU:\s*(.*?)(?:\s*\|\s*สเปก:|\s*\|\s*รายละเอียด\/วิธีใช้\/ส่วนผสม:|$)/.exec(text);
    const optionMatch = /ตัวเลือกที่มี:\s*(.*?)(?:\s*\|\s*สเปก:|\s*\|\s*รายละเอียด\/วิธีใช้\/ส่วนผสม:|$)/.exec(text);
    const raw = (skuMatch?.[1] ?? optionMatch?.[1] ?? '').trim();
    if (!raw)
        return `ตะกร้า ${cart}: ยังไม่พบตัวเลือก`;
    const options = raw
        .split(/\s*\|\s*/)
        .map((item) => item
        .replace(/\s*฿[\d,.]+(?:\s*จาก\s*฿[\d,.]+)?/g, '')
        .replace(/\s*สต็อก\s*\d+/g, '')
        .replace(/^สี:\s*/i, '')
        .trim())
        .filter(Boolean);
    const knownOptionNames = ['EMBRYO', 'BABY', 'JUNIOR', 'ADULT', 'SENIOR'];
    const displayOptions = [];
    for (const option of options) {
        for (const name of knownOptionNames) {
            if (new RegExp(`\\b${name}\\b`, 'i').test(option) && !displayOptions.includes(name))
                displayOptions.push(name);
        }
    }
    if (displayOptions.length)
        return `ตะกร้า ${cart}: ${displayOptions.join(' | ')}`;
    const shadeNames = new Map([
        ['00', 'ผิวขาวอมชมพู'],
        ['01', 'ผิวขาวเหลือง'],
        ['02', 'ผิวสองสี'],
        ['03', 'ผิวเข้ม'],
    ]);
    const cleanLabel = (value) => String(value ?? '')
        .replace(/\s+/g, ' ')
        .replace(/\s*\(\s*/g, ' (')
        .trim();
    const shadeLabel = (code, fallback = '') => `${code}-${shadeNames.get(code) ?? fallback.replace(/^0[0-9]-?/, '').trim()}`.trim();
    const simpleShades = [];
    const groups = new Map();
    const addGroup = (name, value) => {
        const key = cleanLabel(name).replace(/ทีแถม/g, 'ที่แถม');
        const current = groups.get(key) ?? [];
        if (!current.includes(value))
            current.push(value);
        groups.set(key, current);
    };
    for (const option of options) {
        const parts = option.split(/\s*\/\s*/).map((part) => cleanLabel(part)).filter(Boolean);
        if (parts.length > 1) {
            for (const part of parts) {
                const pair = /^(.*?):\s*(.*)$/.exec(part);
                const text = pair ? pair[2] : part;
                const code = /(0[0-3])/.exec(text)?.[1];
                if (pair && code)
                    addGroup(pair[1], shadeLabel(code, text));
            }
            continue;
        }
        const pair = /^(.*?):\s*(.*)$/.exec(option);
        const text = pair ? pair[2] : option;
        const code = /(0[0-3])/.exec(text)?.[1];
        const label = code ? shadeLabel(code, text) : cleanLabel(text);
        if (pair && code)
            addGroup(pair[1], label);
        else if (code && !simpleShades.includes(label))
            simpleShades.push(label);
    }
    const grouped = [...groups.entries()]
        .map(([name, values]) => `${name}: ${values.join(', ')}`)
        .filter((item) => item.length > 0);
    const summary = grouped.length ? grouped : simpleShades;
    return `ตะกร้า ${cart}: ${(summary.length ? summary : options).join(' | ')}`;
}
function productDetailScript(productId) {
    return `(async () => {
    const productId = ${JSON.stringify(String(productId))}
    const clean = (value, max = 900) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max)
    const looksInternalId = (text) => /^[A-Fa-f0-9]{18,}$/.test(String(text || '').replace(/\\s+/g, '')) || /^[A-Za-z0-9_-]{24,}$/.test(String(text || '').trim())
    const looksBadOptionText = (text) => /items? sold|sold globally|excluding items|number of|tiktok shop|free shipping|quantity|buy now|reviews?|followers?|recommended|you may also like/i.test(String(text || ''))
    const looksHumanOption = (text) => {
      const value = clean(text, 240)
      if (!value || looksInternalId(value) || looksBadOptionText(value)) return false
      if (/^(0[1-9]|[1-9][0-9]?)(\\s|$|[-:：])/.test(value)) return /[ก-๙A-Za-z]/.test(value.replace(/^(0[1-9]|[1-9][0-9]?)/, ''))
      return /(เบอร์|สี|เฉด|สูตร|ตัวเลือก|ผิว|ขาว|กลาง|สองสี|เข้ม|ธรรมชาติ|โทน|shade|option|variant|sku|size|ขนาด|embryo|baby|junior|adult|senior)/i.test(value) && /[ก-๙A-Za-z0-9]/.test(value)
    }
    const uniq = (items, max = 20) => [...new Set(items.map((item) => clean(item, 240)).filter(looksHumanOption))].slice(0, max)
    const optionKey = (key) => /(sale|sku|variation|variant|option|prop|spec|attribute|color|shade|เบอร์|สี|เฉด|สูตร|ตัวเลือก)/i.test(String(key || ''))
    const textFrom = (value, keys) => {
      if (!value || typeof value !== 'object') return ''
      for (const key of keys) {
        const text = clean(value[key], 160)
        if (text) return text
      }
      return ''
    }
    const collectOptionTexts = (value, depth = 0, parentKey = '') => {
      if (!value || typeof value !== 'object' || depth > 10) return []
      const found = []
      if (Array.isArray(value)) {
        for (const item of value) found.push(...collectOptionTexts(item, depth + 1, parentKey))
        return found
      }
      const propName = textFrom(value, ['prop_name', 'sale_prop_name', 'name', 'display_name', 'label', 'title'])
      const propValue = textFrom(value, ['prop_value', 'sale_prop_value', 'value', 'display_value', 'value_name', 'option_name', 'sku_name', 'seller_sku', 'text'])
      if (propValue && !looksInternalId(propValue)) {
        const text = [propName && optionKey(propName) ? propName : '', propValue].filter(Boolean).join(': ')
        if (looksHumanOption(text)) found.push(text)
      }
      for (const [key, child] of Object.entries(value)) {
        if (typeof child === 'string') {
          const text = clean(child, 180)
          if ((optionKey(key) || optionKey(parentKey)) && looksHumanOption(text)) found.push(text)
          continue
        }
        if (child && typeof child === 'object') {
          found.push(...collectOptionTexts(child, depth + 1, key))
        }
      }
      return found
    }
    const blockText = (blocks) => {
      if (!Array.isArray(blocks)) return ''
      return blocks.map((block) => {
        if (typeof block?.text === 'string') return block.text
        if (Array.isArray(block?.content)) return block.content.join(', ')
        return ''
      }).filter(Boolean).join(' ')
    }
    const parseState = () => {
      const scripts = [...document.scripts].map((script) => script.textContent || '')
      const jsonOptionTexts = []
      const findProductInfo = (value, depth = 0) => {
        if (!value || typeof value !== 'object' || depth > 8) return null
        if (String(value.product_id || '') === productId && (Array.isArray(value.skus) || Array.isArray(value.sale_props) || value.title)) return value
        if (value.product_info) {
          const nested = findProductInfo(value.product_info, depth + 1)
          if (nested) return nested
        }
        for (const child of Object.values(value)) {
          const found = findProductInfo(child, depth + 1)
          if (found) return found
        }
        return null
      }
      const tryJson = (text) => {
        const candidates = [text]
        const first = text.indexOf('{')
        const last = text.lastIndexOf('}')
        if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1))
        for (const candidate of candidates) {
          try {
            const parsed = JSON.parse(candidate)
            jsonOptionTexts.push(...collectOptionTexts(parsed))
            const info = findProductInfo(parsed)
            if (info) return info
          } catch {}
        }
        return null
      }
      for (const text of scripts) {
        if (!text.includes(productId) && !/sale_props|sku_sale_props|skus|SKU/i.test(text)) continue
        const info = tryJson(text)
        if (info) return info
      }
      const globalKeys = ['__UNIVERSAL_DATA_FOR_REHYDRATION__', '__MODERN_ROUTER_DATA__', '__NEXT_DATA__', 'SIGI_STATE', 'loaderData']
      for (const key of globalKeys) {
        try {
          jsonOptionTexts.push(...collectOptionTexts(window[key]))
          const info = findProductInfo(window[key])
          if (info) return info
        } catch {}
      }
      return jsonOptionTexts.length ? { harvested_options: uniq(jsonOptionTexts, 32) } : null
    }
    const visible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const domOptions = () => {
      const nodes = [...document.querySelectorAll('button, [role="button"], li, span, div')]
      const optionTexts = []
      for (const node of nodes) {
        if (!visible(node)) continue
        const text = clean(node.innerText || node.textContent || '', 180)
        if (!text || text.length < 2 || text.length > 180 || looksInternalId(text)) continue
        if (looksHumanOption(text)) {
          optionTexts.push(text)
        }
      }
      const body = clean(document.body?.innerText || '', 8000)
      const windows = []
      const re = /(0[1-9][^\\n|]{0,80})/g
      let match
      while ((match = re.exec(body)) && windows.length < 24) {
        if (looksHumanOption(match[1])) windows.push(match[1])
      }
      return uniq([...optionTexts, ...windows], 24)
    }
    const info = parseState()
    const domOptionTexts = domOptions()
    if (!info) {
      if (domOptionTexts.length) return { ok: true, source: 'dom', url: location.href, title: clean(document.title, 180), saleProps: domOptionTexts, skus: [], specifications: [], description: '' }
      return { ok: false, reason: /security check/i.test(document.body?.innerText || '') ? 'security-check' : 'not-found', title: document.title, url: location.href }
    }
    const specifications = Array.isArray(info.specifications)
      ? info.specifications.map((item) => [item?.name, item?.value].filter(Boolean).join(': ')).filter(Boolean).slice(0, 10)
      : []
    const saleProps = Array.isArray(info.sale_props)
      ? info.sale_props.map((prop) => {
          const name = clean(prop?.prop_name || prop?.name || '', 60)
          const values = Array.isArray(prop?.sale_prop_values)
            ? prop.sale_prop_values.map((item) => clean(item?.prop_value || item?.value || '', 80)).filter(Boolean).join(', ')
            : ''
          return [name, values].filter(Boolean).join(': ')
        }).filter(Boolean).slice(0, 8)
      : []
    const harvestedOptions = Array.isArray(info.harvested_options) ? info.harvested_options : collectOptionTexts(info)
    const skus = Array.isArray(info.skus)
      ? info.skus.map((sku) => {
          const props = Array.isArray(sku?.sku_sale_props)
            ? sku.sku_sale_props.map((prop) => {
                const name = clean(prop?.prop_name || prop?.name || prop?.sale_prop_name || '', 60)
                const value = clean(prop?.prop_value || prop?.value || prop?.sale_prop_value || '', 120)
                return [name, value].filter(Boolean).join(': ')
              }).filter(Boolean).join(' / ')
            : ''
          const skuName = clean(sku?.sku_name || sku?.name || sku?.seller_sku || sku?.sku_id || '', 120)
          const price = sku?.price?.sale_price_format ? (sku.price.currency_symbol || '฿') + sku.price.sale_price_format : ''
          const origin = sku?.price?.origin_price_format ? 'จาก ' + (sku.price.currency_symbol || '฿') + sku.price.origin_price_format : ''
          const stock = Number.isFinite(Number(sku?.stock)) ? 'สต็อก ' + sku.stock : ''
          return [props || skuName, price, origin, stock].filter(Boolean).join(' ')
        }).filter(Boolean).slice(0, 12)
      : []
    return {
      ok: true,
      url: location.href,
      title: clean(info.title || document.title, 180),
      price: clean(info.price?.real_price || '', 80),
      sold: clean(info.sold_count ? info.sold_count + ' sold' : '', 80),
      review: clean(info.review?.product_rating_str && info.review?.review_count_str ? info.review.product_rating_str + ' (' + info.review.review_count_str + ' รีวิว)' : '', 80),
      seller: clean(info.seller?.name || '', 100),
      saleProps: uniq([...saleProps, ...harvestedOptions, ...domOptionTexts], 24),
      specifications,
      skus,
      description: clean(blockText(info.desc_blocks), 900),
    }
  })()`;
}
function productDetailFetchScript(productId, productUrl) {
    return `(async () => {
    const productId = ${JSON.stringify(String(productId))}
    const productUrl = ${JSON.stringify(String(productUrl || ''))}
    const clean = (value, max = 900) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max)
    const looksInternalId = (text) => /^[A-Fa-f0-9]{18,}$/.test(String(text || '').replace(/\\s+/g, '')) || /^[A-Za-z0-9_-]{24,}$/.test(String(text || '').trim())
    const looksBadOptionText = (text) => /items? sold|sold globally|excluding items|number of|tiktok shop|free shipping|quantity|buy now|reviews?|followers?|recommended|you may also like/i.test(String(text || ''))
    const looksHumanOption = (text) => {
      const value = clean(text, 240)
      if (!value || looksInternalId(value) || looksBadOptionText(value)) return false
      if (/^(0[1-9]|[1-9][0-9]?)(\\s|$|[-:：])/.test(value)) return /[ก-๙A-Za-z]/.test(value.replace(/^(0[1-9]|[1-9][0-9]?)/, ''))
      return /(เบอร์|สี|เฉด|สูตร|ตัวเลือก|ข้อมูลจำเพาะ|ผิว|ขาว|กลาง|สองสี|เข้ม|ธรรมชาติ|โทน|shade|option|variant|sku|size|ขนาด|กระปุก|ขวด|ซอง|กล่อง|ชิ้น|embryo|baby|junior|adult|senior)/i.test(value) && /[ก-๙A-Za-z0-9]/.test(value)
    }
    const uniq = (items, max = 24) => [...new Set(items.map((item) => clean(item, 240)).filter(looksHumanOption))].slice(0, max)
    const productBaseId = (value) => String(value || '').replace(/-\\d+$/, '')
    const titleOptions = (title) => {
      const text = clean(title, 260)
      const found = []
      for (const name of ['EMBRYO', 'BABY', 'JUNIOR', 'ADULT', 'SENIOR']) {
        if (new RegExp('\\\\b' + name + '\\\\b', 'i').test(text)) found.push(name)
      }
      for (const match of text.matchAll(/\\[([^\\]]{2,120})\\]|\\(([^)]{2,120})\\)|\\*([^*]{2,120})\\*/g)) {
        const raw = clean(match[1] || match[2] || match[3] || '', 120)
        if (looksHumanOption(raw)) found.push(raw)
      }
      const sizeMatch = text.match(/(?:รวมครบทุกขนาด|ขนาด|size)\\s*[:：-]?\\s*([A-Za-z0-9ก-๙,\\s/.-]{2,120})/i)
      if (sizeMatch) {
        for (const part of sizeMatch[1].split(/,|\\/|\\s{2,}/)) {
          const item = clean(part, 80)
          if (looksHumanOption(item)) found.push(item)
        }
      }
      return found
    }
    const pageDataOptions = (value) => {
      const products = []
      const visit = (node) => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) {
          for (const item of node) visit(item)
          return
        }
        if (Array.isArray(node.products)) products.push(...node.products)
        for (const child of Object.values(node)) if (child && typeof child === 'object') visit(child)
      }
      visit(value?.data || value)
      const pageConfig = value?.data?.page_config || value?.page_config
      if (typeof pageConfig === 'string') {
        try { visit(JSON.parse(pageConfig)) } catch {}
      }
      const target = products.find((item) => productBaseId(item?.product_id) === productBaseId(productId))
        || products.find((item) => clean(item?.title || '').includes(productId))
      if (!target) return []
      const names = titleOptions(target.title)
      const skuInfo = Array.isArray(target.sku_info) ? target.sku_info : []
      const skuLines = skuInfo.map((sku, index) => {
        const label = names[index] || names[skuInfo.length === 1 ? 0 : index] || ''
        const price = clean(sku?.PriceInfo?.sale_price_format || sku?.price?.sale_price_format || '', 60)
        const origin = clean(sku?.PriceInfo?.origin_price_format || sku?.price?.origin_price_format || '', 60)
        const priceText = price ? '฿' + price.replace(/^฿/, '') : ''
        const originText = origin ? 'จาก ฿' + origin.replace(/^฿/, '') : ''
        return [label || ('SKU ' + (index + 1)), priceText, originText].filter(Boolean).join(' ')
      })
      const humanNames = names.filter((name) => !/^รวมครบทุกขนาด$/i.test(name))
      return uniq(humanNames.length ? humanNames : skuLines, 24)
    }
    const collectOptionTexts = (value, depth = 0, parentKey = '') => {
      if (!value || typeof value !== 'object' || depth > 10) return []
      const found = []
      if (Array.isArray(value)) {
        for (const item of value) found.push(...collectOptionTexts(item, depth + 1, parentKey))
        return found
      }
      const optionKey = (key) => /(sale|sku|variation|variant|option|prop|spec|attribute|color|shade|size|item|เบอร์|สี|เฉด|สูตร|ตัวเลือก|ข้อมูลจำเพาะ|ขนาด)/i.test(String(key || ''))
      const textFrom = (keys) => {
        for (const key of keys) {
          const text = clean(value[key], 160)
          if (text) return text
        }
        return ''
      }
      const propName = textFrom(['prop_name', 'sale_prop_name', 'name', 'display_name', 'label', 'title'])
      const propValue = textFrom(['prop_value', 'sale_prop_value', 'value', 'display_value', 'value_name', 'option_name', 'sku_name', 'seller_sku', 'text'])
      if (propValue && !looksInternalId(propValue)) {
        const text = [propName && optionKey(propName) ? propName : '', propValue].filter(Boolean).join(': ')
        if (looksHumanOption(text)) found.push(text)
      }
      for (const [key, child] of Object.entries(value)) {
        if (typeof child === 'string') {
          const text = clean(child, 180)
          if ((optionKey(key) || optionKey(parentKey)) && looksHumanOption(text)) found.push(text)
          continue
        }
        if (child && typeof child === 'object') found.push(...collectOptionTexts(child, depth + 1, key))
      }
      return found
    }
    const parseJsonCandidates = (text) => {
      const options = []
      const tryJson = (raw) => {
        try {
          const parsed = JSON.parse(raw)
          const fromPageData = pageDataOptions(parsed)
          const isPdpPageData = !!(parsed?.data?.components_map || parsed?.data?.global_data || parsed?.components_map || parsed?.global_data)
          options.push(...(fromPageData.length || isPdpPageData ? fromPageData : collectOptionTexts(parsed)))
        } catch {}
      }
      for (const match of text.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/gi)) {
        const script = match[1] || ''
        if (!/sku|sale_prop|variant|option|ข้อมูลจำเพาะ|product/i.test(script)) continue
        const jsonMatch = script.match(/\\{[\\s\\S]*\\}/)
        if (jsonMatch) tryJson(jsonMatch[0])
      }
      for (const match of text.matchAll(/\\{[^{}]*(?:sku|sale_prop|variant|option|ข้อมูลจำเพาะ)[\\s\\S]{0,3000}?\\}/gi)) {
        tryJson(match[0])
      }
      return options
    }
    const parseBodyOptions = (text) => {
      const doc = new DOMParser().parseFromString(text, 'text/html')
      const body = clean(doc.body?.innerText || text, 12000)
      const options = []
      const specMatch = body.match(/(?:ข้อมูลจำเพาะ|Specifications?)[:：]?\\s*([\\s\\S]{0,500}?)(?:Quantity|จำนวน|Buy now|ซื้อเลย|Explore more|About this product|Product description|$)/i)
      if (specMatch) {
        for (const part of specMatch[1].split(/\\n|\\||,/)) {
          const item = clean(part, 120)
          if (looksHumanOption(item)) options.push(item)
        }
      }
      for (const match of body.matchAll(/(?:Item|ตัวเลือก|ข้อมูลจำเพาะ)[:：]?\\s*([^\\n]{1,120})/gi)) {
        options.push(match[1])
      }
      return options
    }
    const candidates = [
      productUrl,
      'https://shop.tiktok.com/view/product/' + encodeURIComponent(productId),
      'https://shop.tiktok.com/th/pdp/product/' + encodeURIComponent(productId),
    ].filter(Boolean)
    for (const url of [...new Set(candidates)]) {
      try {
        const response = await fetch(url, { credentials: 'include', redirect: 'follow', headers: { Accept: 'text/html,application/json' } })
        const text = await response.text()
        if (!response.ok || !text || /Security Check|captcha|verify/i.test(text)) continue
        let jsonOptions = []
        try {
          const parsed = JSON.parse(text)
          const fromPageData = pageDataOptions(parsed)
          const isPdpPageData = !!(parsed?.data?.components_map || parsed?.data?.global_data || parsed?.components_map || parsed?.global_data)
          jsonOptions = fromPageData.length || isPdpPageData ? fromPageData : collectOptionTexts(parsed)
        } catch { jsonOptions = parseJsonCandidates(text) }
        const saleProps = uniq([...jsonOptions, ...parseBodyOptions(text)])
        if (saleProps.length) return { ok: true, source: 'pdp-fetch', url: response.url || url, saleProps }
      } catch {}
    }
    return { ok: false, reason: 'no-api-options' }
  })()`;
}
async function waitForProductPage(window, timeoutMs = 12000) {
    if (!window.webContents.isLoading())
        return;
    await new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done)
                return;
            done = true;
            resolve();
        };
        window.webContents.once('did-finish-load', finish);
        window.webContents.once('did-fail-load', finish);
        setTimeout(finish, timeoutMs).unref?.();
    });
}
async function readProductDetailViaApi(accountId, product) {
    if (!product?.id)
        return '';
    try {
        const detailUrl = typeof product.url === 'string' && /^https:\/\/shop\.tiktok\.com\//.test(product.url)
            ? product.url
            : '';
        const detail = (await runTikTokApiInLiveConsole(accountId, productDetailFetchScript(product.id, detailUrl)));
        const saleOptions = Array.isArray(detail?.saleProps) ? detail.saleProps.filter(Boolean).slice(0, 12) : [];
        if (!saleOptions.length)
            return '';
        return compactProductText(`ตัวเลือกที่มี: ${saleOptions.join(' | ')}`, 1400);
    }
    catch {
        return '';
    }
}
async function readProductDetail(accountId, product) {
    if (!product?.id)
        return '';
    const cacheKey = `${PRODUCT_DETAIL_CACHE_VERSION}:${normalizeAccountId(accountId)}:${product.id}`;
    const cached = productDetailCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000 && !/ยังไม่พบตัวเลือก/.test(cached.line))
        return cached.line;
    const apiLine = await readProductDetailViaApi(accountId, product);
    if (apiLine) {
        productDetailCache.set(cacheKey, { at: Date.now(), line: apiLine });
        return apiLine;
    }
    let window = null;
    try {
        window = createTikTokWindow(accountId, 'shop', false);
        window.hide();
        const detailUrl = typeof product.url === 'string' && /^https:\/\/shop\.tiktok\.com\//.test(product.url)
            ? product.url
            : `https://shop.tiktok.com/th/pdp/product/${encodeURIComponent(product.id)}`;
        await window.loadURL(detailUrl);
        await waitForProductPage(window);
        await new Promise((resolve) => setTimeout(resolve, 2500).unref?.());
        const detail = (await window.webContents.executeJavaScript(productDetailScript(product.id), true));
        if (!detail?.ok)
            return '';
        const skuOptions = Array.isArray(detail.skus) ? detail.skus.filter(Boolean) : [];
        const saleOptions = Array.isArray(detail.saleProps)
            ? detail.saleProps
                .filter((item) => !/การซื้อที่ตรวจสอบ|ประโยชน์ของสินค้า|สภาพผิว|รีวิว|^\S\*\*/i.test(String(item)))
                .filter((item) => String(item).length <= 220)
                .slice(0, 12)
            : [];
        const optionParts = skuOptions.length
            ? [`ตัวเลือก/SKU: ${skuOptions.join(' | ')}`]
            : saleOptions.length
                ? [`ตัวเลือกที่มี: ${saleOptions.join(' | ')}`]
                : [];
        const parts = [
            detail.seller ? `ร้าน ${detail.seller}` : '',
            detail.review ? `รีวิว ${detail.review}` : '',
            ...optionParts,
            !optionParts.length ? 'สถานะตัวเลือก: ยังไม่พบตัวเลือก 01/02/03/04 ที่อ่านได้จากหน้าสินค้า' : '',
            Array.isArray(detail.specifications) && detail.specifications.length ? `สเปก: ${detail.specifications.join(' | ')}` : '',
            detail.description ? `รายละเอียด/วิธีใช้/ส่วนผสม: ${detail.description}` : '',
        ].filter(Boolean);
        const line = compactProductText(parts.join(' | '), 1400);
        if (line && !/ยังไม่พบตัวเลือก/.test(line))
            productDetailCache.set(cacheKey, { at: Date.now(), line });
        return line;
    }
    catch {
        return '';
    }
    finally {
        if (window && !window.isDestroyed())
            window.destroy();
    }
}
async function openProductDetailWindow(accountId, product) {
    if (!product?.id)
        throw new Error('ไม่พบรหัสสินค้า');
    const requestedUrl = typeof product.url === 'string' && /^https:\/\/shop\.tiktok\.com\//.test(product.url)
        ? product.url
        : `https://shop.tiktok.com/th/pdp/product/${encodeURIComponent(product.id)}`;
    const window = createTikTokWindow(accountId, 'shop', false);
    window.show();
    window.focus();
    await window.loadURL(requestedUrl);
    await waitForProductPage(window);
    await new Promise((resolve) => setTimeout(resolve, 1500).unref?.());
    const detail = await window.webContents.executeJavaScript(productDetailScript(product.id), true).catch((error) => ({
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
    }));
    return {
        ok: true,
        productId: product.id,
        name: product.name,
        labels: product.labels,
        requestedUrl,
        currentUrl: window.webContents.getURL(),
        title: typeof window.webContents.getTitle === 'function' ? window.webContents.getTitle() : window.getTitle(),
        windowId: window.id,
        detail,
    };
}
async function enrichProductsWithDetails(accountId, products) {
    const enriched = [];
    const queue = [...products];
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length) {
            const product = queue.shift();
            if (!product)
                continue;
            const detail = await readProductDetail(accountId, product);
            enriched.push({
                ...product,
                text: detail ? `${product.text} | ${detail}` : product.text,
            });
        }
    });
    await Promise.race([
        Promise.allSettled(workers),
        new Promise((resolve) => setTimeout(resolve, 30000).unref?.()),
    ]);
    const byId = new Map(enriched.map((product) => [product.id, product]));
    return products.map((product) => byId.get(product.id) ?? product);
}
async function tiktokApiRequest(accountId, method, apiPath, body) {
    const result = (await runTikTokApiInLiveConsole(accountId, tikTokApiScript(method, apiPath, body)));
    if (!result?.ok) {
        const message = result?.data?.message ?? result?.data?.msg ?? result?.text ?? `HTTP ${result?.status ?? 'unknown'}`;
        throw new Error(String(message));
    }
    const code = result.data?.code;
    if (code !== undefined && Number(code) !== 0) {
        throw new Error(String(result.data?.message ?? result.data?.msg ?? `TikTok API code ${code}`));
    }
    return result.data;
}
async function listLiveProductsApi(accountId) {
    const data = await tiktokApiRequest(accountId, 'GET', '/api/v1/streamer_desktop/live_product/list', null);
    const products = apiProductList(data).map((product, index) => normalizeApiProduct(product, index)).filter((item) => item.id && item.name);
    const window = chatSenderWindow(normalizeAccountId(accountId));
    return {
        ok: true,
        source: 'api',
        url: window.webContents.getURL() || LIVE_MANAGER_URL,
        apiUrl: '/api/v1/streamer_desktop/live_product/list',
        windowId: window.id,
        windowTarget: window.__npTarget || 'shop',
        windowVisible: window.isVisible(),
        title: 'TikTok LIVE products',
        products,
    };
}
async function listLiveProducts(accountId) {
    const id = normalizeAccountId(accountId);
    const liveSafe = isStreamBusy(id);
    let apiResult = null;
    try {
        apiResult = await listLiveProductsApi(id);
    }
    catch {
        // Fall through to the visible LIVE Manager page. TikTok sometimes returns an empty or
        // stale live_product/list while the seller UI clearly has product rows and Pin buttons.
    }
    const apiCount = Array.isArray(apiResult?.products) ? apiResult.products.length : 0;
    if (liveSafe) {
        if (apiCount)
            return { ...apiResult, liveSafe: true };
        const cached = cachedPinProductsResult(id, 'live-safe-api-failed');
        if (cached.products.length)
            return cached;
        if (apiResult)
            return { ...apiResult, liveSafe: true };
        throw new Error('กำลังไลฟ์อยู่และ TikTok API ดึงสินค้าไม่ได้ จึงไม่สแกนหน้า LIVE Manager เพื่อกันไลฟ์กระตุก');
    }
    let pageResult = null;
    try {
        pageResult = await runInLiveConsole(id, liveProductsScript(), { timeoutMs: 30000 });
    }
    catch {
        // If the visible page cannot be read, a non-empty API result is still useful.
    }
    const pageCount = Array.isArray(pageResult?.products) ? pageResult.products.length : 0;
    if (pageCount && pageCount >= apiCount)
        return { ...pageResult, apiCount: apiCount || undefined };
    if (apiCount)
        return { ...apiResult, visibleCount: pageCount || undefined };
    if (pageResult)
        return pageResult;
    if (apiResult)
        return apiResult;
    const cached = cachedPinProductsResult(id, 'scan-failed');
    if (cached.products.length)
        return cached;
    throw new Error('ยังดึงรายการสินค้าจาก TikTok LIVE Manager ไม่ได้');
}
function findProductForName(products, name) {
    const wanted = String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!wanted)
        return null;
    return products.find((product) => product.name.toLowerCase() === wanted)
        ?? products.find((product) => product.name.toLowerCase().includes(wanted.slice(0, 40)))
        ?? products.find((product) => wanted.includes(product.name.toLowerCase().slice(0, 40)))
        ?? null;
}
function productBaseId(id) {
    return String(id ?? '').replace(/-\d+$/, '').trim();
}
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function getPinnedProductApi(accountId, roomId) {
    if (!roomId)
        return null;
    const data = await tiktokApiRequest(accountId, 'GET', `/api/v1/streamer_desktop/pin/get?room_id=${encodeURIComponent(String(roomId))}`, null);
    return {
        productId: productBaseId(data?.product_id),
        cardType: data?.card_type,
        raw: data,
    };
}
function findProductForPinTarget(products, target) {
    const wantedId = productBaseId(typeof target === 'object' ? target?.id : '');
    if (wantedId) {
        const byId = products.find((product) => productBaseId(product.id) === wantedId || String(product.id) === wantedId);
        if (byId)
            return byId;
    }
    return findProductForName(products, typeof target === 'object' ? target?.name : target);
}
async function pinProductApi(accountId, roomId, target) {
    if (!roomId)
        throw new Error('ยังไม่พบ room_id ของไลฟ์นี้');
    let product = null;
    const directProductId = productBaseId(typeof target === 'object' ? target?.id : '');
    if (directProductId) {
        product = {
            id: directProductId,
            name: String(target?.name ?? directProductId),
        };
    }
    else {
        const list = await listLiveProductsApi(accountId);
        product = findProductForPinTarget(list.products, target);
        if (!product)
            throw new Error('ไม่พบสินค้านี้จาก TikTok API');
    }
    const productId = productBaseId(product.id);
    await tiktokApiRequest(accountId, 'POST', '/api/v1/streamer_desktop/live_product/pin', {
        room_id: String(roomId),
        product_id: productId,
        op: 1,
        trace_time_map: {
            rd_e2e_fe_client_start_timestamp: String(Date.now()),
            rd_e2e_start_timestamp: String(Date.now()),
        },
    });
    await wait(700);
    const pinned = await getPinnedProductApi(accountId, roomId).catch(() => null);
    if (pinned?.productId && pinned.productId !== '0' && pinned.productId !== productId) {
        return { ok: false, source: 'api', reason: 'pinned-other', productId: product.id, pinnedProductId: pinned.productId, name: product.name };
    }
    if (!pinned?.productId || pinned.productId === '0') {
        return { ok: false, source: 'api', reason: 'not-pinned', productId: product.id, name: product.name };
    }
    return { ok: true, source: 'api', already: false, productId: product.id, name: product.name };
}
function normalizeVoucher(voucher) {
    const face = String(voucher?.face_value_format ?? voucher?.face_value ?? '').replace('{{face_value}}', voucher?.face_value ?? '').trim();
    const threshold = String(voucher?.threshold_desc ?? '').trim();
    const cost = String(voucher?.cost_role_desc ?? '').trim();
    const text = [face, threshold, cost].filter(Boolean).join(' ');
    const actionText = String(voucher?.action?.text ?? '').toLowerCase();
    return {
        id: String(voucher?.voucher_type_id ?? voucher?.coupon_type_id ?? voucher?.da_info?.coupon_id ?? ''),
        text,
        pinned: actionText.includes('unpin') || voucher?.da_info?.coupon_status === 'pinned',
    };
}
async function couponApi(accountId, roomId, action) {
    if (!roomId)
        throw new Error('ยังไม่พบ room_id ของไลฟ์นี้');
    const data = await tiktokApiRequest(accountId, 'GET', `/api/v1/streamer_desktop/sea_content/creator/live/vouchers?room_id=${encodeURIComponent(String(roomId))}&voucher_scene=1`, null);
    const vouchers = Array.isArray(data?.data?.vouchers) ? data.data.vouchers.map(normalizeVoucher).filter((item) => item.id) : [];
    const target = vouchers.find((voucher) => !voucher.pinned) ?? vouchers[0];
    if (!target)
        return { ok: false, source: 'api', reason: 'no-coupon' };
    if (action === 'read')
        return { ok: true, source: 'api', text: target.text, pinned: target.pinned };
    if (target.pinned)
        return { ok: true, source: 'api', text: target.text, pinned: true, already: true };
    await tiktokApiRequest(accountId, 'POST', '/api/v1/streamer_desktop/sea_content/creator/live/voucher/pin', {
        room_id: String(roomId),
        voucher_type_id: target.id,
        pin_action: 2,
    });
    return { ok: true, source: 'api', text: target.text, pinned: true, already: false };
}
// One rotation timer per account, alive only while that account is live.
const pinTimers = new Map();
const pinCursors = new Map();
function stopPinRotation(accountId) {
    const id = normalizeAccountId(accountId);
    const timer = pinTimers.get(id);
    if (timer)
        clearInterval(timer);
    pinTimers.delete(id);
    pinCursors.delete(id);
}
async function productsForPinRotation(id, config) {
    const saved = config.products.filter((product) => product.enabled);
    if (saved.length)
        return saved;
    let result;
    try {
        result = await listLiveProducts(id);
    }
    catch (error) {
        result = cachedPinProductsResult(id, error instanceof Error ? error.message : 'pin-rotation-list-failed');
    }
    const discovered = Array.isArray(result?.products)
        ? normalizePinProducts(result.products).map((product) => ({ ...product, enabled: true }))
        : [];
    if (discovered.length) {
        saveDiscoveredPinProducts(id, discovered, false);
        emitChatEvent(id, { kind: 'system', id: (0, node_crypto_1.randomUUID)(), text: `ดึงสินค้าในไลฟ์ ${discovered.length} รายการแล้ว เริ่มปักจากตะกร้า 1`, at: Date.now() });
    }
    return discovered;
}
async function pinNextProduct(accountId) {
    const id = normalizeAccountId(accountId);
    return queueProductConsoleJob(id, 'pin-rotation', () => pinNextProductNow(id));
}
async function pinNextProductNow(accountId) {
    const id = normalizeAccountId(accountId);
    const config = getPinConfig(id);
    const products = await productsForPinRotation(id, config);
    // The coupon is one more stop in the same cycle rather than a second timer — two timers
    // pinning into one console would fight over what is on screen.
    const queue = config.includeCoupon ? [...products, 'coupon'] : [...products];
    if (!queue.length)
        return;
    const cursor = pinCursors.get(id) ?? 0;
    const stop = queue[cursor % queue.length];
    pinCursors.set(id, (cursor + 1) % queue.length);
    if (stop === 'coupon') {
        try {
            const roomId = await resolveActiveRoomId(id, peekStreamSession(id)?.room?.roomId);
            let result;
            try {
                result = await couponApi(id, roomId, 'pin');
            }
            catch (error) {
                try {
                    result = (await runTikTokApiInLiveConsole(id, couponScript('pin')));
                }
                catch (fallbackError) {
                    result = { ok: false, reason: fallbackError instanceof Error ? fallbackError.message : error instanceof Error ? error.message : 'api-failed' };
                }
            }
            const text = result?.ok
                ? result.already
                    ? ''
                    : `ปักคูปอง "${(result.text ?? '').slice(0, 60)}" แล้ว`
                : `ปักคูปองไม่สำเร็จ — ${result?.reason === 'no-coupon' ? 'ไม่พบคูปองในไลฟ์นี้' : 'ปุ่มกดไม่ได้'}`;
            if (text)
                emitChatEvent(id, { kind: 'system', id: (0, node_crypto_1.randomUUID)(), text, at: Date.now() });
        }
        catch (error) {
            emitChatEvent(id, { kind: 'system', id: (0, node_crypto_1.randomUUID)(), text: `ปักคูปองไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`, at: Date.now() });
        }
        return;
    }
    const target = stop;
    try {
        const roomId = await resolveActiveRoomId(id, peekStreamSession(id)?.room?.roomId);
        let result;
        try {
                result = await pinProductApi(id, roomId, target);
                if (!result?.ok && (result?.reason === 'not-pinned' || result?.reason === 'pinned-other')) {
                    result = (await runTikTokApiInLiveConsole(id, pinProductScript(target)));
                }
        }
        catch (error) {
            try {
                result = (await runTikTokApiInLiveConsole(id, pinProductScript(target)));
            }
            catch (fallbackError) {
                result = { ok: false, reason: fallbackError instanceof Error ? fallbackError.message : error instanceof Error ? error.message : 'api-failed' };
            }
        }
        if (result?.ok) {
            if (!result.already) {
                emitChatEvent(id, { kind: 'system', id: (0, node_crypto_1.randomUUID)(), text: `ปักสินค้า "${target.name}" แล้ว`, at: Date.now() });
            }
            return;
        }
        // A failure here must never take the live down with it — say what happened and let the
        // next tick try the next product.
        const why = result?.reason === 'not-found'
            ? 'ไม่พบสินค้านี้ในรายการของไลฟ์'
            : result?.reason === 'disabled'
                ? 'ปุ่มปักยังกดไม่ได้'
                : 'ปักไม่สำเร็จ';
        emitChatEvent(id, { kind: 'system', id: (0, node_crypto_1.randomUUID)(), text: `ปักสินค้า "${target.name}" ไม่สำเร็จ — ${why}`, at: Date.now() });
    }
    catch (error) {
        emitChatEvent(id, {
            kind: 'system',
            id: (0, node_crypto_1.randomUUID)(),
            text: `ปักสินค้าไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
            at: Date.now(),
        });
    }
}
// Read the live's product list and hand it to the chat engine, so AI replies quote real
// names, prices and stock instead of guessing. Best-effort: a failure here must not stop a
// live or a rotation.
async function refreshChatProducts(accountId) {
    const id = normalizeAccountId(accountId);
    const config = getChatConfig(id);
    if (!config.enabled || !config.ai.enabled || !config.ai.useProducts)
        return;
    return queueProductConsoleJob(id, 'chat-products', async () => {
    try {
        let result;
        try {
            result = await listLiveProducts(id);
        }
        catch (error) {
            result = cachedPinProductsResult(id, error instanceof Error ? error.message : 'chat-products-list-failed');
        }
        const products = result?.products ?? [];
        const fallbackLines = products
            .map((product) => (product.text ?? '').replace(/\s*Pin$/i, '').trim())
            .filter(Boolean);
        if (fallbackLines.length)
            (0, chat_engine_1.setChatProducts)(id, fallbackLines);
        const cachedLines = readCachedChatProductLines(id, products);
        if (cachedLines.length) {
            (0, chat_engine_1.setChatProducts)(id, cachedLines);
            return;
        }
        const detailedProducts = result?.source === 'api'
            ? await enrichProductsWithDetails(id, products)
            : products;
        const detailedLines = detailedProducts
            .map((product) => (product.text ?? '').replace(/\s*Pin$/i, '').trim())
            .filter(Boolean);
        if (detailedLines.length) {
            (0, chat_engine_1.setChatProducts)(id, detailedLines);
            saveCachedChatProductLines(id, products, detailedLines);
        }
    }
    catch {
        // Console unreachable; the model just works from the shop context alone.
    }
    });
}
function restartPinRotation(accountId) {
    const id = normalizeAccountId(accountId);
    stopPinRotation(id);
    const config = getPinConfig(id);
    if (!config.enabled)
        return;
    // Only rotate while this account is actually broadcasting. Stream-Key/manual lives do
    // not have an app-created roomId, but the LIVE Manager still has Pin/Coupon controls,
    // so the rotation can use the DOM fallback when the API path has no room id.
    const sessionState = peekStreamSession(id);
    if (sessionState?.status.state !== 'live' && sessionState?.status.state !== 'starting')
        return;
    const everyMs = config.intervalMinutes * 60000;
    const productCount = config.products.filter((product) => product.enabled).length;
    emitChatEvent(id, {
        kind: 'system',
        id: (0, node_crypto_1.randomUUID)(),
        text: `เริ่มปักสินค้าอัตโนมัติ: ${productCount} สินค้า${config.includeCoupon ? ' + คูปอง' : ''} ทุก ${config.intervalMinutes} นาที`,
        at: Date.now(),
    });
    void pinNextProduct(id);
    const timer = setInterval(() => void pinNextProduct(id), everyMs);
    timer.unref();
    pinTimers.set(id, timer);
}
// Coupons sit in the same column as the products but are a different shape: a discount
// line ("20% off") over a condition ("on orders over ฿300.00") with its own Pin, and no
// stock line — which is exactly what tells them apart from a product card. TikTok shows
// one coupon card at a time, so there is nothing to rotate; pinning it is a single action
// the seller triggers, or the rotation can carry it as one more stop.
function couponScript(action) {
    return `(async () => {
    const mode = ${JSON.stringify(action)}
    const cap = (s, n) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, n)
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const seen = (el) => {
      if (!el.getClientRects || el.getClientRects().length === 0) return false
      const st = window.getComputedStyle(el)
      return st.visibility !== 'hidden' && st.display !== 'none'
    }
    const dismissBlockingDialogs = async () => {
      const ok = /^(ดำเนินการต่อ|จัดการภายหลัง|ต่อไป|ตกลง|continue|got it|ok)$/i
      for (let i = 0; i < 3; i += 1) {
        const button = [...document.querySelectorAll('button, [role="button"]')]
          .find((el) => seen(el) && ok.test(cap(el.textContent, 40)))
        if (!button) break
        button.click()
        await sleep(350)
      }
    }
    await dismissBlockingDialogs()
    const isPin = (el) => /^(pin|unpin|ปัก|เลิกปัก)$/i.test(cap(el.textContent, 20))

    // Up from the Pin button to the smallest box that reads like a coupon: an order
    // threshold, a price, no stock line, and exactly one Pin of its own.
    const couponFor = (button) => {
      let node = button.parentElement
      for (let i = 0; node && node !== document.body && i < 8; i += 1) {
        const t = cap(node.textContent, 300)
        const owned = [...node.querySelectorAll('button, [role="button"]')].filter(isPin).length
        if (owned > 1) return null
        if (/In stock|คงเหลือ|Requested demo/i.test(t)) return null
        if (owned === 1 && /orders over|ขั้นต่ำ|เมื่อซื้อครบ/i.test(t) && /[฿$]/.test(t)) return node
        node = node.parentElement
      }
      return null
    }

    let found = null
    for (const button of [...document.querySelectorAll('button, [role="button"]')]) {
      if (!seen(button) || !isPin(button)) continue
      const card = couponFor(button)
      if (card) {
        found = { card, button }
        break
      }
    }
    if (!found) return { ok: false, reason: 'no-coupon' }

    const text = cap(found.card.textContent, 200)
    const pinned = /^(unpin|เลิกปัก)$/i.test(cap(found.button.textContent, 20))
    if (mode === 'read') return { ok: true, text, pinned }
    if (pinned) return { ok: true, text, pinned: true, already: true }
    if (found.button.disabled || found.button.getAttribute('aria-disabled') === 'true') {
      return { ok: false, reason: 'disabled' }
    }
    found.button.scrollIntoView({ block: 'center' })
    await sleep(120)
    found.button.click()
    await sleep(900)
    return { ok: true, text, pinned: true, already: false }
  })()`;
}
// The LIVE analytics panel, read straight off the console. These are TikTok's own numbers
// for this broadcast, which is what the seller compares against — but they are live totals
// that do not yet account for cancellations, so the dashboard keeps the CSV import as the
// figure of record and shows these as the running total.
function liveStatsScript() {
    return `(() => {
    const cap = (s, n) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, n)
    const seen = (el) => {
      if (!el.getClientRects || el.getClientRects().length === 0) return false
      const st = window.getComputedStyle(el)
      return st.visibility !== 'hidden' && st.display !== 'none'
    }
    const num = (raw) => {
      if (!raw) return null
      const digits = raw.replace(/[^0-9.]/g, '')
      if (!digits) return null
      const value = Number(digits)
      return Number.isFinite(value) ? value : null
    }
    const wanted = [
      { key: 'gmv', match: /attributed gmv|ยอดขาย/i },
      { key: 'itemsSold', match: /attributed items sold|จำนวนที่ขาย/i },
      { key: 'viewers', match: /current viewers|ผู้ชมขณะนี้/i },
      { key: 'productClicks', match: /product clicks/i },
    ]
    const out = { ok: true, gmv: null, itemsSold: null, viewers: null, productClicks: null }
    for (const el of [...document.querySelectorAll('div, span, p, strong')]) {
      if (!seen(el) || el.children.length > 0) continue
      const value = cap(el.textContent, 30)
      if (!value || !/^[฿$]?\\s*[\\d.,]+\\s*%?$/.test(value)) continue
      let node = el.parentElement
      for (let i = 0; node && node !== document.body && i < 4; i += 1) {
        const label = cap(node.textContent, 200).replace(value, '').replace(/[฿$]/g, '').trim()
        if (label && label.length <= 40) {
          const hit = wanted.find((w) => w.match.test(label))
          if (hit && out[hit.key] === null) out[hit.key] = num(value)
          break
        }
        node = node.parentElement
      }
    }
    return out
  })()`;
}
const salesCacheByOwner = new Map();
function activeSalesOwner() {
    try {
        const state = typeof global.__npWebLicenseStatus === 'function' ? global.__npWebLicenseStatus() || loadLicenseState() : loadLicenseState();
        const raw = String(state?.username || state?.displayName || '').trim().toLowerCase();
        return normalizeAccountId(raw || 'local');
    }
    catch {
        return 'local';
    }
}
function salesPath() {
    const owner = activeSalesOwner();
    return node_path_1.default.join(electron_1.app.getPath('userData'), owner === 'local' ? 'sales.json' : `sales-${owner}.json`);
}
function getSales() {
    const owner = activeSalesOwner();
    if (!salesCacheByOwner.has(owner)) {
        try {
            const parsed = JSON.parse((0, node_fs_1.readFileSync)(salesPath(), 'utf8'));
            salesCacheByOwner.set(owner, {
                records: Array.isArray(parsed.records) ? parsed.records : [],
                batches: Array.isArray(parsed.batches) ? parsed.batches : [],
            });
        }
        catch {
            salesCacheByOwner.set(owner, { records: [], batches: [] });
        }
    }
    return salesCacheByOwner.get(owner) ?? { records: [], batches: [] };
}
function writeSales(store) {
    const owner = activeSalesOwner();
    salesCacheByOwner.set(owner, store);
    const filePath = salesPath();
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true });
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
}
// RFC4180-ish reader: handles quoted fields, escaped quotes and CRLF. Delimiter is
// sniffed from the header row because exports ship as comma, semicolon or TSV.
function parseDelimited(text) {
    const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const headerLine = body.slice(0, body.search(/\r?\n/) === -1 ? body.length : body.search(/\r?\n/));
    const counts = [
        { d: ',', n: (headerLine.match(/,/g) ?? []).length },
        { d: '\t', n: (headerLine.match(/\t/g) ?? []).length },
        { d: ';', n: (headerLine.match(/;/g) ?? []).length },
    ].sort((a, b) => b.n - a.n);
    const delimiter = counts[0].n > 0 ? counts[0].d : ',';
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < body.length; i += 1) {
        const char = body[i];
        if (quoted) {
            if (char === '"') {
                if (body[i + 1] === '"') {
                    field += '"';
                    i += 1;
                }
                else {
                    quoted = false;
                }
            }
            else {
                field += char;
            }
            continue;
        }
        if (char === '"') {
            quoted = true;
        }
        else if (char === delimiter) {
            row.push(field);
            field = '';
        }
        else if (char === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        }
        else if (char !== '\r') {
            field += char;
        }
    }
    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((entry) => entry.some((cell) => cell.trim()));
}
// Money cells arrive as "฿1,234.50", "1.234,50", "THB 89.00" — strip everything that is
// not part of the number, then decide which separator is the decimal one.
function parseAmount(raw) {
    const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
    if (!cleaned)
        return null;
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    let normalized = cleaned;
    if (lastComma > lastDot) {
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }
    else {
        normalized = cleaned.replace(/,/g, '');
    }
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
}
function parseTimestamp(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    // "2026-08-23 14:22:45" and ISO parse natively; "23/08/2026 14:22" needs reordering.
    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(trimmed);
    if (dmy) {
        const [, d, m, y, hh = '0', mm = '0', ss = '0'] = dmy;
        const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
        return Number.isNaN(date.getTime()) ? null : date.getTime();
    }
    const parsed = Date.parse(trimmed.replace(' ', 'T'));
    if (!Number.isNaN(parsed))
        return parsed;
    const fallback = Date.parse(trimmed);
    return Number.isNaN(fallback) ? null : fallback;
}
// Header keywords per field, best match first. Matching is case-insensitive substring
// so "SKU Subtotal After Discount" and "ยอดรวมคำสั่งซื้อ" both land.
const SALES_COLUMN_HINTS = {
    orderId: ['order id', 'order no', 'order number', 'orderid', 'หมายเลขคำสั่งซื้อ', 'รหัสคำสั่งซื้อ'],
    amount: [
        'sku subtotal after discount',
        'subtotal after seller discounts',
        'order amount',
        'grand total',
        'total amount',
        'payment amount',
        'ยอดรวมสุทธิ',
        'ยอดชำระ',
        'ยอดรวม',
        'total',
    ],
    time: ['paid time', 'payment time', 'created time', 'order time', 'create time', 'เวลาชำระเงิน', 'เวลาสั่งซื้อ', 'วันที่'],
    status: ['order status', 'order substatus', 'status', 'สถานะ'],
};
function detectColumn(headers, field) {
    const lower = headers.map((header) => header.trim().toLowerCase());
    for (const hint of SALES_COLUMN_HINTS[field]) {
        const exact = lower.indexOf(hint);
        if (exact !== -1)
            return exact;
    }
    for (const hint of SALES_COLUMN_HINTS[field]) {
        const partial = lower.findIndex((header) => header.includes(hint));
        if (partial !== -1)
            return partial;
    }
    return -1;
}
// Cancelled/refunded rows sit in the same export as completed ones. Counting them would
// overstate revenue, which is the exact failure this whole CSV-only approach exists to
// avoid — so they are dropped, and the UI reports how many.
const EXCLUDED_STATUS_HINTS = [
    'cancel', 'refund', 'return', 'unpaid', 'failed', 'closed',
    'ยกเลิก', 'คืนเงิน', 'คืนสินค้า', 'ยังไม่ชำระ', 'ไม่สำเร็จ',
];
function isExcludedStatus(status) {
    const value = status.trim().toLowerCase();
    if (!value)
        return false;
    return EXCLUDED_STATUS_HINTS.some((hint) => value.includes(hint));
}
// Parsed rows wait here between preview and commit so the user can confirm (or fix the
// column mapping) before anything touches the store.
const pendingSalesImports = new Map();
function buildSalesPreview(mapping) {
    const pending = pendingSalesImports.get(activeSalesOwner());
    if (!pending)
        throw new Error('ไม่พบไฟล์ที่กำลังนำเข้า กรุณาเลือกไฟล์ใหม่');
    const warnings = [];
    if (mapping.amount < 0)
        warnings.push('ยังไม่ได้เลือกคอลัมน์ "ยอดเงิน" — กรุณาเลือกเอง');
    if (mapping.time < 0)
        warnings.push('หาคอลัมน์วันเวลาไม่เจอ — กราฟรายวันจะใช้วันที่นำเข้าแทน');
    if (mapping.orderId < 0)
        warnings.push('หาคอลัมน์เลขคำสั่งซื้อไม่เจอ — จะกันข้อมูลซ้ำไม่ได้');
    let total = 0;
    let parsedCount = 0;
    let unparsedAmounts = 0;
    let excluded = 0;
    const sample = [];
    for (const row of pending.rows) {
        const amount = mapping.amount >= 0 ? parseAmount(row[mapping.amount] ?? '') : null;
        if (amount === null) {
            unparsedAmounts += 1;
            continue;
        }
        if (mapping.status >= 0 && isExcludedStatus(row[mapping.status] ?? '')) {
            excluded += 1;
            continue;
        }
        parsedCount += 1;
        total += amount;
        if (sample.length < 5) {
            sample.push({
                orderId: mapping.orderId >= 0 ? (row[mapping.orderId] ?? '').trim() : '',
                amount,
                at: mapping.time >= 0 ? parseTimestamp(row[mapping.time] ?? '') : null,
                status: mapping.status >= 0 ? (row[mapping.status] ?? '').trim() : '',
            });
        }
    }
    if (unparsedAmounts)
        warnings.push(`มี ${unparsedAmounts} แถวที่อ่านยอดเงินไม่ได้ และจะถูกข้าม`);
    if (excluded)
        warnings.push(`ไม่นับ ${excluded} รายการที่ยกเลิก/คืนเงิน/ยังไม่ชำระ`);
    if (mapping.status < 0)
        warnings.push('ไม่ได้เลือกคอลัมน์สถานะ — รายการที่ยกเลิกหรือคืนเงินจะถูกนับรวมด้วย');
    return {
        token: pending.token,
        fileName: pending.fileName,
        headers: pending.headers,
        mapping,
        rowCount: pending.rows.length,
        parsedCount,
        total,
        sample,
        warnings,
    };
}
const libraryCacheByOwner = new Map();
const libraryCacheMtimeByOwner = new Map();
function activeLibraryOwner() {
    try {
        const state = typeof global.__npWebLicenseStatus === 'function' ? global.__npWebLicenseStatus() || loadLicenseState() : loadLicenseState();
        const raw = String(state?.username || state?.displayName || '').trim().toLowerCase();
        return normalizeAccountId(raw || 'local');
    }
    catch {
        return 'local';
    }
}
function libraryPath() {
    const owner = activeLibraryOwner();
    return node_path_1.default.join(electron_1.app.getPath('userData'), owner === 'local' ? 'video-library.json' : `video-library-${owner}.json`);
}
function readLibraryFile(filePath) {
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(filePath, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function getLibrary() {
    const owner = activeLibraryOwner();
    const filePath = libraryPath();
    let diskMtime = 0;
    try {
        diskMtime = (0, node_fs_1.statSync)(filePath).mtimeMs;
    }
    catch { }
    if (!libraryCacheByOwner.has(owner) || libraryCacheMtimeByOwner.get(owner) !== diskMtime) {
        libraryCacheByOwner.set(owner, readLibraryFile(filePath));
        libraryCacheMtimeByOwner.set(owner, diskMtime);
    }
    return libraryCacheByOwner.get(owner) ?? [];
}
function writeLibrary(entries, options = {}) {
    const owner = activeLibraryOwner();
    const filePath = libraryPath();
    const previous = libraryCacheByOwner.get(owner) ?? readLibraryFile(filePath);
    if (!options.allowEmpty && entries.length === 0 && previous.length > 0) {
        console.warn('[library] refused to overwrite non-empty library with an empty list');
        return previous;
    }
    libraryCacheByOwner.set(owner, entries);
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true });
    if (previous.length > 0) {
        try {
            (0, node_fs_1.writeFileSync)(`${filePath}.bak`, JSON.stringify(previous), { encoding: 'utf8', mode: 0o600 });
        }
        catch { }
    }
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(entries), { encoding: 'utf8', mode: 0o600 });
    try {
        libraryCacheMtimeByOwner.set(owner, (0, node_fs_1.statSync)(filePath).mtimeMs);
    }
    catch { }
    return entries;
}
// Return library entries with a freshly-minted media URL so the renderer can preview each
// clip (media tokens are per-run, so they must be re-issued on every list).
function libraryForRenderer() {
    return getLibrary().map((entry) => {
        let size = typeof entry.size === 'number' ? entry.size : 0;
        try {
            size = (0, node_fs_1.statSync)(entry.path).size;
        }
        catch { }
        return { ...entry, size, mediaUrl: mediaUrl(entry.path) };
    });
}
function sanitizeLibraryName(value, fallback) {
    const input = typeof value === 'string' ? value.trim() : '';
    const name = input || fallback || 'วิดีโอ';
    return name.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').slice(0, 120);
}
function addLibraryEntry(filePath, displayName) {
    if (typeof filePath !== 'string' || !(0, node_fs_1.existsSync)(filePath))
        return getLibrary();
    const entries = getLibrary();
    const fallbackName = node_path_1.default.basename(filePath);
    const name = sanitizeLibraryName(displayName, fallbackName);
    let size = 0;
    try {
        size = (0, node_fs_1.statSync)(filePath).size;
    }
    catch { }
    const normalizedName = name.toLowerCase();
    const normalizedFallback = sanitizeLibraryName('', fallbackName).toLowerCase();
    // De-dupe by path and by same seller-facing name + size. A retry/resume must not
    // create a second card for the same clip and burn the customer's video quota.
    const existing = entries.find((entry) => {
        const entryName = sanitizeLibraryName(entry.name, node_path_1.default.basename(entry.path || '')).toLowerCase();
        const entryBase = sanitizeLibraryName('', node_path_1.default.basename(entry.path || '')).toLowerCase();
        const entrySize = typeof entry.size === 'number' ? entry.size : 0;
        return entry.path === filePath || (entrySize === size && (entryName === normalizedName || entryBase === normalizedFallback));
    });
    if (existing) {
        const nextEntries = entries.map((entry) => entry.id === existing.id ? { ...entry, path: entry.path || filePath, name, size: entry.size || size } : entry);
        writeLibrary(nextEntries);
        return nextEntries;
    }
    const next = [...entries, { id: (0, node_crypto_1.randomUUID)(), path: filePath, name, size, addedAt: Date.now() }];
    writeLibrary(next);
    return next;
}
function removeLibraryEntry(id) {
    const next = getLibrary().filter((entry) => entry.id !== id);
    writeLibrary(next, { allowEmpty: true });
    return next;
}
// Build the "check live via LINE" summary: current state of every account that has a
// session, so the user can pull status into their LINE chat on demand.
function liveStatusSummary() {
    const lines = [];
    for (const sessionState of streamSessions.values()) {
        const label = sessionState.liveTitle.trim() || sessionState.accountId;
        const state = sessionState.status.state;
        const icon = state === 'live' ? '🟢' : state === 'starting' ? '🟡' : state === 'error' ? '🔴' : '⚪️';
        const word = state === 'live' ? 'กำลังไลฟ์' : state === 'starting' ? 'กำลังเริ่ม' : state === 'error' ? 'ผิดพลาด' : 'ไม่ได้ไลฟ์';
        if (state !== 'idle')
            lines.push(`${icon} ${label}: ${word}`);
    }
    const liveNow = activeStreamCount();
    const header = `📊 สถานะไลฟ์ (${liveNow}/${maxConcurrentStreams()})\n${nowText()}`;
    return lines.length ? `${header}\n\n${lines.join('\n')}` : `${header}\n\nยังไม่มีบัญชีที่กำลังไลฟ์`;
}
// roomId is null for Stream-Key (manual) lives: TikTok created that room for the user
// outside the app, so the chat engine resolves it from the configured @username instead.
// ── Replying through our own TikTok window ────────────────────────────────────────
//
// tiktok-live-connector can only send chat via Euler Stream's paid relay, which also
// means shipping the seller's TikTok session cookie to a third party. Instead we drive
// the LIVE Manager page the app already signs into: the credentials never leave this
// machine and no per-seat subscription is required. The trade-off is that this depends
// on TikTok's page markup, so every failure path below reports something actionable
// rather than silently dropping the reply.
const LIVE_MANAGER_URL = 'https://shop.tiktok.com/streamer/live/product/dashboard';
// ── Ads Manager scan (phase 1: read-only) ──────────────────────────────────────────
//
// The eventual goal is scaling ad budget for a live broadcast, but that touches real
// money — nothing here clicks, types, or changes a budget yet. This phase only opens
// TikTok Ads Manager and reports the page structure (campaign rows, budget/spend
// tiles, on/off toggles), the same way liveConsoleScanScript did before any Pin
// automation was written. Selectors for an actual "raise budget" action get written
// against this report, not against a guess.
const ADS_MANAGER_URL = 'https://ads.tiktok.com/i18n/perf/campaign';
function defaultAdsLinkConfig() {
    return { mode: 'same', label: '' };
}
function adsLinkConfigPath(accountId) {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'ads-link-config', `${normalizeAccountId(accountId)}.json`);
}
function sanitizeAdsLinkConfig(value) {
    const base = defaultAdsLinkConfig();
    if (!value || typeof value !== 'object')
        return base;
    const input = value;
    const mode = input.mode === 'separate' ? 'separate' : 'same';
    const label = typeof input.label === 'string' ? input.label.trim().slice(0, 60) : '';
    return { mode, label: mode === 'separate' ? label : '' };
}
const adsLinkConfigs = new Map();
function getAdsLinkConfig(accountId) {
    const id = normalizeAccountId(accountId);
    let config = adsLinkConfigs.get(id);
    if (!config) {
        try {
            config = sanitizeAdsLinkConfig(JSON.parse((0, node_fs_1.readFileSync)(adsLinkConfigPath(id), 'utf8')));
        }
        catch {
            config = defaultAdsLinkConfig();
        }
        adsLinkConfigs.set(id, config);
    }
    return config;
}
function saveAdsLinkConfig(accountId, value) {
    const id = normalizeAccountId(accountId);
    const config = sanitizeAdsLinkConfig(value);
    adsLinkConfigs.set(id, config);
    const filePath = adsLinkConfigPath(id);
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true });
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
    closeAdsManagerWindow(id); // switching identity mid-session would mix two logins in one window
    return config;
}
// The key createTikTokWindow's session partition is actually derived from. Keep it
// under the live accountId even in "separate ads" mode; two live accounts must never
// share TikTok/Ads cookies just because an agency label happens to match.
function adsPartitionKey(accountId) {
    const config = getAdsLinkConfig(accountId);
    const id = normalizeAccountId(accountId);
    return config.mode === 'separate' && config.label ? `${id}-ads-${normalizeAccountId(config.label)}` : id;
}
const adsManagerWindows = new Map();
function adsManagerWindow(accountId) {
    const existing = adsManagerWindows.get(accountId);
    if (existing && !existing.isDestroyed())
        return existing;
    const window = createTikTokWindow(adsPartitionKey(accountId), 'ads', false);
    adsManagerWindows.set(accountId, window);
    window.on('closed', () => {
        if (adsManagerWindows.get(accountId) === window)
            adsManagerWindows.delete(accountId);
    });
    void window.loadURL(ADS_MANAGER_URL);
    return window;
}
function closeAdsManagerWindow(accountId) {
    const window = adsManagerWindows.get(accountId);
    adsManagerWindows.delete(accountId);
    if (window && !window.isDestroyed())
        window.destroy();
}
const chatSenderWindows = new Map();
function isLiveManagerUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return /(^|\.)shop\.tiktok\.com$/i.test(url.hostname)
            && /^\/streamer\/live\/product\/dashboard(?:\/|$)/i.test(url.pathname);
    }
    catch {
        return false;
    }
}
function findOpenLiveManagerWindow(accountId) {
    const id = normalizeAccountId(accountId);
    const candidates = electron_1.BrowserWindow.getAllWindows().filter((candidate) => {
        if (candidate.isDestroyed())
            return false;
        const rawCandidateAccount = String(candidate.__npAccountId || '').trim();
        const candidateAccount = rawCandidateAccount ? normalizeAccountId(rawCandidateAccount) : '';
        if (candidateAccount && candidateAccount !== id)
            return false;
        const url = candidate.webContents.getURL();
        return isLiveManagerUrl(url);
    });
    // The remote controller shows the same BrowserWindow that the seller used to pin
    // products. Prefer that live, visible window over the hidden fallback composer so
    // the reader uses the exact page and session the seller can see.
    candidates.sort((left, right) => {
        const score = (candidate) => (candidate.isVisible() ? 100 : 0)
            + (candidate.__npTarget === 'shop' ? 10 : 0)
            + Number(candidate.__npCreatedAt || 0) / 1e13;
        return score(right) - score(left);
    });
    return candidates[0] || null;
}
function chatSenderWindow(accountId) {
    const liveManagerWindow = findOpenLiveManagerWindow(accountId);
    if (liveManagerWindow)
        return liveManagerWindow;
    const existing = chatSenderWindows.get(accountId);
    if (existing && !existing.isDestroyed()) {
        const existingLiveManagerWindow = findOpenLiveManagerWindow(accountId);
        if (existingLiveManagerWindow)
            return existingLiveManagerWindow;
        return existing;
    }
    const window = createTikTokWindow(accountId, 'shop', false);
    // Hidden by default — the seller is already watching LIVE Manager in the browser;
    // this one only exists to host the composer.
    window.hide();
    chatSenderWindows.set(accountId, window);
    window.on('closed', () => {
        if (chatSenderWindows.get(accountId) === window)
            chatSenderWindows.delete(accountId);
    });
    void window.loadURL(LIVE_MANAGER_URL);
    return window;
}
// Open (and finish loading) the hidden LIVE Manager page. Testing showed chat only reads
// reliably while that page is open — without it TikTok answers the webcast WebSocket
// upgrade with a plain page, which surfaced as "Unexpected server response: 200". It also
// means the first reply doesn't have to wait for a cold page load.
async function warmChatSenderWindow(accountId) {
    const window = chatSenderWindow(accountId);
    const waitForLoad = async () => {
        if (!window.webContents.isLoading())
            return;
        await new Promise((resolve) => {
            const done = () => resolve();
            window.webContents.once('did-stop-loading', done);
            // Never block starting the live on this: a slow or stalled load should still let the
            // read connection try, since it may well work without the page on some accounts.
            setTimeout(done, 15000).unref();
        });
    };
    await waitForLoad();
    const currentUrl = window.webContents.getURL();
    if (!isLiveManagerUrl(currentUrl)) {
        const liveManagerWindow = findOpenLiveManagerWindow(accountId);
        if (liveManagerWindow && liveManagerWindow !== window)
            return;
        void window.loadURL(LIVE_MANAGER_URL);
        await new Promise((resolve) => {
            const done = () => resolve();
            window.webContents.once('did-stop-loading', done);
            setTimeout(done, 15000).unref();
        });
    }
    const state = await Promise.race([
        window.webContents.executeJavaScript(`(() => {
    const body = String(document.body?.innerText || document.body?.textContent || '')
    return {
      url: location.href,
      title: document.title,
      userAgent: navigator.userAgent,
      scriptCount: document.scripts ? document.scripts.length : 0,
      reactFallback: /react app doesn't work properly without JavaScript enabled/i.test(body),
      hasLiveConsoleText: /LIVE console|Chat|Product|แชท|สินค้า/i.test(body),
    }
  })()`, true),
        new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 5000);
            timer.unref?.();
        }),
    ]).catch(() => null);
    if (state?.reactFallback || (state && !state.hasLiveConsoleText && state.scriptCount === 0)) {
        if (typeof window.webContents.reloadIgnoringCache === 'function')
            window.webContents.reloadIgnoringCache();
        else if (typeof window.webContents.reload === 'function')
            window.webContents.reload();
        else
            void window.loadURL(LIVE_MANAGER_URL);
        await new Promise((resolve) => {
            const done = () => resolve();
            window.webContents.once('did-stop-loading', done);
            setTimeout(done, 15000).unref();
        });
    }
}
function closeChatSenderWindow(accountId) {
    const window = chatSenderWindows.get(accountId);
    chatSenderWindows.delete(accountId);
    if (window && !window.isDestroyed())
        window.destroy();
}
// Runs inside the LIVE Manager page. Finds the chat composer, types through the native
// value setter (React ignores a plain .value assignment) and submits.
function composerScript(text) {
    return `(async () => {
    const text = ${JSON.stringify(text)}
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    // Composers are wide; send controls are usually small icon buttons, so they need a
    // much lower bar than the text field or the fallback click never finds them.
    const visible = (el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 40 && rect.height > 8
    }
    const clickable = (el) => {
      const rect = el.getBoundingClientRect()
      return rect.width >= 10 && rect.height >= 10
    }
    const hints = ['type something', 'send a message', 'comment', 'พิมพ์', 'ข้อความ', 'แสดงความคิดเห็น']
    const matches = (el) => {
      const label = ((el.getAttribute && (el.getAttribute('placeholder') || el.getAttribute('aria-label'))) || '').toLowerCase()
      return hints.some((hint) => label.includes(hint))
    }
    const candidates = [...document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')].filter(visible)
    const target = candidates.find(matches) || candidates[candidates.length - 1]
    if (!target) return { ok: false, reason: 'no-composer' }
    // LIVE Manager keeps the composer mounted but disabled until the room is actually
    // live, so typing into it would fail in a confusing way.
    if (target.disabled || target.getAttribute('aria-disabled') === 'true') {
      return { ok: false, reason: 'composer-disabled' }
    }
    const held = () => (target.isContentEditable ? target.textContent : target.value).trim()

    if (target.isContentEditable) {
      target.focus()
      document.execCommand('selectAll', false, undefined)
      document.execCommand('insertText', false, text)
    } else {
      // React tracks its own value; a plain assignment gets reverted, so go through the
      // prototype setter and then fire the events React listens for.
      const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      target.focus()
      setter.call(target, text)
      target.dispatchEvent(new Event('input', { bubbles: true }))
      target.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (held() !== text) return { ok: false, reason: 'not-typed' }

    const key = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }
    target.dispatchEvent(new KeyboardEvent('keydown', key))
    target.dispatchEvent(new KeyboardEvent('keypress', key))
    target.dispatchEvent(new KeyboardEvent('keyup', key))
    // Composers usually clear asynchronously, so settle before judging the result.
    await sleep(350)
    if (held() !== text) return { ok: true, reason: '' }

    // Enter did not submit. Look for a send control, but only one that is clearly the
    // send button inside the composer's own container — clicking an arbitrary button on
    // LIVE Manager could trigger something unrelated, which is worse than not replying.
    const scope = target.closest('form') || target.parentElement?.parentElement
    if (!scope) return { ok: false, reason: 'not-sent' }
    const sendWords = ['send', 'submit', 'ส่ง', 'โพสต์', 'post']
    let button = [...scope.querySelectorAll('button, [role="button"]')].find((el) => {
      if (el.disabled || !clickable(el)) return false
      const label = (el.innerText + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.title || '')).toLowerCase()
      return sendWords.some((word) => label.includes(word))
    })
    // LIVE Manager's send control is a bare 16px <svg> with no text, title or aria-label,
    // so nothing above matches it. Fall back to an icon inside the composer's own wrapper
    // — and only when there is exactly one, so we still never click a control we did not
    // positively identify.
    if (!button) {
      const wrapper = target.parentElement
      const icons = wrapper
        ? [...wrapper.querySelectorAll('svg, button, [role="button"]')].filter((el) => {
            const rect = el.getBoundingClientRect()
            return !el.disabled && rect.width >= 8 && rect.height >= 8
          })
        : []
      if (icons.length === 1) button = icons[0].closest('button, [role="button"]') || icons[0].parentElement || icons[0]
    }
    if (!button) return { ok: false, reason: 'no-send-button' }
    button.click()
    await sleep(350)
    return held() !== text ? { ok: true, reason: '' } : { ok: false, reason: 'not-sent' }
  })()`;
}
function sendChatApiScript(text, roomId) {
    return `(async () => {
    const content = ${JSON.stringify(text)}
    let roomId = ${JSON.stringify(roomId ? String(roomId) : '')}
    const cap = (s, n) => String(s || '').slice(0, n)
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name).reverse()
    const findSignedSource = () => {
      for (const raw of resources) {
        try {
          const url = new URL(raw)
          if (
            url.hostname === 'shop.tiktok.com' &&
            url.pathname.includes('/api/v1/streamer_desktop/') &&
            url.searchParams.get('aid') === '253642' &&
            url.searchParams.has('msToken') &&
            url.searchParams.has('X-Bogus') &&
            url.searchParams.has('X-Gnarly')
          ) return url
        } catch {}
      }
      return null
    }
    const findCurrentRoomId = () => {
      if (roomId) return roomId
      for (const raw of resources) {
        try {
          const url = new URL(raw)
          const value = url.searchParams.get('room_id')
          if (value && /streamer_desktop|webcast|insights/.test(url.pathname + url.hostname)) return value
        } catch {}
      }
      const text = document.documentElement.innerHTML
      const match = text.match(/"room_id"\\s*:\\s*"?(\\d{12,})"?/) || text.match(/room_id=(\\d{12,})/)
      return match?.[1] || ''
    }
    const findStreamerKey = () => {
      const sources = []
      try { sources.push(document.documentElement.innerHTML) } catch {}
      try {
        for (let i = 0; i < localStorage.length; i += 1) sources.push(localStorage.getItem(localStorage.key(i)) || '')
      } catch {}
      try {
        for (let i = 0; i < sessionStorage.length; i += 1) sources.push(sessionStorage.getItem(sessionStorage.key(i)) || '')
      } catch {}
      const joined = sources.join('\\n')
      const patterns = [
        /"ec_streamer_key"\\s*:\\s*"([^"]+)"/,
        /ec_streamer_key['"]?\\s*[:=]\\s*['"]([^'"]+)['"]/,
        /streamer_key['"]?\\s*[:=]\\s*['"]([^'"]+)['"]/,
      ]
      for (const re of patterns) {
        const hit = re.exec(joined)
        if (hit?.[1]) return hit[1]
      }
      return ''
    }
    roomId = findCurrentRoomId()
    if (!roomId) return { ok: false, reason: 'no-room-id' }
    const signedSource = findSignedSource()
    if (!signedSource) return { ok: false, reason: 'no-signed-source' }
    const ecStreamerKey = findStreamerKey()
    const body = {
      content,
      meta: { source: 2, app_id: 253642, room_id: roomId, ...(ecStreamerKey ? { ec_streamer_key: ecStreamerKey } : {}) },
      client_start_time_stamp_millisecond: String(Date.now()),
    }
    const url = new URL('/api/v1/streamer_desktop/message/chat', location.origin)
    for (const [key, value] of signedSource.searchParams.entries()) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value)
    }
    const response = await fetch(url.toString(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const raw = await response.text()
    let data = null
    try { data = raw ? JSON.parse(raw) : null } catch {}
    const code = data?.code
    if (!response.ok || (code !== undefined && Number(code) !== 0)) {
      return { ok: false, reason: cap(data?.message || data?.msg || raw || ('HTTP ' + response.status), 200), status: response.status, data }
    }
    return { ok: true, status: response.status, data, roomId, signedSourcePath: signedSource.pathname, hasEcStreamerKey: Boolean(ecStreamerKey) }
  })()`;
}
async function sendChatViaApi(accountId, roomId, text) {
    const result = (await runInLiveConsole(accountId, sendChatApiScript(text, roomId)));
    if (result?.ok)
        return result;
    throw new Error(result?.reason ?? 'chat-api-failed');
}
function liveChatCommentsScript() {
    return `(() => {
    const cap = (s, n) => String(s || '').replace(/\\s+/g, ' ').trim().slice(0, n)
    const visible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return rect.width > 8 && rect.height > 4 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const docs = [document]
    for (const frame of [...document.querySelectorAll('iframe')]) {
      try {
        if (frame.contentDocument) docs.push(frame.contentDocument)
      } catch {}
    }
    const reject = /(Viewer comments will appear|ความคิดเห็นของผู้ชมจะปรากฏ|กิจกรรมของผู้ชมจะปรากฏ|Product related|เกี่ยวข้องกับสินค้า|Type something|Welcome to TikTok|Community Guidelines|Orders placed|All activities|Activity|Suggestion|Fresh ideas|Analytics|Attributed GMV|Current viewers|Avg\. viewing|Product clicks|Tap-through|LIVE console|Product list|No products yet|Add products|Giveaway|Flash sale|Coupon|Billboard|ทั้งหมด|แชท|A\+|A-|All\b|Chat\b|0\\/100|just joined|18\+|Next|Support|Log in|Join now|Pet supplies|LIVE shopping|Home improvement|How do I go LIVE|Cookie policy|Turning TikTok trends)/i
    const overlaps = (a, b) => a.left < b.right && a.right > b.left
    const inSameColumn = (el, panelRect) => {
      const rect = el.getBoundingClientRect()
      return rect.left >= panelRect.left - 12 && rect.right <= panelRect.right + 12 && overlaps(rect, panelRect)
    }
    const looksLikeChatPanel = (el) => {
      const text = cap(el.innerText || el.textContent || '', 1400)
      if (!/(\\bChat\\b|แชท)/i.test(text)) return false
      if (/\\bActivity\\b|All activities|Orders placed|LIVE analytics|Suggestion|การวิเคราะห์ LIVE|กิจกรรม/i.test(text)) return false
      return /(Type something|Product related|All\\b|Host|ผู้จัด|[\u0E00-\u0E7F]{2,})/i.test(text)
    }
    const looksLikeMessage = (text) => {
      const value = cap(text, 220)
      if (!value || value.length < 2 || value.length > 180) return false
      if (reject.test(value)) return false
      if (/^(Host|ผู้จัด|Pinned|LIVE Specials|Unpin|Pin|Publish|Add|Search|Stock|Clicks|Added to cart)$/i.test(value)) return false
      return /[A-Za-z\u0E00-\u0E7F0-9]/.test(value)
    }
    const normalizeLines = (text) => String(text || '')
      .split(/\\n+/)
      .map((line) => cap(line, 180))
      .filter(Boolean)
      .filter((line) => !reject.test(line))
    const comments = []
    const push = (user, text) => {
      user = cap(user || 'ผู้ชม', 60).replace(/\s*Host\s*$/i, '').trim() || 'ผู้ชม'
      text = cap(text, 220)
      if (!looksLikeMessage(text)) return
      const key = user + '|' + text
      if (comments.some((item) => item.key === key)) return
      comments.push({ user, text, key })
    }
    const activityReject = /^(กิจกรรม|Activity|คำสั่งซื้อ|Orders placed|LIVE|All activities|ลากเพื่อปรับขนาด|ยินดีต้อนรับ|Welcome|คำแนะนำ|Suggestion|การวิเคราะห์|Analytics|ทั้งหมด|All)$/i
    const pushActivity = (user, text, type = 'activity') => {
      user = cap(user || 'ผู้ชม', 60)
        .replace(/^(กิจกรรม|Activity|ทั้งหมด|All)\s*/i, '')
        .replace(/\s*(ผู้จัด|Host)\s*$/i, '')
        .trim() || 'ผู้ชม'
      text = cap(text, 220)
      if (!user || activityReject.test(user) || reject.test(user)) return
      if (!text || reject.test(text)) return
      const key = 'activity|' + type + '|' + user + '|' + text
      if (comments.some((item) => item.key === key)) return
      comments.push({ user, text, key, source: 'activity', type })
    }
    const scanDoc = (doc) => {
      const composer = [...doc.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')]
        .filter(visible)
        .find((el) => /type something|comment|message|พิมพ์|ข้อความ/i.test(String(el.getAttribute('placeholder') || el.getAttribute('aria-label') || '')))
      const composerTop = composer ? composer.getBoundingClientRect().top : Number.POSITIVE_INFINITY
      const panelCandidates = []
      if (composer) {
        let panel = composer.closest('form') || composer.parentElement
        for (let i = 0; panel && panel !== doc.body && i < 14; i += 1) {
          if (looksLikeChatPanel(panel)) {
            panelCandidates.push(panel)
            break
          }
          panel = panel.parentElement
        }
      }
      if (!panelCandidates.length) {
        for (const el of [...doc.querySelectorAll('section, main, aside, div')]) {
          if (!visible(el) || panelCandidates.length >= 3) continue
          if (looksLikeChatPanel(el)) {
            panelCandidates.push(el)
          }
        }
      }
      const panels = panelCandidates.length ? panelCandidates.slice(0, 1) : []
      for (const panel of panels) {
        const panelRect = panel.getBoundingClientRect()
        const nodes = [...panel.querySelectorAll('div, li, article, section, p')]
          .filter((el) => visible(el) && inSameColumn(el, panelRect) && el.getBoundingClientRect().top < composerTop - 2)
          .map((el) => ({ el, lines: normalizeLines(el.innerText || el.textContent || '') }))
          .filter((item) => item.lines.length >= 1 && item.lines.join(' ').length <= 260)
          .sort((a, b) => a.lines.join(' ').length - b.lines.join(' ').length)
        for (const item of nodes) {
          const joined = item.lines.join(' ')
          if (comments.some((old) => old.text.includes(joined) || joined.includes(old.text))) continue
          if (item.lines.length >= 2) push(item.lines[0], item.lines.slice(1).join(' '))
          else {
            const text = item.lines[0]
            const prev = item.el.previousElementSibling
            const maybeUser = prev ? cap(prev.innerText || prev.textContent || '', 60) : ''
            push(maybeUser && !reject.test(maybeUser) ? maybeUser : 'ผู้ชม', text)
          }
          if (comments.length >= 20) break
        }
        if (comments.length >= 20) break
      }
    }
    for (const doc of docs) scanDoc(doc)
    const scanBodyFallback = (doc) => {
      const raw = String(doc.body?.innerText || doc.body?.textContent || '')
      const compact = cap(raw, 6000)
      const chatStart = compact.search(/แชท\s+ทั้งหมด|\\bChat\\b\\s+All/i)
      if (chatStart < 0) return
      let segment = compact.slice(chatStart)
      const stopAt = segment.search(/การวิเคราะห์ LIVE|LIVE analytics|Activity|All activities|Orders placed|Welcome to TikTok|กิจกรรม|คำแนะนำ|Suggestion|0\\/100/i)
      if (stopAt > 0) segment = segment.slice(0, stopAt)
      segment = segment
        .replace(/^(แชท|Chat)\s*/i, '')
        .replace(/^(ทั้งหมด|All)\s*/i, '')
        .replace(/^(เกี่ยวข้องกับสินค้า|Product related)\s*/i, '')
        .trim()
      if (!segment) return
      const markers = [...segment.matchAll(/(.{2,40}?)(?:\s+(ผู้จัด|Host))?\s+([^]+?)(?=(?:\s+.{2,40}?\s+(?:ผู้จัด|Host)\s+)|$)/gi)]
      if (markers.length) {
        for (const match of markers.slice(-12)) {
          const user = cap(match[1], 60)
          const text = cap(match[3], 220)
          if (/^(แชท|ทั้งหมด|เกี่ยวข้องกับสินค้า|ผู้จัด|Host)$/i.test(user)) continue
          push(user, text)
        }
        return
      }
      const parts = segment.split(/\s{2,}|(?<=ค่ะ|ครับ|นะคะ|จ้า|จ้าา|เลยค่ะ)\s+/).map((part) => cap(part, 180)).filter(Boolean)
      for (const part of parts.slice(-6)) push('ผู้ชม', part)
    }
    const scanActivityFallback = (doc) => {
      const raw = String(doc.body?.innerText || doc.body?.textContent || '')
      const compact = cap(raw, 9000)
      const activityStart = compact.search(/กิจกรรม|\\bActivity\\b/i)
      if (activityStart < 0) return
      let segment = compact.slice(activityStart)
      const stopAt = segment.search(/คำแนะนำ|Suggestion|การวิเคราะห์ LIVE|LIVE analytics|คะแนนคุณภาพ|Account status|Product list/i)
      if (stopAt > 0) segment = segment.slice(0, stopAt)
      segment = segment
        .replace(/^(กิจกรรม|Activity)\s*/i, '')
        .replace(/คำสั่งซื้อที่ทำรายการระหว่าง LIVE จะปรากฏที่นี่/gi, ' ')
        .replace(/Orders placed during LIVE will appear here/gi, ' ')
        .replace(/ลากเพื่อปรับขนาด/gi, ' ')
        .replace(/Drag to resize/gi, ' ')
        .replace(/ยินดีต้อนรับสู่?/gi, ' ')
        .replace(/Welcome to TikTok Shop/gi, ' ')
        .replace(/\\s+/g, ' ')
        .trim()
      if (!segment) return
      const eventRe = /([A-Za-z0-9_.@\\-\u0E00-\u0E7F ]{2,64}?)\\s+(เข้าร่วมแล้ว|joined|กำลังดูสินค้า(?:รายการนี้)?(?:\\s+หมายเลข\\s*\\d+)?|สั่งซื้อ(?:สินค้า)?(?:\\s+[^\\s]+){0,3}|เพิ่มสินค้า(?:ลงรถเข็น)?(?:\\s+[^\\s]+){0,3})(?=\\s+[A-Za-z0-9_.@\\-\u0E00-\u0E7F ]{1,64}\\s+(?:เข้าร่วมแล้ว|joined|กำลังดูสินค้า|สั่งซื้อ|เพิ่มสินค้า)|$)/gi
      for (const match of segment.matchAll(eventRe)) {
        const user = cap(match[1], 60)
        const text = cap(match[2], 180)
        const type = /เข้าร่วมแล้ว|joined/i.test(text) ? 'join' : 'activity'
        pushActivity(user, text, type)
      }
    }
    if (!comments.length) {
      for (const doc of docs) scanBodyFallback(doc)
    }
    if (!comments.length) {
      for (const doc of docs) scanActivityFallback(doc)
    }
    const speakerNames = new Set(comments.map((item) => cap(String(item.user || '').replace(/\s*(ผู้จัด|Host)\s*$/i, ''), 60)).filter(Boolean))
    const cleanComments = comments.filter((item) => {
      const user = cap(item.user, 60)
      const text = cap(item.text, 220)
      if (/^(ผู้ชม|viewer)$/i.test(user) && speakerNames.has(text)) return false
      return true
    })
    if (cleanComments.length) return { ok: true, comments: cleanComments.slice(-12) }
    return { ok: true, comments: [] }
  })()`;
}
function webcastFetchScript(state) {
    return `(async () => {
    const state = ${JSON.stringify(state || {})}
    let expectedRoomId = String(state.roomId || '')
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name)
    if (!expectedRoomId) {
      for (const raw of resources.slice().reverse()) {
        try {
          const url = new URL(raw)
          const value = url.searchParams.get('room_id')
          if (value && /streamer_desktop|insights/.test(url.pathname)) {
            expectedRoomId = value
            break
          }
        } catch {}
      }
    }
    const urls = resources.filter((url) => url.includes('/webcast/im/fetch/'))
    const newestFirst = urls.slice().reverse()
    let source = expectedRoomId
      ? newestFirst.find((item) => {
          try { return new URL(item).searchParams.get('room_id') === expectedRoomId } catch { return false }
        })
      : ''
    source ||= newestFirst[0] || urls[0] || ''
    if (!source && !expectedRoomId) return { ok: false, reason: 'no-webcast-fetch-url' }
    if (!source) {
      source = 'https://webcast.tiktok.com/webcast/im/fetch/?version_code=180800&device_platform=web&cookie_enabled=true&screen_width=' +
        encodeURIComponent(String(screen.width || 1920)) +
        '&screen_height=' + encodeURIComponent(String(screen.height || 1080)) +
        '&browser_language=' + encodeURIComponent(navigator.language || 'en-US') +
        '&browser_platform=' + encodeURIComponent(navigator.platform || 'Win32') +
        '&browser_name=Mozilla&browser_version=' + encodeURIComponent(navigator.userAgent || '') +
        '&browser_online=true&tz_name=' + encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok') +
        '&aid=253642&app_language=en&live_id=12&app_name=i18n_ecom_alliance&version_code=260000&identity=anchor&history_comment_count=100&ws_direct=1&wss_version=2&fetch_rule=1&last_rtt=0&sup_ws_ds_opt=1&resp_content_type=protobuf&did_rule=3&webcast_language=en'
    }
    const url = new URL(source)
    if (expectedRoomId) url.searchParams.set('room_id', expectedRoomId)
    url.searchParams.set('history_comment_count', '100')
    url.searchParams.set('fetch_rule', '1')
    url.searchParams.set('resp_content_type', 'protobuf')
    if (state.cursor) url.searchParams.set('cursor', state.cursor)
    else url.searchParams.delete('cursor')
    if (state.internalExt) url.searchParams.set('internal_ext', state.internalExt)
    else url.searchParams.delete('internal_ext')
    if (!state.cursor) url.searchParams.delete('history_comment_cursor')
    const started = performance.now()
    const response = await fetch(url.toString(), { credentials: 'include' })
    const buffer = new Uint8Array(await response.arrayBuffer())
    let binary = ''
    for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i])
    return { ok: true, status: response.status, rtt: performance.now() - started, roomId: url.searchParams.get('room_id') || '', url: url.toString(), body: btoa(binary) }
  })()`;
}
async function webcastFetchDirect(accountId, state) {
    const id = normalizeAccountId(accountId);
    const roomId = state?.roomId ? String(state.roomId) : await resolveActiveRoomId(id, '');
    if (!roomId)
        return { ok: false, reason: 'no-room-id' };
    const tikTokSession = electron_1.session.fromPartition(tikTokPartition(id), { cache: true });
    const url = new URL('https://webcast.tiktok.com/webcast/im/fetch/');
    url.searchParams.set('version_code', '180800');
    url.searchParams.set('device_platform', 'web');
    url.searchParams.set('cookie_enabled', 'true');
    url.searchParams.set('screen_width', '1920');
    url.searchParams.set('screen_height', '1080');
    url.searchParams.set('browser_language', 'en-US');
    url.searchParams.set('browser_platform', 'Win32');
    url.searchParams.set('browser_name', 'Mozilla');
    url.searchParams.set('browser_version', chromeLikeUserAgent(electron_1.app.userAgentFallback || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'));
    url.searchParams.set('browser_online', 'true');
    url.searchParams.set('tz_name', 'Asia/Bangkok');
    url.searchParams.set('aid', '253642');
    url.searchParams.set('app_language', 'en');
    url.searchParams.set('live_id', '12');
    url.searchParams.set('app_name', 'i18n_ecom_alliance');
    url.searchParams.set('version_code', '260000');
    url.searchParams.set('identity', 'anchor');
    url.searchParams.set('room_id', roomId);
    url.searchParams.set('history_comment_count', '100');
    url.searchParams.set('ws_direct', '1');
    url.searchParams.set('wss_version', '2');
    url.searchParams.set('fetch_rule', '1');
    url.searchParams.set('last_rtt', '0');
    url.searchParams.set('sup_ws_ds_opt', '1');
    url.searchParams.set('resp_content_type', 'protobuf');
    url.searchParams.set('did_rule', '3');
    url.searchParams.set('webcast_language', 'en');
    if (state?.cursor)
        url.searchParams.set('cursor', String(state.cursor));
    if (state?.internalExt)
        url.searchParams.set('internal_ext', String(state.internalExt));
    const cookie = await tikTokCookieHeader(tikTokSession);
    const started = Date.now();
    const { status, buffer } = await new Promise((resolve, reject) => {
        const request = electron_1.net.request({ method: 'GET', url: url.toString(), session: tikTokSession });
        const chunks = [];
        let settled = false;
        const timer = setTimeout(() => {
            try {
                request.abort();
            }
            catch {
                // Best effort.
            }
            if (!settled) {
                settled = true;
                reject(new Error('webcast-fetch-timeout'));
            }
        }, 10000);
        request.setHeader('Accept', '*/*');
        request.setHeader('Origin', 'https://www.tiktok.com');
        request.setHeader('Referer', 'https://www.tiktok.com/');
        if (cookie)
            request.setHeader('Cookie', cookie);
        request.on('response', (response) => {
            response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            response.on('end', () => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                resolve({ status: response.statusCode ?? 0, buffer: Buffer.concat(chunks) });
            });
        });
        request.on('error', (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        });
        request.end();
    });
    return { ok: status >= 200 && status < 300, status, rtt: Date.now() - started, roomId, url: url.toString(), body: buffer.toString('base64') };
}
const webcastChatPollTimers = new Map();
const webcastChatState = new Map();
const webcastChatSeen = new Map();
function cleanLiveChatText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}
function textFromCommonText(value) {
    if (!value || typeof value !== 'object')
        return '';
    const direct = cleanLiveChatText(value.defaultPattern || value.text || value.content || value.key);
    if (direct)
        return direct;
    const pieces = Array.isArray(value.pieces) ? value.pieces : [];
    return pieces
        .map((piece) => cleanLiveChatText(piece?.stringValue || piece?.text || piece?.value || piece?.userValue?.user?.nickname || ''))
        .filter(Boolean)
        .join(' ')
        .trim();
}
function extractWebcastText(decoded, type) {
    const direct = [
        decoded?.content,
        decoded?.comment,
        decoded?.text,
        decoded?.displayText,
        decoded?.extra?.content,
        decoded?.extra?.text,
        decoded?.common?.displayText,
        decoded?.common?.describe,
        decoded?.common?.description,
        decoded?.publicAreaMessageCommon?.dynamicDisplayText,
        decoded?.publicAreaCommon?.dynamicDisplayText,
        decoded?.anchorDisplayText,
    ];
    if (type === 'WebcastMemberMessage') {
        direct.push(decoded?.actionDescription, decoded?.popStr);
    }
    for (const value of direct) {
        const text = typeof value === 'object' ? textFromCommonText(value) : cleanLiveChatText(value);
        if (text)
            return text;
    }
    return '';
}
function webcastUserName(decoded) {
    const user = decoded?.user || decoded?.userInfo || decoded?.operator || decoded?.extra?.user || {};
    return cleanLiveChatText(user.nickname || user.displayId || user.uniqueId || user.id || decoded?.userId || 'ผู้ชม') || 'ผู้ชม';
}
function webcastUserId(decoded) {
    const user = decoded?.user || decoded?.userInfo || decoded?.operator || decoded?.extra?.user || {};
    return cleanLiveChatText(user.id || user.uniqueId || user.displayId || user.nickname || decoded?.userId || 'webcast-viewer') || 'webcast-viewer';
}
function webcastUserRole(decoded) {
    const isHost = Boolean(decoded?.publicAreaMessageCommon?.isAnchorMarked
        || decoded?.publicAreaCommon?.isAnchorMarked
        || decoded?.user?.isAnchor
        || decoded?.user?.isHost
        || decoded?.userIdentity?.isHost);
    return isHost ? 'Host' : '';
}
function decodeWebcastChatFetch(result) {
    if (!result?.ok || !result.body)
        return { ok: false, reason: result?.reason ?? 'webcast-fetch-failed', comments: [] };
    const response = tiktok_live_connector_1.ProtoMessageFetchResult.decode(Buffer.from(result.body, 'base64'));
    const comments = [];
    for (const item of response.messages ?? []) {
        const type = item.type || item.method || item.messageType || '';
        const payload = item.payload || item.binary || item.message || item.data;
        if (!payload || !['WebcastChatMessage', 'WebcastRoomMessage', 'WebcastRoomNotifyMessage', 'WebcastMemberMessage'].includes(type))
            continue;
        try {
            const decoded = (0, tiktok_live_connector_1.deserializeMessage)(type, payload);
            const user = webcastUserName(decoded);
            const userId = webcastUserId(decoded);
            const text = extractWebcastText(decoded, type);
            if (!text || text === user)
                continue;
            comments.push({
                user,
                userId,
                text,
                role: webcastUserRole(decoded),
                key: String(decoded.msgId || decoded.common?.msgId || `${userId}|${text}`),
            });
        }
        catch {
            // Ignore unknown chat payloads; TikTok occasionally ships fields ahead of the decoder.
        }
    }
    return {
        ok: true,
        cursor: response.cursor || '',
        internalExt: response.internalExt || '',
        comments,
    };
}
function stopWebcastChatPoller(accountId) {
    const id = normalizeAccountId(accountId);
    const timer = webcastChatPollTimers.get(id);
    if (timer)
        clearInterval(timer);
    webcastChatPollTimers.delete(id);
    webcastChatState.delete(id);
    webcastChatSeen.delete(id);
    liveChatEventSeen.delete(id);
}
function startWebcastChatPoller(accountId, roomId = null) {
    const id = normalizeAccountId(accountId);
    if (webcastChatPollTimers.has(id))
        return;
    webcastChatState.set(id, { roomId: roomId ? String(roomId) : '' });
    webcastChatSeen.set(id, new Set());
    const tick = async () => {
        try {
            const state = webcastChatState.get(id) ?? {};
            let raw = null;
            try {
                raw = (await runInLiveConsole(id, webcastFetchScript(state), { allowWhileLive: true }));
            }
            catch {
                raw = null;
            }
            if (!raw?.ok) {
                raw = await webcastFetchDirect(id, state).catch((error) => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }));
            }
            const decoded = decodeWebcastChatFetch(raw);
            if (!decoded.ok)
                return;
            webcastChatState.set(id, { roomId: state.roomId || (raw?.roomId ? String(raw.roomId) : ''), cursor: decoded.cursor || state.cursor || '', internalExt: decoded.internalExt || state.internalExt || '' });
            const seen = webcastChatSeen.get(id) ?? new Set();
            webcastChatSeen.set(id, seen);
            for (const comment of decoded.comments) {
                const key = String(comment.key || `${comment.userId}|${comment.text}`);
                if (seen.has(key))
                    continue;
                seen.add(key);
                if (seen.size > 500) {
                    const first = seen.values().next().value;
                    if (first)
                        seen.delete(first);
                }
                emitLiveChatComment(id, comment);
                void (async () => {
                    await (0, chat_engine_1.feedChatComment)(id, comment);
                })();
            }
        }
        catch {
            // Browser webcast polling is a fallback; the visible chat log handles real send failures.
        }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1500);
    timer.unref();
    webcastChatPollTimers.set(id, timer);
}
const domChatPollTimers = new Map();
const domChatSeen = new Map();
function stopDomChatPoller(accountId) {
    const id = normalizeAccountId(accountId);
    const timer = domChatPollTimers.get(id);
    if (timer)
        clearInterval(timer);
    domChatPollTimers.delete(id);
    domChatSeen.delete(id);
    liveChatEventSeen.delete(id);
}
function startDomChatPoller(accountId) {
    const id = normalizeAccountId(accountId);
    if (domChatPollTimers.has(id))
        return;
    domChatSeen.set(id, new Set());
    const tick = async () => {
        try {
            const result = (await runInLiveConsole(id, liveChatCommentsScript(), { allowWhileLive: true }));
            if (!result?.ok)
                return;
            const seen = domChatSeen.get(id) ?? new Set();
            domChatSeen.set(id, seen);
            for (const comment of Array.isArray(result.comments) ? result.comments : []) {
                const key = String(comment.key || `${comment.user}|${comment.text}`);
                if (!comment.text || seen.has(key))
                    continue;
                seen.add(key);
                if (seen.size > 200) {
                    const first = seen.values().next().value;
                    if (first)
                        seen.delete(first);
                }
                const liveComment = {
                    user: comment.user,
                    userId: key,
                    text: comment.text,
                    key,
                    source: comment.source,
                    type: comment.type,
                };
                emitLiveChatComment(id, liveComment);
                if (comment.source !== 'activity' && comment.type !== 'join') {
                    void (async () => {
                        await (0, chat_engine_1.feedChatComment)(id, liveComment);
                    })();
                }
            }
        }
        catch {
            // DOM fallback is best-effort; the normal connector/retry log remains the visible status.
        }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1500);
    timer.unref();
    domChatPollTimers.set(id, timer);
}
// Read-only reconnaissance of the LIVE console page. Runs in the hidden LIVE Manager
// window we already keep open during a broadcast. It NEVER clicks, types, submits, or
// mutates anything — TikTok's own controls are the seller's to press, and a probe that
// could fire one by accident during a live broadcast is not worth the convenience.
//
// The point is to learn the page's real structure (what the Pin controls are called, how
// the analytics tiles are labelled, how a product card is put together) before writing
// code that depends on any of it. Guessing selectors from a screenshot is how the chat
// composer ended up nearly clicking Mute.
function liveConsoleScanScript() {
    return `(() => {
    const cap = (s, n) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, n)
    // "Is this actually rendered", not "is it big". Requiring a positive width filtered out
    // legitimately visible elements whose measured width is 0 (a zero-width containing
    // block still lays text out and still gets a client rect), which silently emptied the
    // whole report. getClientRects covers display:none; visibility is checked separately
    // because a hidden element still has rects.
    const seen = (el) => {
      if (!el.getClientRects || el.getClientRects().length === 0) return false
      const style = window.getComputedStyle(el)
      return style.visibility !== 'hidden' && style.display !== 'none'
    }
    // A short, human-readable path so a selector can be written against it later.
    const where = (el) => {
      const parts = []
      let node = el
      for (let i = 0; node && i < 4; i += 1) {
        let step = node.tagName ? node.tagName.toLowerCase() : '?'
        const id = node.getAttribute && node.getAttribute('id')
        const cls = node.getAttribute && node.getAttribute('class')
        if (id) step += '#' + cap(id, 40)
        else if (cls) step += '.' + cap(String(cls).split(' ').filter(Boolean).slice(0, 2).join('.'), 60)
        parts.unshift(step)
        node = node.parentElement
      }
      return parts.join(' > ')
    }
    // Nearest ancestor big enough to be "the card this control belongs to".
    // The smallest ancestor that says more than the button itself. The bar was 40 chars,
    // which a short coupon card ("15% off / on orders over ฿300.00 / Pin") never clears —
    // the walk then ran all the way to <body> and reported the whole page as context.
    const card = (el) => {
      let node = el.parentElement
      for (let i = 0; node && node !== document.body && i < 6; i += 1) {
        const t = cap(node.textContent, 400)
        if (t.length >= 12) return t
        node = node.parentElement
      }
      return cap(el.textContent, 200)
    }

    const clickable = [...document.querySelectorAll('button, [role="button"], a')].filter(seen)

    // 1) Every Pin-ish control, with the card it sits in so the three kinds (coupon,
    //    whole product list, single product) can be told apart.
    const pins = clickable
      .filter((el) => /\\bpin\\b|ปัก/i.test(cap(el.textContent, 60) + ' ' + ((el.getAttribute('aria-label') || ''))))
      .slice(0, 25)
      .map((el) => ({
        label: cap(el.textContent, 60),
        aria: cap(el.getAttribute('aria-label'), 60),
        disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
        context: card(el),
        path: where(el),
      }))

    // 2) Anything that looks like a metric tile: a short label sitting next to a number or
    //    a baht amount. Kept deliberately loose because the real labels are unknown.
    const metrics = []
    for (const el of [...document.querySelectorAll('div, span, p, strong, h1, h2, h3, h4')]) {
      if (!seen(el) || el.children.length > 0) continue
      const value = cap(el.textContent, 30)
      if (!value || !/^[฿$]?\\s*[\\d.,]+\\s*[%KMkm]?$/.test(value)) continue
      // Walk up for the label instead of reading only the immediate parent. The first real
      // scan missed Attributed GMV entirely because TikTok splits the amount across spans
      // ("฿" in one, "0" in the next): the sibling text was then just the currency symbol,
      // which the old price guard threw away. An ancestor two or three levels up still
      // carries the tile's actual name.
      let label = ''
      let node = el.parentElement
      for (let i = 0; node && node !== document.body && i < 4; i += 1) {
        // Strip the currency symbol the split-span layout leaves behind, so the label reads
        // "Attributed GMV" rather than "Attributed GMV฿".
        const rest = cap(node.textContent, 200).replace(value, '').replace(/[฿$]/g, '').trim()
        // Real words, and short enough to be a tile name rather than a whole card.
        if (/[A-Za-z\\u0E00-\\u0E7F]{2,}/.test(rest) && rest.length <= 40) {
          label = rest
          break
        }
        node = node.parentElement
      }
      if (!label) continue
      metrics.push({ label, value, path: where(el) })
      if (metrics.length >= 60) break
    }

    // 3) Product rows: a card that has both a price and its own Pin control.
    const products = []
    for (const el of [...document.querySelectorAll('div, li')]) {
      if (!seen(el) || products.length >= 15) continue
      const text = cap(el.textContent, 300)
      // Currency symbol OR a plain price-looking number: the baht sign is the obvious
      // marker but it is one glyph away from breaking on any encoding surprise.
      if (!/[฿$]|THB|\\d[\\d,]*\\.\\d{2}/.test(text)) continue
      const ownPins = [...el.querySelectorAll('button, [role="button"]')].filter((b) =>
        /\\bpin\\b|ปัก/i.test(cap(b.textContent, 40)),
      )
      if (ownPins.length !== 1) continue
      // Only the innermost such card — otherwise every ancestor matches too.
      if (el.querySelector('div, li') && [...el.querySelectorAll('div, li')].some((c) =>
        /[฿$]|THB|\\d[\\d,]*\\.\\d{2}/.test(cap(c.textContent, 300)) &&
        [...c.querySelectorAll('button, [role="button"]')].filter((b) => /\\bpin\\b|ปัก/i.test(cap(b.textContent, 40))).length === 1
      )) continue
      products.push({ text, path: where(el) })
    }

    // Where this page can go, and what it says. The first scan came back from
    // business.tiktokshop.com/us/creator/live with 23 clickable elements and a promo
    // carousel — an entry page, not the console — and there was no way to tell from the
    // report how to reach the real one. These two fields answer that.
    const links = [...document.querySelectorAll('a[href]')]
      .filter(seen)
      .map((a) => ({ text: cap(a.textContent, 50), href: cap(a.getAttribute('href'), 120) }))
      .filter((l) => l.text)
      .slice(0, 40)
    const sample = cap(document.body ? document.body.innerText : '', 4000)

    return {
      ok: true,
      url: location.href,
      title: cap(document.title, 120),
      links,
      sample,
      liveish: /live/i.test(document.title) || Boolean(document.querySelector('[class*="live" i]')),
      counts: { clickable: clickable.length, pins: pins.length, metrics: metrics.length, products: products.length },
      pins,
      metrics,
      products,
    }
  })()`;
}
// Read-only reconnaissance of TikTok Ads Manager, same discipline as
// liveConsoleScanScript above: never click, type, or submit — a probe that could fire
// a real control by accident is not worth it when the control moves ad spend. The goal
// is only to learn how campaign rows, budget/spend figures, and on/off toggles are
// actually marked up before any "raise budget" action gets written.
function adsManagerScanScript() {
    return `(() => {
    const cap = (s, n) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, n)

    // querySelectorAll never pierces a shadow boundary — a component that renders its
    // real <input> inside an open shadow root (used for style isolation on some of
    // TikTok's newer ad-creation widgets) is otherwise invisible to every pass below.
    // This walks every element, including elements found inside already-descended
    // shadow roots, so a control hidden that way still turns up. A CLOSED shadow root
    // cannot be read by any script, including this one — that is a real dead end, not
    // a bug here, and shows up as the control simply never appearing in the report.
    function deepQueryAll(root, selector) {
      let out = []
      try { out = out.concat([...root.querySelectorAll(selector)]) } catch (e) {}
      let all = []
      try { all = [...root.querySelectorAll('*')] } catch (e) {}
      for (const el of all) {
        if (el.shadowRoot) out = out.concat(deepQueryAll(el.shadowRoot, selector))
      }
      return out
    }

    // TikTok's newer ad-creation flows (e.g. GMV Max) might embed the actual form as a
    // same-origin iframe rather than rendering it into the top document — the first
    // scan of the Create-campaign page found the campaign-name/schedule fields but
    // neither ROI target nor daily budget, which is what a same-origin iframe boundary
    // looks like from here (a second scan then ruled iframes out entirely, pointing at
    // shadow DOM instead — kept anyway since either could recur on a different page).
    // Every pass below runs once per accessible document (top + each same-origin
    // iframe) so nothing behind a frame boundary goes unreported; a cross-origin
    // iframe is listed but can't be read into, same as a browser would refuse it.
    function scanDoc(doc, frameLabel) {
      const seen = (el) => {
        if (!el.getClientRects || el.getClientRects().length === 0) return false
        const style = (el.ownerDocument.defaultView || window).getComputedStyle(el)
        return style.visibility !== 'hidden' && style.display !== 'none'
      }
      const where = (el) => {
        const parts = []
        let node = el
        for (let i = 0; node && i < 4; i += 1) {
          let step = node.tagName ? node.tagName.toLowerCase() : '?'
          const id = node.getAttribute && node.getAttribute('id')
          const cls = node.getAttribute && node.getAttribute('class')
          if (id) step += '#' + cap(id, 40)
          else if (cls) step += '.' + cap(String(cls).split(' ').filter(Boolean).slice(0, 2).join('.'), 60)
          parts.unshift(step)
          node = node.parentElement
        }
        return frameLabel + ' :: ' + parts.join(' > ')
      }
      const card = (el) => {
        let node = el.parentElement
        for (let i = 0; node && node !== doc.body && i < 6; i += 1) {
          const t = cap(node.textContent, 400)
          if (t.length >= 12) return t
          node = node.parentElement
        }
        return cap(el.textContent, 200)
      }

      // Ads Manager shows amounts as "$12.34", "THB 1,234.00", "฿0.00" — a currency
      // code or symbol is not guaranteed to sit right next to the digits, so both are
      // optional.
      const moneyish = (s) => /[฿$€£]|\\bTHB\\b|\\bUSD\\b|\\d[\\d,]*\\.\\d{2}/.test(s)

      const clickable = deepQueryAll(doc, 'button, [role="button"], a').filter(seen)

      // 1) On/off controls — a campaign's live/paused switch is a toggle, not a
      //    labelled button, so this looks for the control shape rather than any text.
      const toggles = deepQueryAll(doc, '[role="switch"], input[type="checkbox"], [class*="switch" i], [class*="toggle" i]')
        .filter(seen)
        .slice(0, 30)
        .map((el) => ({
          checked: Boolean(el.checked) || el.getAttribute('aria-checked') === 'true',
          disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
          context: card(el),
          path: where(el),
        }))

      // 2) Metric / budget / spend tiles: a short label next to a number, percentage,
      //    or money amount. Loose on purpose — the real labels are unknown until this
      //    runs.
      const metrics = []
      for (const el of [...doc.querySelectorAll('div, span, p, strong, h1, h2, h3, h4, td')]) {
        if (!seen(el) || el.children.length > 0) continue
        const value = cap(el.textContent, 30)
        if (!value || !/^[฿$€£]?\\s*[\\d.,]+\\s*[%KMkm]?$/.test(value)) continue
        let label = ''
        let node = el.parentElement
        for (let i = 0; node && node !== doc.body && i < 4; i += 1) {
          const rest = cap(node.textContent, 200).replace(value, '').replace(/[฿$€£]/g, '').trim()
          if (/[A-Za-z\\u0E00-\\u0E7F]{2,}/.test(rest) && rest.length <= 40) {
            label = rest
            break
          }
          node = node.parentElement
        }
        if (!label) continue
        metrics.push({ label, value, path: where(el) })
        if (metrics.length >= 60) break
      }

      // 3) Editable fields — the ROI target / daily budget inputs on the campaign
      //    create/edit form are plain <input>s, not tiles, so they need their own
      //    pass. A visible sibling/ancestor "helper" line (e.g. "Enter a target ROI
      //    between 0.1 to 100") is captured too, since these fields render without a
      //    real placeholder and the surrounding text is the only way to identify them
      //    from the report.
      const fields = []
      for (const el of deepQueryAll(doc, 'input, textarea')) {
        if (!seen(el) || fields.length >= 40) continue
        const type = (el.getAttribute('type') || 'text').toLowerCase()
        if (['checkbox', 'radio', 'hidden', 'submit', 'button'].includes(type)) continue
        let label = ''
        let node = el.parentElement
        for (let i = 0; node && node !== doc.body && i < 5; i += 1) {
          const heading = node.querySelector('h1, h2, h3, h4, label')
          const text = cap(heading ? heading.textContent : '', 60)
          if (text) { label = text; break }
          node = node.parentElement
        }
        const nearby = cap(
          (el.closest('div,section,form') || el.parentElement || el).textContent,
          160,
        )
        fields.push({
          type,
          label,
          nearby,
          value: cap(el.value, 60),
          placeholder: cap(el.getAttribute('placeholder'), 60),
          min: el.getAttribute('min'),
          max: el.getAttribute('max'),
          step: el.getAttribute('step'),
          disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
          path: where(el),
        })
      }

      // 4) "Set end time" / promotion-day style plain checkboxes — the generic toggle
      //    pass above only looks at role="switch" and switch/toggle-classed elements,
      //    so a vanilla checkbox with its own label needs a separate, label-aware pass.
      const checkboxes = deepQueryAll(doc, 'input[type="checkbox"]')
        .filter(seen)
        .slice(0, 20)
        .map((el) => ({
          checked: Boolean(el.checked),
          disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
          context: card(el),
          path: where(el),
        }))

      // 4b) Targeted probe: if the standard field pass above still didn't turn up a
      //    control whose section heading is exactly "LIVE ROI target" / "Daily
      //    budget" (or similar), find that heading by its own text — deep through
      //    shadow roots — and dump a bounded raw-HTML snapshot of the container around
      //    it plus every interactive-looking descendant found inside (any tag, not
      //    just <input>). This exists specifically to see what markup is really there
      //    instead of guessing again when the generic passes come up empty.
      const probeLabels = ['LIVE ROI target', 'Daily budget', 'ROI', 'budget']
      const probes = []
      const allEls = deepQueryAll(doc, '*')
      for (const label of probeLabels) {
        const re = new RegExp(label, 'i')
        const match = allEls.find((el) => {
          const ownText = [...el.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent)
            .join('')
          return cap(ownText, 60) && re.test(cap(ownText, 60)) && cap(ownText, 60).length < 40
        })
        if (!match) { probes.push({ label, found: false }); continue }
        let container = match
        for (let i = 0; i < 4 && container.parentElement; i += 1) container = container.parentElement
        const interactive = deepQueryAll(container, 'input, textarea, [contenteditable], [role], [tabindex]')
          .filter(seen)
          .slice(0, 15)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type') || '',
            role: el.getAttribute('role') || '',
            contenteditable: el.getAttribute('contenteditable') || '',
            value: cap(el.value || el.textContent, 40),
            path: where(el),
          }))
        probes.push({
          label,
          found: true,
          matchPath: where(match),
          containerHtml: cap(container.outerHTML, 1200),
          interactive,
        })
      }

      // 4c) Semantic section containers — the ROI target and Daily budget inputs both
      //    render through the identical shared <x-input-number> component, so their
      //    generic ancestor-class paths above come out byte-for-byte identical and
      //    cannot tell the two apart. TikTok's own component leaves a stable, meaningful
      //    class behind on the wrapping section though (e.g. "creation-bid-container-v2-
      //    Kbni" for ROI) — matching on that name prefix (ignoring the trailing hash,
      //    which likely changes per build) is what a real write action should scope its
      //    input lookup to, instead of the generic path. This pass finds every such
      //    "creation-<name>-container" section that holds at least one input, so the
      //    stable name for each field is known before any write code gets written.
      const sections = []
      for (const el of deepQueryAll(doc, '[class*="-container"]')) {
        if (!seen(el) || sections.length >= 40) continue
        const cls = String(el.getAttribute('class') || '')
        const semantic = cls.split(' ').find((c) => /^creation-[a-z0-9]+(-[a-z0-9]+)*-container/i.test(c))
        if (!semantic) continue
        const inputs = deepQueryAll(el, 'input, textarea')
          .filter(seen)
          .slice(0, 5)
          .map((inp) => ({
            type: inp.getAttribute('type') || 'text',
            value: cap(inp.value, 40),
            placeholder: cap(inp.getAttribute('placeholder'), 40),
            path: where(inp),
          }))
        if (inputs.length === 0) continue
        const headingEl = el.querySelector('[class*="title" i], h1, h2, h3, h4')
        sections.push({
          semanticClass: semantic,
          heading: cap(headingEl ? headingEl.textContent : '', 60),
          inputs,
          path: where(el),
        })
      }

      // 5) Campaign rows: a row/card that carries both a money-looking figure and its
      //    own on/off toggle — same "innermost match only" rule as the LIVE console's
      //    product rows, so an ancestor table/section does not also get reported.
      const campaigns = []
      for (const el of [...doc.querySelectorAll('tr, div, li')]) {
        if (!seen(el) || campaigns.length >= 20) continue
        const text = cap(el.textContent, 300)
        if (!moneyish(text)) continue
        const ownToggles = [...el.querySelectorAll('[role="switch"], input[type="checkbox"], [class*="switch" i], [class*="toggle" i]')]
        if (ownToggles.length !== 1) continue
        if (el.querySelector('tr, div, li') && [...el.querySelectorAll('tr, div, li')].some((c) =>
          moneyish(cap(c.textContent, 300)) &&
          [...c.querySelectorAll('[role="switch"], input[type="checkbox"], [class*="switch" i], [class*="toggle" i]')].length === 1
        )) continue
        campaigns.push({ text, path: where(el) })
      }

      const links = [...doc.querySelectorAll('a[href]')]
        .filter(seen)
        .map((a) => ({ text: cap(a.textContent, 50), href: cap(a.getAttribute('href'), 120) }))
        .filter((l) => l.text)
        .slice(0, 40)

      return { clickableCount: clickable.length, toggles, metrics, fields, checkboxes, campaigns, links, probes, sections }
    }

    const iframes = []
    const results = [scanDoc(document, 'top')]
    for (const frame of [...document.querySelectorAll('iframe')]) {
      const src = cap(frame.getAttribute('src'), 160)
      try {
        const doc = frame.contentDocument
        if (doc) {
          results.push(scanDoc(doc, 'iframe[src=' + src + ']'))
          iframes.push({ src, accessible: true })
        } else {
          iframes.push({ src, accessible: false })
        }
      } catch (e) {
        iframes.push({ src, accessible: false })
      }
    }

    const merged = { clickableCount: 0, toggles: [], metrics: [], fields: [], checkboxes: [], campaigns: [], links: [], probes: [], sections: [] }
    for (const r of results) {
      merged.clickableCount += r.clickableCount
      merged.toggles.push(...r.toggles)
      merged.metrics.push(...r.metrics)
      merged.fields.push(...r.fields)
      merged.checkboxes.push(...r.checkboxes)
      merged.campaigns.push(...r.campaigns)
      merged.links.push(...r.links)
      merged.probes.push(...r.probes)
      merged.sections.push(...r.sections)
    }

    // Where this page actually is: TikTok may land a first-time visit on account
    // selection, a Business Center gate, or a login page instead of the campaign list.
    const sample = cap(document.body ? document.body.innerText : '', 4000)

    return {
      ok: true,
      url: location.href,
      title: cap(document.title, 120),
      iframes,
      links: merged.links.slice(0, 40),
      sample,
      counts: {
        clickable: merged.clickableCount,
        toggles: merged.toggles.length,
        fields: merged.fields.length,
        checkboxes: merged.checkboxes.length,
        metrics: merged.metrics.length,
        campaigns: merged.campaigns.length,
      },
      toggles: merged.toggles,
      fields: merged.fields,
      checkboxes: merged.checkboxes,
      metrics: merged.metrics,
      campaigns: merged.campaigns,
      probes: merged.probes,
      sections: merged.sections,
    }
  })()`;
}
// Fills the LIVE ROI target / Daily budget input on the Create-campaign page —
// confirmed via adsManagerScanScript to be the two inputs rendered through TikTok's
// shared <x-input-number> web component. It NEVER touches the Publish button: this
// only stages a value for the seller to review and submit themselves on TikTok's own
// page, exactly like the LIVE console Pin buttons only click TikTok's own control
// rather than skipping the seller's final say. Both fields render byte-identical
// generic ancestor paths (same shared component), so the ROI input is found by
// scoping to TikTok's own "creation-bid-container" section class, and the budget
// input by its stable "At least 100" placeholder — never by the generic path alone.
function setAdsFieldScript(target, value) {
    return `(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    function deepQueryAll(root, selector) {
      let out = []
      try { out = out.concat([...root.querySelectorAll(selector)]) } catch (e) {}
      let all = []
      try { all = [...root.querySelectorAll('*')] } catch (e) {}
      for (const el of all) {
        if (el.shadowRoot) out = out.concat(deepQueryAll(el.shadowRoot, selector))
      }
      return out
    }

    let input = null
    if (${JSON.stringify(target)} === 'roi') {
      const container = deepQueryAll(document, '[class*="creation-bid-container"]')[0]
      if (!container) return { ok: false, reason: 'no-roi-container' }
      input = deepQueryAll(container, 'input').find((el) => el.type !== 'checkbox' && el.type !== 'radio')
    } else {
      input = deepQueryAll(document, 'input').find((el) => (el.getAttribute('placeholder') || '') === 'At least 100')
    }
    if (!input) return { ok: false, reason: 'no-input' }
    if (input.disabled || input.getAttribute('aria-disabled') === 'true') return { ok: false, reason: 'disabled' }

    const before = input.value
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    input.focus()
    // TikTok's own JS listens for real typing, not a bulk value assignment — a plain
    // setter call plus one 'input' event left the component's internal validation
    // state out of sync in testing (the visible text updated but the red "Enter a
    // target ROI..." error and Publish-time value did not), so this clears the field
    // and dispatches one native 'input' event per character instead, the same way a
    // person typing would.
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const text = ${JSON.stringify(value)}
    for (const ch of text) {
      setter.call(input, input.value + ch)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await sleep(30)
    }
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await sleep(200)
    input.blur()
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    await sleep(200)

    return { ok: true, before, after: input.value }
  })()`;
}
async function setAdsField(accountId, target, value) {
    const window = adsManagerWindow(accountId);
    if (window.webContents.isLoading()) {
        await new Promise((resolve) => window.webContents.once('did-stop-loading', () => resolve()));
    }
    return (await window.webContents.executeJavaScript(setAdsFieldScript(target, value), true));
}
async function sendChatViaWindow(accountId, text) {
    const window = chatSenderWindow(accountId);
    if (window.webContents.isLoading()) {
        await new Promise((resolve) => window.webContents.once('did-stop-loading', () => resolve()));
    }
    const result = (await window.webContents.executeJavaScript(composerScript(text), true));
    if (result?.ok)
        return;
    const reasons = {
        'no-composer': 'ไม่พบช่องแชทในหน้า LIVE Manager — ตรวจว่าล็อกอิน TikTok แล้วและกำลังไลฟ์อยู่',
        'composer-disabled': 'ช่องแชทใน LIVE Manager ยังปิดอยู่ — TikTok จะเปิดให้พิมพ์เมื่อเริ่มไลฟ์จริงแล้ว',
        'not-typed': 'พิมพ์ข้อความลงช่องแชทไม่ได้ — TikTok อาจเปลี่ยนหน้าเว็บ',
        'no-send-button': 'พิมพ์ได้แต่หาปุ่มส่งไม่เจอ — TikTok อาจเปลี่ยนหน้าเว็บ',
    };
    throw new Error(reasons[result?.reason] ?? 'ส่งข้อความไม่สำเร็จ — TikTok อาจเปลี่ยนหน้าเว็บ');
}
// Turn the library's raw connect failures into something a seller can act on. The
// webcast handshake in particular surfaces as "Unexpected server response: 200", which
// means TikTok answered the WebSocket upgrade with an ordinary page — almost always
// transient, and meaningless to anyone reading the chat panel.
function describeChatConnectError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/isn't online|user_offline/i.test(message)) {
        return 'ยังไม่พบห้องไลฟ์ — TikTok จะเปิดให้อ่านแชทเมื่อไลฟ์ขึ้นจริงแล้ว';
    }
    if (/Unexpected server response/i.test(message)) {
        return `TikTok ปฏิเสธการเชื่อมต่อแชทชั่วคราว (${message})`;
    }
    if (/rate.?limit|429/i.test(message)) {
        return 'ตัวช่วยเชื่อมต่อแชทถูกจำกัดจำนวนครั้งชั่วคราว — รอสักครู่แล้วระบบจะลองใหม่';
    }
    return message;
}
// Chat connect is retried in the background: a live runs for hours, and giving up after
// the first failure left the whole session with no chat at all. Delays are deliberately
// long — Euler Stream's free sign tier allows only ~5 requests/minute, so retrying fast
// would rate-limit us into a worse failure than the one being retried.
const CHAT_RETRY_DELAYS_MS = [8000, 20000, 45000, 90000, 180000];
const chatRetryTimers = new Map();
function cancelChatRetry(accountId) {
    const timer = chatRetryTimers.get(accountId);
    if (timer)
        clearTimeout(timer);
    chatRetryTimers.delete(accountId);
}
async function startRoomChat(accountId, roomId, attempt = 0) {
    const config = getChatConfig(accountId);
    cancelChatRetry(accountId);
    try {
        // Must happen before connecting, not lazily on the first reply — see
        // warmChatSenderWindow for why the read connection depends on this page being open.
        await warmChatSenderWindow(accountId);
        startWebcastChatPoller(accountId, roomId);
        startDomChatPoller(accountId);
        if (!config.enabled)
            return;
        const tikTokSession = electron_1.session.fromPartition(tikTokPartition(accountId), { cache: true });
        const cookie = await tikTokCookieHeader(tikTokSession);
        await (0, chat_engine_1.startChatEngine)({
            accountId,
            roomId,
            cookie,
            config,
            emit: (event) => emitChatEvent(accountId, event),
            send: async (text) => {
                try {
                    await sendChatViaApi(accountId, roomId, text);
                }
                catch {
                    await sendChatViaWindow(accountId, text);
                }
            },
        });
    }
    catch (error) {
        await (0, chat_engine_1.startDomChatEngine)({
            accountId,
            config,
            emit: (event) => emitChatEvent(accountId, event),
            send: async (text) => {
                try {
                    await sendChatViaApi(accountId, roomId, text);
                }
                catch {
                    await sendChatViaWindow(accountId, text);
                }
            },
        });
        startWebcastChatPoller(accountId, roomId);
        startDomChatPoller(accountId);
        const detail = describeChatConnectError(error);
        const delay = CHAT_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
            emitChatEvent(accountId, {
                kind: 'system',
                id: (0, node_crypto_1.randomUUID)(),
                text: `เปิดระบบตอบแชทไม่สำเร็จ: ${detail} — หยุดลองใหม่แล้ว (กดหยุดไลฟ์แล้วเริ่มใหม่เพื่อลองอีกครั้ง)`,
                at: Date.now(),
            });
            return;
        }
        emitChatEvent(accountId, {
            kind: 'system',
            id: (0, node_crypto_1.randomUUID)(),
            text: `${detail} — จะลองเชื่อมต่อใหม่ใน ${Math.round(delay / 1000)} วินาที (ครั้งที่ ${attempt + 1}/${CHAT_RETRY_DELAYS_MS.length})`,
            at: Date.now(),
        });
        const timer = setTimeout(() => {
            chatRetryTimers.delete(accountId);
            void startRoomChat(accountId, roomId, attempt + 1);
        }, delay);
        timer.unref();
        chatRetryTimers.set(accountId, timer);
    }
}
function enabledChatAccountIds() {
    const dir = node_path_1.default.join(electron_1.app.getPath('userData'), 'chat-config');
    try {
        return (0, node_fs_1.readdirSync)(dir)
            .filter((name) => name.endsWith('.json'))
            .map((name) => normalizeAccountId(node_path_1.default.basename(name, '.json')))
            .filter((id) => getChatConfig(id).enabled);
    }
    catch {
        return [];
    }
}
async function recoverEnabledChatReaders() {
    const ids = enabledChatAccountIds();
    for (const accountId of ids) {
        const config = getChatConfig(accountId);
        if (!config.enabled)
            continue;
        try {
            await warmChatSenderWindow(accountId);
            if (!(0, chat_engine_1.isChatEngineRunning)(accountId)) {
                await (0, chat_engine_1.startDomChatEngine)({
                    accountId,
                    config,
                    emit: (event) => emitChatEvent(accountId, event),
                    send: async (text) => {
                        const roomId = peekStreamSession(accountId)?.room?.roomId ?? null;
                        try {
                            await sendChatViaApi(accountId, roomId, text);
                        }
                        catch {
                            await sendChatViaWindow(accountId, text);
                        }
                    },
                });
            }
            else {
                (0, chat_engine_1.updateChatConfig)(accountId, config);
            }
            const roomId = peekStreamSession(accountId)?.room?.roomId ?? null;
            startWebcastChatPoller(accountId, roomId);
            startDomChatPoller(accountId);
            if (config.ai.enabled && config.ai.useProducts)
                void refreshChatProducts(accountId);
            emitChatEvent(accountId, {
                kind: 'system',
                id: (0, node_crypto_1.randomUUID)(),
                text: 'กู้คืนตัวอ่านแชทหลังรีสตาร์ทแล้ว — กำลังอ่านคอมเมนต์จากหน้า LIVE Manager',
                at: Date.now(),
            });
        }
        catch (error) {
            emitChatEvent(accountId, {
                kind: 'system',
                id: (0, node_crypto_1.randomUUID)(),
                text: `กู้คืนตัวอ่านแชทหลังรีสตาร์ทไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
                at: Date.now(),
            });
        }
    }
}
function createMainWindow() { mainWindow = global.__npWebMainWindow; }
// Electron's default UA reads e.g. "... digital-np-studio/0.1.0 Chrome/128.0.0.0
// Electron/32.0.1 Safari/537.36" — real Chrome never sends either token. Stripping
// them leaves an otherwise-genuine Chrome UA (same underlying Chromium build), which
// is the standard fix for anti-bot paths that reject on the Electron/product tokens
// alone rather than deeper fingerprinting.
function chromeLikeUserAgent(raw) {
    return raw
        .replace(/\s*\S+\/\S+(?=\s+Chrome\/)/, '')
        .replace(/\s*Electron\/\S+/, '');
}
function createTikTokWindow(accountId, target, autoLoad = true) {
    const partition = tikTokPartition(accountId);
    const tikTokSession = electron_1.session.fromPartition(partition, { cache: true });
    const title = target === 'login'
        ? 'เข้าสู่ระบบ TikTok'
        : target === 'shop'
            ? 'TikTok Shop — ตัวจัดการ LIVE'
            : target === 'ads'
                ? 'TikTok Ads Manager'
                : 'TikTok';
    const targetUrl = target === 'login'
        ? 'https://www.tiktok.com/live'
        : target === 'shop'
            ? 'https://shop.tiktok.com/streamer/live/product/dashboard'
            : target === 'ads'
                ? ADS_MANAGER_URL
                : 'https://www.tiktok.com/';
    const window = new electron_1.BrowserWindow({
        show: true,
        x: -24000,
        y: -24000,
        width: 1080,
        height: 760,
        title,
        skipTaskbar: true,
        autoHideMenuBar: true,
        webPreferences: {
            partition,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            safeDialogs: true,
            offscreen: false,
            backgroundThrottling: false,
        },
    });
    window.__npAccountId = accountId;
    window.__npTarget = target;
    window.__npCreatedAt = Date.now();
    // TikTok LIVE Manager and Ads Manager depend on TikTok-hosted script bundles and
    // signing helpers. Electron's default UA advertises "Electron/x.y" and the app's own
    // product name; stricter TikTok paths can serve the bare React fallback page instead
    // of hydrating the app. Use a Chrome-like UA for these hidden/control windows too, so
    // the chat reader has a real LIVE console DOM to inspect after a server restart.
    if (target === 'login' || target === 'shop' || target === 'ads') {
        window.webContents.setUserAgent(chromeLikeUserAgent(window.webContents.getUserAgent()));
    }
    tikTokSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
        let hostname = '';
        try {
            hostname = new URL(url).hostname;
        }
        catch {
            return { action: 'deny' };
        }
        const allowedHosts = ['tiktok.com', 'google.com', 'facebook.com', 'apple.com'];
        const allowed = allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
        return {
            action: allowed ? 'allow' : 'deny',
            overrideBrowserWindowOptions: {
                autoHideMenuBar: true,
                webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true },
            },
        };
    });
    window.webContents.on('did-create-window', (childWindow) => {
        childWindow.__npAccountId = accountId;
        childWindow.__npTarget = target;
        try {
            childWindow.webContents.setUserAgent(chromeLikeUserAgent(childWindow.webContents.getUserAgent()));
        }
        catch {
            // Best effort only; the parent window still carries the same session partition.
        }
    });
    window.on('page-title-updated', (event) => {
        if (target === 'shop' || target === 'ads')
            event.preventDefault();
    });
    window.webContents.on('did-start-navigation', (_event, url) => console.log(`[tiktok-window] start ${target} ${url}`));
    window.webContents.on('did-fail-load', (_event, code, description, url) => console.error(`[tiktok-window] fail ${target} ${code} ${description} ${url}`));
    window.webContents.on('did-finish-load', () => console.log(`[tiktok-window] finish ${target} ${window.webContents.getURL()}`));
    if (autoLoad) {
        console.log(`[tiktok-window] load ${target} ${targetUrl}`);
        void window.loadURL(targetUrl).catch((error) => console.error(`[tiktok-window] load-error ${target} ${error instanceof Error ? error.message : String(error)}`));
        setTimeout(() => {
            if (!window.isDestroyed() && !window.webContents.getURL()) {
                console.error(`[tiktok-window] retry ${target} ${targetUrl}`);
                void window.loadURL(targetUrl).catch((error) => console.error(`[tiktok-window] retry-error ${target} ${error instanceof Error ? error.message : String(error)}`));
            }
        }, 5000).unref?.();
    }
    return window;
}
async function hasTikTokLogin(tikTokSession) {
    const [sessionId, multiSids] = await Promise.all([
        tikTokSession.cookies.get({ name: 'sessionid' }),
        tikTokSession.cookies.get({ name: 'multi_sids' }),
    ]);
    return sessionId.some((cookie) => Boolean(cookie.value)) && multiSids.some((cookie) => Boolean(cookie.value));
}
const pendingTikTokLogins = new Map();
function captureTikTokAuthFromRequest(accountId, details, fallbackUserAgent) {
    const headers = details.requestHeaders ?? {};
    const cookie = headers.Cookie ?? headers.cookie ?? '';
    if (!/sessionid=[^;\s]/.test(cookie) || !/multi_sids=[^;\s]/.test(cookie))
        return false;
    const requestScore = tikTokAuthRequestScore(details.url);
    const current = loadTikTokAuth(accountId);
    if (requestScore <= tikTokAuthRequestScore(current?.requestUrl ?? ''))
        return false;
    saveTikTokAuth(accountId, {
        version: 1,
        requestUrl: details.url,
        userAgent: headers['User-Agent'] ?? headers['user-agent'] ?? fallbackUserAgent,
        referer: headers.Referer ?? headers.referer ?? 'https://www.tiktok.com/',
        capturedAt: Date.now(),
    });
    return isUsableTikTokAuthSnapshot(loadTikTokAuth(accountId));
}
function waitForTikTokLogin(loginWindow, tikTokSession, accountId) {
    return new Promise((resolve) => {
        let settled = false;
        let checking = false;
        let captured = false;
        const filter = { urls: ['*://*.tiktok.com/*', '*://*.tiktokv.com/*'] };
        const capture = (details) => {
            if (settled || captured)
                return;
            captured = captureTikTokAuthFromRequest(accountId, details, loginWindow.webContents.getUserAgent());
        };
        tikTokSession.webRequest.onSendHeaders(filter, capture);
        const finish = (saved) => {
            if (settled)
                return;
            settled = true;
            clearInterval(timer);
            tikTokSession.webRequest.onSendHeaders(filter, null);
            resolve(saved);
        };
        const check = async (closeOnSuccess) => {
            if (settled || checking)
                return;
            checking = true;
            try {
                if (!(await hasTikTokLogin(tikTokSession)) || (!captured && !isUsableTikTokAuthSnapshot(loadTikTokAuth(accountId))))
                    return;
                await tikTokSession.flushStorageData();
                finish(true);
                if (closeOnSuccess && !loginWindow.isDestroyed()) {
                    loginWindow.setTitle('เชื่อมต่อ TikTok สำเร็จ');
                    setTimeout(() => {
                        for (const childWindow of loginWindow.getChildWindows())
                            childWindow.close();
                        if (!loginWindow.isDestroyed())
                            loginWindow.close();
                    }, 650);
                }
            }
            finally {
                checking = false;
            }
        };
        const timer = setInterval(() => void check(true), 750);
        void loginWindow.loadURL('https://www.tiktok.com/live');
        void check(true);
        loginWindow.once('closed', () => {
            if (settled)
                return;
            clearInterval(timer);
            void hasTikTokLogin(tikTokSession)
                .then(async (saved) => {
                const ready = saved && isUsableTikTokAuthSnapshot(loadTikTokAuth(accountId));
                if (ready)
                    await tikTokSession.flushStorageData();
                finish(ready);
            })
                .catch(() => finish(false));
        });
    });
}
async function refreshTikTokAuthSnapshot(accountId, timeoutMs = 8000) {
    const normalizedId = normalizeAccountId(accountId);
    const tikTokSession = electron_1.session.fromPartition(tikTokPartition(normalizedId), { cache: true });
    if (!(await hasTikTokLogin(tikTokSession)))
        return false;
    let captured = false;
    const window = createTikTokWindow(normalizedId, 'login', false);
    const filter = { urls: ['*://*.tiktok.com/*', '*://*.tiktokv.com/*'] };
    const capture = (details) => {
        if (captured)
            return;
        captured = captureTikTokAuthFromRequest(normalizedId, details, window.webContents.getUserAgent());
        if (captured)
            console.log(`[tiktok-auth] refreshed account=${normalizedId}`);
    };
    tikTokSession.webRequest.onSendHeaders(filter, capture);
    try {
        void window.loadURL('https://www.tiktok.com/live');
        const startedAt = Date.now();
        while (!captured && Date.now() - startedAt < timeoutMs) {
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (captured)
            await tikTokSession.flushStorageData();
        return captured;
    }
    finally {
        tikTokSession.webRequest.onSendHeaders(filter, null);
        if (!window.isDestroyed())
            window.close();
    }
}
function findApiValue(value, keys, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 8)
        return undefined;
    const record = value;
    for (const key of keys) {
        if (record[key] !== undefined && record[key] !== null && record[key] !== '')
            return record[key];
    }
    for (const nested of Object.values(record)) {
        const found = findApiValue(nested, keys, depth + 1);
        if (found !== undefined)
            return found;
    }
    return undefined;
}
function apiString(value, keys) {
    const found = findApiValue(value, keys);
    return typeof found === 'string' || typeof found === 'number' ? String(found) : '';
}
async function tikTokCookieHeader(tikTokSession) {
    const cookies = await tikTokSession.cookies.get({});
    return cookies
        .filter((cookie) => {
        const domain = String(cookie.domain).replace(/^\./, '');
        return Boolean(cookie.value) && (domain.endsWith('tiktok.com') || domain.endsWith('tiktokshop.com'));
    })
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; ');
}
function tikTokRequestUrl(snapshot, pathname) {
    let requestUrl;
    try {
        requestUrl = new URL(snapshot.requestUrl);
    }
    catch {
        requestUrl = new URL('https://www.tiktok.com/live');
    }
    requestUrl.protocol = 'https:';
    requestUrl.hostname = 'webcast.tiktokv.com';
    requestUrl.port = '';
    requestUrl.pathname = pathname;
    requestUrl.hash = '';
    return requestUrl.toString();
}
async function tikTokControlRequest(accountId, pathname, form) {
    const normalizedId = normalizeAccountId(accountId);
    const tikTokSession = electron_1.session.fromPartition(tikTokPartition(normalizedId), { cache: true });
    if (!(await hasTikTokLogin(tikTokSession))) {
        throw new Error('TikTok session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
    let snapshot = loadTikTokAuth(normalizedId);
    if (!isUsableTikTokAuthSnapshot(snapshot) && await refreshTikTokAuthSnapshot(normalizedId)) {
        snapshot = loadTikTokAuth(normalizedId);
    }
    if (!snapshot) {
        throw new Error('ยังไม่มีข้อมูลยืนยัน Streamer Desktop กรุณาเข้าสู่ระบบ TikTok ใหม่ 1 ครั้ง');
    }
    if (!isUsableTikTokAuthSnapshot(snapshot)) {
        throw new Error('ข้อมูลยืนยัน Streamer Desktop ยังไม่ครบ กรุณากดเข้าสู่ระบบ TikTok ใหม่ 1 ครั้ง แล้วลองเริ่มไลฟ์อีกครั้ง');
    }
    const cookie = await tikTokCookieHeader(tikTokSession);
    const body = form.toString();
    // Use a main-process ClientRequest (net.request) instead of session.fetch.
    // fetch enforces renderer-style CORS, so this cross-origin credentialed call
    // (www.tiktok.com -> webcast.tiktokv.com) was blocked with net::ERR_FAILED
    // because the native webcast endpoint returns no CORS headers. net.request
    // is not subject to CORS while still using the session's network stack.
    const { status, responseText } = await new Promise((resolve, reject) => {
        const request = electron_1.net.request({
            method: 'POST',
            url: tikTokRequestUrl(snapshot, pathname),
            session: tikTokSession,
        });
        // net.request has no built-in timeout: a stalled TLS handshake or a silently
        // dropped webcast request emits neither 'response' nor 'error', so without this
        // guard the whole stream:start IPC hangs forever and the UI spins indefinitely.
        let settled = false;
        const finish = (fn, arg) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            fn(arg);
        };
        const timer = setTimeout(() => {
            try {
                request.abort();
            }
            catch {
                // The request may already be torn down; abort is best-effort.
            }
            finish(reject, new Error('TikTok ไม่ตอบภายใน 15 วินาที — ตรวจอินเทอร์เน็ต/VPN หรือเข้าสู่ระบบ TikTok ใหม่ 1 ครั้ง'));
        }, 15000);
        request.setHeader('Accept', 'application/json, text/plain, */*');
        request.setHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        request.setHeader('Cookie', cookie);
        request.setHeader('Origin', 'https://www.tiktok.com');
        request.setHeader('Referer', snapshot.referer || 'https://www.tiktok.com/');
        request.setHeader('User-Agent', snapshot.userAgent);
        request.setHeader('sdk_aid', '8311');
        request.setHeader('x-ss-stub', (0, node_crypto_1.createHash)('md5').update(body).digest('hex').toUpperCase());
        request.on('response', (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk.toString();
            });
            response.on('end', () => finish(resolve, { status: response.statusCode, responseText: data }));
            response.on('error', (error) => finish(reject, error));
        });
        // Chromium's raw net:: codes mean nothing to a seller. ERR_BLOCKED_BY_CLIENT in
        // particular is not a network fault at all — something on their own machine (AV,
        // firewall, or a DNS/ad blocker; several public blocklists include tiktokv.com)
        // refused the call, so the fix is on that machine, not with the internet or TikTok.
        request.on('error', (error) => {
            const raw = error instanceof Error ? error.message : String(error);
            if (/ERR_BLOCKED_BY_CLIENT/i.test(raw)) {
                finish(reject, new Error('การเชื่อมต่อ TikTok ถูกบล็อกจากโปรแกรมในเครื่องนี้ — ปิดแอนตี้ไวรัส/ตัวบล็อกโฆษณา/VPN ' +
                    'หรืออนุญาต Digital NP Studio ในไฟร์วอลล์ แล้วลองใหม่'));
                return;
            }
            if (/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/i.test(raw)) {
                finish(reject, new Error(`เชื่อมต่ออินเทอร์เน็ตไม่ได้ (${raw})`));
                return;
            }
            finish(reject, error);
        });
        request.on('abort', () => finish(reject, new Error('คำขอ TikTok ถูกยกเลิก (timeout)')));
        request.write(body);
        request.end();
    });
    let payload;
    try {
        payload = JSON.parse(responseText);
    }
    catch {
        throw new Error(`TikTok ตอบกลับไม่ถูกต้อง (HTTP ${status})`);
    }
    if (status < 200 || status >= 300)
        throw new Error(`TikTok Streamer Desktop ติดต่อไม่สำเร็จ (HTTP ${status})`);
    const statusCode = apiString(payload, ['status_code']);
    if (statusCode && statusCode !== '0') {
        const statusMessage = apiString(payload, ['status_msg', 'message', 'prompts']);
        throw new Error(statusMessage || `TikTok ปฏิเสธคำขอ (status ${statusCode})`);
    }
    return payload;
}
async function tikTokShopNetRequest(accountId, method, apiPath, body = null) {
    const normalizedId = normalizeAccountId(accountId);
    const tikTokSession = electron_1.session.fromPartition(tikTokPartition(normalizedId), { cache: true });
    const url = new URL(apiPath, 'https://shop.tiktok.com');
    if (!url.searchParams.get('aid'))
        url.searchParams.set('aid', '4068');
    if (!url.searchParams.get('app_name'))
        url.searchParams.set('app_name', 'i18n_ecom_shop');
    if (!url.searchParams.get('device_platform'))
        url.searchParams.set('device_platform', 'web');
    if (!url.searchParams.get('cookie_enabled'))
        url.searchParams.set('cookie_enabled', 'true');
    if (!url.searchParams.get('screen_width'))
        url.searchParams.set('screen_width', '1920');
    if (!url.searchParams.get('screen_height'))
        url.searchParams.set('screen_height', '1080');
    if (!url.searchParams.get('browser_language'))
        url.searchParams.set('browser_language', 'en-US');
    if (!url.searchParams.get('browser_platform'))
        url.searchParams.set('browser_platform', 'Win32');
    if (!url.searchParams.get('browser_name'))
        url.searchParams.set('browser_name', 'Mozilla');
    if (!url.searchParams.get('browser_version'))
        url.searchParams.set('browser_version', chromeLikeUserAgent(electron_1.app.userAgentFallback || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'));
    if (!url.searchParams.get('browser_online'))
        url.searchParams.set('browser_online', 'true');
    if (!url.searchParams.get('timezone_name'))
        url.searchParams.set('timezone_name', 'Asia/Bangkok');
    const cookie = await tikTokCookieHeader(tikTokSession);
    const { status, responseText } = await new Promise((resolve, reject) => {
        const request = electron_1.net.request({ method, url: url.toString(), session: tikTokSession });
        let settled = false;
        const timer = setTimeout(() => {
            try {
                request.abort();
            }
            catch {
                // Best effort.
            }
            if (!settled) {
                settled = true;
                reject(new Error('TikTok Shop API ตอบกลับไม่ทันเวลา'));
            }
        }, 15000);
        request.setHeader('Accept', 'application/json, text/plain, */*');
        request.setHeader('Origin', 'https://shop.tiktok.com');
        request.setHeader('Referer', LIVE_MANAGER_URL);
        if (cookie)
            request.setHeader('Cookie', cookie);
        if (body !== null && body !== undefined) {
            request.setHeader('Content-Type', 'application/json');
            request.write(JSON.stringify(body));
        }
        request.on('response', (response) => {
            let text = '';
            response.on('data', (chunk) => {
                text += chunk.toString('utf8');
            });
            response.on('end', () => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                resolve({ status: response.statusCode ?? 0, responseText: text });
            });
        });
        request.on('error', (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        });
        request.end();
    });
    let data = null;
    try {
        data = responseText ? JSON.parse(responseText) : null;
    }
    catch {
        data = null;
    }
    return { ok: status >= 200 && status < 300, status, url: url.toString(), data, text: data ? '' : responseText.slice(0, 500) };
}
async function fetchActiveShopRoomStatus(accountId) {
    let roomId = '';
    try {
        const current = await runTikTokApiInLiveConsole(accountId, currentRoomIdScript());
        if (current?.roomId)
            roomId = String(current.roomId);
    }
    catch {
        // Fall through; the status API needs a room id and will report that cleanly below.
    }
    if (!roomId)
        return { ok: false, status: 0, reason: 'no-room-id' };
    const result = await tikTokShopNetRequest(accountId, 'POST', '/api/v1/insights/workbench/live/detail/room/status?user_language=en&locale=en&vertical=3&device_type=web_h265&carrier_region=th', {
        request: {
            room_filter: { room_id: roomId },
        },
    });
    if (!result.ok)
        return { ok: false, status: result.status, reason: result.text || result.data?.message || result.data?.msg || 'status-api-failed' };
    const code = result.data?.code;
    if (code !== undefined && Number(code) !== 0)
        return { ok: false, status: result.status, reason: result.data?.message || result.data?.msg || `code-${code}`, data: result.data };
    const data = result.data?.data ?? result.data;
    const liveStreamUrl = apiString(data, ['live_stream_url', 'stream_url', 'flv_pull_url']);
    const liveStatus = Number(data?.status ?? 0);
    const duration = Number(data?.duration ?? 0);
    return { ok: true, roomId, status: liveStatus, duration, liveStreamUrl, data: result.data, url: result.url };
}
function buildTikTokRoomCreateForm(title, useMultiStream = true) {
    const form = new URLSearchParams();
    form.set('studiolive', '1');
    form.set('gen_replay', 'true');
    form.set('close_room_when_close_stream', 'false');
    form.set('cover_uri', '');
    form.set('title', String(title || '').trim().slice(0, 64) || 'Rerun LIVE');
    if (useMultiStream) {
        form.set('multi_stream_scene', '1');
        form.set('is_group_live_session', 'true');
        form.set('multi_stream_source', '1');
    }
    return form;
}
async function createTikTokRoom(accountId, title) {
    let payload;
    try {
        payload = await tikTokControlRequest(accountId, '/webcast/room/create/', buildTikTokRoomCreateForm(title));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/request params error/i.test(message))
            throw error;
        console.warn(`[tiktok-room] create fallback account=${normalizeAccountId(accountId)} reason=${message}`);
        payload = await tikTokControlRequest(accountId, '/webcast/room/create/', buildTikTokRoomCreateForm(title, false));
    }
    const roomId = apiString(payload, ['room_id_str', 'room_id']);
    const streamId = apiString(payload, ['stream_id_str', 'stream_id']);
    const rtmpPushUrl = apiString(payload, ['rtmp_push_url']);
    if (!roomId || !streamId || !/^rtmps?:\/\//i.test(rtmpPushUrl)) {
        throw new Error('TikTok สร้างห้องแล้วแต่ไม่ส่ง RTMP URL กลับมา บัญชีอาจยังไม่มีสิทธิ์ Streamer Desktop');
    }
    return {
        accountId: normalizeAccountId(accountId),
        roomId,
        streamId,
        rtmpPushUrl,
        keepAliveTimer: null,
        keepAliveFailures: 0,
    };
}
// The actual end-live call. ping/anchor with status=4 only tells TikTok the anchor's
// state; it does not close the room — the seller pressed stop, ffmpeg exited, and the
// broadcast sat "live" on TikTok until its own no-data timeout minutes later, looking
// exactly like the stop button doing nothing.
async function finishTikTokRoom(room) {
    const form = new URLSearchParams();
    form.set('room_id', room.roomId);
    form.set('stream_id', room.streamId);
    await tikTokControlRequest(room.accountId, '/webcast/room/finish/', form);
}
async function pingTikTokRoom(room, status) {
    const form = new URLSearchParams();
    form.set('status', String(status));
    form.set('room_id', room.roomId);
    form.set('stream_id', room.streamId);
    await tikTokControlRequest(room.accountId, '/webcast/room/ping/anchor/', form);
}
function startTikTokKeepAlive(sessionState, room) {
    room.keepAliveTimer = setInterval(() => {
        void pingTikTokRoom(room, 2)
            .then(() => {
            room.keepAliveFailures = 0;
        })
            .catch(() => {
            room.keepAliveFailures += 1;
            if (room.keepAliveFailures >= 3 && sessionState.room === room && sessionState.status.state === 'live') {
                updateStatus(sessionState, { state: 'error', message: 'TikTok ไม่ตอบรับ keepalive กรุณาหยุดไลฟ์และเข้าสู่ระบบใหม่' });
            }
        });
    }, 5000);
    room.keepAliveTimer.unref();
}
async function finishRoom(sessionState) {
    // Stop the chat engine before the room guard: Stream-Key (manual) lives have no room
    // of ours but may still have a chat connection that must not outlive the stream.
    // Pending connect retries have to be dropped too, or one would fire after the live
    // ended and quietly reopen a chat connection for a stream that no longer exists.
    cancelChatRetry(sessionState.accountId);
    stopWebcastChatPoller(sessionState.accountId);
    stopDomChatPoller(sessionState.accountId);
    stopPinRotation(sessionState.accountId);
    if ((0, chat_engine_1.isChatEngineRunning)(sessionState.accountId))
        void (0, chat_engine_1.stopChatEngine)(sessionState.accountId);
    closeChatSenderWindow(sessionState.accountId);
    const room = sessionState.room;
    if (!room)
        return;
    sessionState.room = null;
    if (room.keepAliveTimer)
        clearInterval(room.keepAliveTimer);
    room.keepAliveTimer = null;
    try {
        await pingTikTokRoom(room, 4);
    }
    catch {
        // Informational only; the finish call below is what actually closes the room.
    }
    try {
        await finishTikTokRoom(room);
    }
    catch (error) {
        // Failing to close the room is the one failure the seller must hear about — their
        // broadcast is still visibly live on TikTok. Swallowing it here is how "stop did
        // nothing" went undiagnosed.
        emitChatEvent(sessionState.accountId, {
            kind: 'system',
            id: (0, node_crypto_1.randomUUID)(),
            text: `สั่งปิดห้องไลฟ์กับ TikTok ไม่สำเร็จ (${error instanceof Error ? error.message : String(error)}) — ` +
                'ถ้าไลฟ์ยังค้างอยู่ ให้กด End LIVE ในแอป TikTok หรือหน้า LIVE Manager หนึ่งครั้ง',
            at: Date.now(),
        });
    }
}
async function tikTokConnectionStatus(accountId) {
    const normalizedId = normalizeAccountId(accountId);
    const tikTokSession = electron_1.session.fromPartition(tikTokPartition(normalizedId), { cache: true });
    const connected = await hasTikTokLogin(tikTokSession);
    const streamerReady = connected && (isUsableTikTokAuthSnapshot(loadTikTokAuth(normalizedId)) || await refreshTikTokAuthSnapshot(normalizedId, 5000));
    return { connected, streamerReady };
}
async function logoutTikTokAccount(accountId) {
    const normalizedId = normalizeAccountId(accountId);
    if (peekStreamSession(normalizedId)?.room) {
        throw new Error('กรุณาหยุดไลฟ์ของบัญชีนี้ก่อนออกจากระบบ');
    }
    const tikTokSession = electron_1.session.fromPartition(tikTokPartition(normalizedId), { cache: true });
    for (const window of electron_1.BrowserWindow.getAllWindows()) {
        if (window !== mainWindow && window.webContents.session === tikTokSession && !window.isDestroyed())
            window.close();
    }
    await tikTokSession.clearStorageData();
    await tikTokSession.clearCache();
    await tikTokSession.flushStorageData();
    try {
        (0, node_fs_1.unlinkSync)(tikTokAuthPath(normalizedId));
    }
    catch {
        // The account may predate Streamer Desktop capture and have no snapshot file.
    }
    return { signedOut: !(await hasTikTokLogin(tikTokSession)) };
}
async function resetTikTokLoginSession(accountId) {
    const normalizedId = normalizeAccountId(accountId);
    if (peekStreamSession(normalizedId)?.room) {
        throw new Error('กรุณาหยุดไลฟ์ของบัญชีนี้ก่อนล็อกอิน TikTok ใหม่');
    }
    const tikTokSession = electron_1.session.fromPartition(tikTokPartition(normalizedId), { cache: true });
    for (const window of electron_1.BrowserWindow.getAllWindows()) {
        if (window !== mainWindow && window.webContents.session === tikTokSession && !window.isDestroyed())
            window.close();
    }
    await tikTokSession.clearStorageData();
    await tikTokSession.clearCache();
    await tikTokSession.flushStorageData();
    try {
        (0, node_fs_1.unlinkSync)(tikTokAuthPath(normalizedId));
    }
    catch {
        // Already clean.
    }
    return tikTokSession;
}
// Clip length, used to wrap the resume offset after a reconnect. Cached per path because
// it is probed on every (re)start and the file does not change mid-live.
const durationCache = new Map();
async function fileDurationSec(filePath) {
    const cached = durationCache.get(filePath);
    if (cached !== undefined)
        return cached;
    const ffmpegPath = ffmpegBinary();
    if (!ffmpegPath)
        return 0;
    const seconds = await new Promise((resolve) => {
        const probe = (0, node_child_process_1.spawn)(ffmpegPath, ['-hide_banner', '-i', filePath, '-t', '0', '-f', 'null', '-']);
        let metadata = '';
        let done = false;
        const settle = (result) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            resolve(result);
        };
        const parse = () => {
            const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(metadata);
            if (!match)
                return 0;
            return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        };
        const timer = setTimeout(() => {
            try {
                probe.kill('SIGKILL');
            }
            catch {
                // Probe may already have exited; kill is best-effort.
            }
            settle(parse());
        }, 8000);
        probe.stderr.on('data', (chunk) => {
            metadata += String(chunk);
        });
        probe.on('error', () => settle(0));
        probe.on('close', () => settle(parse()));
    });
    durationCache.set(filePath, seconds);
    return seconds;
}
// The clip whose encode will cost the most, approximated as bytes per second — heavier
// codecs/resolutions pack more bits into each second. Used as the benchmark sample so a
// light first clip can't make the whole playlist look cheaper than it is. Falls back to
// the first clip when probing fails (missing file, zero duration).
async function pickHeaviestClip(clipPaths) {
    if (clipPaths.length <= 1)
        return clipPaths[0];
    let best = clipPaths[0];
    let bestRate = -1;
    for (const clipPath of clipPaths) {
        try {
            const bytes = (0, node_fs_1.statSync)(clipPath).size;
            const seconds = await fileDurationSec(clipPath);
            const rate = seconds > 0 ? bytes / seconds : 0;
            if (rate > bestRate) {
                bestRate = rate;
                best = clipPath;
            }
        }
        catch {
            // Unreadable clip: FFmpeg will surface the real error at stream start.
        }
    }
    return best;
}
async function fileHasAudio(filePath) {
    const ffmpegPath = ffmpegBinary();
    if (!ffmpegPath)
        return false;
    return new Promise((resolve) => {
        const probe = (0, node_child_process_1.spawn)(ffmpegPath, ['-hide_banner', '-i', filePath, '-t', '0', '-f', 'null', '-']);
        let metadata = '';
        let done = false;
        const settle = (result) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            resolve(result);
        };
        // Never let the audio probe block stream startup indefinitely.
        const timer = setTimeout(() => {
            try {
                probe.kill('SIGKILL');
            }
            catch {
                // Probe may already have exited; kill is best-effort.
            }
            settle(/Stream #.*: Audio:/i.test(metadata));
        }, 8000);
        probe.stderr.on('data', (chunk) => {
            metadata += String(chunk);
        });
        probe.on('error', () => settle(false));
        probe.on('close', () => settle(/Stream #.*: Audio:/i.test(metadata)));
    });
}
const clipInfoCache = new Map();
async function probeClip(filePath) {
    const cached = clipInfoCache.get(filePath);
    if (cached !== undefined)
        return cached;
    const ffmpegPath = ffmpegBinary();
    if (!ffmpegPath)
        return null;
    const info = await new Promise((resolve) => {
        const probe = (0, node_child_process_1.spawn)(ffmpegPath, ['-hide_banner', '-i', filePath]);
        let text = '';
        let done = false;
        const settle = (value) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            resolve(value);
        };
        const parse = () => {
            const video = /Stream #[^\n]*: Video: (\w+)[^\n]*?, (\d+)x(\d+)[^\n]*/.exec(text);
            if (!video)
                return null;
            const fps = Number(/([\d.]+) fps/.exec(text)?.[1] ?? 0);
            // Prefer the stream's own bitrate; fall back to the container's.
            const streamRate = Number(/Video:[^\n]*?, (\d+) kb\/s/.exec(text)?.[1] ?? 0);
            const containerRate = Number(/bitrate: (\d+) kb\/s/.exec(text)?.[1] ?? 0);
            return {
                videoCodec: video[1].toLowerCase(),
                width: Number(video[2]),
                height: Number(video[3]),
                fps,
                bitrateKbps: streamRate || containerRate,
                audioCodec: (/Stream #[^\n]*: Audio: (\w+)/.exec(text)?.[1] ?? '').toLowerCase(),
                sampleRate: Number(/Audio: \w+[^\n]*?, (\d+) Hz/.exec(text)?.[1] ?? 0),
            };
        };
        const timer = setTimeout(() => {
            try {
                probe.kill('SIGKILL');
            }
            catch {
                // Already gone.
            }
            settle(parse());
        }, 8000);
        probe.stderr.on('data', (chunk) => {
            text += String(chunk);
        });
        probe.on('error', () => settle(null));
        probe.on('close', () => settle(parse()));
    });
    clipInfoCache.set(filePath, info);
    return info;
}
// Every clip has to qualify, and they all have to match each other: the concat demuxer
// cannot copy across clips whose codec parameters differ.
async function passthroughVerdict(config, downscale) {
    if (config.overlays.length || config.clocks.length || config.texts.length) {
        return { ok: false, reason: 'มีภาพหรือข้อความซ้อนบนวิดีโอ' };
    }
    if (config.camera.zoom > 1.001 || config.camera.mirror)
        return { ok: false, reason: 'มีการปรับกล้อง (ซูม/กลับด้าน)' };
    if (downscale)
        return { ok: false, reason: 'ระบบย่อขนาดภาพให้เครื่องอยู่' };
    const infos = [];
    for (const clipPath of config.videoPaths) {
        const info = await probeClip(clipPath);
        if (!info)
            return { ok: false, reason: 'อ่านข้อมูลคลิปไม่ได้' };
        if (info.videoCodec !== 'h264')
            return { ok: false, reason: `คลิปไม่ใช่ H.264 (${info.videoCodec})` };
        if (info.width !== 1080 || info.height !== 1920) {
            return { ok: false, reason: `ขนาดคลิปไม่ใช่ 1080x1920 (${info.width}x${info.height})` };
        }
        // Above 30fps TikTok gets more frames than the live is configured for, and the file is
        // carrying roughly double the data it needs to.
        if (info.fps > 31)
            return { ok: false, reason: `คลิปเป็น ${Math.round(info.fps)}fps (ต้องไม่เกิน 30)` };
        if (info.audioCodec && info.audioCodec !== 'aac')
            return { ok: false, reason: `เสียงไม่ใช่ AAC (${info.audioCodec})` };
        // Sending the file untouched means sending its own bitrate, so it has to fit the
        // seller's chosen ceiling rather than the other way round.
        if (info.bitrateKbps > config.bitrateKbps * 1.15) {
            return { ok: false, reason: `คลิปบิตเรตสูงเกินที่ตั้งไว้ (${info.bitrateKbps} > ${config.bitrateKbps} kbps)` };
        }
        infos.push(info);
    }
    if (!infos.length)
        return { ok: false, reason: 'ไม่มีคลิป' };
    const first = infos[0];
    const mixed = infos.some((info) => info.width !== first.width || info.height !== first.height || info.audioCodec !== first.audioCodec);
    if (mixed)
        return { ok: false, reason: 'คลิปหลายตัวมีสเปคไม่ตรงกัน' };
    return { ok: true, reason: '', info: first };
}
// Clips played through the concat demuxer have to match. Tested with the seller's own two
// files — 1080x1920/30fps/48kHz and 1080x1920/60fps/44.1kHz — the video stops dead after
// the first clip: 2201 frames produced where 4800 were due, with the muxer reporting
// non-monotonic DTS and "DTS out of order" at the boundary. The same file listed three
// times produces all 4800. No input flag fixes it: +genpts, +igndts, avoid_negative_ts,
// -fps_mode cfr and aresample=async were all tried and all still lost the same 2599
// frames. The demuxer simply is not built for heterogeneous inputs, so the honest move is
// to catch it before the seller is live rather than let a broadcast freeze mid-way.
function describeClip(info) {
    return `${info.width}x${info.height} · ${Math.round(info.fps)}fps · เสียง ${info.audioCodec || 'ไม่มี'}`;
}
// The concat demuxer cannot play heterogeneous clips — measured with the seller's own
// files (30fps/48kHz next to 60fps/44.1kHz), video stops dead after the first clip and no
// input flag rescues it. The seller's requirement is the opposite of a restriction: any
// mix of clips must just work. So when the chosen clips differ, each nonconforming one is
// transcoded ONCE to a canonical spec (1080x1920 · 30fps · AAC 44.1kHz stereo) into a
// cache keyed by the source file's identity, and the playlist is built from the
// conformed copies. Matching clips are never touched, and a second live with the same
// clips reuses the cache instantly.
const CANONICAL_CLIP = { width: 1080, height: 1920, fps: 30, sampleRate: 44100 };
function conformedClipPath(sourcePath) {
    const stat = (0, node_fs_1.statSync)(sourcePath);
    const key = (0, node_crypto_1.createHash)('sha1').update(`${sourcePath}|${stat.size}|${Math.round(stat.mtimeMs)}`).digest('hex');
    const dir = node_path_1.default.join(electron_1.app.getPath('userData'), 'normalized-clips');
    (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    return node_path_1.default.join(dir, `${key}.mp4`);
}
function clipIsCanonical(info) {
    return (info.videoCodec === 'h264' &&
        info.width === CANONICAL_CLIP.width &&
        info.height === CANONICAL_CLIP.height &&
        Math.round(info.fps) === CANONICAL_CLIP.fps &&
        info.audioCodec === 'aac' &&
        info.sampleRate === CANONICAL_CLIP.sampleRate);
}
// One transcode process per account at most, so a stop can kill it.
const conformChildren = new Map();
const conformJobs = new Map();
function conformClip(accountId, sourcePath, outPath, hasAudioTrack) {
    if ((0, node_fs_1.existsSync)(outPath))
        return Promise.resolve();
    const activeJob = conformJobs.get(outPath);
    if (activeJob)
        return activeJob;
    const ffmpegPath = ffmpegBinary();
    if (!ffmpegPath)
        return Promise.reject(new Error('ไม่พบ FFmpeg ในชุดติดตั้ง'));
    // Transcode to a private temp file and rename into place, rather than writing outPath
    // directly. conformedClipPath() keys the cache on the source file alone, so two accounts
    // starting with the same clip pick the same destination and, writing it at once, produced
    // a file both FFmpegs reported success on and neither had written whole ("Invalid NAL unit
    // size" on playback) — then cached it, so every later live reused the broken copy until
    // someone cleared the folder by hand. rename(2) is atomic within the folder, so the loser
    // of the race replaces one complete file with another complete file.
    const stageOut = `${outPath}.${normalizeAccountId(accountId)}.${(0, node_crypto_1.randomUUID)().slice(0, 8)}.tmp`;
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', sourcePath];
    // A clip with no audio gets a silent track: entries with and without audio streams are
    // just as fatal to the demuxer as mismatched sample rates.
    if (!hasAudioTrack)
        args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
    args.push('-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black', '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '6000k', '-maxrate', '6480k', '-bufsize', '6000k', '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2');
    if (!hasAudioTrack)
        args.push('-map', '0:v:0', '-map', '1:a:0', '-shortest');
    // -f mp4 explicitly: the staged name ends .tmp, and FFmpeg picks its muxer from the
    // extension when none is given, so it would refuse the file outright.
    args.push('-f', 'mp4', stageOut);
    const sessionState = getStreamSession(accountId);
    const startedInGeneration = sessionState.stopGeneration;
    const job = new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(ffmpegPath, args);
        conformChildren.set(accountId, child);
        let stderrText = '';
        child.stderr?.on('data', (chunk) => {
            stderrText = (stderrText + String(chunk)).slice(-2000);
        });
        child.on('error', (error) => {
            conformChildren.delete(accountId);
            reject(error);
        });
        child.on('close', (code, signal) => {
            conformChildren.delete(accountId);
            // The staged file is ours alone, so dropping it can never delete another account's
            // finished cache entry — which the old unlinkSync(outPath) did whenever one account
            // failed on a clip another had just conformed successfully.
            const dropStage = () => {
                try {
                    (0, node_fs_1.unlinkSync)(stageOut);
                }
                catch {
                    // Never got created.
                }
            };
            if (code === 0) {
                try {
                    (0, node_fs_1.renameSync)(stageOut, outPath);
                }
                catch (error) {
                    dropStage();
                    reject(new Error(`ปรับคลิปไม่สำเร็จ (บันทึกไฟล์ที่แปลงแล้วไม่ได้: ${error instanceof Error ? error.message : String(error)})`));
                    return;
                }
                resolve();
                return;
            }
            dropStage();
            // stopFfmpeg SIGKILLs this child, and it is the only thing that does. Reporting that
            // as "ปรับคลิปไม่สำเร็จ (exit null)" told a seller who had just pressed stop that
            // their clip was broken — the app did exactly what they asked and then blamed itself
            // in red. Generation is the reliable signal: stopFfmpeg bumps it before the kill.
            if (sessionState.stopGeneration !== startedInGeneration) {
                reject(new Error('หยุดไลฟ์แล้ว — ยกเลิกการเตรียมคลิป'));
                return;
            }
            // Name the signal when there is one. With -loglevel error a killed FFmpeg leaves no
            // stderr at all, so without this the message degrades to a bare exit code that says
            // nothing about who ended it.
            const detail = stderrText.trim().split('\n').pop() || (signal ? `ถูกปิดด้วยสัญญาณ ${signal}` : `exit ${code}`);
            reject(new Error(`ปรับคลิปไม่สำเร็จ (${detail})`));
        });
    });
    conformJobs.set(outPath, job);
    return job.finally(() => {
        if (conformJobs.get(outPath) === job)
            conformJobs.delete(outPath);
    });
}
// Returns the paths the playlist should actually use. Identity when the clips already
// match each other; conformed copies otherwise.
async function conformClipsIfNeeded(sessionState, clipPaths, startedInGeneration) {
    // A single clip can be transcoded by the live FFmpeg pipeline in real time. Pre-rendering
    // the whole file here delays the actual TikTok room creation and makes Start Live look fake.
    if (clipPaths.length <= 1)
        return clipPaths;
    const infos = [];
    for (const clipPath of clipPaths)
        infos.push(await probeClip(clipPath));
    // An unreadable clip is FFmpeg's error to report at stream start, not ours to guess at.
    if (infos.some((info) => !info))
        return clipPaths;
    const known = infos;
    // Checking "do the clips match EACH OTHER" instead of "does each clip match the
    // canonical spec" missed two real cases: a single-clip playlist always "matched
    // itself" and skipped conforming entirely — a customer's lone HEVC clip was re-encoded
    // live on every broadcast (expensive, and the actual cause of a machine reading
    // 0.90x/near-stall) instead of being converted once and cached like this pipeline is
    // meant to. A multi-clip playlist where every clip shared the same non-canonical
    // spec (e.g. all HEVC) had the identical bug. The concat demuxer's real requirement —
    // every clip identical in spec — is satisfied precisely when every clip is canonical,
    // so checking against CANONICAL_CLIP directly is both simpler and correct for both
    // cases the old pairwise-against-clip-0 comparison missed.
    const mismatched = known.some((info) => !clipIsCanonical(info));
    if (!mismatched)
        return clipPaths;
    const out = [];
    for (let i = 0; i < clipPaths.length; i += 1) {
        if (sessionState.stopGeneration !== startedInGeneration) {
            throw new Error('หยุดไลฟ์แล้ว — ยกเลิกการเตรียมคลิป');
        }
        const info = known[i];
        if (clipIsCanonical(info)) {
            out.push(clipPaths[i]);
            continue;
        }
        const cached = conformedClipPath(clipPaths[i]);
        if (!(0, node_fs_1.existsSync)(cached)) {
            updateStatus(sessionState, {
                state: 'starting',
                message: `กำลังปรับคลิปให้สเปคตรงกัน (${i + 1}/${clipPaths.length}): ${node_path_1.default.basename(clipPaths[i])} — ทำครั้งเดียว ครั้งหน้าจะเริ่มได้ทันที`,
                startedAt: sessionState.status.startedAt,
            });
            await conformClip(sessionState.accountId, clipPaths[i], cached, info.audioCodec !== '');
        }
        out.push(cached);
    }
    return out;
}
async function prepareTikTokConfigBeforeRoom(sessionState, config) {
    const startedInGeneration = sessionState.stopGeneration;
    const playPaths = await conformClipsIfNeeded(sessionState, config.videoPaths, startedInGeneration);
    if (sessionState.stopGeneration !== startedInGeneration) {
        throw new Error('หยุดไลฟ์แล้ว — ยกเลิกการเตรียมคลิป');
    }
    return { ...config, videoPaths: playPaths };
}
// ── Multi-clip rerun playlist (anti-fingerprint rotation) ──────────────────────────
//
// A single clip looped byte-for-byte is a trivial, exact-repeating pattern for TikTok's
// duplicate/rerun detection to fingerprint. When the user selects more than one clip we
// instead build a long concat-demuxer playlist that reshuffles the clip order on every
// pass through the list, so the broadcast does not repeat one fixed sequence.
//
// The playlist is a plain text file generated ONCE per live. Do not wrap concat input in
// FFmpeg's `-stream_loop -1`: the bundled static FFmpeg has been seen segfaulting before
// the first frame while publishing that combination to TikTok RTMP. Instead, make the
// playlist itself long enough for a normal live and reconnect with the saved offset if it
// ever reaches the end.
const PLAYLIST_TARGET_HOURS = 48;
const PLAYLIST_MIN_REPEATS = 20;
const PLAYLIST_MAX_REPEATS = 3000;
function shuffledCopy(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = (0, node_crypto_1.randomInt)(i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
// The concat demuxer's own line format: single-quoted, with embedded quotes escaped by
// closing/re-opening the quote (the standard trick, not shell-specific).
function concatPlaylistLine(filePath) {
    return `file '${filePath.replace(/'/g, "'\\''")}'`;
}
// ── Continue-from-next-clip on mid-live updates ───────────────────────────────────
//
// Applying a clip change rebuilds the playlist, and a rebuilt playlist used to start from
// its first entry — the seller adds clip 4 while clip 1 plays, and the broadcast jumps
// back to clip 1's opening. What they expect is a queue: the update lands, and playback
// carries on with whatever was NEXT. So before the old stream is killed, we work out which
// entry it is currently inside (position = spawn offset + elapsed, walked through the old
// playlist's entries), take the entry after it, and hand the rebuilt playlist that clip as
// its starting point. Rotation, not truncation — the cycle order the seller arranged is
// preserved exactly, just entered at a different point.
function parseConcatPlaylist(text) {
    const entries = [];
    for (const line of text.split('\n')) {
        const match = /^file '(.*)'$/.exec(line.trim());
        if (match)
            entries.push(match[1].replace(/'\\''/g, "'"));
    }
    return entries;
}
function entryIndexAtPosition(entries, durations, position) {
    let cursor = 0;
    for (let i = 0; i < entries.length; i += 1) {
        cursor += durations.get(entries[i]) ?? 0;
        if (position < cursor)
            return i;
    }
    return entries.length - 1;
}
function nextInCycle(list, current) {
    const index = list.indexOf(current);
    if (index === -1)
        return null;
    return list[(index + 1) % list.length];
}
// Where the queue stands: the clip the NEW list should open with, and how many seconds the
// entry on screen has left. remainingSec lets the switch wait for the clip boundary — the
// seller's requirement is that the playing clip finishes; cutting it mid-way to jump to
// the "next" one reads as the update skipping their content. Best-effort by design: every
// failure path degrades to { null, null }, i.e. switch immediately from the list head,
// which is just the old behaviour, never anything worse.
async function clipToResumeFrom(sessionState, newPaths) {
    const nothing = { startWith: null, remainingSec: null };
    const retry = sessionState.retry;
    if (!retry)
        return nothing;
    const oldPaths = retry.config.videoPaths;
    try {
        // Which ORIGINAL clip is on screen right now, and how far into it are we?
        let currentOriginal = null;
        let nextOriginal = null;
        let remainingSec = null;
        if (retry.playlistFile && retry.durationSec > 0) {
            const entries = parseConcatPlaylist((0, node_fs_1.readFileSync)(retry.playlistFile, 'utf8'));
            if (!entries.length)
                return nothing;
            const durations = new Map();
            for (const entry of [...new Set(entries)])
                durations.set(entry, await fileDurationSec(entry));
            const position = ((retry.offsetSec + (Date.now() - retry.spawnedAt) / 1000) % retry.durationSec + retry.durationSec) %
                retry.durationSec;
            const index = entryIndexAtPosition(entries, durations, position);
            let entryStart = 0;
            for (let i = 0; i < index; i += 1)
                entryStart += durations.get(entries[i]) ?? 0;
            const entryLength = durations.get(entries[index]) ?? 0;
            if (entryLength > 0)
                remainingSec = Math.max(0, entryStart + entryLength - position);
            // Playlist entries may be conformed cache copies; map them back to the seller's own
            // paths, which are what the new list is expressed in.
            const toOriginal = new Map();
            for (const original of oldPaths) {
                toOriginal.set(original, original);
                try {
                    toOriginal.set(conformedClipPath(original), original);
                }
                catch {
                    // Source file gone; identity mapping above still stands.
                }
            }
            currentOriginal = toOriginal.get(entries[index]) ?? null;
            nextOriginal = toOriginal.get(entries[(index + 1) % entries.length]) ?? null;
        }
        else {
            // Old live was a single clip: it is trivially the current one, looping on its own
            // duration.
            currentOriginal = oldPaths[0] ?? null;
            if (retry.durationSec > 0) {
                const position = ((retry.offsetSec + (Date.now() - retry.spawnedAt) / 1000) % retry.durationSec + retry.durationSec) %
                    retry.durationSec;
                remainingSec = Math.max(0, retry.durationSec - position);
            }
        }
        // Prefer what the old arrangement would have played next (this honours shuffle order
        // too); fall back to "the clip after the current one in the new list".
        const startWith = nextOriginal && newPaths.includes(nextOriginal)
            ? nextOriginal
            : currentOriginal
                ? nextInCycle(newPaths, currentOriginal)
                : null;
        return { startWith, remainingSec };
    }
    catch {
        return nothing;
    }
}
function rotated(items, startIndex) {
    if (startIndex <= 0)
        return items;
    return [...items.slice(startIndex), ...items.slice(0, startIndex)];
}
async function buildPlaylist(accountId, clipPaths, shuffle, 
// When set (mid-live updates), the playlist OPENS with this clip. The cycle is rotated,
// not reordered: the arrangement the seller made is preserved, entered mid-way.
startWith) {
    const durations = await Promise.all(clipPaths.map((clipPath) => fileDurationSec(clipPath)));
    const cycleDurationSec = durations.reduce((sum, seconds) => sum + seconds, 0) || 1;
    const lines = [];
    let totalDurationSec = cycleDurationSec;
    if (shuffle) {
        // More repeats for a short clip set, fewer for a long one — either way the playlist
        // covers roughly PLAYLIST_TARGET_HOURS before it would ever need to repeat a shuffle.
        const repeats = Math.min(PLAYLIST_MAX_REPEATS, Math.max(PLAYLIST_MIN_REPEATS, Math.ceil((PLAYLIST_TARGET_HOURS * 3600) / cycleDurationSec)));
        for (let pass = 0; pass < repeats; pass += 1) {
            let order = shuffledCopy(clipPaths);
            // Only the opening pass honours startWith — later passes stay fully random.
            if (pass === 0 && startWith) {
                const index = order.indexOf(startWith);
                if (index > 0)
                    order = rotated(order, index);
            }
            for (const clipPath of order)
                lines.push(concatPlaylistLine(clipPath));
        }
        totalDurationSec = cycleDurationSec * repeats;
    }
    else {
        // Shuffle off still needs a long explicit playlist; looping the concat input itself is
        // less stable against TikTok RTMP on the deployed static FFmpeg build.
        const repeats = Math.min(PLAYLIST_MAX_REPEATS, Math.max(PLAYLIST_MIN_REPEATS, Math.ceil((PLAYLIST_TARGET_HOURS * 3600) / cycleDurationSec)));
        const index = startWith ? clipPaths.indexOf(startWith) : -1;
        const order = rotated(clipPaths, Math.max(0, index));
        for (let pass = 0; pass < repeats; pass += 1) {
            for (const clipPath of order)
                lines.push(concatPlaylistLine(clipPath));
        }
        totalDurationSec = cycleDurationSec * repeats;
    }
    const dir = node_path_1.default.join(electron_1.app.getPath('temp'), 'digital-np-studio-playlists');
    (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    const filePath = node_path_1.default.join(dir, `${normalizeAccountId(accountId)}-${(0, node_crypto_1.randomUUID)()}.txt`);
    (0, node_fs_1.writeFileSync)(filePath, lines.join('\n'), 'utf8');
    return { filePath, totalDurationSec };
}
// Best-effort: the playlist is a temp file, so a failed delete is not worth surfacing.
function cleanupPlaylistFile(sessionState) {
    const filePath = sessionState.retry?.playlistFile;
    if (!filePath)
        return;
    try {
        (0, node_fs_1.unlinkSync)(filePath);
    }
    catch {
        // Already removed, or never got written.
    }
}
function sanitizeCamera(value) {
    const input = (value && typeof value === 'object' ? value : {});
    return {
        zoom: Math.min(3, Math.max(1, Number(input.zoom) || 1)),
        panX: Math.min(1, Math.max(-1, Number(input.panX) || 0)),
        panY: Math.min(1, Math.max(-1, Number(input.panY) || 0)),
        mirror: input.mirror === true,
    };
}
function validateConfig(value) {
    if (!value || typeof value !== 'object')
        throw new Error('ข้อมูลสตรีมไม่ถูกต้อง');
    const input = value;
    const videoPaths = [];
    if (Array.isArray(input.videoPaths)) {
        for (const item of input.videoPaths) {
            if (typeof item !== 'string' || !item.length || videoPaths.includes(item))
                continue;
            videoPaths.push(item);
            if (videoPaths.length >= 30)
                break;
        }
    }
    if (!videoPaths.length)
        throw new Error('กรุณาเลือกวิดีโออย่างน้อย 1 คลิป');
    const targetMode = input.targetMode === 'manual' ? 'manual' : 'tiktok';
    const rtmpServer = typeof input.rtmpServer === 'string' ? input.rtmpServer.trim() : '';
    const streamKey = typeof input.streamKey === 'string' ? input.streamKey.trim() : '';
    if (targetMode === 'manual') {
        if (!rtmpServer)
            throw new Error('กรุณากรอก RTMP server');
        if (!/^rtmps?:\/\//i.test(rtmpServer))
            throw new Error('RTMP server ต้องขึ้นต้นด้วย rtmp:// หรือ rtmps://');
        if (!streamKey)
            throw new Error('กรุณากรอก stream key');
    }
    const overlays = Array.isArray(input.overlays)
        ? input.overlays
            .filter((item) => {
            return Boolean(item && typeof item.path === 'string' && typeof item.x === 'number' && typeof item.y === 'number');
        })
            .map((item) => ({ ...item, effect: sanitizeEffect(item.effect) }))
        : [];
    const clocks = Array.isArray(input.clocks)
        ? input.clocks
            .filter((item) => Boolean(item && typeof item.x === 'number' && typeof item.y === 'number'))
            .map((raw, index) => ({
            id: typeof raw.id === 'string' ? raw.id : `clock-${index}`,
            x: Math.round(Math.min(1060, Math.max(-300, raw.x))),
            y: Math.round(Math.min(1900, Math.max(-100, raw.y))),
            fontSize: Math.round(Math.min(180, Math.max(24, Number(raw.fontSize) || 72))),
            opacity: Math.min(1, Math.max(0.1, Number(raw.opacity) || 1)),
            format: sanitizeClockFormat(raw.format),
            color: sanitizeColor(raw.color),
            font: sanitizeFont(raw.font),
            design: sanitizeDesign(raw.design),
            effect: sanitizeEffect(raw.effect),
        }))
            .slice(0, 6)
        : [];
    const texts = Array.isArray(input.texts)
        ? input.texts
            .filter((item) => Boolean(item && typeof item.text === 'string' && typeof item.x === 'number' && typeof item.y === 'number'))
            .map((raw, index) => ({
            id: typeof raw.id === 'string' ? raw.id : `text-${index}`,
            x: Math.round(Math.min(1060, Math.max(-1080, raw.x))),
            y: Math.round(Math.min(1900, Math.max(-100, raw.y))),
            fontSize: Math.round(Math.min(200, Math.max(18, Number(raw.fontSize) || 56))),
            opacity: Math.min(1, Math.max(0.1, Number(raw.opacity) || 1)),
            text: String(raw.text).slice(0, 200),
            color: sanitizeColor(raw.color),
            font: sanitizeFont(raw.font),
            design: sanitizeDesign(raw.design),
            mode: raw.mode === 'marquee' ? 'marquee' : 'static',
            speed: Math.min(400, Math.max(20, Number(raw.speed) || 120)),
            effect: sanitizeEffect(raw.effect),
        }))
            .slice(0, 8)
        : [];
    return {
        videoPaths,
        shuffleEnabled: videoPaths.length > 1 && input.shuffleEnabled === true,
        camera: sanitizeCamera(input.camera),
        overlays: overlays.slice(0, 12),
        clocks,
        texts,
        targetMode,
        accountId: normalizeAccountId(input.accountId),
        liveTitle: typeof input.liveTitle === 'string' ? input.liveTitle.trim().slice(0, 64) : 'Rerun LIVE',
        rtmpServer,
        streamKey,
        loop: input.loop !== false,
        bitrateKbps: Math.min(10000, Math.max(1500, Number(input.bitrateKbps) || 6000)),
    };
}
function sanitizeEffect(value) {
    return value === 'blink' || value === 'pulse' || value === 'float' ? value : 'none';
}
function sanitizeClockFormat(value) {
    const allowed = ['time', 'time-short', 'time-12h', 'date', 'datetime', 'weekday'];
    return allowed.includes(value) ? value : 'time';
}
function sanitizeColor(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : '#ffffff';
}
function sanitizeFont(value) {
    const allowed = [
        'sans', 'modern', 'bold', 'poster', 'classic', 'heavy', 'mono', 'serif',
        'lcd', 'lcd-alpha', 'techno', 'pixel', 'terminal',
    ];
    return allowed.includes(value) ? value : 'sans';
}
function sanitizeDesign(value) {
    const allowed = ['solid-dark', 'solid-accent', 'outline', 'shadow', 'plain'];
    return allowed.includes(value) ? value : 'solid-dark';
}
function ffColor(hex) {
    return `0x${hex.replace('#', '')}`;
}
// Per-font candidate files, most-preferred first. macOS ships Thai-capable faces
// (Thonburi/Sukhumvit/Silom/…); Windows/Linux fall back to their closest system font.
// TODO: bundle a Thai font asset so these render identically on machines lacking them.
const FONT_CANDIDATES = {
    sans: ['/System/Library/Fonts/Thonburi.ttc', 'C:/Windows/Fonts/tahoma.ttf', '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf'],
    modern: ['/System/Library/Fonts/Supplemental/SukhumvitSet.ttc', 'C:/Windows/Fonts/leelawui.ttf', '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf'],
    bold: ['/System/Library/Fonts/Supplemental/Silom.ttf', 'C:/Windows/Fonts/leelawuib.ttf', '/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf'],
    poster: ['/System/Library/Fonts/Supplemental/Krungthep.ttf', 'C:/Windows/Fonts/tahomabd.ttf', '/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf'],
    classic: ['/System/Library/Fonts/Supplemental/Ayuthaya.ttf', 'C:/Windows/Fonts/angsa.ttf', '/usr/share/fonts/truetype/tlwg/Norasi.ttf'],
    heavy: ['/System/Library/Fonts/Supplemental/Sathu.ttf', 'C:/Windows/Fonts/leelawuib.ttf', '/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf'],
    mono: ['/System/Library/Fonts/Menlo.ttc', 'C:/Windows/Fonts/consola.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'],
    serif: ['/System/Library/Fonts/Supplemental/Georgia.ttf', 'C:/Windows/Fonts/georgia.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'],
};
// Prefer a font that covers both Thai and Latin so date/weekday clocks and typed
// Thai text render as real glyphs instead of tofu boxes.
function overlayFont() {
    const candidates = process.platform === 'darwin'
        ? ['/System/Library/Fonts/Thonburi.ttc', '/Library/Fonts/Arial Unicode.ttf', '/System/Library/Fonts/Helvetica.ttc']
        : process.platform === 'win32'
            ? ['C:/Windows/Fonts/tahoma.ttf', 'C:/Windows/Fonts/leelawui.ttf', 'C:/Windows/Fonts/arial.ttf']
            : ['/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'];
    return candidates.find((candidate) => (0, node_fs_1.existsSync)(candidate)) ?? candidates[candidates.length - 1];
}
// Display fonts shipped inside the app (all SIL OFL), so the LCD/techno/pixel clock
// looks render identically on every machine. Digit/Latin-only — Thai text and Thai
// dates should stay on the system fonts above.
const BUNDLED_FONT_FILES = {
    lcd: 'DSEG7Classic-Bold.ttf',
    'lcd-alpha': 'DSEG14Classic-Regular.ttf',
    techno: 'Audiowide-Regular.ttf',
    pixel: 'PressStart2P-Regular.ttf',
    terminal: 'VT323-Regular.ttf',
};
// Packaged builds copy src/assets/fonts into Resources/fonts via electron-builder
// extraResources; dev runs read them straight out of the repo.
function bundledFontPath(fileName) {
    const dir = electron_1.app.isPackaged
        ? node_path_1.default.join(process.resourcesPath, 'fonts')
        : node_path_1.default.join(electron_1.app.getAppPath(), 'src', 'assets', 'fonts');
    return node_path_1.default.join(dir, fileName);
}
// Resolve a per-layer font choice to an existing file, falling back to the shared
// Thai-capable font so a missing face never breaks the render.
function resolveFont(fontId) {
    const bundled = BUNDLED_FONT_FILES[fontId];
    if (bundled) {
        const filePath = bundledFontPath(bundled);
        if ((0, node_fs_1.existsSync)(filePath))
            return filePath;
    }
    const found = (FONT_CANDIDATES[fontId] ?? []).find((candidate) => (0, node_fs_1.existsSync)(candidate));
    return found ?? overlayFont();
}
function designParts(design, opacity) {
    const op = Math.min(1, Math.max(0.1, opacity));
    switch (design) {
        case 'solid-accent':
            return ['box=1', `boxcolor=0xff5a1f@${(op * 0.9).toFixed(2)}`, 'boxborderw=16'];
        case 'outline':
            return [`bordercolor=black@${op.toFixed(2)}`, 'borderw=6'];
        case 'shadow':
            return [`shadowcolor=black@${(op * 0.7).toFixed(2)}`, 'shadowx=5', 'shadowy=5'];
        case 'plain':
            return [];
        case 'solid-dark':
        default:
            return ['box=1', `boxcolor=black@${(op * 0.62).toFixed(2)}`, 'boxborderw=14'];
    }
}
function escapeFilterPath(filePath) {
    return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
}
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
function pad2(value) {
    return String(value).padStart(2, '0');
}
// FFmpeg can render a clock by itself via the localtime expansion, which needs no file,
// no writer timer, and no per-frame reload. Only the formats carrying Thai month or day
// names fall outside what strftime can produce in the C locale, so only those still need a
// file behind them. Colons and backslashes are escaped for the filter parser.
function localtimeClockExpr(format) {
    switch (format) {
        case 'time':
            return '%{localtime\\:%H\\\\\\:%M\\\\\\:%S}';
        case 'time-short':
            return '%{localtime\\:%H\\\\\\:%M}';
        case 'time-12h':
            return '%{localtime\\:%I\\\\\\:%M\\\\\\:%S %p}';
        default:
            // date / datetime / weekday need THAI_MONTHS or THAI_DAYS.
            return null;
    }
}
function formatClock(format, date = new Date()) {
    const h = date.getHours();
    const m = date.getMinutes();
    const s = date.getSeconds();
    const hhmmss = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    const hhmm = `${pad2(h)}:${pad2(m)}`;
    const dateText = `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
    switch (format) {
        case 'time-short':
            return hhmm;
        case 'time-12h': {
            const period = h < 12 ? 'AM' : 'PM';
            const hour12 = h % 12 === 0 ? 12 : h % 12;
            return `${pad2(hour12)}:${pad2(m)}:${pad2(s)} ${period}`;
        }
        case 'date':
            return dateText;
        case 'datetime':
            return `${dateText} ${hhmmss}`;
        case 'weekday':
            return `${THAI_DAYS[date.getDay()]} ${hhmm}`;
        default:
            return hhmmss;
    }
}
function stopOverlayText(sessionState) {
    sessionState.clockTimers.forEach((timer) => clearInterval(timer));
    sessionState.clockTimers = [];
    sessionState.clockTextPaths.forEach((filePath) => {
        try {
            (0, node_fs_1.unlinkSync)(filePath);
        }
        catch {
            // The temporary overlay file may already be gone during app shutdown.
        }
    });
    sessionState.clockTextPaths = [];
}
// Clocks refresh their text file on a timer (drawtext reload=1); typed/marquee text
// is written once. Both live under userData and are cleaned up on stop.
function startOverlayText(sessionState, clocks, texts) {
    stopOverlayText(sessionState);
    const dir = electron_1.app.getPath('userData');
    const clockFiles = clocks.map((clock) => {
        // Clocks FFmpeg can draw on its own need no file and no timer at all — skip both, and
        // keep the array position so buildFilter's index still lines up with `clocks`.
        if (localtimeClockExpr(clock.format))
            return '';
        const filePath = node_path_1.default.join(dir, `live-clock-${sessionState.accountId}-${(0, node_crypto_1.randomUUID)()}.txt`);
        sessionState.clockTextPaths.push(filePath);
        const write = () => {
            if (!sessionState.clockTextPaths.includes(filePath))
                return;
            try {
                (0, node_fs_1.writeFileSync)(filePath, formatClock(clock.format), 'utf8');
            }
            catch {
                // FFmpeg will keep showing the last successfully written value.
            }
        };
        write();
        // These formats carry Thai date or weekday text, which changes once a minute at the
        // fastest, so a 250ms rewrite was 240x more often than needed.
        sessionState.clockTimers.push(setInterval(write, 1000));
        return filePath;
    });
    const textFiles = texts.map((text) => {
        const filePath = node_path_1.default.join(dir, `live-text-${sessionState.accountId}-${(0, node_crypto_1.randomUUID)()}.txt`);
        sessionState.clockTextPaths.push(filePath);
        try {
            (0, node_fs_1.writeFileSync)(filePath, text.text.length ? text.text : ' ', 'utf8');
        }
        catch {
            // Fall back to an empty overlay if the file cannot be written.
        }
        return filePath;
    });
    return { clockFiles, textFiles };
}
// Builds a drawtext filter node reading its content from a text file, applying the
// selected animation via drawtext's alpha/y expressions (evaluated per frame on t).
function drawtextChain(input, output, options) {
    const op = Math.min(1, Math.max(0.1, options.opacity));
    const opFixed = op.toFixed(2);
    const fontSize = Math.round(Math.min(200, Math.max(18, options.fontSize)));
    const baseY = Math.round(options.baseY);
    let alpha = opFixed;
    let yArg = `${baseY}`;
    if (options.effect === 'blink') {
        alpha = `'if(lt(mod(t,1.4),0.7),${opFixed},0.12)'`;
    }
    else if (options.effect === 'pulse') {
        alpha = `'${(op * 0.65).toFixed(2)}+${(op * 0.35).toFixed(2)}*sin(2*PI*t/2.4)'`;
    }
    else if (options.effect === 'float') {
        yArg = `'${baseY}+14*sin(2*PI*t/3)'`;
    }
    const parts = [`fontfile='${options.font}'`];
    if (options.text !== undefined) {
        parts.push(`text='${options.text}'`);
    }
    else {
        parts.push(`textfile='${escapeFilterPath(options.textfile ?? '')}'`);
        // drawtext's `reload` is a FRAME INTERVAL, not a boolean: reload=1 re-opened and
        // re-parsed the file on every single frame, i.e. 30 file opens per second per clock,
        // for the whole broadcast. Harmless on macOS where the page cache absorbs it, but on
        // Windows every open goes through the antivirus filter driver, and a seller testing
        // with and without a clock saw exactly that difference. Ten frames (3x a second) is
        // still faster than any text here changes.
        if (options.reloadEveryFrames)
            parts.push(`reload=${options.reloadEveryFrames}`);
    }
    parts.push(`x=${options.x}`, `y=${yArg}`, `fontsize=${fontSize}`, `fontcolor=${ffColor(options.color)}`, `alpha=${alpha}`, ...designParts(options.design, op));
    return `[${input}]drawtext=${parts.join(':')}[${output}]`;
}
// Builds the [base] stage: fit-with-letterbox exactly as before, then (only when the
// camera control is actually touched) an optional mirror and a zoom+pan crop within that
// already-padded frame. Order matters: mirror happens before the crop so panX/panY keep
// the same "which side you're revealing" meaning regardless of mirror state. Skips the
// zoom/crop entirely at zoom<=1 so an unadjusted camera produces the identical filter
// string as before this feature existed.
function buildBaseFilter(camera) {
    const steps = [
        'scale=1080:1920:force_original_aspect_ratio=decrease',
        'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
        'setsar=1',
    ];
    if (camera.mirror)
        steps.push('hflip');
    const zoom = Math.min(3, Math.max(1, camera.zoom));
    if (zoom > 1.001) {
        const panX = Math.min(1, Math.max(-1, camera.panX));
        const panY = Math.min(1, Math.max(-1, camera.panY));
        const scaledW = Math.round(1080 * zoom);
        const scaledH = Math.round(1920 * zoom);
        const offsetX = Math.round(((scaledW - 1080) / 2) * (1 + panX));
        const offsetY = Math.round(((scaledH - 1920) / 2) * (1 + panY));
        steps.push(`scale=${scaledW}:${scaledH}`, `crop=1080:1920:${offsetX}:${offsetY}`);
    }
    return `[0:v]${steps.join(',')}[base]`;
}
function buildFilter(camera, overlays, clocks, texts, clockFiles, textFiles, 
// Applied last, after everything is composited, so overlay/clock/text coordinates stay
// in the 1080x1920 space they were authored in. Only set when the machine can't sustain
// realtime at full size (see detectEncoderPlan).
downscale = null) {
    const filters = [buildBaseFilter(camera)];
    let previous = 'base';
    overlays.forEach((overlay, index) => {
        const width = Math.round(Math.min(1080, Math.max(32, overlay.width || 240)));
        const opacity = Math.min(1, Math.max(0.05, overlay.opacity || 1)).toFixed(2);
        const x = Math.round(Math.min(1080 - 16, Math.max(-width + 16, overlay.x)));
        const baseY = Math.round(Math.min(1920 - 16, Math.max(-1920 + 16, overlay.y)));
        const yArg = overlay.effect === 'float' ? `'${baseY}+12*sin(2*PI*t/3)'` : `${baseY}`;
        filters.push(`[${index + 1}:v]format=rgba,colorchannelmixer=aa=${opacity},scale=${width}:-1[overlay${index}]`);
        const output = `composed${index}`;
        filters.push(`[${previous}][overlay${index}]overlay=x=${x}:y=${yArg}:format=auto[${output}]`);
        previous = output;
    });
    clocks.forEach((clock, index) => {
        const expr = localtimeClockExpr(clock.format);
        const file = clockFiles[index];
        if (!expr && !file)
            return;
        const output = `clock${index}`;
        filters.push(drawtextChain(previous, output, {
            font: escapeFilterPath(resolveFont(clock.font)),
            ...(expr ? { text: expr } : { textfile: file, reloadEveryFrames: CLOCK_RELOAD_FRAMES }),
            x: `${Math.round(clock.x)}`,
            baseY: clock.y,
            fontSize: clock.fontSize,
            color: clock.color,
            design: clock.design,
            opacity: clock.opacity,
            effect: clock.effect,
        }));
        previous = output;
    });
    texts.forEach((text, index) => {
        const file = textFiles[index];
        if (!file)
            return;
        const output = `text${index}`;
        const xArg = text.mode === 'marquee'
            ? `'w-mod(t*${Math.round(text.speed)},w+tw)'`
            : `${Math.round(text.x)}`;
        filters.push(drawtextChain(previous, output, {
            font: escapeFilterPath(resolveFont(text.font)),
            textfile: file,
            x: xArg,
            baseY: text.y,
            fontSize: text.fontSize,
            color: text.color,
            design: text.design,
            opacity: text.opacity,
            effect: text.effect,
        }));
        previous = output;
    });
    const finalScale = downscale ? `,scale=${downscale.width}:${downscale.height}` : '';
    filters.push(`[${previous}]format=yuv420p${finalScale}[outv]`);
    return filters.join(';');
}
async function startFfmpeg(sessionState, config, outputUrl) {
    if (sessionState.ffmpegProcess)
        throw new Error('บัญชีนี้กำลังไลฟ์อยู่แล้ว');
    // See stopGeneration on the session: everything between here and spawn() can take
    // seconds, and a stop pressed during it must win over this start.
    const startedInGeneration = sessionState.stopGeneration;
    const ffmpegPath = ffmpegBinary();
    if (!ffmpegPath)
        throw new Error('ไม่พบ FFmpeg ในชุดติดตั้ง');
    // sessionState.retry only exists once this live has spawned FFmpeg before, so its
    // presence is exactly "this call is a reconnect". A reconnect reuses the already-built
    // playlist/duration/audio decision instead of re-shuffling or re-probing every clip on
    // each of up to 12 retries — and, for a multi-clip live, resumes into the SAME order
    // rather than a new shuffle appearing mid-broadcast.
    const isReconnect = Boolean(sessionState.retry);
    let playlistFile;
    let totalDurationSec;
    let hasAudio;
    // A reconnect may only reuse the retry snapshot when it still fits this config: applying
    // a changed clip list clears playlistFile, and reusing a null playlist here would leave
    // a multi-clip live playing only its first clip forever.
    const snapshotUsable = isReconnect && (config.videoPaths.length <= 1 || sessionState.retry.playlistFile !== null);
    if (snapshotUsable && isReconnect && config.videoPaths.length > 1) {
        playlistFile = sessionState.retry.playlistFile;
        totalDurationSec = sessionState.retry.durationSec;
        hasAudio = sessionState.retry.hasAudio;
    }
    else if (snapshotUsable && isReconnect && sessionState.retry.durationSec > 0) {
        playlistFile = null;
        totalDurationSec = sessionState.retry.durationSec;
        hasAudio = sessionState.retry.hasAudio;
    }
    else if (config.videoPaths.length > 1) {
        const playPaths = await conformClipsIfNeeded(sessionState, config.videoPaths, startedInGeneration);
        // Translate the requested opening clip through the conform mapping: playPaths is
        // index-aligned with videoPaths, so the seller's path becomes whichever copy plays.
        const requested = sessionState.retry?.startWithClip;
        const requestedIndex = requested ? config.videoPaths.indexOf(requested) : -1;
        if (sessionState.retry)
            sessionState.retry.startWithClip = undefined;
        // Start with the first clip shown in the UI so the seller's preview matches the
        // video TikTok receives; shuffle still randomizes the rest of the cycle.
        const openingClip = requestedIndex >= 0 ? playPaths[requestedIndex] : playPaths[0];
        const built = await buildPlaylist(sessionState.accountId, playPaths, config.shuffleEnabled, openingClip);
        playlistFile = built.filePath;
        totalDurationSec = built.totalDurationSec;
        hasAudio = (await Promise.all(playPaths.map((clipPath) => fileHasAudio(clipPath)))).every(Boolean);
        config = { ...config, videoPaths: playPaths };
    }
    else {
        const playPaths = await conformClipsIfNeeded(sessionState, config.videoPaths, startedInGeneration);
        const playPath = playPaths[0] || config.videoPaths[0];
        config = { ...config, videoPaths: [playPath] };
        playlistFile = null;
        totalDurationSec = await fileDurationSec(playPath);
        hasAudio = await fileHasAudio(playPath);
    }
    const { clockFiles, textFiles } = startOverlayText(sessionState, config.clocks, config.texts);
    const args = ['-hide_banner', '-loglevel', 'info', '-re'];
    // Each -stream_loop pass restarts timestamps at zero. Regenerating PTS is cheap
    // insurance for single-file loops. Multi-clip concat playlists are already expanded to
    // a long timeline; looping the concat demuxer itself can crash this FFmpeg build while
    // publishing to TikTok RTMP.
    if (playlistFile)
        args.push('-fflags', '+genpts');
    else if (config.loop)
        args.push('-stream_loop', '-1', '-fflags', '+genpts');
    // Pick the rerun back up where a dropped run left off. -ss before -i seeks accurately
    // into a concat playlist's virtual timeline too (verified), so later loops/clips still
    // play whole — without this, a live that drops every few minutes never gets past the
    // opening clip.
    const resumeOffset = sessionState.retry?.offsetSec ?? 0;
    if (resumeOffset >= 1)
        args.push('-ss', resumeOffset.toFixed(2));
    if (playlistFile) {
        args.push('-f', 'concat', '-safe', '0', '-i', playlistFile);
    }
    else {
        args.push('-i', config.videoPaths[0]);
    }
    config.overlays.forEach((overlay) => args.push('-loop', '1', '-i', overlay.path));
    let silentAudioIndex = -1;
    if (!hasAudio) {
        silentAudioIndex = config.overlays.length + 1;
        args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
    }
    const maxrate = Math.round(config.bitrateKbps * 1.08);
    // bufsize was 2x the bitrate — a two-second VBV window, which lets the encoder emit a
    // burst at twice the nominal rate. On a home uplink that is already near capacity those
    // bursts queue, the RTMP write stalls, and TikTok drops the publish; the seller sees a
    // live that is fine at first and then keeps reconnecting. One second is the standard
    // live setting (what OBS uses for CBR) and keeps the output paced.
    const encoderRate = { bitrateKbps: config.bitrateKbps, maxrateKbps: maxrate, bufsizeKbps: config.bitrateKbps };
    // A fresh user-initiated start gets a clean slate; reconnects keep whatever level the
    // watchdog already had to reach, so a degraded live doesn't stutter all over again.
    if (!isReconnect)
        sessionState.degradeLevel = 0;
    // Benchmark the heaviest clip in the playlist (file size per second is a cheap proxy
    // for decode+scale cost) — the old code measured clip #1 only, so a light first clip
    // followed by a heavy 4K one passed the benchmark and then stuttered mid-live.
    const samplePath = await pickHeaviestClip(config.videoPaths);
    // Machine capability is measured once per app run; the PLAN is re-derived per live,
    // because lives running concurrently share the same CPU/GPU — a benchmark taken on an
    // idle machine says nothing about the third simultaneous stream.
    // Decided before the benchmark: a passthrough live never encodes, so measuring how fast
    // this machine encodes would only delay going live.
    const passthrough = await passthroughVerdict(config, null);
    const measurements = passthrough.ok
        ? { hardware: null, softwareSpeed: 99, hardwareSpeed: 0 }
        : await (0, encoder_1.detectEncoderMeasurements)(ffmpegPath, samplePath, encoderRate);
    // Hardware DECODE (v0.7.15) is REVERTED as of v0.7.17 — a customer on h264_nvenc with
    // d3d11va decode got zero video packets on every attempt ("Nothing was written into
    // output file, because at least one of its streams received no packets"), i.e. no
    // frames ever reached the filter graph at all. detectHardwareDecoder()'s probe only
    // proved the decoder could decode into `-f null -`; it never proved d3d11va-decoded
    // frames survive the trip through -filter_complex (overlay/scale/pad with the image
    // and silent-audio inputs also present) on real Windows hardware — there is no
    // Windows box in this dev loop to verify that on. A live that occasionally stutters
    // beats one that produces no video at all, so this stays off until it can be proven
    // working end-to-end, not just at the decode-probe level. GPU ENCODE (h264_nvenc/
    // qsv/amf, planCandidates in encoder.ts) is unrelated and unaffected — that part is
    // confirmed working (13-minute clean live on qsv, this same session's own nvenc
    // reading 8.8-9.5x).
    const hwDecode = null;
    // Now that a real measurement exists, let it replace the logical-core estimate that
    // maxConcurrentStreams falls back to before the first live.
    measuredStreamCapacity = (0, encoder_1.sustainableStreamCount)(measurements);
    let concurrent = 1;
    for (const other of streamSessions.values()) {
        if (other !== sessionState && other.ffmpegProcess)
            concurrent += 1;
    }
    // Charge for the filter graph THIS live will actually run. A bare stream and one with a
    // dozen image overlays cost very different amounts, and a flat factor under-served the
    // decorated case badly.
    const filterCost = (0, encoder_1.overlayCost)({
        images: config.overlays.length,
        clocks: config.clocks.length,
        texts: config.texts.length,
        zoomed: config.camera.zoom > 1.001,
    });
    const planOpts = { concurrent, degradeLevel: sessionState.degradeLevel, filterCost };
    let plan = (0, encoder_1.planFromMeasurements)(measurements, planOpts);
    const qualityFirstFullFrame =
        !isReconnect &&
            sessionState.degradeLevel === 0 &&
            concurrent === 1 &&
            config.bitrateKbps >= 6000 &&
            !passthrough.ok;
    if (qualityFirstFullFrame && plan.downscale) {
        process.stderr.write(`[encoder] account=${sessionState.accountId} quality-first full-frame override ` +
            `from=${plan.downscale.width}x${plan.downscale.height} bitrate=${config.bitrateKbps}k\n`);
        plan = { ...plan, downscale: null };
    }
    const canDegradeMore = (0, encoder_1.canDegradeFurther)(measurements, planOpts);
    // The seller's configured bitrate is authoritative. If the setup says 6,000 kbps,
    // FFmpeg must request 6,000 kbps even when the encoder plan downscales frames.
    const ladderBitrate = config.bitrateKbps;
    const ladderRate = {
        bitrateKbps: ladderBitrate,
        maxrateKbps: Math.round(ladderBitrate * 1.08),
        bufsizeKbps: qualityFirstFullFrame && !plan.downscale ? ladderBitrate * 2 : ladderBitrate,
    };
    const encoder = plan.encoder;
    const outputFps = outputFpsForFrame(plan.downscale);
    const outputGop = outputFps * 2;
    // Not sent to the renderer (nothing there needs it, and this is diagnostic-only) — just
    // stderr, same as the ffmpeg output below, so it shows up if we ever need to ask a
    // tester to run the packaged app from a terminal to see what got picked.
    const frameLabel = plan.downscale ? `${plan.downscale.width}x${plan.downscale.height}` : '1080x1920';
    sessionState.tech =
        (passthrough.ok
            ? 'ส่งตรงไม่เข้ารหัส'
            : `เข้ารหัสใหม่ (${passthrough.reason}) · ${encoder} · ${frameLabel}/${outputFps}fps · ${ladderBitrate} kbps · วัดได้ ${plan.measuredSpeed.toFixed(2)}x`) +
            // Surfaced here on purpose: the history line is the one diagnostic a customer can
            // screenshot, and "was the decode on the GPU" is the first question for a stutter.
            (hwDecode ? ` · ถอดรหัส GPU (${hwDecode})` : '') +
            ` · ${concurrent} ไลฟ์พร้อมกัน · ${node_os_1.default.cpus()?.length || 0} core · RAM ${Math.round(node_os_1.default.totalmem() / 1024 ** 3)} GB`;
    process.stderr.write(`[encoder] account=${sessionState.accountId} selected=${encoder} preset=${plan.preset} ` +
        `frame=${frameLabel} fps=${outputFps} bitrate=${ladderBitrate}k measured=${plan.measuredSpeed.toFixed(2)}x ` +
        `concurrent=${concurrent} degrade=${sessionState.degradeLevel} ` +
        `mode=${passthrough.ok ? 'passthrough' : 'reencode'}${passthrough.ok ? '' : ` (${passthrough.reason})`}\n`);
    // Quality was reduced to keep the stream real-time — say so rather than letting the
    // seller wonder why this live looks softer than the last one.
    if (plan.preset === 'fast' || plan.downscale) {
        const parts = [plan.preset === 'fast' ? 'ลดความละเอียดการบีบอัด' : '', plan.downscale ? `ย่อภาพเป็น ${frameLabel}` : '']
            .filter(Boolean)
            .join(' และ ');
        emitChatEvent(sessionState.accountId, {
            kind: 'system',
            id: (0, node_crypto_1.randomUUID)(),
            text: `เครื่องนี้เข้ารหัสได้ ${plan.measuredSpeed.toFixed(2)}x ซึ่งไม่พอสำหรับไลฟ์ — ระบบ${parts}ให้อัตโนมัติ ` +
                `เพื่อไม่ให้ภาพกระตุกหรือหลุด` +
                '',
            at: Date.now(),
        });
    }
    // Tell the seller which mode they got, and what is costing them the cheap one. The
    // difference is not subtle — 15s of their own clip measured 11.45s of CPU re-encoded
    // against 0.01s passed through — so a clip exported at 60fps instead of 30 is worth
    // knowing about.
    emitChatEvent(sessionState.accountId, {
        kind: 'system',
        id: (0, node_crypto_1.randomUUID)(),
        text: passthrough.ok
            ? 'ส่งวิดีโอตรงไปยัง TikTok โดยไม่เข้ารหัสใหม่ — เครื่องแทบไม่ต้องทำงาน ภาพคมเท่าไฟล์ต้นฉบับ'
            : `กำลังเข้ารหัสวิดีโอใหม่เพราะ ${passthrough.reason} — ถ้าเอาเหตุนี้ออกได้ เครื่องจะเบาลงมาก`,
        at: Date.now(),
    });
    if (passthrough.ok) {
        // Nothing to draw and the file already matches: mux it straight through. No decode, no
        // filter graph, no encode — this is what makes a modest machine keep up.
        args.push('-map', '0:v:0');
        if (hasAudio) {
            args.push('-map', '0:a:0');
            if (playlistFile)
                args.push('-af', 'aresample=async=1:first_pts=0', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2');
            else
                args.push('-c:a', 'copy');
        }
        else
            args.push('-map', `${silentAudioIndex}:a:0`, '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2');
        args.push('-c:v', 'copy', '-flvflags', 'no_duration_filesize', '-progress', 'pipe:2', '-nostats');
    }
    else {
        args.push('-filter_complex', buildFilter(config.camera, config.overlays, config.clocks, config.texts, clockFiles, textFiles, plan.downscale), '-map', '[outv]', '-map', hasAudio ? '0:a:0' : `${silentAudioIndex}:a:0`, ...(0, encoder_1.videoEncoderArgs)(encoder, ladderRate, plan.preset), '-pix_fmt', 'yuv420p', '-r', String(outputFps), '-g', String(outputGop), '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-flvflags', 'no_duration_filesize', '-progress', 'pipe:2', '-nostats');
    }
    if (!config.loop)
        args.push('-shortest');
    // Before the URL so it applies to the output protocol. Keep it for manual RTMP, where
    // it was verified against a local sink. TikTok's ingest is created dynamically and the
    // bundled static FFmpeg has been seen segfaulting before the first frame while opening
    // that output; for TikTok, let our connect/stall watchdog own recovery instead.
    if (config.targetMode === 'manual') {
        args.push('-rw_timeout', String(RTMP_WRITE_TIMEOUT_US));
    }
    args.push('-f', 'flv', outputUrl);
    // Carrying startedAt keeps the on-air clock (and eventual history duration) counting
    // from the original start when this call is a reconnect rather than a fresh live.
    updateStatus(sessionState, {
        state: 'starting',
        message: 'กำลังเชื่อมต่อ RTMP…',
        startedAt: sessionState.status.startedAt ?? Date.now(),
    });
    // Remember how to respawn this exact stream; attempts carry over across restarts.
    if (sessionState.stopGeneration !== startedInGeneration) {
        throw new Error('หยุดไลฟ์แล้ว — ยกเลิกการเริ่มสตรีมที่ค้างอยู่');
    }
    process.stderr.write(`[rtmp] account=${sessionState.accountId} mode=${config.targetMode} output=${describeRtmpOutput(outputUrl)} ` +
        `bitrate=${config.bitrateKbps}k connectTimeout=${Math.round(RTMP_CONNECT_TIMEOUT_MS / 1000)}s\n`);
    sessionState.retry = {
        config,
        outputUrl,
        attempts: sessionState.retry?.attempts ?? 0,
        everLive: sessionState.retry?.everLive ?? false,
        offsetSec: resumeOffset,
        spawnedAt: Date.now(),
        durationSec: totalDurationSec,
        hasAudio,
        playlistFile,
        timer: null,
        settleTimer: null,
    };
    const child = (0, node_child_process_1.spawn)(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    sessionState.ffmpegProcess = child;
    let stderr = '';
    let stdout = '';
    let becameLive = false;
    const spawnedAt = Date.now();
    // If FFmpeg never emits progress it is stuck opening the input or completing the
    // RTMP publish handshake (TikTok not accepting the stream). Without this watchdog
    // the UI sits on "กำลังเชื่อมต่อ" forever because errors only surface on close.
    const connectWatchdog = setTimeout(() => {
        if (becameLive || sessionState.ffmpegProcess !== child)
            return;
        // Mid-reconnect, don't flash an error status: the close handler will schedule the
        // next attempt and keep the "กำลังต่อใหม่" message. A transient error state here
        // would fire a LINE error push and write a history row for every failed attempt.
        const willRetry = sessionState.retry?.everLive && sessionState.retry.attempts < MAX_RESTART_ATTEMPTS;
        if (!willRetry) {
            const lastLine = lastMeaningfulStderrLine(stderr);
            updateStatus(sessionState, {
                state: 'error',
                message: `FFmpeg ต่อ RTMP ไม่สำเร็จใน ${Math.round(RTMP_CONNECT_TIMEOUT_MS / 1000)} วินาที — TikTok อาจยังไม่รับสตรีมจาก server${lastLine ? ` (${lastLine})` : ''}`,
            });
        }
        try {
            child.kill('SIGKILL');
        }
        catch {
            // Process may already be gone; kill is best-effort.
        }
    }, RTMP_CONNECT_TIMEOUT_MS);
    connectWatchdog.unref();
    let lastHealthAt = 0;
    // Armed only once the stream is actually live: before that connectWatchdog owns the
    // timeout, and a slow input probe would otherwise look like a stall.
    let stallPoll = null;
    const clearStallPoll = () => {
        if (stallPoll) {
            clearInterval(stallPoll);
            stallPoll = null;
        }
    };
    const armStallPoll = () => {
        clearStallPoll();
        stallPoll = setInterval(() => {
            if (sessionState.ffmpegProcess !== child)
                return clearStallPoll();
            // Stopping, or already respawning for a degrade — neither is a stall.
            if (sessionState.status.state === 'stopping' || sessionState.degradeRestartPending)
                return;
            if (Date.now() - lastHealthAt < LIVE_STALL_TIMEOUT_MS)
                return;
            clearStallPoll();
            // Say what happened, because the close handler's fallback reason is read off stderr
            // and a stalled FFmpeg by definition wrote nothing to read.
            sessionState.stallReason =
                `สัญญาณเงียบไปเกิน ${Math.round(LIVE_STALL_TIMEOUT_MS / 1000)} วินาที (ปลายทางหยุดรับข้อมูล)`;
            // SIGKILL rather than SIGTERM: the process is blocked inside a socket write, where
            // it will not get around to running a signal handler.
            try {
                child.kill('SIGKILL');
            }
            catch {
                // Already gone; close handler still runs.
            }
        }, LIVE_STALL_POLL_MS);
        stallPoll.unref();
    };
    // Consecutive below-realtime health samples (they arrive ~1/s). The benchmark is a
    // 5-second guess; the live itself is the ground truth. When the encode stays under
    // pace long enough to be a trend rather than a blip, respawn FFmpeg one degrade level
    // down — a smooth softer stream beats a stuttering sharp one, and the watchdog only
    // fires while planFromMeasurements still has a genuinely faster option to offer.
    let lowSpeedStreak = 0;
    child.stderr.on('data', (chunk) => {
        const text = String(chunk);
        // -progress emits key=value lines; report at most once a second so the renderer is
        // not flooded while FFmpeg reports several times per second.
        if (text.includes('speed=') && Date.now() - lastHealthAt > 1000) {
            const read = (key) => {
                const match = new RegExp(`${key}=\\s*([0-9.]+)`).exec(text);
                return match ? Number(match[1]) : NaN;
            };
            const speed = read('speed');
            if (Number.isFinite(speed)) {
                lastHealthAt = Date.now();
                const health = {
                    speed,
                    fps: read('fps') || 0,
                    bitrateKbps: Math.round(read('bitrate') || 0),
                    dropped: read('drop_frames') || 0,
                    duplicated: read('dup_frames') || 0,
                };
                mainWindow?.webContents.send('stream:health', { accountId: sessionState.accountId, health });
                // -re paces the input at wall clock, so a HEALTHY live reports ~0.95-1.02x no
                // matter how fast the machine is — a box measured at 13.6x in the benchmark reads
                // 0.955x here. The old 0.95 threshold sat inside that normal band, so ordinary
                // jitter could trip the watchdog and SIGKILL a perfectly good stream. A machine
                // that genuinely cannot keep up reads far lower (the failing tester was at 0.56x),
                // so the bar belongs well below the healthy band, held for longer.
                lowSpeedStreak = speed < LIVE_SPEED_FLOOR ? lowSpeedStreak + 1 : 0;
                if (lowSpeedStreak >= LIVE_SPEED_STREAK && becameLive && canDegradeMore && !sessionState.degradeRestartPending) {
                    sessionState.degradeRestartPending = true;
                    sessionState.degradeLevel += 1;
                    emitChatEvent(sessionState.accountId, {
                        kind: 'system',
                        id: (0, node_crypto_1.randomUUID)(),
                        text: `เครื่องเข้ารหัสตามไลฟ์ไม่ทัน (${speed.toFixed(2)}x ต่อเนื่อง) — กำลังลดคุณภาพภาพลงหนึ่งขั้นแล้วต่อสตรีมอัตโนมัติ เพื่อให้ไลฟ์หายกระตุก`,
                        at: Date.now(),
                    });
                    try {
                        child.kill('SIGKILL');
                    }
                    catch {
                        // Already exited; the close handler still sees degradeRestartPending.
                    }
                }
            }
        }
        // Surface FFmpeg output so launching the app from a terminal reveals the exact
        // RTMP connect/handshake error (input open, Connection refused, TLS, etc.).
        process.stderr.write(`[ffmpeg] ${text}`);
        stderr = (stderr + text).slice(-4000);
        if (!becameLive && /progress=continue|out_time_ms=[1-9]/.test(text)) {
            becameLive = true;
            clearTimeout(connectWatchdog);
            // Seed the clock from the first frame so the poller measures silence since going
            // live, not since an epoch-zero lastHealthAt that would trip it instantly.
            lastHealthAt = Date.now();
            armStallPoll();
            updateStatus(sessionState, {
                state: 'live',
                message: 'กำลังไลฟ์',
                startedAt: sessionState.status.startedAt ?? Date.now(),
            });
            // Once it has held up for a while, treat the stream as healthy again so a later
            // blip gets the full retry budget rather than the leftovers from an earlier one.
            const retry = sessionState.retry;
            if (retry) {
                retry.everLive = true;
                retry.settleTimer = setTimeout(() => {
                    if (sessionState.ffmpegProcess === child && sessionState.retry)
                        sessionState.retry.attempts = 0;
                }, RESTART_HEALTHY_AFTER_MS);
                retry.settleTimer.unref();
            }
        }
    });
    child.stdout.on('data', (chunk) => {
        const text = String(chunk);
        stdout = (stdout + text).slice(-4000);
        process.stderr.write(`[ffmpeg-stdout] ${text}`);
    });
    child.on('error', (error) => {
        clearTimeout(connectWatchdog);
        clearStallPoll();
        sessionState.degradeRestartPending = false;
        sessionState.ffmpegProcess = null;
        stopOverlayText(sessionState);
        cancelRestart(sessionState);
        void finishRoom(sessionState);
        updateStatus(sessionState, { state: 'error', message: `เปิด FFmpeg ไม่สำเร็จ: ${error.message}` });
    });
    child.on('close', (code, signal) => {
        clearTimeout(connectWatchdog);
        clearStallPoll();
        sessionState.ffmpegProcess = null;
        stopOverlayText(sessionState);
        const retry = sessionState.retry;
        if (retry?.settleTimer) {
            clearTimeout(retry.settleTimer);
            retry.settleTimer = null;
        }
        const stoppedByUser = sessionState.status.state === 'stopping';
        const closeDetail = lastMeaningfulStderrLine(stderr) || lastMeaningfulStderrLine(stdout) || 'none';
        process.stderr.write(`[ffmpeg-close] account=${sessionState.accountId} code=${code ?? 'null'} signal=${signal ?? 'none'} ` +
            `live=${becameLive ? 'yes' : 'no'} ms=${Date.now() - spawnedAt} detail=${closeDetail.slice(0, 240)}\n`);
        if (!stoppedByUser && code === 0 && becameLive && retry?.everLive && retry.attempts < MAX_RESTART_ATTEMPTS) {
            retry.attempts += 1;
            const delayMs = Math.min(10000, 1000 * retry.attempts);
            if (retry.durationSec > 0) {
                const playedSec = retry.offsetSec + (Date.now() - retry.spawnedAt + delayMs) / 1000;
                retry.offsetSec = playedSec % retry.durationSec;
            }
            updateStatus(sessionState, {
                state: 'starting',
                message: `FFmpeg ปิดเองระหว่างไลฟ์ — กำลังต่อใหม่อัตโนมัติ (ครั้งที่ ${retry.attempts}/${MAX_RESTART_ATTEMPTS})`,
                startedAt: sessionState.status.startedAt,
            });
            retry.timer = setTimeout(() => {
                retry.timer = null;
                if (sessionState.ffmpegProcess)
                    return;
                void startFfmpeg(sessionState, retry.config, retry.outputUrl).catch((error) => {
                    if (!sessionState.retry)
                        return;
                    updateStatus(sessionState, {
                        state: 'error',
                        message: `ต่อใหม่ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
                    });
                });
            }, delayMs);
            retry.timer.unref();
            return;
        }
        if (stoppedByUser || code === 0) {
            sessionState.degradeRestartPending = false;
            sessionState.stallReason = null;
            cleanupPlaylistFile(sessionState);
            sessionState.retry = null;
            void finishRoom(sessionState);
            updateStatus(sessionState, { state: 'idle', message: 'หยุดไลฟ์แล้ว' });
            return;
        }
        // The watchdog killed this FFmpeg on purpose to respawn it one degrade level down.
        // Same resume mechanics as a connection retry (offset carried forward, room and chat
        // stay up), but it neither consumes a retry attempt nor reports a scary "connection
        // lost" — the network did nothing wrong.
        if (sessionState.degradeRestartPending && retry) {
            sessionState.degradeRestartPending = false;
            const delayMs = 1000;
            if (retry.durationSec > 0) {
                const playedSec = retry.offsetSec + (Date.now() - retry.spawnedAt + delayMs) / 1000;
                retry.offsetSec = playedSec % retry.durationSec;
            }
            const applied = sessionState.applyRestartPending;
            sessionState.applyRestartPending = false;
            updateStatus(sessionState, {
                state: 'starting',
                message: applied
                    ? 'กำลังใช้การตั้งค่าใหม่กับไลฟ์นี้ — อีกสักครู่ภาพจะกลับมา'
                    : 'กำลังปรับคุณภาพวิดีโอให้เหมาะกับเครื่อง แล้วต่อไลฟ์ต่ออัตโนมัติ',
                startedAt: sessionState.status.startedAt,
            });
            retry.timer = setTimeout(() => {
                // The handle is spent the moment this runs; leaving it set made a stale timer look
                // like a pending reconnect to anyone checking retry.timer later.
                retry.timer = null;
                if (sessionState.ffmpegProcess)
                    return;
                void startFfmpeg(sessionState, retry.config, retry.outputUrl).catch((error) => {
                    // A start aborted because the seller pressed stop mid-preamble is not a failure;
                    // stop already put the session in its final idle state, and painting an error
                    // over it would tell them the stop went wrong when it went exactly right.
                    if (!sessionState.retry)
                        return;
                    updateStatus(sessionState, {
                        state: 'error',
                        message: `ต่อใหม่ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
                    });
                });
            }, delayMs);
            retry.timer.unref();
            return;
        }
        // A bad file or rejected stream key will fail identically on every retry, so those
        // stop immediately instead of hammering TikTok for a minute.
        const fatal = /No such file or directory/i.test(stderr)
            ? 'ไม่พบไฟล์วิดีโอหรือ overlay'
            : /Forbidden stream pushing|Operation not permitted/i.test(stderr)
                ? 'TikTok ปฏิเสธการส่งสตรีมแล้ว — ไลฟ์อาจถูกจำกัด/ถูกแจ้งเตือนใน TikTok Shop กรุณาตรวจหน้าต่าง TikTok แล้วเริ่มไลฟ์ใหม่เมื่อ TikTok อนุญาต'
            : /Connection refused/i.test(stderr)
                ? 'RTMP server ปฏิเสธการเชื่อมต่อ กรุณาตรวจ server และ stream key'
                : null;
        if (!fatal && retry?.everLive && retry.attempts < MAX_RESTART_ATTEMPTS) {
            retry.attempts += 1;
            const delayMs = Math.min(30000, 3000 * retry.attempts);
            // -re makes playback run at wall-clock speed, so elapsed time is how far into the
            // clip we got. Add the gap itself so the rerun stays roughly in sync with the clock,
            // then wrap around the clip length.
            if (retry.durationSec > 0) {
                const playedSec = retry.offsetSec + (Date.now() - retry.spawnedAt + delayMs) / 1000;
                retry.offsetSec = playedSec % retry.durationSec;
            }
            // Keep the configured bitrate across reconnects. Users choose this value for image
            // quality, so reconnect recovery must not silently lower it.
            // Say WHY it dropped. Without this the seller only ever sees "การเชื่อมต่อหลุด" and
            // has nothing to report back, which is exactly the position we were in diagnosing it.
            const reason = sessionState.stallReason ?? lastMeaningfulStderrLine(stderr);
            sessionState.stallReason = null;
            updateStatus(sessionState, {
                state: 'starting',
                message: `การเชื่อมต่อหลุด — กำลังต่อใหม่อัตโนมัติ (ครั้งที่ ${retry.attempts}/${MAX_RESTART_ATTEMPTS})` +
                    (reason ? ` · สาเหตุ: ${reason.slice(0, 160)}` : ''),
                startedAt: sessionState.status.startedAt,
            });
            // The TikTok room and chat connection stay up across the gap, so the live itself
            // survives; only the FFmpeg publish is rebuilt.
            retry.timer = setTimeout(() => {
                // The handle is spent the moment this runs; leaving it set made a stale timer look
                // like a pending reconnect to anyone checking retry.timer later.
                retry.timer = null;
                if (sessionState.ffmpegProcess)
                    return;
                void startFfmpeg(sessionState, retry.config, retry.outputUrl).catch((error) => {
                    // A start aborted because the seller pressed stop mid-preamble is not a failure;
                    // stop already put the session in its final idle state, and painting an error
                    // over it would tell them the stop went wrong when it went exactly right.
                    if (!sessionState.retry)
                        return;
                    updateStatus(sessionState, {
                        state: 'error',
                        message: `ต่อใหม่ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
                    });
                });
            }, delayMs);
            retry.timer.unref();
            return;
        }
        cleanupPlaylistFile(sessionState);
        sessionState.retry = null;
        void finishRoom(sessionState);
        const lastLine = lastMeaningfulStderrLine(stderr) || lastMeaningfulStderrLine(stdout);
        const detail = lastLine ? ` (${lastLine})` : '';
        const message = fatal ??
            (retry?.everLive
                ? `ไลฟ์หลุดและต่อใหม่ไม่สำเร็จ ${MAX_RESTART_ATTEMPTS} ครั้ง${detail}`
                : `FFmpeg ส่งข้อมูลไป TikTok RTMP ไม่สำเร็จ${detail || ` (ปลายทาง ${describeRtmpOutput(retry?.outputUrl ?? outputUrl)} ปิดการเชื่อมต่อโดยไม่ส่งรายละเอียด)`}`);
        updateStatus(sessionState, { state: 'error', message });
    });
    return sessionState.status;
}
async function startStream(config) {
    config = effectiveStreamConfig(config);
    const sessionState = getStreamSession(config.accountId);
    if (sessionState.startPromise)
        return sessionState.startPromise;
    const startPromise = startStreamUnlocked(sessionState, config);
    sessionState.startPromise = startPromise;
    try {
        return await startPromise;
    }
    finally {
        if (sessionState.startPromise === startPromise)
            sessionState.startPromise = null;
    }
}
async function startStreamUnlocked(sessionState, config) {
    // retry?.timer covers the reconnect backoff window, where ffmpegProcess is momentarily
    // null but the live is still considered running.
    if (sessionState.ffmpegProcess || sessionState.room || sessionState.retry?.timer || sessionState.status?.state === 'starting') {
        throw new Error('บัญชีนี้กำลังไลฟ์อยู่แล้ว');
    }
    const hardwareLimit = hardwareConcurrentStreams();
    if (activeStreamCount() >= hardwareLimit) {
        throw new Error(`เครื่องนี้รองรับไลฟ์พร้อมกันได้สูงสุด ${hardwareLimit} บัญชี — กรุณาหยุดบางบัญชีก่อนเริ่มเพิ่ม`);
    }
    const owner = activeWebStreamOwner();
    const packageLimit = activePackageChannelLimit();
    const ownerLiveCount = owner ? activeStreamCount(owner) : activeStreamCount();
    if (packageLimit !== null && ownerLiveCount >= packageLimit) {
        throw new Error(`แพ็กเกจของบัญชีนี้รองรับไลฟ์พร้อมกันได้สูงสุด ${packageLimit} ช่อง — กรุณาหยุดไลฟ์ของบัญชีนี้ก่อนเริ่มเพิ่ม`);
    }
    sessionState.liveTitle = config.liveTitle;
    updateStatus(sessionState, {
        state: 'starting',
        message: config.targetMode === 'manual'
            ? 'กำลังเปิด FFmpeg และเชื่อม RTMP…'
            : 'กำลังเตรียมวิดีโอและเปิดห้อง TikTok Streamer Desktop…',
    });
    if (config.targetMode === 'manual') {
        const outputUrl = `${config.rtmpServer.replace(/\/+$/, '')}/${config.streamKey.replace(/^\/+/, '')}`;
        const status = await startFfmpeg(sessionState, config, outputUrl);
        // No room of our own here — the chat engine finds the live by @username.
        void startRoomChat(config.accountId, null);
        restartPinRotation(config.accountId);
        void refreshChatProducts(config.accountId);
        return status;
    }
    config = await prepareTikTokConfigBeforeRoom(sessionState, config);
    updateStatus(sessionState, { state: 'starting', message: 'กำลังสร้างห้อง TikTok Streamer Desktop…' });
    const room = await createTikTokRoom(config.accountId, config.liveTitle);
    sessionState.room = room;
    startTikTokKeepAlive(sessionState, room);
    try {
        const status = await startFfmpeg(sessionState, config, room.rtmpPushUrl);
        void startRoomChat(room.accountId, room.roomId);
        restartPinRotation(room.accountId);
        void refreshChatProducts(room.accountId);
        return status;
    }
    catch (error) {
        await finishRoom(sessionState);
        throw error;
    }
}
// Drop any scheduled auto-restart. Needed before every deliberate stop, because during
// the backoff window ffmpegProcess is already null and a pending timer would otherwise
// bring the stream back up after the user asked it to end.
function cancelRestart(sessionState) {
    const retry = sessionState.retry;
    if (!retry)
        return;
    if (retry.timer)
        clearTimeout(retry.timer);
    if (retry.settleTimer)
        clearTimeout(retry.settleTimer);
    cleanupPlaylistFile(sessionState);
    sessionState.retry = null;
}
async function stopFfmpeg(accountId) {
    const sessionState = getStreamSession(accountId);
    // Kill any start still in its pre-spawn phase before anything else — cancelRestart only
    // clears timers that have not fired yet, not a startFfmpeg already past its timer.
    sessionState.stopGeneration += 1;
    if (sessionState.applySwitchTimer) {
        clearTimeout(sessionState.applySwitchTimer);
        sessionState.applySwitchTimer = null;
    }
    const conforming = conformChildren.get(sessionState.accountId);
    if (conforming) {
        try {
            conforming.kill('SIGKILL');
        }
        catch {
            // Already finished.
        }
    }
    const wasReconnecting = Boolean(sessionState.retry?.timer) || Boolean(sessionState.retry);
    cancelRestart(sessionState);
    if (!sessionState.ffmpegProcess) {
        await finishRoom(sessionState);
        if (wasReconnecting) {
            // The live was still running (mid-reconnect), so pass through 'stopping' like a
            // normal stop: that edge is what fires the LINE end notification and records the
            // live in history — jumping starting → idle would silently drop both.
            updateStatus(sessionState, {
                state: 'stopping',
                message: 'กำลังหยุดไลฟ์…',
                startedAt: sessionState.status.startedAt,
            });
        }
        return updateStatus(sessionState, {
            state: 'idle',
            message: wasReconnecting ? 'หยุดไลฟ์แล้ว' : 'ไม่มีสตรีมที่กำลังทำงาน',
        });
    }
    // startedAt rides along so the history entry written at close still knows the real
    // start time — without it, user-stopped lives were recorded with a zero duration.
    updateStatus(sessionState, {
        state: 'stopping',
        message: 'กำลังหยุดไลฟ์…',
        startedAt: sessionState.status.startedAt,
    });
    sessionState.ffmpegProcess.stdin.write('q\n');
    const processToStop = sessionState.ffmpegProcess;
    setTimeout(() => {
        if (sessionState.ffmpegProcess === processToStop)
            processToStop.kill('SIGTERM');
    }, 5000).unref();
    return sessionState.status;
}
// --- License gate ----------------------------------------------------------
//
// Set this to the deployed Cloudflare Worker URL (worker/wrangler.toml). The app
// authenticates username + password + license key against it, stores a rolling
// session token encrypted at rest, and re-validates on launch + hourly. A short
// offline grace window keeps working users unlocked during brief outages.
// PLACEHOLDER until worker/ is deployed for THIS product (see worker/wrangler.toml).
// Deliberately its own Worker, never Rerun Studio's: the two products are sold
// separately, so a key issued for one must not unlock the other. Deployed 2026-09-06
// against KV 01fde98ef73c4c93ae516d1d87bd282f. Now that this is a real URL,
// licenseDevBypass() below is permanently off — dev and packaged builds alike
// authenticate against this Worker, so a broken deploy locks developers out too.
const LICENSE_API_BASE = 'local-owned-backend';
const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
// While developing before the license Worker is deployed, allow logging in without a
// backend. This is gated to dev builds AND the un-configured placeholder URL, so a
// packaged/production build always authenticates against the real Worker.
function licenseDevBypass() {
    return !electron_1.app.isPackaged && LICENSE_API_BASE.includes('example.workers.dev');
}
function machineIdPath() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'machine-id');
}
function getMachineId() {
    if (global.__npLocalBackend?.kind === 'np') {
        try {
            return require('../np-machine.cjs')();
        }
        catch {
            // The web server can run on Linux while the packaged desktop app runs on Windows.
            // Fall through to the per-install machine id when the Windows registry is absent.
        }
    }
    try {
        const existing = (0, node_fs_1.readFileSync)(machineIdPath(), 'utf8').trim();
        if (existing)
            return existing;
    }
    catch {
        // First run — mint and persist a stable per-install id below.
    }
    const id = (0, node_crypto_1.createHash)('sha256').update(`${(0, node_crypto_1.randomUUID)()}:${node_os_1.default.hostname()}`).digest('hex');
    try {
        (0, node_fs_1.writeFileSync)(machineIdPath(), id, { encoding: 'utf8', mode: 0o600 });
    }
    catch {
        // Non-fatal; a transient id still lets this session authenticate.
    }
    return id;
}
function licenseStatePath() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'license.bin');
}
function saveLicenseState(state) {
    const serialized = JSON.stringify(state);
    const buffer = electron_1.safeStorage.isEncryptionAvailable()
        ? electron_1.safeStorage.encryptString(serialized)
        : Buffer.from(serialized, 'utf8');
    (0, node_fs_1.writeFileSync)(licenseStatePath(), buffer, { mode: 0o600 });
}
function loadLicenseState() {
    try {
        const buffer = (0, node_fs_1.readFileSync)(licenseStatePath());
        const serialized = electron_1.safeStorage.isEncryptionAvailable()
            ? electron_1.safeStorage.decryptString(buffer)
            : buffer.toString('utf8');
        const parsed = JSON.parse(serialized);
        if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'number')
            return null;
        return {
            token: parsed.token,
            username: typeof parsed.username === 'string' ? parsed.username : '',
            displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
            plan: typeof parsed.plan === 'string' ? parsed.plan : 'standard',
            packageId: typeof parsed.packageId === 'string' ? parsed.packageId : '',
            packageName: typeof parsed.packageName === 'string' ? parsed.packageName : '',
            channelLimit: typeof parsed.channelLimit === 'number' ? parsed.channelLimit : null,
            videoLimit: typeof parsed.videoLimit === 'number' ? parsed.videoLimit : null,
            packageActive: parsed.packageActive === true,
            expiresAt: parsed.expiresAt,
            validatedAt: typeof parsed.validatedAt === 'number' ? parsed.validatedAt : 0,
        };
    }
    catch {
        return null;
    }
}
function clearLicenseState() {
    try {
        (0, node_fs_1.unlinkSync)(licenseStatePath());
    }
    catch {
        // Already absent — nothing to clear.
    }
}
async function licenseApiRequest(pathname, body) { const response = await global.__npLocalBackend.request('POST', pathname, body); if (response.ok) { global.__npActiveChannelLimit = Number.isFinite(response.data.channelLimit) ? Math.max(1, Math.floor(response.data.channelLimit)) : null; global.__npActiveVideoLimit = Number.isFinite(response.data.videoLimit) ? Math.max(0, Math.floor(response.data.videoLimit)) : null; } return response; }
async function licenseLogin(username, password, licenseKey) {
    if (licenseDevBypass()) {
        const state = {
            token: 'dev-local',
            username: username || 'dev',
            displayName: username || 'Dev User',
            plan: 'dev',
            packageActive: true,
            expiresAt: Date.now() + OFFLINE_GRACE_MS,
            validatedAt: Date.now(),
        };
        saveLicenseState(state);
        return { licensed: true, username: state.username, displayName: state.displayName, plan: state.plan, packageActive: state.packageActive, expiresAt: state.expiresAt };
    }
    try {
        const { ok, data } = await licenseApiRequest('/api/login', {
            username,
            password,
            licenseKey,
            machineId: getMachineId(),
        });
        if (!ok || data.ok !== true) {
            return { licensed: false, error: typeof data.error === 'string' ? data.error : 'เข้าสู่ระบบไม่สำเร็จ' };
        }
        const state = {
            token: String(data.token || ''),
            username,
            displayName: typeof data.displayName === 'string' ? data.displayName : username,
            plan: typeof data.plan === 'string' ? data.plan : 'standard',
            packageId: typeof data.packageId === 'string' ? data.packageId : '',
            packageName: typeof data.packageName === 'string' ? data.packageName : '',
            channelLimit: typeof data.channelLimit === 'number' ? data.channelLimit : null,
            videoLimit: typeof data.videoLimit === 'number' ? data.videoLimit : null,
            packageActive: data.packageActive === true,
            expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : 0,
            validatedAt: Date.now(),
        };
        saveLicenseState(state);
        return { licensed: true, username: state.username, displayName: state.displayName, plan: state.plan, packageActive: state.packageActive, packageName: state.packageName, channelLimit: state.channelLimit, videoLimit: state.videoLimit, expiresAt: state.expiresAt };
    }
    catch (error) {
        return { licensed: false, error: error?.message || 'เชื่อมต่อเซิร์ฟเวอร์ยืนยันสิทธิ์ไม่ได้ กรุณาตรวจอินเทอร์เน็ต' };
    }
}
async function licenseStatus() {
    const webStatus = typeof global.__npWebLicenseStatus === 'function' ? global.__npWebLicenseStatus() : null;
    if (webStatus)
        return webStatus;
    const state = loadLicenseState();
    if (!state)
        return { licensed: false };
    if (licenseDevBypass()) {
        return { licensed: true, offline: true, username: state.username, displayName: state.displayName, plan: state.plan, packageActive: state.packageActive, packageName: state.packageName, channelLimit: state.channelLimit, videoLimit: state.videoLimit, expiresAt: state.expiresAt };
    }
    try {
        const { ok, status, data } = await licenseApiRequest('/api/validate', {
            token: state.token,
            machineId: getMachineId(),
        });
        if (ok && data.ok === true) {
            const next = {
                ...state,
                token: typeof data.token === 'string' ? data.token : state.token,
                displayName: typeof data.displayName === 'string' ? data.displayName : state.displayName,
                plan: typeof data.plan === 'string' ? data.plan : state.plan,
                packageId: typeof data.packageId === 'string' ? data.packageId : state.packageId,
                packageName: typeof data.packageName === 'string' ? data.packageName : state.packageName,
                channelLimit: typeof data.channelLimit === 'number' ? data.channelLimit : state.channelLimit,
                videoLimit: typeof data.videoLimit === 'number' ? data.videoLimit : state.videoLimit,
                packageActive: data.packageActive === true,
                expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : state.expiresAt,
                validatedAt: Date.now(),
            };
            saveLicenseState(next);
            return { licensed: true, username: next.username, displayName: next.displayName, plan: next.plan, packageActive: next.packageActive, packageName: next.packageName, channelLimit: next.channelLimit, videoLimit: next.videoLimit, expiresAt: next.expiresAt };
        }
        // The server explicitly rejected (revoked/expired/disabled) — force re-login.
        if (status === 401 || status === 403) {
            clearLicenseState();
            return { licensed: false, error: typeof data.error === 'string' ? data.error : 'สิทธิ์ใช้งานหมดอายุ' };
        }
        throw new Error('server-unavailable');
    }
    catch {
        // Offline / server down: keep the user working within the grace window if the
        // last successful validation is recent and the token itself hasn't expired.
        if(global.__npLocalBackend?.kind==='np')return {licensed:false,error:'ตรวจสอบสิทธิ์ NP ไม่ได้'};
        const withinGrace = Date.now() - state.validatedAt < OFFLINE_GRACE_MS;
        if (withinGrace && state.expiresAt > Date.now()) {
            return { licensed: true, offline: true, username: state.username, displayName: state.displayName, plan: state.plan, packageActive: state.packageActive, packageName: state.packageName, channelLimit: state.channelLimit, videoLimit: state.videoLimit, expiresAt: state.expiresAt };
        }
        return { licensed: false, error: 'ตรวจสอบสิทธิ์ไม่ได้ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วเข้าสู่ระบบใหม่' };
    }
}
// Keep the last good feed so a brief outage doesn't blank the ticker.
let announcementCache = [];
async function fetchAnnouncements() { if(global.__npLocalBackend?.kind==='np')return []; const result = await global.__npLocalBackend.request('GET', '/api/announcements'); if (result.ok && Array.isArray(result.data.items)) announcementCache = result.data.items; return announcementCache; }
// In-memory only — cleared on quit. Never persisted, never exposed to renderer.
let adminToken = global.__npLocalBackend.ownerToken;
function adminUnlocked() {
    return global.__npLocalBackend.isAdminToken(adminToken);
}
// A stable, human-readable key: DNP-XXXX-XXXX-XXXX-XXXX (Crockford-ish alphabet,
// no easily-confused chars). Uses crypto randomInt for unbiased selection.
function generateLicenseKey() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const block = () => Array.from({ length: 4 }, () => alphabet[(0, node_crypto_1.randomInt)(alphabet.length)]).join('');
    // DNP- rather than RERUN-: the two products have separate licence backends, and a
    // visibly different prefix means a support request never leaves you guessing which
    // product a pasted key belongs to.
    return `DNP-${block()}-${block()}-${block()}-${block()}`;
}
function adminLocalStorePath() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'admin-users.json');
}
function loadAdminLocal() {
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(adminLocalStorePath(), 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function saveAdminLocal(list) {
    (0, node_fs_1.writeFileSync)(adminLocalStorePath(), JSON.stringify(list, null, 2), { encoding: 'utf8', mode: 0o600 });
}
async function adminApiRequest(method, pathname, body) { return global.__npLocalBackend.request(method, pathname, body, adminToken); }
function expiresAtFromDays(days) {
    return days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : null;
}
async function adminIssueKey(input) {
    const username = input.username.trim().toLowerCase();
    if (!username)
        return { ok: false, error: 'ต้องระบุชื่อผู้ใช้' };
    if (!input.password)
        return { ok: false, error: 'ต้องตั้งรหัสผ่านให้ผู้ใช้ใหม่' };
    const licenseKey = generateLicenseKey();
    const expiresAt = expiresAtFromDays(input.expiresDays);
    const machineLimit = input.machineLimit > 0 ? Math.floor(input.machineLimit) : 1;
    const plan = input.plan.trim() || 'standard';
    const displayName = input.displayName.trim() || username;
    if (licenseDevBypass()) {
        const list = loadAdminLocal();
        if (list.some((u) => u.username === username)) {
            return { ok: false, error: 'มีผู้ใช้ชื่อนี้อยู่แล้ว' };
        }
        const record = {
            username, displayName, plan, licenseKey, expiresAt, machineLimit, disabled: false, createdAt: Date.now(),
        };
        list.unshift(record);
        saveAdminLocal(list);
        return { ok: true, user: record, dev: true };
    }
    try {
        const { ok, data } = await adminApiRequest('PUT', '/api/admin/user', {
            username,
            password: input.password,
            licenseKey,
            plan,
            displayName,
            expiresAt,
            machineLimit,
        });
        if (!ok || data.ok !== true) {
            return { ok: false, error: typeof data.error === 'string' ? data.error : 'ออกคีย์ไม่สำเร็จ (ตรวจ ADMIN TOKEN)' };
        }
        // Worker returns the record without the licenseKey echoed for GET, but PUT
        // returns the saved record which includes it; surface the key we generated.
        return { ok: true, user: { username, displayName, plan, licenseKey, expiresAt, machineLimit, disabled: false, createdAt: Date.now() } };
    }
    catch {
        return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์แอดมินไม่ได้' };
    }
}
async function adminLookupUser(username) {
    const name = username.trim().toLowerCase();
    if (!name)
        return { ok: false, error: 'ต้องระบุชื่อผู้ใช้' };
    if (licenseDevBypass()) {
        const found = loadAdminLocal().find((u) => u.username === name);
        return found ? { ok: true, user: found, dev: true } : { ok: false, error: 'ไม่พบผู้ใช้' };
    }
    try {
        const { ok, data } = await adminApiRequest('GET', `/api/admin/user?username=${encodeURIComponent(name)}`);
        if (!ok || data.ok !== true || !data.user) {
            return { ok: false, error: typeof data.error === 'string' ? data.error : 'ไม่พบผู้ใช้' };
        }
        const u = data.user;
        return {
            ok: true,
            user: {
                username: String(u.username || name),
                displayName: String(u.displayName || name),
                plan: String(u.plan || 'standard'),
                licenseKey: String(u.licenseKey || ''),
                expiresAt: typeof u.expiresAt === 'number' ? u.expiresAt : null,
                machineLimit: typeof u.machineLimit === 'number' ? u.machineLimit : 1,
                disabled: Boolean(u.disabled),
            },
        };
    }
    catch {
        return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์แอดมินไม่ได้' };
    }
}
async function adminRevokeUser(username) {
    const name = username.trim().toLowerCase();
    if (!name)
        return { ok: false, error: 'ต้องระบุชื่อผู้ใช้' };
    if (licenseDevBypass()) {
        const list = loadAdminLocal().filter((u) => u.username !== name);
        saveAdminLocal(list);
        return { ok: true, users: list, dev: true };
    }
    try {
        const { ok, data } = await adminApiRequest('DELETE', `/api/admin/user?username=${encodeURIComponent(name)}`);
        if (!ok || data.ok !== true) {
            return { ok: false, error: typeof data.error === 'string' ? data.error : 'ถอนสิทธิ์ไม่สำเร็จ' };
        }
        return { ok: true };
    }
    catch {
        return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์แอดมินไม่ได้' };
    }
}
async function adminListKeys() {
    if (licenseDevBypass())
        return { ok: true, users: loadAdminLocal(), dev: true };
    try {
        const { ok, data } = await adminApiRequest('GET', '/api/admin/users');
        if (!ok || data.ok !== true || !Array.isArray(data.users)) {
            return { ok: false, error: typeof data.error === 'string' ? data.error : 'ดึงรายการคีย์ไม่สำเร็จ' };
        }
        const users = data.users.map((u) => ({
            username: String(u.username || ''),
            displayName: String(u.displayName || ''),
            plan: String(u.plan || 'standard'),
            licenseKey: String(u.licenseKey || ''),
            expiresAt: typeof u.expiresAt === 'number' ? u.expiresAt : null,
            machineLimit: typeof u.machineLimit === 'number' ? u.machineLimit : 1,
            disabled: Boolean(u.disabled),
        }));
        return { ok: true, users };
    }
    catch {
        return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์แอดมินไม่ได้' };
    }
}
function registerIpc() {
    electron_1.ipcMain.handle('media:choose-video', async (event) => {
        assertTrustedSender(event);
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: 'เลือกวิดีโอสำหรับไลฟ์',
            properties: ['openFile'],
            filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }],
        });
        if (result.canceled || !result.filePaths[0])
            return null;
        const filePath = result.filePaths[0];
        // Remember every chosen clip so it shows up in คลังวิดีโอ for quick re-use.
        addLibraryEntry(filePath);
        return { path: filePath, name: node_path_1.default.basename(filePath), mediaUrl: mediaUrl(filePath) };
    });
    // Two-step import: choose+parse returns a preview the user confirms, so a mis-detected
    // money column is caught before any revenue number is stored.
    electron_1.ipcMain.handle('sales:choose-file', async (event) => {
        assertTrustedSender(event);
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: 'เลือกไฟล์ออร์เดอร์จาก TikTok Shop',
            properties: ['openFile'],
            filters: [{ name: 'Order export', extensions: ['csv', 'tsv', 'txt'] }],
        });
        if (result.canceled || !result.filePaths[0])
            return null;
        const filePath = result.filePaths[0];
        const rows = parseDelimited((0, node_fs_1.readFileSync)(filePath, 'utf8'));
        if (rows.length < 2)
            throw new Error('ไฟล์นี้ไม่มีข้อมูลออร์เดอร์');
        const headers = rows[0].map((header) => header.trim());
        pendingSalesImports.set(activeSalesOwner(), { token: (0, node_crypto_1.randomUUID)(), fileName: node_path_1.default.basename(filePath), headers, rows: rows.slice(1) });
        return buildSalesPreview({
            orderId: detectColumn(headers, 'orderId'),
            amount: detectColumn(headers, 'amount'),
            time: detectColumn(headers, 'time'),
            status: detectColumn(headers, 'status'),
        });
    });
    // Re-preview with a mapping the user corrected by hand.
    electron_1.ipcMain.handle('sales:preview', async (event, mapping) => {
        assertTrustedSender(event);
        const value = (mapping && typeof mapping === 'object' ? mapping : {});
        const toIndex = (input) => (typeof input === 'number' && Number.isInteger(input) ? input : -1);
        return buildSalesPreview({
            orderId: toIndex(value.orderId),
            amount: toIndex(value.amount),
            time: toIndex(value.time),
            status: toIndex(value.status),
        });
    });
    electron_1.ipcMain.handle('sales:commit', async (event, payload) => {
        assertTrustedSender(event);
        const value = (payload && typeof payload === 'object' ? payload : {});
        const pending = pendingSalesImports.get(activeSalesOwner());
        if (!pending || value.token !== pending.token)
            throw new Error('ไฟล์ที่นำเข้าหมดอายุแล้ว กรุณาเลือกไฟล์ใหม่');
        const accountId = normalizeAccountId(typeof value.accountId === 'string' ? value.accountId : '');
        const mappingInput = (value.mapping && typeof value.mapping === 'object' ? value.mapping : {});
        const toIndex = (input) => (typeof input === 'number' && Number.isInteger(input) ? input : -1);
        const mapping = {
            orderId: toIndex(mappingInput.orderId),
            amount: toIndex(mappingInput.amount),
            time: toIndex(mappingInput.time),
            status: toIndex(mappingInput.status),
        };
        if (mapping.amount < 0)
            throw new Error('ต้องเลือกคอลัมน์ยอดเงินก่อนบันทึก');
        const store = getSales();
        // Re-importing an overlapping export must not double-count, so orders already
        // stored for this account win over the incoming row.
        const seen = new Set(store.records.filter((record) => record.accountId === accountId && record.orderId).map((record) => record.orderId));
        const batchId = (0, node_crypto_1.randomUUID)();
        const importedAt = Date.now();
        const fresh = [];
        let duplicates = 0;
        let excluded = 0;
        for (const row of pending.rows) {
            const amount = parseAmount(row[mapping.amount] ?? '');
            if (amount === null)
                continue;
            // Same exclusion the preview showed, so the stored total matches what was confirmed.
            if (mapping.status >= 0 && isExcludedStatus(row[mapping.status] ?? '')) {
                excluded += 1;
                continue;
            }
            const orderId = mapping.orderId >= 0 ? (row[mapping.orderId] ?? '').trim() : '';
            if (orderId && seen.has(orderId)) {
                duplicates += 1;
                continue;
            }
            if (orderId)
                seen.add(orderId);
            fresh.push({
                id: (0, node_crypto_1.randomUUID)(),
                accountId,
                orderId,
                amount,
                at: (mapping.time >= 0 ? parseTimestamp(row[mapping.time] ?? '') : null) ?? importedAt,
                status: mapping.status >= 0 ? (row[mapping.status] ?? '').trim() : '',
                batchId,
            });
        }
        const total = fresh.reduce((sum, record) => sum + record.amount, 0);
        const batch = {
            id: batchId,
            accountId,
            fileName: pending.fileName,
            importedAt,
            orderCount: fresh.length,
            total,
        };
        writeSales({ records: [...store.records, ...fresh], batches: [...store.batches, batch] });
        pendingSalesImports.delete(activeSalesOwner());
        return { imported: fresh.length, duplicates, excluded, total, accountId };
    });
    electron_1.ipcMain.handle('sales:list', async (event) => {
        assertTrustedSender(event);
        return getSales();
    });
    electron_1.ipcMain.handle('sales:remove-batch', async (event, batchId) => {
        assertTrustedSender(event);
        const id = typeof batchId === 'string' ? batchId : '';
        const store = getSales();
        writeSales({
            records: store.records.filter((record) => record.batchId !== id),
            batches: store.batches.filter((batch) => batch.id !== id),
        });
        return getSales();
    });
    electron_1.ipcMain.handle('media:choose-overlay', async (event) => {
        assertTrustedSender(event);
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: 'เลือกภาพ Overlay',
            properties: ['openFile'],
            filters: [{ name: 'Image', extensions: ['png', 'webp', 'jpg', 'jpeg'] }],
        });
        if (result.canceled || !result.filePaths[0])
            return null;
        const filePath = result.filePaths[0];
        return { path: filePath, name: node_path_1.default.basename(filePath), mediaUrl: mediaUrl(filePath) };
    });
    electron_1.ipcMain.handle('license:login', async (event, payload) => {
        assertTrustedSender(event);
        const value = (payload && typeof payload === 'object' ? payload : {});
        const username = typeof value.username === 'string' ? value.username.trim() : '';
        const password = typeof value.password === 'string' ? value.password : '';
        const licenseKey = typeof value.licenseKey === 'string' ? value.licenseKey.trim() : '';
        if (!username) {
            return { licensed: false, error: 'กรุณากรอกชื่อผู้ใช้' };
        }
        if (!password) {
            return { licensed: false, error: 'กรุณากรอกรหัสผ่าน' };
        }
        return licenseLogin(username, password, licenseKey);
    });
    electron_1.ipcMain.handle('license:status', async (event) => {
        assertTrustedSender(event);
        return licenseStatus();
    });
    electron_1.ipcMain.handle('license:logout', async (event) => {
        assertTrustedSender(event);
        clearLicenseState();
        return { licensed: false };
    });
    electron_1.ipcMain.handle('update:get-status', async (event) => {
        assertTrustedSender(event);
        return latestUpdateStatus;
    });
    electron_1.ipcMain.handle('update:install', async (event) => {
        assertTrustedSender(event);
        if (!electron_1.app.isPackaged)
            return;
        electron_updater_1.autoUpdater.quitAndInstall();
    });
    electron_1.ipcMain.handle('update:check', async (event) => {
        assertTrustedSender(event);
        if (!electron_1.app.isPackaged) {
            // Dev build has no publish feed; report so the UI can explain instead of hanging.
            broadcastUpdateStatus({ state: 'error', message: 'ตรวจอัปเดตได้เฉพาะเวอร์ชันที่ติดตั้งแล้ว (เวอร์ชัน dev ข้ามการตรวจ)' });
            return latestUpdateStatus;
        }
        try {
            // Manual check should download even if auto-download is off, so the user can apply it.
            electron_updater_1.autoUpdater.autoDownload = true;
            await electron_updater_1.autoUpdater.checkForUpdates();
        }
        catch (error) {
            broadcastUpdateStatus({ state: 'error', message: error instanceof Error ? error.message : 'ตรวจอัปเดตไม่สำเร็จ' });
        }
        finally {
            electron_updater_1.autoUpdater.autoDownload = autoUpdatePref;
        }
        return latestUpdateStatus;
    });
    electron_1.ipcMain.handle('update:get-config', async (event) => {
        assertTrustedSender(event);
        return { autoUpdate: autoUpdatePref };
    });
    electron_1.ipcMain.handle('update:set-config', async (event, payload) => {
        assertTrustedSender(event);
        const value = (payload && typeof payload === 'object' ? payload : {});
        if (typeof value.autoUpdate === 'boolean') {
            autoUpdatePref = value.autoUpdate;
            saveUpdateConfig();
            if (electron_1.app.isPackaged)
                electron_updater_1.autoUpdater.autoDownload = autoUpdatePref;
        }
        return { autoUpdate: autoUpdatePref };
    });
    // Opens a link in the user's real browser. Allow-listed on purpose: the renderer must
    // not be able to hand the OS an arbitrary URL (file://, custom protocol handlers), so
    // only https links to hosts we actually link to are passed through.
    electron_1.ipcMain.handle('shell:open-external', async (event, rawUrl) => {
        assertTrustedSender(event);
        const value = typeof rawUrl === 'string' ? rawUrl : '';
        let parsed;
        try {
            parsed = new URL(value);
        }
        catch {
            return { opened: false };
        }
        const allowedHosts = ['youtube.com', 'youtu.be', 'www.youtube.com'];
        const allowed = parsed.protocol === 'https:' &&
            allowedHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
        if (!allowed)
            return { opened: false };
        await electron_1.shell.openExternal(parsed.toString());
        return { opened: true };
    });
    electron_1.ipcMain.handle('announcements:get', async (event) => {
        assertTrustedSender(event);
        return fetchAnnouncements();
    });
    electron_1.ipcMain.handle('admin:unlock', async (event, payload) => {
        assertTrustedSender(event);
        const value = (payload && typeof payload === 'object' ? payload : {});
        const token = typeof value.token === 'string' ? value.token.trim() : '';
        if (licenseDevBypass())
            return { ok: true, dev: true, unlocked: true };
        if (!token)
            return { ok: false, error: 'กรุณากรอก ADMIN TOKEN' };
        if (!global.__npLocalBackend.isAdminToken(token)) return { ok: false, error: 'ADMIN TOKEN ไม่ถูกต้อง' };
        adminToken = token;
        return { ok: true, dev: false, unlocked: true };
    });
    electron_1.ipcMain.handle('admin:status', async (event) => {
        assertTrustedSender(event);
        return { unlocked: adminUnlocked(), dev: licenseDevBypass() };
    });
    electron_1.ipcMain.handle('admin:lock', async (event) => {
        assertTrustedSender(event);
        adminToken = '';
        return { ok: true };
    });
    electron_1.ipcMain.handle('admin:issue-key', async (event, payload) => {
        assertTrustedSender(event);
        if (!adminUnlocked())
            return { ok: false, error: 'ยังไม่ได้ปลดล็อกโหมดแอดมิน' };
        const value = (payload && typeof payload === 'object' ? payload : {});
        return adminIssueKey({
            username: typeof value.username === 'string' ? value.username : '',
            displayName: typeof value.displayName === 'string' ? value.displayName : '',
            password: typeof value.password === 'string' ? value.password : '',
            plan: typeof value.plan === 'string' ? value.plan : '',
            expiresDays: typeof value.expiresDays === 'number' ? value.expiresDays : 0,
            machineLimit: typeof value.machineLimit === 'number' ? value.machineLimit : 1,
        });
    });
    electron_1.ipcMain.handle('admin:lookup', async (event, username) => {
        assertTrustedSender(event);
        if (!adminUnlocked())
            return { ok: false, error: 'ยังไม่ได้ปลดล็อกโหมดแอดมิน' };
        return adminLookupUser(typeof username === 'string' ? username : '');
    });
    electron_1.ipcMain.handle('admin:revoke', async (event, username) => {
        assertTrustedSender(event);
        if (!adminUnlocked())
            return { ok: false, error: 'ยังไม่ได้ปลดล็อกโหมดแอดมิน' };
        return adminRevokeUser(typeof username === 'string' ? username : '');
    });
    electron_1.ipcMain.handle('admin:list', async (event) => {
        assertTrustedSender(event);
        if (!adminUnlocked())
            return { ok: false, error: 'ยังไม่ได้ปลดล็อกโหมดแอดมิน' };
        return adminListKeys();
    });
    electron_1.ipcMain.handle('tiktok:login', async (event, accountId) => {
        assertTrustedSender(event);
        const normalizedId = normalizeAccountId(accountId);
        const currentSession = electron_1.session.fromPartition(tikTokPartition(normalizedId), { cache: true });
        if ((await hasTikTokLogin(currentSession)) && (isUsableTikTokAuthSnapshot(loadTikTokAuth(normalizedId)) || await refreshTikTokAuthSnapshot(normalizedId, 5000))) {
            return { saved: true, streamerReady: true };
        }
        const pending = pendingTikTokLogins.get(normalizedId);
        if (pending) {
            if (!pending.window.isDestroyed())
                pending.window.close();
            pendingTikTokLogins.delete(normalizedId);
        }
        const tikTokSession = await resetTikTokLoginSession(normalizedId);
        const loginWindow = createTikTokWindow(normalizedId, 'login', false);
        const result = waitForTikTokLogin(loginWindow, tikTokSession, normalizedId)
            .then(saved => ({ saved, streamerReady: saved }))
            .finally(() => pendingTikTokLogins.delete(normalizedId));
        pendingTikTokLogins.set(normalizedId, { window: loginWindow, result });
        return { opened: true, saved: false, streamerReady: false, pending: true };
    });
    electron_1.ipcMain.handle('tiktok:status', async (event, accountId) => {
        assertTrustedSender(event);
        return tikTokConnectionStatus(normalizeAccountId(accountId));
    });
    electron_1.ipcMain.handle('tiktok:logout', async (event, accountId) => {
        assertTrustedSender(event);
        return logoutTikTokAccount(normalizeAccountId(accountId));
    });
    electron_1.ipcMain.handle('tiktok:open', async (event, accountId) => {
        assertTrustedSender(event);
        createTikTokWindow(normalizeAccountId(accountId), 'home');
    });
    electron_1.ipcMain.handle('tiktok:open-shop', async (event, accountId) => {
        assertTrustedSender(event);
        createTikTokWindow(normalizeAccountId(accountId), 'shop');
    });
    electron_1.ipcMain.handle('stream:start', async (event, value) => {
        assertTrustedSender(event);
        return startStream(rememberStreamConfig(value));
    });
    electron_1.ipcMain.handle('stream:stop', async (event, accountId) => {
        assertTrustedSender(event);
        return await stopFfmpeg(normalizeAccountId(accountId));
    });
    electron_1.ipcMain.handle('stream:status', (event, accountId) => {
        assertTrustedSender(event);
        return storedStreamStatus(normalizeAccountId(accountId));
    });
    electron_1.ipcMain.handle('stream:last-config', (event, accountId) => {
        assertTrustedSender(event);
        return streamConfigSnapshot(normalizeAccountId(accountId));
    });
    electron_1.ipcMain.handle('stream:save-config', (event, value) => {
        assertTrustedSender(event);
        return rememberStreamConfig(value);
    });
    electron_1.ipcMain.handle('stream:clear-config', (event, accountId) => {
        assertTrustedSender(event);
        return clearStreamConfig(accountId);
    });
    electron_1.ipcMain.handle('stream:list-configs', (event) => {
        assertTrustedSender(event);
        return knownStreamAccountIds().map((accountId) => streamConfigSnapshot(accountId)).filter(Boolean);
    });
    electron_1.ipcMain.handle('stream:schedule:get', (event, accountId) => {
        assertTrustedSender(event);
        return readStreamSchedule(normalizeAccountId(accountId));
    });
    electron_1.ipcMain.handle('stream:schedule:set', (event, accountId, config) => {
        assertTrustedSender(event);
        return saveStreamSchedule(normalizeAccountId(accountId), config);
    });
    electron_1.ipcMain.handle('app:info', (event) => {
        assertTrustedSender(event);
        return {
            version: electron_1.app.getVersion(),
            ffmpegReady: Boolean(ffmpegBinary()),
            maxConcurrentStreams: maxConcurrentStreams(),
        };
    });
    // Run the same benchmark a live would run, so the seller can find out what their machine
    // is capable of BEFORE a customer is watching — rather than discovering it as a stuttering
    // broadcast. Reuses the live path's own measurement (cached per app run), so a later
    // "go live" costs nothing extra.
    electron_1.ipcMain.handle('system:benchmark', async (event, videoPath, overlayCounts) => {
        assertTrustedSender(event);
        const ffmpegPath = ffmpegBinary();
        if (!ffmpegPath)
            throw new Error('ไม่พบ FFmpeg ในชุดติดตั้ง');
        // Prefer the seller's own clip — decode cost varies enormously between a phone
        // recording and a 4K export, and measuring the wrong one gives a number they cannot
        // act on. Fall back to any clip in their library so the button still works before a
        // clip is chosen.
        const sample = typeof videoPath === 'string' && videoPath && (0, node_fs_1.existsSync)(videoPath)
            ? videoPath
            : getLibrary().find((item) => (0, node_fs_1.existsSync)(item.path))?.path;
        if (!sample)
            throw new Error('ยังไม่มีคลิปให้ทดสอบ — เลือกคลิปในขั้นตอน "วิดีโอ" ก่อน');
        const rate = { bitrateKbps: 6000, maxrateKbps: 6480, bufsizeKbps: 12000 };
        const measurements = await (0, encoder_1.detectEncoderMeasurements)(ffmpegPath, sample, rate);
        measuredStreamCapacity = (0, encoder_1.sustainableStreamCount)(measurements);
        // Charge for the SAME filter graph a real live with this account's overlays would
        // run — startFfmpeg does this from the account's real config (see overlayCost call
        // near the live start path); this button used to always assume the flat
        // OVERLAY_COST default (worth ~3 average layers), so a seller with a heavily
        // decorated live saw "ไหว" here and then struggled live, because the two numbers
        // were never actually measuring the same thing.
        const counts = (overlayCounts && typeof overlayCounts === 'object' ? overlayCounts : {});
        const filterCost = (0, encoder_1.overlayCost)({
            images: Math.max(0, Math.round(Number(counts.images) || 0)),
            clocks: Math.max(0, Math.round(Number(counts.clocks) || 0)),
            texts: Math.max(0, Math.round(Number(counts.texts) || 0)),
            zoomed: counts.zoomed === true,
        });
        const single = (0, encoder_1.planFromMeasurements)(measurements, { concurrent: 1, degradeLevel: 0, filterCost });
        const dual = (0, encoder_1.planFromMeasurements)(measurements, { concurrent: 2, degradeLevel: 0, filterCost });
        const describe = (plan) => plan.downscale ? `${plan.downscale.width}x${plan.downscale.height}` : '1080x1920';
        return {
            hardwareEncoder: measurements.hardware,
            softwareSpeed: measurements.softwareSpeed,
            hardwareSpeed: measurements.hardwareSpeed,
            // What the live will actually run at with this account's overlay setup — the
            // renderer used to recompute this itself with a hardcoded factor; doing it here
            // keeps it in sync with the one true formula in encoder.ts.
            effectiveSpeed: Math.max(measurements.softwareSpeed, measurements.hardwareSpeed) * filterCost,
            filterCost,
            maxStreams: maxConcurrentStreams(),
            singleQuality: describe(single),
            dualQuality: describe(dual),
            totalMemoryGb: Math.round(node_os_1.default.totalmem() / 1024 ** 3),
            cores: node_os_1.default.cpus()?.length || 0,
        };
    });
    // Read-only. Opens (or reuses) the hidden LIVE Manager window and reports what the page
    // actually contains, so pin/coupon/GMV work can be written against verified structure
    // instead of a screenshot. Clicks nothing.
    electron_1.ipcMain.handle('tiktok:scan-live-console', async (event, accountId) => {
        assertTrustedSender(event);
        const id = normalizeAccountId(accountId);
        if (isStreamBusy(id)) {
            return {
                ok: false,
                liveSafe: true,
                reason: 'กำลังไลฟ์อยู่ จึงไม่สแกนหน้า TikTok LIVE Manager เพื่อกันไลฟ์กระตุก',
                products: getPinConfig(id).products,
                counts: { products: getPinConfig(id).products.length },
            };
        }
        await warmChatSenderWindow(id);
        const window = chatSenderWindow(id);
        if (window.webContents.isLoading()) {
            await new Promise((resolve) => window.webContents.once('did-stop-loading', () => resolve()));
        }
        return (await window.webContents.executeJavaScript(liveConsoleScanScript(), true));
    });
    electron_1.ipcMain.handle('ads:get-link-config', (event, accountId) => {
        assertTrustedSender(event);
        return getAdsLinkConfig(normalizeAccountId(accountId));
    });
    electron_1.ipcMain.handle('ads:set-link-config', (event, accountId, config) => {
        assertTrustedSender(event);
        return saveAdsLinkConfig(normalizeAccountId(accountId), config);
    });
    // Visible on purpose: the first run needs the seller to log into Ads Manager (and pick
    // a Business Center / ad account) themselves, the same way tiktok:open-shop does.
    electron_1.ipcMain.handle('tiktok:open-ads-manager', async (event, accountId) => {
        assertTrustedSender(event);
        const window = adsManagerWindow(normalizeAccountId(accountId));
        window.show();
        window.focus();
    });
    // Read-only. Phase 1 of ads scaling: report what the Ads Manager page actually
    // contains (campaign rows, budget/spend tiles, toggles) so a later "raise budget"
    // action can be written against verified structure. Clicks nothing.
    electron_1.ipcMain.handle('tiktok:scan-ads-manager', async (event, accountId) => {
        assertTrustedSender(event);
        const window = adsManagerWindow(normalizeAccountId(accountId));
        window.show();
        if (window.webContents.isLoading()) {
            await new Promise((resolve) => window.webContents.once('did-stop-loading', () => resolve()));
        }
        return (await window.webContents.executeJavaScript(adsManagerScanScript(), true));
    });
    // Fills the ROI target / daily budget input on the Create-campaign page — never
    // clicks Publish. See setAdsFieldScript for why the field is found the way it is.
    electron_1.ipcMain.handle('tiktok:set-ads-field', async (event, accountId, target, value) => {
        assertTrustedSender(event);
        if (target !== 'roi' && target !== 'budget')
            return { ok: false, reason: 'bad-target' };
        const text = typeof value === 'string' ? value.trim().slice(0, 20) : '';
        if (!/^\d{1,9}(\.\d{1,2})?$/.test(text))
            return { ok: false, reason: 'bad-value' };
        return setAdsField(normalizeAccountId(accountId), target, text);
    });
    electron_1.ipcMain.handle('pin:get-config', (event, accountId) => {
        assertTrustedSender(event);
        return getPinConfigForClient(normalizeAccountId(accountId));
    });
    electron_1.ipcMain.handle('pin:set-config', (event, accountId, config) => {
        assertTrustedSender(event);
        return savePinConfig(normalizeAccountId(accountId), config);
    });
    // Read-only: pulls the current product list out of the LIVE console so the seller can
    // pick and order them without retyping names.
    electron_1.ipcMain.handle('pin:list-products', async (event, accountId) => {
        assertTrustedSender(event);
        const id = normalizeAccountId(accountId);
        return queueProductConsoleJob(id, 'pin-list-products', async () => {
        let result;
        try {
            result = await listLiveProducts(id);
        }
        catch (error) {
            result = cachedPinProductsResult(id, error instanceof Error ? error.message : 'scan-failed');
        }
        // The seller just told us what is in the cart. Treat this as the new truth for
        // this account/live, not as another list to merge with yesterday's products.
        const products = Array.isArray(result?.products) ? result.products : [];
        if (products.length)
            saveDiscoveredPinProducts(id, products, true);
        else
            emitChatEvent(id, {
                kind: 'system',
                id: (0, node_crypto_1.randomUUID)(),
                text: 'ยังดึงสินค้าจาก TikTok ไม่ได้ แต่ระบบไม่ล้างรายการสินค้าเดิม เพื่อกันปักตะกร้าพังระหว่างไลฟ์',
                at: Date.now(),
            });
        const lines = products
            .map((product) => (product.text ?? '').replace(/\s*Pin$/i, '').trim())
            .filter(Boolean);
        let aiLines = lines;
        if (lines.length)
            (0, chat_engine_1.setChatProducts)(id, lines);
        const chatConfig = getChatConfig(id);
        if (products.length && chatConfig.enabled && chatConfig.ai.enabled && chatConfig.ai.useProducts) {
            const cachedLines = readCachedChatProductLines(id, products);
            if (cachedLines.length) {
                aiLines = cachedLines;
            }
            else {
                const detailedProducts = await enrichProductsWithDetails(id, products);
                const detailedLines = detailedProducts
                    .map((product) => (product.text ?? '').replace(/\s*Pin$/i, '').trim())
                    .filter(Boolean);
                if (detailedLines.length) {
                    aiLines = detailedLines;
                    saveCachedChatProductLines(id, products, detailedLines);
                }
            }
            if (aiLines.length)
                (0, chat_engine_1.setChatProducts)(id, aiLines);
        }
        const aiProducts = aiLines.map((line, index) => ({ cart: index + 1, text: summarizeProductOptionsForPanel(line, index + 1) }));
        if (aiProducts.length) {
            writePinAiProducts(id, aiProducts);
            savePinConfig(id, { ...getPinConfig(id), aiProducts });
        }
        return { ...result, aiProducts };
        });
    });
    electron_1.ipcMain.handle('pin:open-product-link', async (event, accountId, selector = 'Hot deals') => {
        assertTrustedSender(event);
        const id = normalizeAccountId(accountId);
        return queueProductConsoleJob(id, 'pin-open-product-link', async () => {
        const result = await listLiveProducts(id);
        const products = result?.products ?? [];
        const wanted = String(selector ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
        const target = /^\d+$/.test(wanted)
            ? products.find((product) => Number(product.cartIndex) === Number(wanted))
            : products.find((product) => `${product.labels} ${product.name}`.toLowerCase().includes(wanted))
                ?? products.find((product) => String(product.labels ?? '').toLowerCase().includes('hot deals'));
        if (!target)
            throw new Error(`ไม่พบสินค้าที่ตรงกับ ${selector || 'Hot deals'}`);
        return openProductDetailWindow(id, target);
        });
    });
    // Pin one product now. Exposed on its own so the seller can prove a pin works before
    // handing the rotation the keys.
    electron_1.ipcMain.handle('pin:pin-now', async (event, accountId, name) => {
        assertTrustedSender(event);
        if (typeof name !== 'string' || !name.trim())
            throw new Error('ไม่ได้ระบุชื่อสินค้า');
        const id = normalizeAccountId(accountId);
        return queueProductConsoleJob(id, 'pin-now', async () => {
        const roomId = await resolveActiveRoomId(id, peekStreamSession(id)?.room?.roomId);
        const savedTarget = getPinConfig(id).products.find((product) => product.name === name.trim()) ?? name.trim();
        try {
            const result = await pinProductApi(id, roomId, savedTarget);
            if (!result?.ok && (result?.reason === 'not-pinned' || result?.reason === 'pinned-other')) {
                if (isStreamBusy(id))
                    return (await runTikTokApiInLiveConsole(id, pinProductScript(savedTarget)));
                return (await runInLiveConsole(id, pinProductScript(savedTarget)));
            }
            return result;
        }
        catch (error) {
            if (isStreamBusy(id))
                return (await runTikTokApiInLiveConsole(id, pinProductScript(savedTarget)));
            return (await runInLiveConsole(id, pinProductScript(savedTarget)));
        }
        });
    });
    // Coupon: read what is offered, or pin it. Same click discipline as products.
    electron_1.ipcMain.handle('pin:coupon', async (event, accountId, action) => {
        assertTrustedSender(event);
        const id = normalizeAccountId(accountId);
        const mode = action === 'pin' ? 'pin' : 'read';
        return queueProductConsoleJob(id, `pin-coupon-${mode}`, async () => {
        const roomId = await resolveActiveRoomId(id, peekStreamSession(id)?.room?.roomId);
        try {
            return await couponApi(id, roomId, mode);
        }
        catch (error) {
            if (isStreamBusy(id))
                return (await runTikTokApiInLiveConsole(id, couponScript(mode)));
            return (await runInLiveConsole(id, couponScript(mode)));
        }
        });
    });
    // Live analytics straight off the console — read-only.
    electron_1.ipcMain.handle('pin:live-stats', async (event, accountId) => {
        assertTrustedSender(event);
        const id = normalizeAccountId(accountId);
        if (isStreamBusy(id))
            return { ok: false, liveSafe: true, reason: 'กำลังไลฟ์อยู่ จึงไม่อ่านหน้า LIVE Manager เพื่อกันไลฟ์กระตุก' };
        return (await runInLiveConsole(id, liveStatsScript()));
    });
    // Clip specs for the picker, so a mismatch is visible when clips are chosen rather than
    // when the live refuses to start.
    electron_1.ipcMain.handle('media:probe-clips', async (event, paths) => {
        assertTrustedSender(event);
        if (!Array.isArray(paths))
            return [];
        const out = [];
        for (const value of paths.slice(0, 30)) {
            if (typeof value !== 'string')
                continue;
            const info = await probeClip(value);
            if (!info)
                continue;
            out.push({ path: value, label: describeClip(info), width: info.width, height: info.height, fps: Math.round(info.fps) });
        }
        return out;
    });
    // Rebuild a running live with new settings. Overlays, clips and camera are baked into
    // the FFmpeg command at spawn, so there is no way to change them in place — but the
    // reconnect path already respawns cleanly, carrying the playback offset and leaving the
    // TikTok room and chat untouched. This reuses it, which costs a second or two of video
    // rather than ending the broadcast.
    electron_1.ipcMain.handle('stream:apply-config', async (event, value) => {
        assertTrustedSender(event);
        const config = rememberStreamConfig(value);
        const sessionState = getStreamSession(config.accountId);
        if (!sessionState.retry || !sessionState.ffmpegProcess) {
            throw new Error('ยังไม่ได้ไลฟ์อยู่ — กดเริ่มไลฟ์ได้เลย');
        }
        // A changed clip list needs a fresh playlist; dropping it makes startFfmpeg rebuild.
        const clipsChanged = JSON.stringify(sessionState.retry.config.videoPaths) !== JSON.stringify(config.videoPaths) ||
            sessionState.retry.config.shuffleEnabled !== config.shuffleEnabled;
        const switchNow = () => {
            const retry = sessionState.retry;
            if (!retry || !sessionState.ffmpegProcess)
                return;
            sessionState.applyRestartPending = true;
            sessionState.degradeRestartPending = true;
            try {
                sessionState.ffmpegProcess.kill('SIGKILL');
            }
            catch {
                // Already exiting; the close handler still sees the pending flag.
            }
        };
        // A second apply while one is waiting replaces it — the newest list wins.
        if (sessionState.applySwitchTimer) {
            clearTimeout(sessionState.applySwitchTimer);
            sessionState.applySwitchTimer = null;
        }
        if (!clipsChanged) {
            // Overlays/camera: apply straight away, as before.
            sessionState.retry.config = config;
            emitChatEvent(config.accountId, {
                kind: 'system',
                id: (0, node_crypto_1.randomUUID)(),
                text: 'กำลังอัปเดตการตั้งค่าให้ไลฟ์นี้ — ภาพจะสะดุดสั้นๆ แล้วต่อเอง',
                at: Date.now(),
            });
            switchNow();
            return { applied: true, clipsChanged };
        }
        // Conform any new clip FIRST, while the old stream keeps playing — a fresh clip that
        // needs the one-time spec transcode can take a minute, and doing it after the kill
        // would leave the broadcast black for that whole minute.
        if (config.videoPaths.length > 1) {
            await conformClipsIfNeeded(sessionState, config.videoPaths, sessionState.stopGeneration);
        }
        // Only after conforming (it can take a while) work out where the queue stands, so the
        // remaining time is measured from now, not from before the transcode.
        const { startWith, remainingSec } = await clipToResumeFrom(sessionState, config.videoPaths);
        const oldPlaylist = sessionState.retry.playlistFile;
        if (startWith)
            sessionState.retry.startWithClip = startWith;
        sessionState.retry.playlistFile = null;
        sessionState.retry.offsetSec = 0;
        // Zero also disables the close-handler's offset recompute (gated on durationSec > 0),
        // which would otherwise resume a brand-new clip list from the old list's elapsed time.
        sessionState.retry.durationSec = 0;
        sessionState.retry.config = config;
        // The seller's requirement: the clip on screen finishes before the new list takes
        // over. So the switch is scheduled for the clip boundary rather than fired now —
        // which also puts the respawn blink at the join, where a cut is least visible. A
        // moment of lead keeps the old stream from starting the next clip first and playing
        // its opening twice. Unknown remaining time falls back to switching immediately.
        const waitSec = remainingSec !== null ? Math.max(0, remainingSec - 1.5) : 0;
        const generationAtApply = sessionState.stopGeneration;
        const processAtApply = sessionState.ffmpegProcess;
        const fire = () => {
            sessionState.applySwitchTimer = null;
            // A stop pressed while we waited wins; so does a live that already died on its own.
            if (sessionState.stopGeneration !== generationAtApply)
                return;
            // If the process changed underneath us (a natural drop reconnected mid-wait), the
            // respawn already picked up the new list — killing the fresh stream again would just
            // add a second blink for nothing.
            if (sessionState.ffmpegProcess !== processAtApply)
                return;
            if (oldPlaylist) {
                try {
                    (0, node_fs_1.unlinkSync)(oldPlaylist);
                }
                catch {
                    // Already gone.
                }
            }
            switchNow();
        };
        emitChatEvent(config.accountId, {
            kind: 'system',
            id: (0, node_crypto_1.randomUUID)(),
            text: waitSec > 3
                ? `อัปเดตรายการคลิปแล้ว — จะสลับเข้ารายการใหม่เมื่อคลิปปัจจุบันจบ (อีกประมาณ ${Math.round(waitSec)} วินาที)`
                : 'อัปเดตรายการคลิปแล้ว — กำลังสลับเข้ารายการใหม่',
            at: Date.now(),
        });
        if (waitSec > 3) {
            sessionState.applySwitchTimer = setTimeout(fire, waitSec * 1000);
            sessionState.applySwitchTimer.unref();
        }
        else {
            fire();
        }
        return { applied: true, clipsChanged, waitSec };
    });
    // One-press AI connectivity test: same code path a real reply uses, but with a fixed
    // sample comment and no live, no cooldowns, no second account required. The seller's
    // first real test failed on a wrong key AND a closed master switch, and there was no way
    // to see either without going live — that is a terrible feedback loop for a paid key.
    electron_1.ipcMain.handle('chat:test-ai', async (event, accountId) => {
        assertTrustedSender(event);
        const config = getChatConfig(normalizeAccountId(accountId));
        const configuredKeys = [
            ...(typeof config.ai.apiKey === 'string' ? config.ai.apiKey.split(/[\r\n,;]+/) : []),
            ...(Array.isArray(config.ai.apiKeys) ? config.ai.apiKeys : []),
        ].map((key) => typeof key === 'string' ? key.trim() : '').filter(Boolean);
        if (!configuredKeys.length)
            return { ok: false, error: 'ยังไม่ได้ใส่ API key' };
        let products = [];
        if (config.ai.useProducts) {
            try {
                const result = await listLiveProducts(normalizeAccountId(accountId));
                const contextProducts = isStreamBusy(normalizeAccountId(accountId))
                    ? result.products ?? []
                    : await enrichProductsWithDetails(normalizeAccountId(accountId), result.products ?? []);
                products = contextProducts
                    .map((product) => (product.text ?? '').replace(/\s*Pin$/i, '').trim())
                    .filter(Boolean)
                    .map((line) => ({ line }));
            }
            catch {
                products = [];
            }
        }
        let failure = '';
        const reply = await (0, chat_engine_1.generateAiReply)('ลูกค้าถามว่า: สวัสดีครับ ร้านนี้มีโปรอะไรบ้าง ตะกร้าแรกคืออะไร', config.ai, products, (message) => {
            failure = message;
        });
        if (reply)
            return { ok: true, reply, chatEnabled: config.enabled };
        return { ok: false, error: failure || 'AI ไม่ได้ส่งข้อความกลับมา', chatEnabled: config.enabled };
    });
    electron_1.ipcMain.handle('chat:test-ai-question', async (event, accountId, question) => {
        assertTrustedSender(event);
        const id = normalizeAccountId(accountId);
        const text = typeof question === 'string' && question.trim()
            ? question.trim().slice(0, 240)
            : 'ผิวแพ้ง่ายใช้ได้ไหมคะ';
        const config = getChatConfig(id);
        const configuredKeys = [
            ...(typeof config.ai.apiKey === 'string' ? config.ai.apiKey.split(/[\r\n,;]+/) : []),
            ...(Array.isArray(config.ai.apiKeys) ? config.ai.apiKeys : []),
        ].map((key) => typeof key === 'string' ? key.trim() : '').filter(Boolean);
        if (!configuredKeys.length)
            return { ok: false, error: 'ยังไม่ได้ใส่ API key' };
        let products = [];
        if (config.ai.useProducts) {
            try {
                const result = await listLiveProducts(id);
                const contextProducts = isStreamBusy(id)
                    ? result.products ?? []
                    : await enrichProductsWithDetails(id, result.products ?? []);
                products = contextProducts
                    .map((product) => (product.text ?? '').replace(/\s*Pin$/i, '').trim())
                    .filter(Boolean)
                    .map((line) => ({ line }));
            }
            catch {
                products = [];
            }
        }
        let failure = '';
        const reply = await (0, chat_engine_1.generateAiReply)(text, config.ai, products, (message) => {
            failure = message;
        });
        if (reply)
            return { ok: true, reply, chatEnabled: config.enabled };
        return { ok: false, error: failure || 'AI ไม่ได้ส่งข้อความกลับมา', chatEnabled: config.enabled };
    });
    electron_1.ipcMain.handle('chat:test-send', async (event, accountId, text) => {
        assertTrustedSender(event);
        const id = normalizeAccountId(accountId);
        const message = typeof text === 'string' && text.trim()
            ? text.trim().slice(0, 100)
            : 'ทดสอบระบบตอบกลับค่ะ';
        await warmChatSenderWindow(id);
        const roomId = peekStreamSession(id)?.room?.roomId ?? null;
        try {
            const result = await sendChatViaApi(id, roomId, message);
            return {
                ok: true,
                via: 'api',
                endpoint: '/api/v1/streamer_desktop/message/chat',
                roomId: result?.roomId || (roomId ? String(roomId) : ''),
                status: result?.status,
                response: result?.data ?? null,
            };
        }
        catch (apiError) {
            const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
            try {
                await sendChatViaWindow(id, message);
                return { ok: true, via: 'composer-fallback', apiError: apiMessage };
            }
            catch (fallbackError) {
                const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                return { ok: false, apiError: apiMessage, fallbackError: fallbackMessage };
            }
        }
    });
    electron_1.ipcMain.handle('chat:get-config', (event, accountId) => {
        assertTrustedSender(event);
        return getChatConfig(normalizeAccountId(accountId));
    });
    electron_1.ipcMain.handle('chat:set-config', (event, accountId, value) => {
        assertTrustedSender(event);
        return saveChatConfig(normalizeAccountId(accountId), value);
    });
    electron_1.ipcMain.handle('debug:live-chat-scan', async (event, accountId) => {
        assertTrustedSender(event);
        const id = normalizeAccountId(accountId);
        await warmChatSenderWindow(id);
        const comments = await runInLiveConsole(id, liveChatCommentsScript(), { allowWhileLive: true }).catch((error) => ({
            ok: false,
            reason: error instanceof Error ? error.message : String(error),
        }));
        const page = await runInLiveConsole(id, `(() => {
      const cap = (s, n) => String(s || '').replace(/\\s+/g, ' ').trim().slice(0, n)
      const body = cap(document.body?.innerText || document.body?.textContent || '', 2500)
      const resources = performance.getEntriesByType('resource').map((entry) => entry.name).slice(-80)
      return {
        ok: true,
        url: location.href,
        title: document.title,
        hasComposer: /Type something|พิมพ์|ข้อความ|comment|message/i.test(body),
        hasChatText: /Chat|แชท|Viewer comments|Product related/i.test(body),
        body,
        recentChatUrls: resources.filter((url) => /webcast\\/im\\/fetch|streamer_desktop|room\\/status|message\\/chat/i.test(url)).slice(-20),
      }
    })()`, { allowWhileLive: true }).catch((error) => ({
            ok: false,
            reason: error instanceof Error ? error.message : String(error),
        }));
        return { comments, page };
    });
    electron_1.ipcMain.handle('debug:recover-chat-readers', async (event) => {
        assertTrustedSender(event);
        await recoverEnabledChatReaders();
        return { ok: true, accounts: enabledChatAccountIds() };
    });
    electron_1.ipcMain.handle('debug:live-chat-api', async (event, accountId) => {
        assertTrustedSender(event);
        const id = normalizeAccountId(accountId);
        const status = await fetchActiveShopRoomStatus(id).catch((error) => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }));
        const roomId = status?.roomId || '';
        const raw = roomId ? await webcastFetchDirect(id, { roomId }).catch((error) => ({ ok: false, reason: error instanceof Error ? error.message : String(error) })) : { ok: false, reason: 'no-room-id' };
        const decoded = decodeWebcastChatFetch(raw);
        return {
            status: status?.ok ? { ok: true, roomId: status.roomId, hasLiveStreamUrl: Boolean(status.liveStreamUrl), url: status.url } : status,
            fetch: raw?.ok ? { ok: true, httpStatus: raw.status, roomId: raw.roomId, bytes: raw.body ? Buffer.from(raw.body, 'base64').length : 0 } : raw,
            decoded: { ok: decoded.ok, reason: decoded.reason, count: decoded.comments.length, comments: decoded.comments.slice(-80) },
        };
    });
    electron_1.ipcMain.handle('debug:live-chat-resources', async (event, accountId) => {
        assertTrustedSender(event);
        const id = normalizeAccountId(accountId);
        const result = await runInLiveConsole(id, `(() => {
      const cap = (s, n) => String(s || '').replace(/\\s+/g, ' ').trim().slice(0, n)
      const resources = performance.getEntriesByType('resource')
        .map((entry) => entry.name || '')
        .filter(Boolean)
      const interesting = resources.filter((url) => /webcast|room|chat|message|comment|live_room|streamer_desktop/i.test(url)).slice(-120)
      const roomIds = []
      for (const raw of interesting) {
        try {
          const url = new URL(raw)
          const value = url.searchParams.get('room_id')
          if (value && !roomIds.includes(value)) roomIds.push(value)
        } catch {}
      }
      return {
        ok: true,
        url: location.href,
        title: document.title,
        roomIds,
        body: cap(document.body?.innerText || '', 2000),
        resources: interesting.map((raw) => {
          try {
            const url = new URL(raw)
            return { host: url.hostname, path: url.pathname, roomId: url.searchParams.get('room_id') || '', full: raw.slice(0, 800) }
          } catch {
            return { full: raw.slice(0, 800) }
          }
        }),
      }
    })()`, { allowWhileLive: true }).catch((error) => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }));
        return result;
    });
    electron_1.ipcMain.handle('line:get-config', (event) => {
        assertTrustedSender(event);
        return getLineConfig();
    });
    electron_1.ipcMain.handle('line:set-config', (event, value) => {
        assertTrustedSender(event);
        return saveLineConfig(value);
    });
    // Send a test message using the token/target the user just typed (not yet saved).
    electron_1.ipcMain.handle('line:test', async (event, value) => {
        assertTrustedSender(event);
        return (0, notify_1.sendLineMessage)((0, notify_1.sanitizeLineConfig)(value), `✅ ทดสอบการแจ้งเตือนจาก Digital NP Studio\n${nowText()}`);
    });
    // "Check live via LINE": push the current status of all accounts on demand.
    electron_1.ipcMain.handle('line:push-status', async (event) => {
        assertTrustedSender(event);
        return (0, notify_1.sendLineMessage)(getLineConfig(), liveStatusSummary());
    });
    electron_1.ipcMain.handle('history:list', async (event) => {
        assertTrustedSender(event);
        const license = await licenseStatus();
        const owner = normalizeAccountId(String(license.username || license.displayName || '').trim().toLowerCase());
        adoptLegacyHistoryForOwner(owner);
        const ownerPrefix = owner ? `${owner}__` : '';
        // Newest first for display.
        return [...getHistory()].filter((item) => !ownerPrefix || String(item.accountId || '').startsWith(ownerPrefix)).reverse();
    });
    electron_1.ipcMain.handle('history:clear', async (event) => {
        assertTrustedSender(event);
        const license = await licenseStatus();
        const owner = normalizeAccountId(String(license.username || license.displayName || '').trim().toLowerCase());
        const ownerPrefix = owner ? `${owner}__` : '';
        writeHistory(ownerPrefix ? getHistory().filter((item) => !String(item.accountId || '').startsWith(ownerPrefix)) : []);
        return [];
    });
    electron_1.ipcMain.handle('library:list', (event) => {
        assertTrustedSender(event);
        return libraryForRenderer();
    });
    electron_1.ipcMain.handle('library:add', async (event) => {
        assertTrustedSender(event);
        const license = await licenseStatus();
        const limit = Number.isFinite(license.videoLimit) && Math.floor(license.videoLimit) > 0 ? Math.floor(license.videoLimit) : null;
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: 'เพิ่มวิดีโอเข้าคลัง',
            properties: ['openFile'],
            filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }],
        });
        if (result.canceled || !result.filePaths[0])
            return libraryForRenderer();
        if (limit !== null && !getLibrary().some((entry) => entry.path === result.filePaths[0]) && getLibrary().length >= limit)
            throw new Error(`แพ็กเกจนี้มีวิดีโอรวมได้สูงสุด ${limit} ไฟล์`);
        addLibraryEntry(result.filePaths[0]);
        return libraryForRenderer();
    });
    electron_1.ipcMain.handle('library:choose-file', async (event) => {
        assertTrustedSender(event);
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: 'เลือกวิดีโอเข้าคลัง',
            properties: ['openFile'],
            filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }],
        });
        if (result.canceled || !result.filePaths[0])
            return null;
        const filePath = result.filePaths[0];
        const stat = (0, node_fs_1.statSync)(filePath);
        return {
            path: filePath,
            name: node_path_1.default.basename(filePath),
            size: stat.size,
            addedAt: Date.now(),
            mediaUrl: mediaUrl(filePath),
        };
    });
    electron_1.ipcMain.handle('library:save-file', async (event, payload) => {
        assertTrustedSender(event);
        const value = payload && typeof payload === 'object' ? payload : {};
        const filePath = typeof value.path === 'string' ? value.path : '';
        const license = await licenseStatus();
        const limit = Number.isFinite(license.videoLimit) && Math.floor(license.videoLimit) > 0 ? Math.floor(license.videoLimit) : null;
        if (!filePath || !(0, node_fs_1.existsSync)(filePath))
            throw new Error('กรุณาเลือกไฟล์วิดีโอก่อนบันทึก');
        if (limit !== null && !getLibrary().some((entry) => entry.path === filePath) && getLibrary().length >= limit)
            throw new Error(`แพ็กเกจนี้มีวิดีโอรวมได้สูงสุด ${limit} ไฟล์`);
        addLibraryEntry(filePath, value.name);
        return libraryForRenderer();
    });
    electron_1.ipcMain.handle('library:remove', (event, id) => {
        assertTrustedSender(event);
        removeLibraryEntry(id);
        return libraryForRenderer();
    });
}
let latestUpdateStatus = { state: 'none' };
function broadcastUpdateStatus(status) {
    latestUpdateStatus = status;
    if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('update:status', status);
}
// User-facing auto-update preference. When on, new versions download automatically
// in the background; when off, the user checks + downloads manually from Settings.
// Either way the "อัปเดตเลย" button applies a downloaded update.
let autoUpdatePref = true;
function updateConfigPath() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'update-config.json');
}
function loadUpdateConfig() {
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(updateConfigPath(), 'utf8'));
        if (parsed && typeof parsed.autoUpdate === 'boolean')
            autoUpdatePref = parsed.autoUpdate;
    }
    catch {
        // No saved preference yet — keep the default (auto-update on).
    }
}
function saveUpdateConfig() {
    try {
        (0, node_fs_1.writeFileSync)(updateConfigPath(), JSON.stringify({ autoUpdate: autoUpdatePref }), { encoding: 'utf8', mode: 0o600 });
    }
    catch {
        // Non-fatal; the preference just won't persist across restarts.
    }
}
function setupAutoUpdater() {
    loadUpdateConfig();
    // electron-updater only works from a packaged build with a publish feed; skip in dev.
    if (!electron_1.app.isPackaged)
        return;
    electron_updater_1.autoUpdater.autoDownload = autoUpdatePref;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on('checking-for-update', () => broadcastUpdateStatus({ state: 'checking' }));
    electron_updater_1.autoUpdater.on('update-available', (info) => broadcastUpdateStatus({ state: 'available', version: info.version }));
    electron_updater_1.autoUpdater.on('update-not-available', () => broadcastUpdateStatus({ state: 'none' }));
    electron_updater_1.autoUpdater.on('download-progress', (progress) => broadcastUpdateStatus({ state: 'downloading', percent: Math.round(progress.percent) }));
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => broadcastUpdateStatus({ state: 'ready', version: info.version }));
    electron_updater_1.autoUpdater.on('error', (error) => broadcastUpdateStatus({ state: 'error', message: error instanceof Error ? error.message : 'update error' }));
    const check = () => {
        electron_updater_1.autoUpdater.checkForUpdates().catch(() => undefined);
    };
    check();
    setInterval(check, 60 * 60 * 1000);
}
global.__npSignInLocal = async () => { const state = global.__npLocalBackend.ownerSession(getMachineId()); saveLicenseState(state); return licenseStatus(); };
electron_1.app.whenReady().then(() => {
    electron_1.protocol.handle('rerun-media', (request) => {
        const requestUrl = new URL(request.url);
        const token = requestUrl.pathname.replace(/^\//, '');
        const filePath = mediaTokens.get(token);
        if (!filePath || !node_path_1.default.isAbsolute(filePath))
            return new Response('Invalid media token', { status: 404 });
        let size;
        try {
            size = (0, node_fs_1.statSync)(filePath).size;
        }
        catch {
            return new Response('Not found', { status: 404 });
        }
        const contentType = mediaMimeType(filePath);
        // The <video> preview seeks and loops, which needs HTTP Range (206) support.
        // net.fetch(file://) ignores the Range header and always returns the whole file,
        // so the player had to buffer the entire clip before the first frame — it looked
        // frozen. Serve byte ranges from an fs stream instead.
        const rangeHeader = request.headers.get('Range');
        const match = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null;
        if (match) {
            const start = match[1] ? Number(match[1]) : 0;
            const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
            if (Number.isNaN(start) || start > end || start >= size) {
                return new Response('Range not satisfiable', {
                    status: 416,
                    headers: { 'Content-Range': `bytes */${size}` },
                });
            }
            const body = node_stream_1.Readable.toWeb((0, node_fs_1.createReadStream)(filePath, { start, end }));
            return new Response(body, {
                status: 206,
                headers: {
                    'Content-Type': contentType,
                    'Content-Range': `bytes ${start}-${end}/${size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': String(end - start + 1),
                },
            });
        }
        const body = node_stream_1.Readable.toWeb((0, node_fs_1.createReadStream)(filePath));
        return new Response(body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
                'Content-Length': String(size),
            },
        });
    });
    registerIpc();
    ensureStreamScheduler();
    createMainWindow();
    const chatRecoveryTimer = setTimeout(() => void recoverEnabledChatReaders(), 2500);
    chatRecoveryTimer.unref?.();
    // Desktop auto-update disabled for this web-server distribution.
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    });
});
electron_1.app.on('window-all-closed', () => {});
electron_1.app.on('before-quit', () => {
    for (const sessionState of streamSessions.values()) {
        if (sessionState.ffmpegProcess)
            sessionState.ffmpegProcess.kill('SIGTERM');
        stopOverlayText(sessionState);
    }
});






