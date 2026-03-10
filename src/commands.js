/**
 * naek — Command Handler
 * Routes WhatsApp messages to appropriate actions
 */

const cdp = require('./cdp');
const monitor = require('./monitor');
const { sendText, sendImage } = require('./whatsapp');
const { splitMessage, sanitize, timestamp } = require('./utils');

async function handleMessage(jid, text) {
  const trimmed = sanitize(text);
  if (!trimmed) return;

  if (trimmed.startsWith('/')) {
    await handleCommand(jid, trimmed);
  } else {
    await handlePrompt(jid, trimmed);
  }
}

async function handlePrompt(jid, text) {
  if (!cdp.isConnected()) {
    await sendText(jid, '❌ Antigravity not connected. Run:\nantigravity d:\\yaru --remote-debugging-port=9222');
    return;
  }

  try {
    await monitor.captureBaseline();
    monitor.reset();
    await cdp.injectPrompt(text);
    await sendText(jid, `⚡ _${text.length > 60 ? text.slice(0, 60) + '...' : text}_`);
  } catch (err) {
    await sendText(jid, `❌ ${err.message}`);
  }
}

async function handleCommand(jid, text) {
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  const commands = {
    '/help': () => showHelp(jid),
    '/h': () => showHelp(jid),
    '/ss': () => takeScreenshot(jid),
    '/screenshot': () => takeScreenshot(jid),
    '/stop': () => stopGen(jid),
    '/new': () => newChat(jid),
    '/accept': () => accept(jid),
    '/yes': () => accept(jid),
    '/y': () => accept(jid),
    '/reject': () => reject(jid),
    '/no': () => reject(jid),
    '/n': () => reject(jid),
    '/status': () => showStatus(jid),
    '/model': () => switchModel(jid, args),
    '/mode': () => switchMode(jid),
    '/rc': () => reconnect(jid),
    '/reconnect': () => reconnect(jid),
  };

  const handler = commands[cmd];
  if (handler) {
    await handler();
  } else {
    await sendText(jid, `❓ Unknown: ${cmd}\nType /help for commands.`);
  }
}

// ── Commands ──────────────────────────────────────────────────

async function showHelp(jid) {
  await sendText(jid, `📋 *naek*

_Just type anything → sends to Antigravity_

*/ss* — Screenshot
*/stop* — Stop generation
*/new* — New chat
*/yes* — Accept dialog
*/no* — Reject dialog
*/status* — Model & mode info
*/model <name>* — Switch model
*/mode* — Toggle Planning/Fast
*/rc* — Reconnect CDP
*/help* — This message`);
}

async function takeScreenshot(jid) {
  if (!cdp.isConnected()) { await sendText(jid, '❌ Not connected.'); return; }
  try {
    const buffer = await cdp.takeScreenshot();
    await sendImage(jid, buffer, `🖥️ ${timestamp()}`);
  } catch (err) {
    await sendText(jid, `❌ ${err.message}`);
  }
}

async function stopGen(jid) {
  if (!cdp.isConnected()) { await sendText(jid, '❌ Not connected.'); return; }
  await cdp.stopGeneration();
  await sendText(jid, '⏹️ Stopped.');
}

async function newChat(jid) {
  if (!cdp.isConnected()) { await sendText(jid, '❌ Not connected.'); return; }
  await cdp.startNewChat();
  monitor.reset();
  await sendText(jid, '✨ New chat started.');
}

async function accept(jid) {
  await cdp.acceptDialog();
  await sendText(jid, '✅ Accepted.');
}

async function reject(jid) {
  await cdp.rejectDialog();
  await sendText(jid, '❌ Rejected.');
}

async function showStatus(jid) {
  if (!cdp.isConnected()) {
    await sendText(jid, '📊 CDP: ❌ | WA: ✅');
    return;
  }
  const s = await cdp.getStatus();
  await sendText(jid, `📊 *Status*
CDP: ✅
Model: ${s.model || '?'}
Mode: ${s.mode || '?'}
WA: ✅`);
}

async function switchModel(jid, modelName) {
  if (!modelName) {
    await sendText(jid, '⚠️ Usage: /model <name>');
    return;
  }
  if (!cdp.isConnected()) { await sendText(jid, '❌ Not connected.'); return; }
  
  // Type the model switch command in Antigravity's command palette
  await sendText(jid, `🔄 Switching to ${modelName}...`);
  // This is best done via the UI - send instructions
  await sendText(jid, `ℹ️ Model switching via WhatsApp is limited.\nUse the dropdown in Antigravity directly.`);
}

async function switchMode(jid) {
  if (!cdp.isConnected()) { await sendText(jid, '❌ Not connected.'); return; }
  await sendText(jid, `ℹ️ Mode toggle via WhatsApp is limited.\nUse the toggle in Antigravity directly.`);
}

async function reconnect(jid) {
  const port = parseInt(process.env.CDP_PORT || '9222');
  await sendText(jid, '🔄 Reconnecting...');
  const ok = await cdp.reconnectCDP(port, 3);
  await sendText(jid, ok ? '✅ Reconnected!' : '❌ Failed. Is Antigravity running?');
}

module.exports = { handleMessage };
