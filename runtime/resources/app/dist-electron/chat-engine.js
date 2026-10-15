"use strict";
// chat-engine.ts — reads incoming TikTok LIVE comments for our own rerun room and
// auto-replies as the host. Two reply strategies, checked in order:
//   A. keyword rules  — free, instant, for known FAQs (price, shipping, COD…)
//   B. AI (Anthropic)  — BYOK: the user supplies their own API key, so there is no
//      API cost to us. Only used when no rule matches, to keep call volume (and cost) low.
//
// Reading goes through tiktok-live-connector (v2), which handles the webcast protobuf
// decode; we connect by roomId (or the host @username for Stream-Key lives), seeded with
// the host's captured session cookie. Sending does NOT use that library: its only send
// route is Euler Stream's paid relay, so the caller injects a `send` function instead.
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultChatConfig = defaultChatConfig;
exports.isChatEngineRunning = isChatEngineRunning;
exports.setChatProducts = setChatProducts;
exports.updateChatConfig = updateChatConfig;
exports.feedChatComment = feedChatComment;
exports.startDomChatEngine = startDomChatEngine;
exports.startChatEngine = startChatEngine;
exports.stopChatEngine = stopChatEngine;
exports.generateAiReply = generateAiReply;
const electron_1 = require("electron");
let libraryPromise = null;
function loadLibrary() {
    if (!libraryPromise)
        libraryPromise = import('tiktok-live-connector');
    return libraryPromise;
}
function defaultChatConfig() {
    return {
        enabled: false,
        rules: [],
        ai: {
            enabled: false,
            provider: 'gemini',
            apiKey: '',
            apiKeys: [],
            providerConfigs: {
                gemini: { apiKey: '', apiKeys: [], model: 'gemini-3-flash-preview' },
                openai: { apiKey: '', apiKeys: [], model: 'gpt-6-astra' },
                claude: { apiKey: '', apiKeys: [], model: 'claude-haiku-4-5' },
            },
            // The '-latest' alias tracks whatever Google currently serves. A pinned version was
            // the default once and got RETIRED under us — every configured user began 404ing.
            model: 'gemini-3-flash-preview',
            context: '',
            useProducts: true,
        },
        replyCooldownMs: 4000,
        // 8s, down from 30: a buying customer asks two questions back-to-back, and a 30s
        // mute per viewer read as "the AI answers only some questions" in real testing.
        perUserCooldownMs: 8000,
        signApiKey: '',
        hostUsername: '',
    };
}
// Pull a single cookie value out of the "name=value; name2=value2" header string.
function cookieValue(cookie, name) {
    const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookie);
    return match ? match[1] : '';
}
const randomId = () => Math.random().toString(36).slice(2, 10);
// How long to wait for a sent reply to echo back through the read connection before
// concluding it never actually posted. The webcast relay is normally sub-second to a
// couple of seconds, so this is a generous margin, not a tight one.
const CONFIRM_TIMEOUT_MS = 8000;
const INCOMING_DEDUPE_MS = 60000;
function system(text) {
    return { kind: 'system', id: randomId(), text, at: Date.now() };
}
function canonicalChatText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~“”‘’]+/g, '')
        .trim();
}
function canonicalViewerName(value) {
    return String(value || 'ผู้ชม')
        .replace(/\b(host|admin|moderator|creator)\b/ig, '')
        .replace(/ผู้จัด|โฮสต์|แอดมิน|เจ้าของร้าน|แม่ค้า/g, '')
        .replace(/\s+/g, ' ')
        .trim() || 'ผู้ชม';
}
function isHostLikeMessage(message) {
    const role = String(message?.role || message?.user?.role || '').toLowerCase();
    const label = `${message?.user?.nickname || ''} ${message?.user?.displayId || ''}`;
    return /host|creator|anchor|admin|moderator/i.test(role)
        || /\bhost\b/i.test(label)
        || /ผู้จัด|โฮสต์|แอดมิน|เจ้าของร้าน|แม่ค้า/.test(label);
}
// One ChatSession per TikTok account, so every live room reads/replies with its own
// connection, config, cooldown timers and self-echo suppression set. Concurrent lives
// no longer share (and clobber) a single module-level connection.
class ChatSession {
    // Product lines for the prompt, pushed in from the main process — the chat engine has no
    // access to the LIVE console itself, and should not grow one.
    products = [];
    connection = null;
    config;
    emit;
    send;
    lastGlobalReplyAt = 0;
    lastUserReplyAt = new Map();
    // Texts we just sent, so the echo of our own reply in the chat stream is ignored
    // (prevents the bot replying to itself).
    recentlySent = new Set();
    // Sent texts still waiting to see their own echo — the ONLY real proof TikTok's
    // backend actually posted the reply. The composer only proves the input field cleared,
    // and some web UIs clear it optimistically even when the backend silently drops or
    // rate-limits the post, which would otherwise look like a successful reply that never
    // actually reaches viewers.
    pendingConfirmations = new Map();
    // LIVE Manager can expose the same viewer comment through more than one reader
    // (DOM poller + webcast/browser fallback). Claim it before AI generation so one
    // real comment cannot produce two host replies.
    recentIncoming = new Map();
    inFlightIncoming = new Set();
    constructor(config, emit, send) {
        this.config = config;
        this.emit = emit;
        this.send = send;
    }
    isRunning() {
        return true;
    }
    // Live-editable: settings changed from the UI take effect without reconnecting.
    updateConfig(config) {
        this.config = config;
    }
    async start(roomId, cookie) {
        const { TikTokLiveConnection, ControlEvent, WebcastEvent } = await loadLibrary();
        // Stream-Key lives give us no roomId, so we connect by the host's @username and let
        // the library look the live room up (which is what fetchRoomInfoOnConnect does).
        const hostUsername = this.config.hostUsername.trim().replace(/^@/, '');
        if (!roomId && !hostUsername) {
            throw new Error('โหมด Stream Key ต้องกรอก @username ของบัญชีโฮสต์ก่อนจึงจะตอบแชทได้');
        }
        const conn = new TikTokLiveConnection(hostUsername || 'digitalnpstudio', {
            session: {
                cookie: {
                    type: 'cookie',
                    value: {
                        sessionId: cookieValue(cookie, 'sessionid'),
                        ttTargetIdc: cookieValue(cookie, 'tt-target-idc'),
                    },
                },
            },
            // Deliberately not passing authenticateWs: the library only forwards it to the
            // signed-websocket route when useMobile is set, and that path additionally demands
            // an Euler Stream whitelist env var we don't have — so it was a no-op that only
            // made this call look like it did something. Reading public chat needs no WS auth.
            signApiKey: this.config.signApiKey || undefined,
            fetchRoomInfoOnConnect: !roomId,
            processInitialData: false,
        });
        this.connection = conn;
        this.connection.on(ControlEvent.DISCONNECTED, () => this.emit(system('การเชื่อมต่อแชทหลุด')));
        this.connection.on(ControlEvent.ERROR, (payload) => {
            const detail = payload?.exception ?? payload;
            const message = detail instanceof Error ? detail.message : String(payload?.info ?? detail);
            this.emit(system(`แชท error: ${message}`));
        });
        this.connection.on(WebcastEvent.CHAT, (message) => {
            void this.handleChat(message);
        });
        await this.connection.connect(roomId ?? undefined);
        this.emit(system('เชื่อมต่อแชทสำเร็จ — กำลังอ่านคอมเมนต์'));
    }
    async stop() {
        const active = this.connection;
        this.connection = null;
        if (active) {
            try {
                await active.disconnect();
            }
            catch {
                // Already closed or never fully connected; nothing to clean up.
            }
        }
    }
    async handleChat(message) {
        const config = this.config;
        if (!config.enabled)
            return;
        const text = (message.content ?? '').trim();
        if (!text)
            return;
        if (isHostLikeMessage(message))
            return;
        // Ignore the echo of our own replies (they come back through the chat stream) —
        // and if something is waiting to confirm this exact text was actually delivered,
        // this echo is that confirmation.
        if (this.recentlySent.has(text)) {
            this.pendingConfirmations.get(text)?.();
            this.pendingConfirmations.delete(text);
            return;
        }
        const user = canonicalViewerName(message.user?.nickname || message.user?.displayId || 'ผู้ชม');
        const userId = canonicalViewerName(message.user?.id || user);
        const textKey = canonicalChatText(text);
        if (!textKey)
            return;
        const incomingKey = `${userId}:${textKey}`;
        const textOnlyIncomingKey = `text:${textKey}`;
        const now = Date.now();
        const lastSeenIncoming = this.recentIncoming.get(incomingKey) ?? 0;
        const lastSeenText = this.recentIncoming.get(textOnlyIncomingKey) ?? 0;
        if (this.inFlightIncoming.has(incomingKey)
            || this.inFlightIncoming.has(textOnlyIncomingKey)
            || now - lastSeenIncoming < INCOMING_DEDUPE_MS
            || now - lastSeenText < INCOMING_DEDUPE_MS)
            return;
        this.inFlightIncoming.add(incomingKey);
        this.inFlightIncoming.add(textOnlyIncomingKey);
        this.recentIncoming.set(incomingKey, now);
        this.recentIncoming.set(textOnlyIncomingKey, now);
        setTimeout(() => {
            if (this.recentIncoming.get(incomingKey) === now)
                this.recentIncoming.delete(incomingKey);
            if (this.recentIncoming.get(textOnlyIncomingKey) === now)
                this.recentIncoming.delete(textOnlyIncomingKey);
        }, INCOMING_DEDUPE_MS);
        this.emit({ kind: 'incoming', id: randomId(), user, text, at: Date.now() });
        // A keyword cell may carry several phrasings separated by "/" — sellers write FAQ
        // rows like "ผิวขาวใช้โทนไหน / ผิวแทนใช้เบอร์ไหน", and treating that as one literal
        // string means it can never match any real comment.
        const lowered = text.toLowerCase();
        const rule = config.rules.find((candidate) => candidate.enabled &&
            candidate.keyword.trim() &&
            candidate.keyword
                .split('/')
                .map((variant) => variant.trim().toLowerCase())
                .some((variant) => variant && lowered.includes(variant)));
        // Check the cooldowns BEFORE generating. They used to be checked after, so every
        // comment that arrived inside a cooldown still cost a paid API call whose answer was
        // then discarded — on a busy live that is most of them.
        if (now - this.lastGlobalReplyAt < config.replyCooldownMs)
            return void (this.inFlightIncoming.delete(incomingKey), this.inFlightIncoming.delete(textOnlyIncomingKey));
        if (now - (this.lastUserReplyAt.get(userId) ?? 0) < config.perUserCooldownMs)
            return void (this.inFlightIncoming.delete(incomingKey), this.inFlightIncoming.delete(textOnlyIncomingKey));
        let replyText = null;
        let via = 'rule';
        if (rule) {
            replyText = rule.reply.trim() || null;
            via = 'rule';
        }
        else if (config.ai.enabled && aiKeyList(config.ai).length) {
            replyText = await generateAiReply(text, config.ai, this.products, (message) => this.emit(system(message)));
            via = 'ai';
        }
        if (!replyText)
            return void (this.inFlightIncoming.delete(incomingKey), this.inFlightIncoming.delete(textOnlyIncomingKey));
        const finalText = replyText;
        this.recentlySent.add(finalText);
        setTimeout(() => this.recentlySent.delete(finalText), 60000);
        try {
            await this.send(finalText);
        }
        catch {
            // The composer flakes now and then (the hidden LIVE Manager page re-renders under
            // us); observed live, the very next attempt lands. One quiet retry before troubling
            // the seller with a failure message.
            await new Promise((resolve) => setTimeout(resolve, 1500));
            try {
                await this.send(finalText);
            }
            catch (error) {
                this.emit(system(`ส่งคำตอบไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`));
                this.inFlightIncoming.delete(incomingKey);
                this.inFlightIncoming.delete(textOnlyIncomingKey);
                return;
            }
        }
        this.inFlightIncoming.delete(incomingKey);
        this.inFlightIncoming.delete(textOnlyIncomingKey);
        // Stamp the cooldowns only after the reply actually WENT OUT. Stamping before the send
        // meant a failed send still muted that viewer for the whole per-user window — in the
        // seller's test log, "ของแท้ดูยังไง" failed to send and the customer's immediate retry
        // of the same question was then silently dropped.
        this.lastGlobalReplyAt = Date.now();
        this.lastUserReplyAt.set(userId, Date.now());
        // The composer cleared, which only proves our side worked — wait for the message to
        // echo back through the read connection before calling it a real success, since a
        // cleared input does not guarantee TikTok's backend actually posted it.
        const confirmed = await new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.pendingConfirmations.delete(finalText);
                resolve(false);
            }, CONFIRM_TIMEOUT_MS);
            this.pendingConfirmations.set(finalText, () => {
                clearTimeout(timer);
                resolve(true);
            });
        });
        if (confirmed) {
            this.emit({ kind: 'reply', id: randomId(), user, text: finalText, via, at: now });
        }
        else {
            const preview = finalText.length > 30 ? `${finalText.slice(0, 30)}…` : finalText;
            this.emit(system(`ส่งข้อความ "${preview}" แล้วแต่ไม่เห็นขึ้นในแชทจริง — TikTok อาจบล็อกหรือจำกัดการส่ง`));
        }
    }
}
const chatSessions = new Map();
const chatProductLines = new Map();
function isChatEngineRunning(accountId) {
    return chatSessions.get(accountId)?.isRunning() ?? false;
}
// Live-editable: settings changed from the UI take effect without reconnecting.
// Push the account's product list into a running chat session. Called when a live starts
// and whenever the seller re-pulls products, so the model answers from what is actually in
// the cart rather than from whatever was there when the live began.
function setChatProducts(accountId, lines) {
    chatProductLines.set(accountId, lines.filter(Boolean));
    const chat = chatSessions.get(accountId);
    if (!chat)
        return;
    chat.products = (chatProductLines.get(accountId) ?? []).map((line) => ({ line }));
}
function updateChatConfig(accountId, config) {
    chatSessions.get(accountId)?.updateConfig(config);
}
async function feedChatComment(accountId, message) {
    const chat = chatSessions.get(accountId);
    if (!chat)
        return false;
    await chat.handleChat({
        content: String(message?.text ?? '').trim(),
        user: {
            id: String(message?.userId || message?.user || 'dom-viewer'),
            nickname: String(message?.user || 'ผู้ชม'),
            displayId: String(message?.user || 'ผู้ชม'),
            role: String(message?.role || ''),
        },
        role: String(message?.role || ''),
    });
    return true;
}
async function startDomChatEngine({ accountId, config, emit, send }) {
    await stopChatEngine(accountId);
    const chat = new ChatSession(config, emit, send);
    chat.products = (chatProductLines.get(accountId) ?? []).map((line) => ({ line }));
    chatSessions.set(accountId, chat);
    emit(system('เชื่อมต่อแชทแบบหน้า LIVE Manager สำเร็จ — กำลังอ่านคอมเมนต์จากหน้าจอ'));
}
async function startChatEngine({ accountId, roomId, cookie, config, emit, send }) {
    await stopChatEngine(accountId);
    const chat = new ChatSession(config, emit, send);
    chat.products = (chatProductLines.get(accountId) ?? []).map((line) => ({ line }));
    chatSessions.set(accountId, chat);
    try {
        await chat.start(roomId, cookie);
    }
    catch (error) {
        chatSessions.delete(accountId);
        throw error;
    }
}
async function stopChatEngine(accountId) {
    const chat = chatSessions.get(accountId);
    if (!chat)
        return;
    chatSessions.delete(accountId);
    await chat.stop();
}
// BYOK Anthropic call from the main process (net.request is not subject to CORS and
// keeps the key out of the renderer). Returns null on any failure so a bad key or
// network blip degrades to "no reply" instead of crashing the chat loop.
// What the model is told about this shop before it sees a single comment. Kept in one
// place so both providers get exactly the same instructions — a reply that changes
// character because the seller switched provider would be a support problem, not a
// feature.
function buildSystemPrompt(ai, products) {
    const lines = [
        'คุณเป็นผู้ช่วยแม่ค้าไลฟ์ขายของบน TikTok ตอบคอมเมนต์ผู้ชมแบบสั้น กระชับ สุภาพ เป็นกันเอง',
        'ภาษาไทย ไม่เกิน 1-2 ประโยค ห้ามขึ้นต้นด้วยเครื่องหมายคำพูด ห้ามใส่ชื่อผู้ใช้',
        'ทุกคำตอบต้องตอบให้จบและช่วยลูกค้าไปต่อได้: ถ้าเป็นคำชม/ทักทาย ให้ขอบคุณแล้วถามต่อหรือแนะนำทางเลือกสั้น ๆ ห้ามตอบแค่ขอบคุณ ดีใจที่ชอบ รับทราบ หรือประโยคสั้นที่ไม่ช่วยขาย',
        'ตอบเหมือนคนขายของจริงในไลฟ์ ไม่พูดว่าตัวเองเป็น AI ไม่ใช้คำแข็ง ไม่ใช้ภาษาทางการเกินไป',
        'หลีกเลี่ยงคำเสี่ยงโดนแพลตฟอร์มบล็อก เช่น อ้างสรรพคุณรักษาโรค รับประกันผลลัพธ์เกินจริง หรือชวนซื้อแบบกดดัน',
        // Without this the model invents prices, which is worse than not answering.
        'ถ้าไม่มีข้อมูลสินค้าที่ลูกค้าถาม ให้บอกว่าเดี๋ยวแม่ค้าเช็คให้แป๊บนึง ห้ามเดาราคาหรือรายละเอียดเอง และห้ามไล่ลูกค้าไปดูเองแบบทิ้งคำถาม',
        'ข้อมูลจาก TikTok เป็นข้อมูลตะกร้า/ราคา/สต็อก/หมวด/ยอดขาย/SKU/สเปก/รายละเอียดสินค้าจริง ให้ใช้ตอบคำถามสินค้าตามเลขตะกร้า',
        'ถ้าลูกค้าถามว่า "ตะกร้า 1 คืออะไร" "มีโปรอะไร" หรือถามสินค้ากว้าง ๆ ให้ตอบชื่อสินค้า/โปร/ราคาหลักให้จบก่อน ห้ามดึงราคาตัวเลือกหรือราคา SKU มาพูดเองถ้าลูกค้าไม่ได้ถามตัวเลือกโดยตรง เพราะจะทำให้สับสน',
        'ราคาตัวเลือก/SKU ให้พูดเฉพาะเมื่อลูกค้าถามสี เบอร์ สูตร ขนาด หรือตัวเลือกนั้นโดยตรงเท่านั้น ถ้าราคาหลักกับราคาตัวเลือกไม่ตรงกัน ให้บอกเฉพาะราคาหลักและชวนเลือกตะกร้า ไม่ต้องพูดว่าราคาตัวเลือกเท่าไร',
        'ถ้าข้อมูลสินค้ามีตัวเลือก/SKU เช่น 01, 02, 03, 04 หรือชื่อสี/สูตร/ขนาด ต้องอธิบายให้ลูกค้าเลือกได้ทันทีว่าแต่ละตัวคืออะไร เหมาะกับใคร และสั่งที่ตะกร้าไหน',
        'ถ้าลูกค้าถามเรื่องเฉดสี เบอร์ SKU ส่วนผสม เหมาะกับสีผิว/สีปาก/สภาพผิว หรือวิธีใช้ ให้ตอบจากข้อมูลสินค้าและข้อมูลร้านที่มีเท่านั้น ห้ามแต่งสี สูตร หรือสรรพคุณเอง',
        'คำถามเรื่องผิวแพ้ง่าย แพ้ ระคายเคือง สิว ตั้งครรภ์ เด็ก โรคผิวหนัง ส่วนผสม หรือความปลอดภัย ต้องตอบตามหลักฐานในข้อมูลสินค้าเท่านั้น: ได้คือได้ตามข้อมูล ไม่ได้คือบอกว่ายังยืนยันไม่ได้',
        'ถ้าข้อมูลสินค้าระบุชัดว่าเหมาะกับผิวแพ้ง่าย ผ่านการทดสอบ ไม่มีน้ำหอม ไม่มีแอลกอฮอล์ หรือมีส่วนผสมที่ลูกค้าถาม ให้ยกข้อมูลนั้นพร้อมเลขตะกร้า แต่ยังห้ามรับรองว่าไม่แพ้ 100%',
        'ถ้าข้อมูลสินค้าไม่ระบุเรื่องผิวแพ้ง่ายหรือส่วนผสมที่ลูกค้าถาม ให้ตอบตรง ๆ ว่าในข้อมูลตะกร้านี้ยังไม่มีระบุ จึงยังยืนยันว่าใช้ได้ไม่ได้ อย่าตอบคลุมเครือว่าเดี๋ยวเช็กถ้ารู้แล้วว่าข้อมูลไม่มี',
        'ถ้าลูกค้าไม่ได้บอกตะกร้า/สินค้าและมีหลายสินค้า ให้ถามกลับสั้น ๆ ว่าหมายถึงตะกร้าไหน พร้อมบอกว่าต้องดูส่วนผสมของตัวนั้นก่อนจึงจะตอบเรื่องแพ้ง่ายได้',
        'ห้ามใช้คำว่า ใช้ได้แน่นอน, ไม่แพ้แน่นอน, ปลอดภัย 100%, รับรองว่าไม่แพ้, รักษา, หายขาด; ถ้าลูกค้ามีประวัติแพ้ง่าย ให้แนะนำทดสอบเล็ก ๆ ก่อนและหยุดใช้ถ้าระคายเคือง',
        'เมื่อตอบคำถามความปลอดภัย ให้ตอบสั้นแบบ: ข้อมูลที่ยืนยันได้ + ข้อจำกัดที่ยืนยันไม่ได้ + วิธีลองใช้อย่างปลอดภัย ไม่เกิน 2 ประโยค',
        'ตัวอย่าง: ถ้าถาม "ผิวแพ้ง่ายใช้ได้ไหม" และข้อมูลสินค้าไม่ระบุ ให้ตอบว่า "ข้อมูลตะกร้านี้ยังไม่มีระบุว่าผ่านการทดสอบสำหรับผิวแพ้ง่าย เลยยังยืนยันว่าใช้ได้ไม่ได้ค่ะ แนะนำเช็กส่วนผสมและลองเทสต์เล็ก ๆ ก่อนนะคะ"',
        'ห้ามตอบแค่ "ดูในตะกร้า" หรือ "กดดูเอง" ถ้ามีข้อมูลในรายการสินค้า ต้องแนะนำให้จบแบบแม่ค้าจริง พร้อมเลขตะกร้า',
        '',
        `ข้อมูลร้าน/โปรโมชัน:\n${ai.context.trim() || '(ไม่มีข้อมูลเพิ่มเติม)'}`,
    ];
    if (ai.useProducts && products.length) {
        lines.push('', 'สินค้าที่กำลังขายในไลฟ์นี้จาก TikTok (ใช้เลขตะกร้า ราคา SKU และรายละเอียดตามนี้เท่านั้น):', ...products.slice(0, 20).map((product, index) => `${index + 1}. ${product.line}`));
    }
    return lines.join('\n');
}
function aiKeyList(ai) {
    const keys = [];
    const push = (value) => {
        if (typeof value !== 'string')
            return;
        const parts = value
            .split(/[\r\n,;]+/)
            .map((part) => part.trim())
            .filter(Boolean);
        let pending = '';
        const flush = () => {
            const key = pending.trim();
            if (key && !keys.includes(key))
                keys.push(key);
            pending = '';
        };
        for (const part of parts) {
            const startsKey = /^(sk-|AIza|sk-ant-)/.test(part);
            if (startsKey) {
                flush();
                pending = part;
            }
            else if (pending) {
                pending += part;
            }
            else if (!keys.includes(part)) {
                keys.push(part);
            }
        }
        flush();
    };
    push(ai.apiKey);
    if (Array.isArray(ai.apiKeys)) {
        for (const key of ai.apiKeys)
            push(key);
    }
    return keys;
}
function withAiKey(ai, apiKey) {
    return { ...ai, apiKey };
}
function isSensitiveProductQuestion(text) {
    return /แพ้ง่าย|แพ้|ระคาย|คัน|แสบ|สิว|ผิวบาง|ตั้งครรภ์|คนท้อง|เด็ก|โรคผิว|ส่วนผสม|สาร|แอลกอฮอล์|น้ำหอม|สเตียรอยด์|ปรอท|hydroquinone|retinol|aha|bha|vitamin c/i.test(text);
}
function makeSafeSensitiveFallback(products) {
    const scope = products.length === 1 ? 'ข้อมูลตะกร้านี้' : 'ข้อมูลสินค้าที่มีตอนนี้';
    return `${scope}ยังไม่มีข้อมูลพอให้รับรองว่าใช้กับผิวแพ้ง่ายแล้วจะไม่แพ้ค่ะ แนะนำเช็กส่วนผสมและลองเทสต์เล็ก ๆ ก่อน ถ้าเคยแพ้ง่ายมากให้เลี่ยงก่อนนะคะ`;
}
function guardAiReply(comment, reply, products) {
    const completeReply = ensureUsefulLiveReply(comment, finishLiveReply(reply), products);
    if (!isSensitiveProductQuestion(comment))
        return completeReply;
    if (/ใช้ได้แน่นอน|ไม่แพ้แน่นอน|ปลอดภัย\s*100|รับรองว่าไม่แพ้|รักษา|หายขาด/i.test(completeReply))
        return makeSafeSensitiveFallback(products);
    if (/เดี๋ยวแม่ค้า(?:ช่วย)?เช็[กค]|สนใจตัวไหน|ตะกร้าไหน/i.test(completeReply) && products.length === 1)
        return makeSafeSensitiveFallback(products);
    return completeReply;
}
function normalizeReplyText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}
function shortProductHelp(products) {
    if (products.length === 1) {
        const line = normalizeReplyText(products[0]?.line);
        const price = line.match(/฿\s*[\d,.]+|[0-9][\d,.]*\s*บาท/)?.[0];
        if (price)
            return `ตัวนี้ราคา ${price} สนใจขนาดหรือกลิ่นแบบไหนถามแม่ค้าได้เลยค่ะ`;
    }
    return 'สนใจขนาดหรือกลิ่นแบบไหนบอกได้เลย เดี๋ยวแม่ค้าช่วยแนะนำตะกร้าที่เหมาะให้ค่ะ';
}
function looksTooThinReply(reply) {
    const text = normalizeReplyText(reply);
    if (!text)
        return false;
    if (text.length < 45)
        return true;
    return /^(?:ขอบคุณ|ขอบคุณมาก|ดีใจ|ยินดี|รับทราบ|โอเค|ได้เลย)[\s\S]{0,55}(?:ค่ะ|นะคะ|ครับ|นะครับ|จ้า)?$/i.test(text);
}
function ensureUsefulLiveReply(comment, reply, products) {
    const text = finishLiveReply(reply);
    if (!text || !looksTooThinReply(text))
        return text;
    const commentText = normalizeReplyText(comment);
    const needsProductHelp = /สนใจ|หอม|กลิ่น|ขนาด|ราคา|ตะกร้า|ตัวไหน|แนะนำ|ซื้อ|สั่ง|โปร/i.test(commentText)
        || /ขอบคุณ|ดีใจ|ยินดี/i.test(text);
    const extra = needsProductHelp ? shortProductHelp(products) : 'ถามเพิ่มได้เลยนะคะ เดี๋ยวแม่ค้าช่วยดูให้ค่ะ';
    if (normalizeReplyText(text).includes(normalizeReplyText(extra).slice(0, 24)))
        return text;
    return finishLiveReply(`${text} ${extra}`);
}
function finishLiveReply(reply) {
    const text = String(reply || '').replace(/^["“”]+|["“”]+$/g, '').trim();
    if (!text)
        return text;
    if (/(?:[.!?…ฯ]|ค่ะ|ครับ|นะคะ|นะครับ|จ้า)$/.test(text))
        return text;
    const lastStop = Math.max(text.lastIndexOf('ค่ะ'), text.lastIndexOf('ครับ'), text.lastIndexOf('นะคะ'), text.lastIndexOf('นะครับ'), text.lastIndexOf('จ้า'), text.lastIndexOf('!'), text.lastIndexOf('?'), text.lastIndexOf('。'), text.lastIndexOf('.'));
    if (lastStop > 24)
        return text.slice(0, lastStop + 3).trim();
    return `${text}ค่ะ`;
}
// Google's Generative Language API. Shape differs from Anthropic's in every part that
// matters: the key rides on the query string, the system prompt is its own field, and the
// answer is nested under candidates[].content.parts[].
function geminiRequest(comment, ai, products) {
    const model = (ai.model || 'gemini-3-flash-preview').trim();
    // Gemma models ride the same endpoint but reject thinkingConfig outright — only the
    // gemini-* family both supports it and needs it silenced.
    const thinking = model.startsWith('gemma') ? {} : { thinkingConfig: { thinkingBudget: 0 } };
    return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
            `:generateContent?key=${encodeURIComponent(ai.apiKey.trim())}`,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: buildSystemPrompt(ai, products) }] },
            contents: [{ role: 'user', parts: [{ text: comment }] }],
            // thinkingBudget 0 + a real output ceiling, or the reply arrives amputated: current
            // Gemini models "think" by default and the thinking spends the SAME token budget —
            // measured live, 150 of the old 160 tokens went to thought and the customer got
            // "ผิวแทนถ้าอยากให้ส" (cut mid-word, finishReason MAX_TOKENS). A live-chat reply
            // needs no chain of thought, and 1024 costs nothing extra: billing counts tokens
            // actually produced, and the prompt still asks for 1-2 sentences.
            generationConfig: { maxOutputTokens: 1024, temperature: 0.7, ...thinking },
        }),
        pick: (parsed) => {
            const data = parsed;
            return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() || null;
        },
    };
}
function claudeRequest(comment, ai, products) {
    return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
            'content-type': 'application/json',
            'x-api-key': ai.apiKey.trim(),
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: (ai.model || 'claude-haiku-4-5').trim(),
            max_tokens: 1024,
            system: buildSystemPrompt(ai, products),
            messages: [{ role: 'user', content: comment }],
        }),
        pick: (parsed) => {
            const data = parsed;
            return data.content?.[0]?.text?.trim() || null;
        },
    };
}
function openAiRequest(comment, ai, products) {
    const OPENAI_REPLY_MODEL = 'gpt-6-astra';
    return {
        url: 'https://api.openai.com/v1/responses',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${ai.apiKey.trim()}`,
        },
        body: JSON.stringify({
            model: OPENAI_REPLY_MODEL,
            instructions: buildSystemPrompt(ai, products),
            input: comment,
            max_output_tokens: 1024,
        }),
        pick: (parsed) => {
            const data = parsed;
            if (typeof data.output_text === 'string' && data.output_text.trim())
                return data.output_text.trim();
            const output = Array.isArray(data.output) ? data.output : [];
            return output
                .flatMap((item) => Array.isArray(item.content) ? item.content : [])
                .map((part) => typeof part.text === 'string' ? part.text : '')
                .join('')
                .trim() || null;
        },
    };
}
async function generateAiReply(comment, ai, products, onError) {
    const keys = aiKeyList(ai);
    if (!keys.length) {
        onError?.('ยังไม่ได้ใส่ API key');
        return null;
    }
    const start = keys.length > 1 ? Math.floor(Date.now() / 1000) % keys.length : 0;
    const orderedKeys = [...keys.slice(start), ...keys.slice(0, start)];
    let lastFailure = '';
    for (let index = 0; index < orderedKeys.length; index += 1) {
        const scopedAi = withAiKey(ai, orderedKeys[index]);
        const reply = await generateAiReplyWithKey(comment, scopedAi, products, (message) => {
            lastFailure = message;
        });
        if (reply)
            return guardAiReply(comment, reply, products);
        if (orderedKeys.length > 1 && index < orderedKeys.length - 1) {
            onError?.(`API key ตัวที่ ${index + 1} ใช้ไม่ได้ กำลังลอง key สำรอง`);
        }
    }
    onError?.(lastFailure || 'AI ไม่ได้ส่งข้อความกลับมา');
    return null;
}
async function generateAiReplyWithKey(comment, ai, products, onError) {
    const spec = ai.provider === 'claude'
        ? claudeRequest(comment, ai, products)
        : ai.provider === 'openai'
            ? openAiRequest(comment, ai, products)
            : geminiRequest(comment, ai, products);
    // Two attempts, not one: observed live, Google's endpoint returned three empty 404s in
    // a row for a model alias that resolved fine seconds later. A single-shot call turns
    // every such blip into a dead reply (or a scary timeout message), while a bad key or a
    // wrong model name fails identically on both attempts and is reported once.
    const first = await attemptAiCall(spec);
    if (first.text !== null)
        return first.text;
    if (first.transient) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        // Retrying the SAME overloaded model mostly re-joins the same queue. For Gemini the
        // second attempt goes to a sibling model instead — capacity problems are per-model,
        // and the two pools rarely spike together.
        const primaryModel = (ai.model || '').trim();
        const secondSpec = ai.provider === 'gemini'
            ? geminiRequest(comment, {
                ...ai,
                model: primaryModel === 'gemini-3-flash-preview' ? 'gemini-2.5-flash' : 'gemini-3-flash-preview',
            }, products)
            : spec;
        const second = await attemptAiCall(secondSpec);
        if (second.text !== null)
            return second.text;
        onError?.(second.failure || first.failure);
        return null;
    }
    onError?.(first.failure);
    return null;
}
function attemptAiCall(spec) {
    return new Promise((resolve) => {
        const request = electron_1.net.request({ method: 'POST', url: spec.url });
        for (const [name, value] of Object.entries(spec.headers))
            request.setHeader(name, value);
        let data = '';
        let status = 0;
        let done = false;
        const settle = (value) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            resolve(value);
        };
        // 25s, up from 12: with a ~10k-char shop FAQ in the prompt, tail latency on a cold
        // request can clear 12s while the median stays a couple of seconds — and a reply that
        // lands late in a live chat still beats a timeout notice.
        const timer = setTimeout(() => {
            try {
                request.abort();
            }
            catch {
                // Best-effort abort.
            }
            settle({ text: null, failure: 'AI ตอบไม่ทันใน 25 วินาที', transient: false });
        }, 25000);
        request.on('response', (response) => {
            status = response.statusCode;
            response.on('data', (chunk) => {
                data += chunk.toString();
            });
            response.on('end', () => {
                // 404 and 5xx are the shapes Google's blips take; 4xx configuration errors
                // (bad key, wrong model, no credits) are stable and retrying them just doubles
                // the wait before the seller learns what to fix. One 429 is NOT configuration:
                // "high demand" / "overloaded" is capacity, and a second attempt (on the fallback
                // model) usually lands.
                let transient = status === 404 || status >= 500;
                try {
                    const parsed = JSON.parse(data);
                    if (status >= 400) {
                        // Surface the provider's own message: a wrong model name or an expired key is
                        // something the seller can fix, but only if they are told which it is.
                        const detail = parsed.error?.message ?? `HTTP ${status}`;
                        if (status === 429 && /high demand|overloaded|try again/i.test(detail))
                            transient = true;
                        settle({ text: null, failure: `AI ตอบไม่สำเร็จ (${detail})`.slice(0, 300), transient });
                        return;
                    }
                    const text = spec.pick(parsed);
                    settle({ text, failure: text ? '' : 'AI ไม่ได้ส่งข้อความกลับมา', transient: false });
                }
                catch {
                    settle({ text: null, failure: `AI ส่งข้อมูลกลับมาอ่านไม่ได้ (HTTP ${status})`, transient });
                }
            });
            response.on('error', () => settle({ text: null, failure: 'การเชื่อมต่อขาดระหว่างรอคำตอบ', transient: true }));
        });
        request.on('error', (error) => {
            settle({ text: null, failure: `ต่อ AI ไม่ได้: ${error.message}`, transient: true });
        });
        request.write(spec.body);
        request.end();
    });
}

