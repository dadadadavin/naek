/**
 * naek — WhatsApp Client (Baileys)
 * Handles QR auth, message sending/receiving, session persistence
 * 
 * IMPORTANT: WhatsApp now uses LID (Local Identifier) format for JIDs.
 * Messages may come from @lid instead of @s.whatsapp.net.
 * We handle both formats transparently.
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
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Initialize WhatsApp connection via Baileys
 * Shows QR code on first run, auto-reconnects after that
 */
async function initWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  // Close existing socket if any
  if (sock) {
    try { sock.end(); } catch (e) {}
    sock = null;
  }

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // We handle QR ourselves
    logger: pino({ level: 'warn' }), // Show warnings but not spam
    browser: ['naek', 'Chrome', '120.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    getMessage: async () => { return { conversation: '' }; }, // Required for retries
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

      // Determine if we should reconnect or re-auth
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        // Session expired or logged out — need fresh QR
        console.log('❌ Session expired. Clearing auth for fresh QR scan...');
        clearAuth();
        reconnectAttempts = 0;
        setTimeout(() => initWhatsApp(), 2000);
      } else if (statusCode === 440 || statusCode === 403) {
        // Conflict or forbidden — session corrupted
        console.log('❌ Session conflict detected. Clearing auth...');
        clearAuth();
        reconnectAttempts = 0;
        setTimeout(() => initWhatsApp(), 3000);
      } else {
        // Temporary disconnect — try reconnecting with backoff
        reconnectAttempts++;
        if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(reconnectAttempts * 2000, 30000); // Max 30s
          console.log(`🔄 Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
          setTimeout(() => initWhatsApp(), delay);
        } else {
          console.log('❌ Max reconnect attempts reached. Clearing auth and starting fresh...');
          clearAuth();
          reconnectAttempts = 0;
          setTimeout(() => initWhatsApp(), 3000);
        }
      }
    }

    if (connection === 'open') {
      reconnectAttempts = 0; // Reset on successful connection
      console.log('✅ WhatsApp connected!\n');
    }
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Accept both 'notify' (real-time) and 'append' (history sync) types
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Skip messages sent by us
      if (msg.key.fromMe) continue;
      // Skip status broadcasts
      if (msg.key.remoteJid === 'status@broadcast') continue;

      // Debug: log the raw JID so we can see what format WhatsApp sends
      console.log(`📨 Raw message from: ${msg.key.remoteJid} (participant: ${msg.key.participant || 'N/A'})`);

      if (messageHandler) {
        try {
          await messageHandler(msg);
        } catch (err) {
          console.error('❌ Error in message handler:', err.message);
        }
      }
    }
  });

  return sock;
}

/**
 * Clear auth directory for fresh QR scan
 */
function clearAuth() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      console.log('   🗑️  Auth directory cleared.');
    }
  } catch (e) {
    console.error('   ⚠️ Failed to delete auth_info:', e.message);
  }
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
  if (!sock) {
    console.log('⚠️ Cannot send: WhatsApp not connected');
    return;
  }
  try {
    await sock.sendMessage(jid, { text });
  } catch (err) {
    console.error(`❌ Failed to send text to ${jid}:`, err.message);
  }
}

/**
 * Send an image with optional caption
 */
async function sendImage(jid, imageBuffer, caption = '') {
  if (!sock) {
    console.log('⚠️ Cannot send image: WhatsApp not connected');
    return;
  }
  try {
    await sock.sendMessage(jid, {
      image: imageBuffer,
      caption: caption || undefined,
    });
  } catch (err) {
    console.error(`❌ Failed to send image to ${jid}:`, err.message);
  }
}

/**
 * Get the text content from a message
 * Handles all common message types
 */
function getMessageText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    msg.message?.buttonsResponseMessage?.selectedButtonId ||
    msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

/**
 * Get the sender JID
 * For group messages, use participant. For DMs, use remoteJid.
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
