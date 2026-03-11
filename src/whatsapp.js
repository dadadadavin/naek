/**
 * naek — WhatsApp Client (Baileys)
 * Handles QR auth, message sending/receiving, session persistence.
 * 
 * FIX #9: Event listeners are bound once to sock.ev and the socket reference
 * is reused on reconnect. Prevents duplicate handler accumulation.
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const AUTH_DIR = path.join(__dirname, '..', 'auth_info');

let sock = null;
let messageHandler = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

// Message deduplication
const processedMsgIds = new Set();
const MAX_MSG_CACHE = 200;

function trackMessage(msgId) {
  processedMsgIds.add(msgId);
  if (processedMsgIds.size > MAX_MSG_CACHE) {
    const first = processedMsgIds.values().next().value;
    processedMsgIds.delete(first);
  }
}

async function initWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  // FIX #9: End old socket AND unbind flag before creating new one
  if (sock) {
    try { 
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.end(); 
    } catch {} 
    sock = null;
  }

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'error' }),
    browser: ['naek', 'Chrome', '120.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    getMessage: async () => ({ conversation: '' }),
  });

  // Connection handler
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n  📱 Scan QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('  WhatsApp → Settings → Linked Devices → Link\n');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode || 500;

      if (code === DisconnectReason.loggedOut || code === 401 || code === 440 || code === 403) {
        console.log(`  ✗ WA session invalid (${code}). Clearing auth...`);
        clearAuth();
        reconnectAttempts = 0;
        setTimeout(() => initWhatsApp(), 2000);
      } else {
        reconnectAttempts++;
        if (reconnectAttempts <= MAX_RECONNECT) {
          const delay = Math.min(reconnectAttempts * 2000, 20000);
          console.log(`  ↻ WA reconnecting in ${delay/1000}s (${reconnectAttempts}/${MAX_RECONNECT})...`);
          setTimeout(() => initWhatsApp(), delay);
        } else {
          console.log('  ✗ WA max retries. Clearing auth...');
          clearAuth();
          reconnectAttempts = 0;
          setTimeout(() => initWhatsApp(), 3000);
        }
      }
    }

    if (connection === 'open') {
      reconnectAttempts = 0;
      console.log('  ✓ WhatsApp connected\n');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Message handler — bound fresh each time (old listeners removed above)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;
      
      const msgId = msg.key.id;
      if (processedMsgIds.has(msgId)) continue;
      trackMessage(msgId);

      if (messageHandler) {
        try { await messageHandler(msg); }
        catch (err) { console.error('  ✗ Handler error:', err.message); }
      }
    }
  });

  return sock;
}

function clearAuth() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  } catch {}
}

function onMessage(handler) { messageHandler = handler; }

async function sendText(jid, text) {
  if (!sock) return;
  try { await sock.sendMessage(jid, { text }); }
  catch (err) { console.error(`  ✗ Send failed:`, err.message); }
}

async function sendImage(jid, imageBuffer, caption = '') {
  if (!sock) return;
  try { await sock.sendMessage(jid, { image: imageBuffer, caption: caption || undefined }); }
  catch (err) { console.error(`  ✗ Image send failed:`, err.message); }
}

function getMessageText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ''
  );
}

function getSenderJid(msg) { return msg.key.remoteJid; }
function getSocket() { return sock; }

module.exports = { initWhatsApp, onMessage, sendText, sendImage, getMessageText, getSenderJid, getSocket };
