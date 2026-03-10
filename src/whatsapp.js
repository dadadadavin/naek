/**
 * naek — WhatsApp Client (Baileys)
 * Handles QR auth, message sending/receiving, session persistence
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');

const AUTH_DIR = path.join(__dirname, '..', 'auth_info');

let sock = null;
let messageHandler = null;

/**
 * Initialize WhatsApp connection via Baileys
 * Shows QR code on first run, auto-reconnects after that
 */
async function initWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // We handle QR ourselves
    logger: pino({ level: 'silent' }), // Suppress Baileys verbose logs
    browser: ['naek', 'Chrome', '120.0.0'], // Appear as Chrome browser
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  // Handle connection updates
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\nOpen WhatsApp → Settings → Linked Devices → Link a Device\n');
    }

    if (connection === 'close') {
      const boomError = lastDisconnect?.error;
      const statusCode = boomError?.output?.statusCode || boomError?.statusCode || 500;
      const reason = boomError?.message || 'Unknown reason';
      console.log(`📡 Connection closed (Status: ${statusCode}, Reason: ${reason})`);

      // 440 Conflict usually means session is being used elsewhere or is corrupted
      // 403 Forbidden can also happen if session is invalid
      // 401 Unauthorized means logged out
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401 && statusCode !== 440 && statusCode !== 403;

      if (shouldReconnect) {
        console.log('🔄 Connection lost, reconnecting in 5s...');
        // Explicitly end the old socket instance
        if (sock) {
          try { sock.end(); } catch (e) {}
          sock = null;
        }
        setTimeout(() => initWhatsApp(), 5000); 
      } else {
        console.log('❌ Session invalid or logged out. Deleting auth_info to force fresh QR scan...');
        try {
          const fs = require('fs');
          if (fs.existsSync(AUTH_DIR)) {
             fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
        } catch (e) {
             console.error('   ⚠️ Failed to delete auth_info:', e.message);
        }
        console.log('🔄 Restarting WhatsApp client for new QR code in 3s...');
        setTimeout(() => initWhatsApp(), 3000);
      }
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected!\n');
    }
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Skip messages sent by us
      if (msg.key.fromMe) continue;
      // Skip status broadcasts
      if (msg.key.remoteJid === 'status@broadcast') continue;

      if (messageHandler) {
        await messageHandler(msg);
      }
    }
  });

  return sock;
}

/**
 * Register a callback for incoming messages
 */
function onMessage(handler) {
  messageHandler = handler;
}

/**
 * Send a text message
 */
async function sendText(jid, text) {
  if (!sock) return;
  await sock.sendMessage(jid, { text });
}

/**
 * Send an image with optional caption
 */
async function sendImage(jid, imageBuffer, caption = '') {
  if (!sock) return;
  await sock.sendMessage(jid, {
    image: imageBuffer,
    caption: caption || undefined,
  });
}

/**
 * Get the text content from a message
 */
function getMessageText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ''
  );
}

/**
 * Get the sender JID
 */
function getSenderJid(msg) {
  return msg.key.remoteJid;
}

/**
 * Get the socket instance
 */
function getSocket() {
  return sock;
}

module.exports = {
  initWhatsApp,
  onMessage,
  sendText,
  sendImage,
  getMessageText,
  getSenderJid,
  getSocket,
};
