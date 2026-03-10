/**
 * naek — WhatsApp Remote Control for Antigravity
 *
 * Control your Antigravity IDE from WhatsApp.
 * Send prompts, receive responses, capture screenshots, switch models.
 *
 * Usage:
 *   1. Launch Antigravity with: antigravity d:\yaru --remote-debugging-port=9222
 *   2. Run: node src/index.js
 *   3. Scan the QR code with WhatsApp
 *   4. Start sending messages!
 */

require('dotenv').config();

const { initWhatsApp, onMessage, sendText, sendImage, getMessageText, getSenderJid } = require('./whatsapp');
const cdp = require('./cdp');
const monitor = require('./monitor');
const { handleMessage } = require('./commands');
const { isAllowed, splitMessage, sleep } = require('./utils');

// Config
const ALLOWED_PHONE = process.env.ALLOWED_PHONE || '';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9222');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '2000');

// Active chat JID (so monitor can send responses back)
let activeJid = null;
// Throttle status messages
let lastStatusTime = 0;

async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   naek — WhatsApp × Antigravity          ║');
  console.log('  ║   Remote control your AI from your phone  ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  Config:`);
  console.log(`    ALLOWED_PHONE: ${ALLOWED_PHONE || '(any)'}`);
  console.log(`    CDP_PORT:      ${CDP_PORT}`);
  console.log(`    POLL_INTERVAL: ${POLL_INTERVAL}ms`);
  console.log('');

  // Step 1: Connect to WhatsApp
  console.log('📱 Initializing WhatsApp...\n');
  await initWhatsApp();

  // Wait a moment for WhatsApp to connect
  await sleep(2000);

  // Step 2: Connect to Antigravity via CDP
  console.log('\n🔗 Connecting to Antigravity...');
  let cdpOk = await cdp.connectCDP(CDP_PORT);

  if (!cdpOk) {
    console.log('⚠️  Antigravity not found yet. Will retry when you send a message.');
    console.log(`   Make sure to run: antigravity d:\\yaru --remote-debugging-port=${CDP_PORT}\n`);
  }

  // Step 3: Start response monitor
  monitor.startPolling(POLL_INTERVAL);

  // When a complete response is detected, send it to WhatsApp
  monitor.onResponse(async (text) => {
    if (!activeJid) return;

    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      await sendText(activeJid, chunk);
      if (chunks.length > 1) await sleep(500);
    }
  });

  // When thinking/generating status changes
  monitor.onStatus(async (status) => {
    if (!activeJid) return;

    const now = Date.now();
    if (now - lastStatusTime < 5000) return;
    lastStatusTime = now;

    if (status === 'thinking') {
      await sendText(activeJid, '🤔 Thinking...');
    }
  });

  // When a screenshot fallback is triggered
  monitor.onScreenshot(async (screenshotBuffer, caption) => {
    if (!activeJid) return;
    try {
      await sendImage(activeJid, screenshotBuffer, caption);
    } catch (err) {
      console.log('   ⚠️  Failed to send screenshot:', err.message);
    }
  });

  // Step 4: Handle incoming WhatsApp messages
  onMessage(async (msg) => {
    const jid = getSenderJid(msg);
    const text = getMessageText(msg);

    // Security: only respond to allowed phone
    if (ALLOWED_PHONE && !isAllowed(jid, ALLOWED_PHONE)) {
      console.log(`🚫 Blocked message from unauthorized: ${jid}`);
      return;
    }

    // Track active JID for sending responses back
    activeJid = jid;
    console.log(`📩 Message from ${jid}: "${(text || '(no text)').slice(0, 100)}"`);

    if (!text) {
      await sendText(jid, '⚠️ Text messages only for now.');
      return;
    }

    // Auto-reconnect CDP if needed
    if (!cdp.isConnected()) {
      console.log('🔄 Auto-reconnecting to Antigravity...');
      cdpOk = await cdp.reconnectCDP(CDP_PORT, 3);
      if (!cdpOk) {
        await sendText(jid, '❌ Antigravity not available. Launch it with:\nantigravity d:\\yaru --remote-debugging-port=' + CDP_PORT);
        return;
      }
      await sendText(jid, '✅ Reconnected to Antigravity!');
    }

    // Route to command handler
    await handleMessage(jid, text);
  });

  console.log('🎉 naek is ready! Send a message from WhatsApp.\n');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n👋 Shutting down naek...');
    monitor.stopPolling();
    await cdp.disconnectCDP();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    monitor.stopPolling();
    await cdp.disconnectCDP();
    process.exit(0);
  });
}

// Run
main().catch((err) => {
  console.error('💥 Fatal error:', err.message);
  process.exit(1);
});
