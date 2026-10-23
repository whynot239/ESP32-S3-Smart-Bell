import http from 'http';
import {validDeviceSettings, normalizeCards, readTelemetry} from './dashboard-support.js';
import { createPushService } from './push-service.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

function requiredSecret(name) {
  const value = process.env[name];
  if (!value || value.startsWith('REPLACE_WITH_') || value.length < 24) {
    throw new Error(`${name} must be configured with a private value before the hub can start.`);
  }
  return value;
}

// No security-sensitive default values: local and cloud deployments must configure these.
const DEVICE_HMAC_KEY = requiredSecret('DEVICE_HMAC_KEY');
const DEVICE_CONNECTION_TOKEN = requiredSecret('DEVICE_CONNECTION_TOKEN');
const MOBILE_WS_TOKEN = requiredSecret('MOBILE_WS_TOKEN');
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'owner').trim().toLowerCase();
const OWNER_PIN = process.env.OWNER_PIN;
if (!/^\d{6,12}$/.test(OWNER_PIN || '')) {
  throw new Error('OWNER_PIN must be a private 6 to 12 digit PIN before the hub can start.');
}
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || '')
  .split(',').map(origin => origin.trim()).filter(Boolean));

// Ensure captures directory exists
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(DATA_DIR, {recursive:true});
const pushService=createPushService(DATA_DIR,process.env.EXPO_ACCESS_TOKEN || '');
const CAPTURES_DIR = path.join(DATA_DIR, 'captures');
if (!fs.existsSync(CAPTURES_DIR)) {
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp'
};

// ============================================================================
// SINGLE-OWNER PIN SECURITY
// ============================================================================
function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(pin + ':' + salt).digest('hex');
}

const USERS = {
  [OWNER_USERNAME]: {
    id: 'owner',
    username: OWNER_USERNAME,
    name: OWNER_USERNAME,
    role: 'owner',
    salt: crypto.randomBytes(16).toString('hex'),
    pinHash: null,
    permissions: ['all']
  }
};
USERS[OWNER_USERNAME].pinHash = hashPin(OWNER_PIN, USERS[OWNER_USERNAME].salt);

// Failed PIN attempt tracking for rate limiting & lockout
const pinFailures = {};
const MAX_FAILED_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function verifyUserPin(username, enteredPin) {
  const key = String(username).toLowerCase();
  const user = Object.hasOwn(USERS, key) ? USERS[key] : null;
  if (!user) return { success: false, reason: 'User not found' };

  const now = Date.now();
  if (pinFailures[user.id] && pinFailures[user.id].lockoutUntil > now) {
    const remainingSec = Math.ceil((pinFailures[user.id].lockoutUntil - now) / 1000);
    return { success: false, reason: `Account locked. Try again in ${remainingSec} seconds.` };
  }

  const enteredHash = hashPin(enteredPin, user.salt);
  if (crypto.timingSafeEqual(Buffer.from(enteredHash), Buffer.from(user.pinHash))) {
    // Reset failed counter
    delete pinFailures[user.id];
    return { success: true, user };
  } else {
    // Record failed attempt
    if (!pinFailures[user.id]) {
      pinFailures[user.id] = { count: 0, lockoutUntil: 0 };
    }
    pinFailures[user.id].count++;
    console.warn(`⚠️ [SECURITY] Failed PIN attempt (${pinFailures[user.id].count}/${MAX_FAILED_PIN_ATTEMPTS}) for user: ${user.name}`);

    if (pinFailures[user.id].count >= MAX_FAILED_PIN_ATTEMPTS) {
      pinFailures[user.id].lockoutUntil = now + LOCKOUT_DURATION_MS;
      console.error(`🚨 [SECURITY LOCKOUT] User ${user.name} locked out for 5 minutes due to repeated failed PIN attempts.`);
      return { success: false, reason: 'Too many failed attempts. Account locked for 5 minutes.' };
    }
    return { success: false, reason: 'Incorrect PIN' };
  }
}

function tokensMatch(received, expected) {
  const actual = Buffer.from(String(received || ''));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}

function hasOwnerApiToken(req) {
  const authorization = req.headers.authorization || '';
  return authorization.startsWith('Bearer ') && tokensMatch(authorization.slice(7), MOBILE_WS_TOKEN);
}

// ============================================================================
// CRYPTOGRAPHIC COMMAND SIGNER (HMAC-SHA256 with Replay Nonces)
// ============================================================================
function buildSignedCommand(commandName, userName = 'System', extraData = {}) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ command: commandName, nonce, timestamp, user: userName,
    ...extraData, bootId: deviceBootId, seq: ++commandSequence });
  const signature = crypto.createHmac('sha256', DEVICE_HMAC_KEY).update(payload).digest('hex');
  return { payload, signature };

}

// ============================================================================
// SYSTEM STATE & ACCESS HISTORIES
// ============================================================================
const state = {
  entities: {
    'binary_sensor.front_doorbell_ring': { state: 'off', attributes: { friendly_name: 'Front Doorbell Ring' } },
    'camera.front_doorbell_live': { state: 'idle', attributes: { friendly_name: 'Front Doorbell Camera' } },
    'lock.front_gate': { state: 'locked', attributes: { friendly_name: 'Front Gate Smart Lock' } },
    'switch.porch_light': { state: 'off', attributes: { friendly_name: 'Front Porch Sconce' } },
    'sensor.wifi_signal': { state: '-48 dBm', attributes: { ssid: 'Home_IoT' } }
  },
  chime: 'idle',
  lockBurst: 'locked',
  cameraActive: false,
  light: 'off',
  rssi: -48,
  ringCounter: 0,
  lastRingTime: 0,
  alarmActive: false,
  deviceOnline: false,
  lastHeartbeat: 0
};

const historyFile = path.join(DATA_DIR, 'history.json');
const savedHistory = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')) : {access:[],security:[]};
const accessHistory = savedHistory.access;
const securityHistory = savedHistory.security;
function persistHistory() {
  accessHistory.splice(5000); securityHistory.splice(5000);
  const temporary = historyFile + '.tmp';
  const fd = fs.openSync(temporary, 'w');
  try { fs.writeFileSync(fd, JSON.stringify({access:accessHistory,security:securityHistory})); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, historyFile);
}
let pendingPhotoEvent = null; // Associates upcoming binary frame with last alert

const wsClients = new Set();
let esp32Socket = null;
let mediaSocket = null;
let deviceBootId = null;
let commandSequence = 0;
const pendingCommands = new Map();
const pendingCardReads = new Map();
const commandHistory = [];
function recordCommand(action, result) {
  commandHistory.unshift({timestamp:Date.now(),action,result});commandHistory.splice(50);
}
function dispatchCommand(command) {
  if (!deviceBootId || pendingCommands.size >= 16) return Promise.resolve(false);
  const nonce = JSON.parse(command.payload).nonce;
  return new Promise(resolve => {
    const action=JSON.parse(command.payload).command;
    const timer = setTimeout(() => { pendingCommands.delete(nonce); recordCommand(action,"unconfirmed"); resolve(false); }, 5000);
    pendingCommands.set(nonce, { resolve, timer, action });
    if (!sendToHardware(command)) {
      clearTimeout(timer); pendingCommands.delete(nonce); recordCommand(action,"offline"); resolve(false);
    }
  });
}

function sendToHardware(data) {
  if (esp32Socket && esp32Socket.readyState === WebSocket.OPEN) {
    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      esp32Socket.send(payload);
      return true;
    } catch (err) {
      console.error('Error dispatching to ESP32 hardware:', err.message);
    }
  }
  return false;
}

function broadcast(data) {
  const raw = typeof data === 'string' ? data : JSON.stringify(data);
  for (const client of wsClients) {
    if (client.clientType !== 'device' && client.readyState === WebSocket.OPEN) {
      try {
        client.send(raw);
      } catch (err) {
        console.error('Error broadcasting to client:', err.message);
      }
    }
  }
}

function broadcastStateChange(entityId, newState, customAttrs = {}) {
  if (!state.entities[entityId]) {
    state.entities[entityId] = { state: newState, attributes: customAttrs };
  } else {
    state.entities[entityId].state = newState;
    state.entities[entityId].attributes = { ...state.entities[entityId].attributes, ...customAttrs };
  }

  broadcast({
    type: 'sync',
    entityId,
    state: newState,
    entities: state.entities,
    chime: state.chime,
    lockBurst: state.lockBurst,
    alarmActive: state.alarmActive
  });
}

function registerRing({ eventId, visitor = 'Front Porch Visitor', hasPhoto = false } = {}) {
  state.chime = 'ringing';
  state.cameraActive = true;
  state.ringCounter++;
  state.lastRingTime = Date.now();

  const ringEvent = {
    eventId: eventId || crypto.randomBytes(8).toString('hex'),
    type: 'doorbell_ring',
    timestamp: Date.now(),
    visitor
  };

  if (hasPhoto) pendingPhotoEvent = ringEvent;
  accessHistory.unshift({
    eventId: ringEvent.eventId,
    type: 'doorbell_ring',
    userName: 'Visitor',
    timestamp: ringEvent.timestamp,
    method: 'Physical Button'
  });
  persistHistory();
  console.log(`🔔 [DOORBELL RING] Ring #${state.ringCounter} initialized!`);
  broadcast({ type: 'ring_alert', ...ringEvent });
  pushService.notify('Doorbell ringing','A visitor is at the front entrance.',{type:'ring',eventId:ringEvent.eventId});
  broadcastStateChange('binary_sensor.front_doorbell_ring', 'on');
  return ringEvent;
}

// Authenticated Remote Gate Unlock Flow
async function executeRemoteUnlock(user) {
  const signedCmd = buildSignedCommand('unlock', user.name, { burstMs: 1000, userId: user.id });
  return dispatchCommand(signedCmd);
}

// Authenticated on-demand camera session. The ESP receives the same signed
// command format used for gate access, so an untrusted client cannot wake the
// camera or start an intercom session directly.
async function executeLiveView(user) {
  const sessionId = crypto.randomUUID();
  const ok = await dispatchCommand(buildSignedCommand('live_view', user.name, { sessionId }));
  return ok ? sessionId : null;
}

// Disarm Alarm Flow
async function executeDisarmAlarm(user) {
  const signedCmd = buildSignedCommand('disarm', user.name);
  return dispatchCommand(signedCmd);
}

// ============================================================================
// HTTP SERVER (REST API + Static Files + Security Captures)
// ============================================================================
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  if (Number(req.headers['content-length'] || 0) > 16 * 1024) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Request body is too large.' }));
    return;
  }
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(origin && !ALLOWED_ORIGINS.has(origin) ? 403 : 204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;

  if ((pathname.startsWith('/api/') || pathname === '/status') && !hasOwnerApiToken(req)) {
    res.writeHead(401); res.end(JSON.stringify({ error: 'Owner authorization required.' })); return;
  }
  if (pathname === '/api/diagnostics' && req.method === 'GET') {
    res.setHeader('Cache-Control','no-store');
    const online=state.deviceOnline && Date.now()-state.lastHeartbeat<45000;
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({serverTime:Date.now(),serverUptimeSec:Math.floor(process.uptime()),deviceOnline:online,
      firmware:state.firmware || null,hardware:state.hardware || null,lastHeartbeat:state.lastHeartbeat || null,
      telemetry:state.telemetry || null,commands:commandHistory}));return;
  }
  if (pathname === '/api/cards' && req.method === 'GET') {
    res.setHeader('Cache-Control','no-store');
    if(!state.telemetry?.settings) {res.writeHead(409);res.end(JSON.stringify({error:'Install rc6 firmware to read saved cards in the app.'}));return;}
    const command=buildSignedCommand('get_cards',OWNER_USERNAME);const nonce=JSON.parse(command.payload).nonce;
    const read={cards:null};pendingCardReads.set(nonce,read);
    dispatchCommand(command).then(ok=>{
      res.writeHead(ok && read.cards ? 200 : 503,{'Content-Type':'application/json'});
      res.end(JSON.stringify(ok && read.cards ? {cards:read.cards} : {error:'The device did not return its card list. No changes were made.'}));
    }).catch(()=>{res.writeHead(503);res.end(JSON.stringify({error:'Card list unavailable.'}));}).finally(()=>pendingCardReads.delete(nonce));return;
  }
  if (pathname === '/api/device_settings' && req.method === 'POST') {
    let body='';req.on('data',chunk=>{if(res.writableEnded)return;body+=chunk;if(Buffer.byteLength(body)>2048){res.writeHead(413);res.end();req.destroy();}});
    req.on('end',async()=>{
      if(res.writableEnded)return;
      try {
        const data=JSON.parse(body);const auth=verifyUserPin(data.username,data.pin);
        if(!auth.success){res.writeHead(403);res.end(JSON.stringify({error:auth.reason}));return;}
        const settings=data.settings;
        if(!validDeviceSettings(settings)){res.writeHead(400);res.end(JSON.stringify({error:'Settings are outside the supported limits.'}));return;}
        if(!state.telemetry?.settings){res.writeHead(409);res.end(JSON.stringify({error:'Install rc6 firmware to change device settings.'}));return;}
        const ok=await dispatchCommand(buildSignedCommand('device_settings',auth.user.name,{version:1,idleBrightness:settings.idleBrightness,activeBrightness:settings.activeBrightness,speakerGain:settings.speakerGain}));
        res.writeHead(ok?200:503);res.end(JSON.stringify(ok?{status:'confirmed',settings}:{error:'The ESP did not confirm saving. Refresh and check before retrying.'}));
      }catch{res.writeHead(400);res.end(JSON.stringify({error:'Invalid settings request.'}));}
    });return;
  }
  if (pathname === '/api/cards_enabled' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { if (res.writableEnded) return; body += chunk; if (Buffer.byteLength(body) > 16384) { res.writeHead(413); res.end(); req.destroy(); } });
    req.on('end', async () => {
      if (res.writableEnded) return;
      try {
        const { username, pin, enabled } = JSON.parse(body);
        const auth = verifyUserPin(username, pin);
        if (!auth.success) { res.writeHead(403); res.end(JSON.stringify({error: auth.reason})); return; }
        if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean');
        const ok = await dispatchCommand(buildSignedCommand('cards_enabled', auth.user.name, { enabled }));
        res.writeHead(ok ? 200 : 503);
        res.end(JSON.stringify(ok ? {status:'confirmed', enabled} : {error:'Device did not confirm the change. Refresh before retrying.'}));
      } catch { res.writeHead(400); res.end(JSON.stringify({error:'Invalid request'})); }
    });
    return;
  }

  if (pathname === '/api/push_token' && req.method === 'POST') {
    let body='';
    req.on('data',chunk=>{if(res.writableEnded)return;body+=chunk;if(Buffer.byteLength(body)>2048){res.writeHead(413);res.end();req.destroy();}});
    req.on('end',()=>{
      if(res.writableEnded)return;
      try {const data=JSON.parse(body);pushService.register(data.token,data.enabled!==false);res.writeHead(200);res.end(JSON.stringify({status:'registered'}));}
      catch(error){res.writeHead(400);res.end(JSON.stringify({error:error.message}));}
    });return;
  }
  if (pathname === '/api/control'  && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { if (res.writableEnded) return; body += chunk; if (Buffer.byteLength(body) > 16384) { res.writeHead(413); res.end(); req.destroy(); } });
    req.on('end', async () => {
      if (res.writableEnded) return;
      try {
        const data = JSON.parse(body);
        if (!['chime','light_set'].includes(data.command)) throw new Error('Invalid command');
        const ok = await dispatchCommand(buildSignedCommand(data.command, OWNER_USERNAME,
          data.command === 'chime' ? {durationMs: 1000} : {state:data.state === 'on' ? 'on':'off'}));
        res.writeHead(ok ? 200:503); res.end(JSON.stringify(ok ? {status:'confirmed'}:{error:'Device did not confirm.'}));
      } catch { res.writeHead(400); res.end(JSON.stringify({error:'Invalid request'})); }
    }); return;
  }
  // 1. Authenticated Gate Unlock (Requires PIN and User)
  if (pathname === '/api/unlock' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { if (res.writableEnded) return; body += chunk; if (Buffer.byteLength(body) > 16384) { res.writeHead(413); res.end(); req.destroy(); } });
    req.on('end', async () => {
      if (res.writableEnded) return;
      try {
        const { username, pin } = JSON.parse(body || '{}');
        if (!username || !pin) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing username or PIN' }));
          return;
        }

        const authResult = verifyUserPin(username, pin);
        if (!authResult.success) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: authResult.reason }));
          return;
        }

        if (!await executeRemoteUnlock(authResult.user)) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Device did not confirm acceptance. Check activity before retrying.' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', message: 'Device accepted a bounded unlock pulse; no gate-position sensor is fitted.' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 2. Authenticated simulator ring, for testing the website-to-phone path.
  if (pathname === '/api/test_ring' && req.method === 'POST') {
    if (!hasOwnerApiToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Owner authorization required.' }));
      return;
    }
    const ringEvent = registerRing({ visitor: 'Website Test' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'success', eventId: ringEvent.eventId }));
    return;
  }

  // 3. Authenticated on-demand video/intercom session.
  if (pathname === '/api/live_view' && req.method === 'POST') {
    if (!hasOwnerApiToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Owner authorization required.' }));
      return;
    }
    const sessionId = await executeLiveView({ id: 'owner', name: OWNER_USERNAME });
    if (!sessionId) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Doorbell is offline; live view was not started.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'success', sessionId }));
    return;
  }

  // 4. Authenticated Alarm Disarm
  if (pathname === '/api/disarm' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { if (res.writableEnded) return; body += chunk; if (Buffer.byteLength(body) > 16384) { res.writeHead(413); res.end(); req.destroy(); } });
    req.on('end', async () => {
      if (res.writableEnded) return;
      try {
        const { username, pin } = JSON.parse(body || '{}');
        const authResult = verifyUserPin(username || '', pin || '');
        if (!authResult.success) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: authResult.reason }));
          return;
        }

        if (!await executeDisarmAlarm(authResult.user)) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Device did not confirm disarm.' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', message: 'Security alarm disarmed' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 4. Security History (Unauthorized attempts & captured photos)
  if (pathname === '/api/security_history') {
    if (!hasOwnerApiToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Owner authorization required.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(securityHistory));
    return;
  }

  // 5. Access Logs History (Authorized entries & offline synced events)
  if (pathname === '/api/access_history') {
    if (!hasOwnerApiToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Owner authorization required.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(accessHistory));
    return;
  }

  // 6. Card Sync Endpoint (Super User updates card database on ESP32)
  if (pathname === '/api/sync_cards' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { if (res.writableEnded) return; body += chunk; if (Buffer.byteLength(body) > 16384) { res.writeHead(413); res.end(); req.destroy(); } });
    req.on('end', async () => {
      if (res.writableEnded) return;
      try {
        const { username, pin, cards: submittedCards } = JSON.parse(body || '{}');
        const authResult = verifyUserPin(username || '', pin || '');
        if (!authResult.success || authResult.user.role !== 'owner') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Only Super User can synchronize card database' }));
          return;
        }

        const cards=normalizeCards(submittedCards);
        const signedCmd = buildSignedCommand('sync_cards', authResult.user.name, { data: { cards } });
        if (!await dispatchCommand(signedCmd)) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Doorbell is offline; card sync was not sent.' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', message: 'Card list persisted by ESP32' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 7. Serve Captured Security Photos
  if (pathname.startsWith('/captures/')) {
    if (!hasOwnerApiToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Owner authorization required.' }));
      return;
    }
    const filename = path.basename(pathname);
    const filePath = path.join(CAPTURES_DIR, filename);
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Photo Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      fs.createReadStream(filePath).pipe(res);
    });
    return;
  }

  // 8. General Status Telemetry
  if (pathname === '/status') {
    const now = Date.now();
    const online = state.deviceOnline && now - state.lastHeartbeat < 45000;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: online ? 'online' : 'offline',
      preview:process.env.SMART_BELL_PREVIEW==='1',
      cardsEnabled: online ? state.cardsEnabled ?? null : null,
      relayFault: online ? state.relayFault ?? true : true,
      rssi: state.rssi,
      chime: state.chime,
      lockBurst: state.lockBurst,
      porchLight: state.light,
      alarmActive: state.alarmActive,
      lastSeenMsAgo: state.lastHeartbeat ? now - state.lastHeartbeat : null,
      firmware:state.firmware || null,
      telemetry:online ? state.telemetry || null : null,
      securityEventsCount: securityHistory.length,
      accessLogsCount: accessHistory.length
    }));
    return;
  }

  // 9. Static Web App Files
  let filePath = pathname === '/' ? 'doorbell.html' : pathname === '/simulator' ? 'index.html' : pathname.slice(1);
  const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
  const publicRoot = path.join(__dirname, 'dist');
  const fullPath = path.resolve(publicRoot, safePath);
  if (!fullPath.startsWith(publicRoot + path.sep)) { res.writeHead(404); res.end(); return; }

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${pathname}`);
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(fullPath).pipe(res);
  });
});

// ============================================================================
// WEBSOCKET SERVER (Handles ESP32 Hardware + Mobile Apps)
// ============================================================================
const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost');
  const isDevice = url.pathname === '/ws' && tokensMatch(url.searchParams.get('device_token'), DEVICE_CONNECTION_TOKEN);
  // The hosted simulator is a read-only dashboard; its notification socket
  // must connect without exposing the phone token in browser source.
  const isWebDashboard = url.pathname === '/api/websocket' && tokensMatch(url.searchParams.get('token'), MOBILE_WS_TOKEN);
  const isMedia = url.pathname === '/api/media' && tokensMatch(url.searchParams.get('token'), MOBILE_WS_TOKEN);
  const isIntercom = url.pathname === '/api/intercom' && tokensMatch(url.searchParams.get('token'), MOBILE_WS_TOKEN);
  if (isDevice || isWebDashboard || isIntercom || isMedia) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.clientType = isDevice ? 'device' : isMedia ? 'media' : isIntercom ? 'intercom' : 'web';
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, request) => {
  if (ws.clientType === 'media') {
    if (mediaSocket) { ws.close(1008, 'Another intercom session is active'); return; }
    mediaSocket = ws;
  }
  wsClients.add(ws);
  console.log(`📱 [WS CONNECTED] ${ws.clientType} client connected`);

  ws.on('message', (message, isBinary) => {
    // -------------------------------------------------------------------------
    // Handle Binary Photo Frame from ESP32
    // -------------------------------------------------------------------------
    if (isBinary) {
      if (ws === mediaSocket && message[0] === 2 && message.length > 1 &&
          (message.length - 1) % 320 === 0 && message.length <= 2561) {
        if (esp32Socket?.readyState === WebSocket.OPEN && esp32Socket.bufferedAmount < 65536) esp32Socket.send(message);
        return;
      }
      if (ws === esp32Socket && [1,2].includes(message[0])) {
        if (mediaSocket?.readyState === WebSocket.OPEN && mediaSocket.bufferedAmount < 262144) mediaSocket.send(message);
        return;
      }
      if (ws === esp32Socket && pendingPhotoEvent && message[0] === 0xff && message[1] === 0xd8) {
        const photoEvent = pendingPhotoEvent;
        pendingPhotoEvent = null;
        const photoFilename = `snap_${crypto.randomUUID()}.jpg`;
        const photoPath = path.join(CAPTURES_DIR, photoFilename);
        fs.writeFile(photoPath, message, (err) => {
          if (!err) {
            const photoUrl = `/captures/${photoFilename}`;
            photoEvent.photoUrl = photoUrl;
            console.log(`📸 [SNAPSHOT SAVED] Stored security photo: ${photoUrl}`);

            const target = [...securityHistory, ...accessHistory].find(event=>event.eventId===photoEvent.eventId);
            if (target) target.photoUrl = photoUrl;
            try { persistHistory(); } catch(error) { console.error('[STORAGE] Photo metadata not saved:',error.message); }
            broadcast({
              type: 'photo_ready',
              eventId: photoEvent.eventId,
              photoUrl
            });
          }

        });
      }
      return;
    }

    // -------------------------------------------------------------------------
    // Handle Text JSON Messages
    // -------------------------------------------------------------------------
    try {
      const msg = JSON.parse(message.toString());

      if (ws === mediaSocket) {
        if (msg.type === 'watch' && (!ws.lastWatch || Date.now() - ws.lastWatch >= 10000)) {
          ws.lastWatch = Date.now();
          executeLiveView({name:OWNER_USERNAME}).then(id => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:id ? 'ready':'error', message:id ? 'Camera session ready':'Device did not confirm live view'}));
          });
        }
        return;
      }
      // WebRTC signaling relay. Media travels peer-to-peer; this server only
      // passes SDP and ICE messages between the laptop simulator and phone.
      if (ws.clientType === 'intercom') {
        if (['ready', 'offer', 'answer', 'ice', 'hangup'].includes(msg.type)) {
          for (const client of wsClients) {
            if (client !== ws && client.clientType === 'intercom' && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(msg));
            }
          }
        }
        return;
      }

      // Mobile clients are read-only on this channel. Unlock always requires POST /api/unlock + PIN.
      if (ws.clientType !== 'device') {
        if (msg.type === 'call_service') {
          ws.send(JSON.stringify({ id: msg.id || 1, type: 'result', success: false, error: 'Use the authenticated unlock API.' }));
        }
        return;
      }

      // 1. ESP32 Hardware Registration
      if (msg.type === 'esp32_connect') {
        if (!/^[a-f0-9]{32}$/.test(msg.bootId) || !Number.isSafeInteger(msg.lastSequence)) { ws.close(); return; }
        if (esp32Socket && esp32Socket !== ws) esp32Socket.close();
        state.telemetry=null;
        state.firmware=typeof msg.version==="string"?msg.version.slice(0,80):null;
        state.hardware=typeof msg.hardware==="string"?msg.hardware.slice(0,80):null;
        deviceBootId = msg.bootId;
        commandSequence = msg.lastSequence;
        esp32Socket = ws;
        ws.isEsp32 = true;
        state.deviceOnline = true;
        state.lastHeartbeat = Date.now();
        console.log(`\n🤖 [HARDWARE ONLINE] GOOUUU ESP32-S3-CAM Connected! Firmware: v${msg.version || '3.0'}`);
        broadcast({ type: 'hardware_status', connected: true, timestamp: Date.now() });
      }

      // 2. Hardware Heartbeat Telemetry
      else if (ws !== esp32Socket) return;
      else if (msg.type === 'command_result') {
        const pending = pendingCommands.get(msg.nonce);
        if (pending) { clearTimeout(pending.timer); pendingCommands.delete(msg.nonce); recordCommand(pending.action,msg.success===true?"confirmed":"rejected"); pending.resolve(msg.success === true); }
      }
      else if (msg.type === 'cards_snapshot') {
        const pending=pendingCardReads.get(msg.nonce);
        if(pending) pending.cards=normalizeCards(msg.cards);
      }
      else if (msg.type === 'heartbeat') {
        state.telemetry=readTelemetry(msg);
        state.deviceOnline = true;
        state.lastHeartbeat = Date.now();
        if (typeof msg.rssi === 'number') state.rssi = msg.rssi;
        state.cardsEnabled = msg.cardsEnabled === true;
        state.relayFault = msg.relayFault !== false;
        state.lockBurst = msg.gateLock;
        state.chime = msg.chime;
        state.light = msg.light;
        if (msg.alarmActive !== undefined) state.alarmActive = msg.alarmActive;
      }

      // 3. Authorized Access Event from ESP32
      else if (msg.type === 'access_event') {
        const eventItem = {
          eventId: msg.eventId,
          type: msg.eventType,
          userId: msg.userId,
          userName: msg.userName,
          cardUid: msg.cardUid,
          authorized: msg.authorized,
          timestamp: Date.now(),
          method: msg.method || 'NFC'
        };
        if (!accessHistory.some(event => event.eventId === eventItem.eventId)) accessHistory.unshift(eventItem);
        persistHistory();
        sendToHardware(buildSignedCommand('offline_ack','hub',{eventIds:[msg.eventId]}));
        console.log(`💳 [ACCESS LOGGED] ${msg.userName} entered via ${msg.method}`);
        broadcast({ type: 'access_event', ...eventItem });
      }

      // 4. Unauthorized Access Alert from ESP32
      else if (msg.type === 'unauthorized_alert') {
        const alertItem = {
          eventId: msg.eventId,
          type: 'unauthorized_attempt',
          cardUid: msg.cardUid,
          timestamp: Date.now(),
          alarmActive: msg.alarmActive,
          photoUrl: null
        };
        pendingPhotoEvent = msg.hasPhoto ? alertItem : null;
        securityHistory.unshift(alertItem);
        state.alarmActive = msg.alarmActive;
        persistHistory();
        sendToHardware(buildSignedCommand('offline_ack','hub',{eventIds:[msg.eventId]}));

        console.warn(`🚨 [SECURITY ALERT] Unauthorized NFC attempt for UID: ${msg.cardUid}`);
        broadcast({ type: 'security_alert', ...alertItem });
        pushService.notify('Doorbell security alert','An unrecognized or disabled card was used.',{type:'security',eventId:alertItem.eventId});
      }

      // 5. Offline Sync Batch Flush from ESP32
      else if (msg.type === 'offline_sync_batch') {
        console.log(`📥 [SYNC] Processing ${msg.count} offline events from LittleFS queue...`);
        const events = Array.isArray(msg.events) ? msg.events : [];
        for (const ev of events.slice(0,100)) {
          if (typeof ev.eventId !== "string" || [...accessHistory,...securityHistory].some(item=>item.eventId === ev.eventId)) continue;
          accessHistory.unshift({
            eventId: ev.eventId,
            type: ev.type,
            userId: ev.userId,
            userName: ev.userName,
            cardUid: ev.cardUid,
            authorized: ev.authorized,
            timestamp: ev.timestamp,
            method: ev.method,
            receivedAt: Date.now(),
            offlineSync: true
          });
        }
        persistHistory();
        sendToHardware(buildSignedCommand('offline_ack', 'hub', {eventIds:events.slice(0,100).map(event=>event.eventId)}));
        broadcast({ type: 'offline_sync_completed', count: events.length });
      }

      // 6. Doorbell Ring Event
      else if (msg.type === 'ring') {
        registerRing({ eventId: msg.eventId, hasPhoto: msg.hasPhoto });
        sendToHardware(buildSignedCommand('offline_ack','hub',{eventIds:[msg.eventId]}));
      }

      // 7. Doorbell Button Released
      else if (msg.type === 'ring_release') {
        state.chime = 'idle';
        broadcast({ type: 'chime_complete' });
        broadcastStateChange('binary_sensor.front_doorbell_ring', 'off');
      }

      // 8. ESP confirms that an owner-requested camera session is awake.
      else if (msg.type === 'live_view_ready') {
        state.cameraActive = true;
        broadcastStateChange('camera.front_doorbell_live', 'streaming');
        broadcast({ type: 'live_view_ready', timestamp: Date.now() });
      }

    } catch (err) {
      console.error('Error handling WebSocket frame:', err.message);
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    if (ws === mediaSocket) {
      mediaSocket = null;
      if (deviceBootId) sendToHardware(buildSignedCommand('end_view', OWNER_USERNAME));
    }
    console.log(`📱 [WS DISCONNECTED] ${ws.clientType} client disconnected`);
    if (ws === esp32Socket) {
      esp32Socket = null;
      deviceBootId = null;
      for (const pending of pendingCommands.values()) { clearTimeout(pending.timer); pending.resolve(false); }
      pendingCommands.clear();
      state.deviceOnline = false;
      console.log('⚠️ [HARDWARE OFFLINE] GOOUUU ESP32-S3-CAM Disconnected.');
      broadcast({ type: 'hardware_status', connected: false, timestamp: Date.now() });
    }
  });
});

server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log('=======================================================');
  console.log(`🔐 SMART VIDEO DOORBELL HUB — SECURE SERVER RUNNING`);
  console.log(`🌐 Local Website    : http://localhost:${PORT}/`);
  console.log(`📡 Local Wi-Fi IP   : http://${localIp}:${PORT}/`);
  console.log(`🤖 Hardware WS Link : ws://${localIp}:${PORT}/ws`);
  console.log(`🔒 HMAC Signatures  : SHA-256 with Replay Nonces Enabled`);
  console.log(`🔑 PIN Protection   : Owner PIN + 5-attempt lockout`);
  console.log(`👤 Authorized Owner : ${OWNER_USERNAME}`);
  console.log('=======================================================\n');
});
