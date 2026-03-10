/**
 * naek — WhatsApp Remote Control for Antigravity
 *
 * Usage:
 *   1. antigravity d:\yaru --remote-debugging-port=9222
 *   2. node src/index.js  (or: npm start)
 *   3. Scan QR with WhatsApp
 *   4. Send messages!
 * 
 * FIX #13: Startup waits for WhatsApp 'open' event instead of arbitrary sleep.
 */

require('dotenv').config();

const { initWhatsApp, onMessage, sendText, sendImage, getMessageText, getSenderJid } = require('./whatsapp');
const cdp = require('./cdp');
const monitor = require('./monitor');
const { handleMessage } = require('./commands');
const { isAllowed, splitMessage, sleep } = require('./utils');

const ALLOWED_PHONE = process.env.ALLOWED_PHONE || '';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9222');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '2000');

let activeJid = null;

async function main() {
  console.log('');
  console.log('  ┌──────────────────────────────────────┐');
  console.log('  │  naek — WhatsApp × Antigravity       │');
  console.log('  │  Remote control AI from your phone   │');
  console.log('  └──────────────────────────────────────┘');
  console.log('');
  console.log(`  Phone: ${ALLOWED_PHONE || '(any)'} | CDP: ${CDP_PORT} | Poll: ${POLL_INTERVAL}ms`);
  console.log('');

  // 1. WhatsApp — initWhatsApp is async but the QR/connect happens via events
  console.log('  [1/3] WhatsApp...');
  await initWhatsApp();

  // FIX #13: Wait up to 15s for WhatsApp to connect, but don't block forever
  const waConnected = await waitForCondition(
    () => {
      // Check if sock exists and has connected by trying getSocket
      const { getSocket } = require('./whatsapp');
      return getSocket() !== null;
    },
    15000, 500
  );
  if (!waConnected) {
    console.log('  ⚠ WhatsApp not connected yet. QR scan may be needed.');
  }

  // 2. CDP
  console.log('  [2/3] Antigravity CDP...');
  let cdpOk = await cdp.connectCDP(CDP_PORT);
  if (!cdpOk) {
    console.log('  ⚠ Antigravity not found. Will auto-connect when you message.');
    console.log(`    Run: antigravity d:\\yaru --remote-debugging-port=${CDP_PORT}`);
  }

  // 3. Monitor
  console.log('  [3/3] Response monitor...');
  monitor.startPolling(POLL_INTERVAL);

  monitor.onResponse(async (text) => {
    if (!activeJid) return;
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      await sendText(activeJid, chunk);
      if (chunks.length > 1) await sleep(500);
    }
  });

  monitor.onStatus(async (status) => {
    if (!activeJid) return;
    if (status === 'thinking') {
      await sendText(activeJid, '🤔 _Thinking..._');
    }
  });

  monitor.onScreenshot(async (buf, caption) => {
    if (!activeJid) return;
    try { await sendImage(activeJid, buf, caption); } catch {}
  });

  // 4. Message handler
  onMessage(async (msg) => {
    const jid = getSenderJid(msg);
    const text = getMessageText(msg);

    if (ALLOWED_PHONE && !isAllowed(jid, ALLOWED_PHONE)) return;

    activeJid = jid;

    if (!text) {
      await sendText(jid, '⚠️ Text only.');
      return;
    }

    console.log(`  ← ${text.slice(0, 80)}`);

    if (!cdp.isConnected()) {
      cdpOk = await cdp.reconnectCDP(CDP_PORT, 3);
      if (!cdpOk) {
        await sendText(jid, '❌ Antigravity not running.\nantigravity d:\\yaru --remote-debugging-port=' + CDP_PORT);
        return;
      }
      await sendText(jid, '✅ Connected to Antigravity!');
    }

    await handleMessage(jid, text);
  });

  console.log('');
  console.log('  ✓ naek is ready. Send a WhatsApp message!');
  console.log('  ─────────────────────────────────────────');
  console.log('');

  process.on('SIGINT', async () => {
    console.log('\n  Shutting down...');
    monitor.stopPolling();
    await cdp.disconnectCDP();
    process.exit(0);
  });
}

/**
 * FIX #13: Wait for a condition to be true, with timeout
 */
async function waitForCondition(checkFn, timeoutMs, intervalMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (checkFn()) return true;
    await sleep(intervalMs);
  }
  return false;
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
