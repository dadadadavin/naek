/**
 * naek — Command Handler
 * Parses WhatsApp messages and routes to appropriate actions
 */

const cdp = require('./cdp');
const monitor = require('./monitor');
const { sendText, sendImage } = require('./whatsapp');
const { splitMessage, sanitize, timestamp } = require('./utils');

/**
 * Process an incoming message and execute the appropriate command
 */
async function handleMessage(jid, text) {
  const trimmed = sanitize(text);
  if (!trimmed) return;

  // Check if it's a command (starts with /)
  if (trimmed.startsWith('/')) {
    await handleCommand(jid, trimmed);
  } else {
    // Regular text — send as prompt to Antigravity
    await handlePrompt(jid, trimmed);
  }
}

/**
 * Send a natural language prompt to Antigravity
 */
async function handlePrompt(jid, text) {
  if (!cdp.isConnected()) {
    await sendText(jid, '❌ Not connected to Antigravity. Make sure it\'s running with CDP enabled.');
    return;
  }

  try {
    // Capture baseline so we only detect the NEW response
    await monitor.captureBaseline();
    monitor.reset();

    // Inject the prompt
    await cdp.injectPrompt(text);
    await sendText(jid, `✅ Prompt sent → ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`);
  } catch (err) {
    await sendText(jid, `❌ Failed to send prompt: ${err.message}`);
  }
}

/**
 * Handle slash commands
 */
async function handleCommand(jid, text) {
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (cmd) {
    case '/help':
    case '/h':
      await showHelp(jid);
      break;

    case '/screenshot':
    case '/ss':
      await takeScreenshot(jid);
      break;

    case '/stop':
      await stopGeneration(jid);
      break;

    case '/new':
      await newChat(jid);
      break;

    case '/accept':
    case '/yes':
    case '/y':
      await acceptAction(jid);
      break;

    case '/reject':
    case '/no':
    case '/n':
      await rejectAction(jid);
      break;

    case '/status':
      await showStatus(jid);
      break;

    case '/model':
      await switchModel(jid, args);
      break;

    case '/mode':
      await switchMode(jid);
      break;

    case '/reconnect':
    case '/rc':
      await reconnect(jid);
      break;

    default:
      await sendText(jid, `❓ Unknown command: ${cmd}\nType /help for available commands.`);
  }
}

// ===== Individual command implementations =====

async function showHelp(jid) {
  const help = `📋 *naek Commands*

*Prompts:*
Just type anything → sends to Antigravity

*Controls:*
/ss — Screenshot
/stop — Stop generation
/new — New chat
/accept or /yes — Accept dialog
/reject or /no — Reject dialog

*Info:*
/status — Current model & mode
/model <name> — Switch model
/mode — Toggle Fast/Planning
/reconnect — Reconnect to Antigravity
/help — This message`;

  await sendText(jid, help);
}

async function takeScreenshot(jid) {
  if (!cdp.isConnected()) {
    await sendText(jid, '❌ Not connected to Antigravity.');
    return;
  }

  try {
    await sendText(jid, '📸 Capturing...');
    const buffer = await cdp.takeScreenshot();
    await sendImage(jid, buffer, `🖥️ Antigravity @ ${timestamp()}`);
  } catch (err) {
    await sendText(jid, `❌ Screenshot failed: ${err.message}`);
  }
}

async function stopGeneration(jid) {
  if (!cdp.isConnected()) {
    await sendText(jid, '❌ Not connected.');
    return;
  }

  try {
    const stopped = await cdp.stopGeneration();
    await sendText(jid, stopped ? '⏹️ Generation stopped.' : '⚠️ No stop button found.');
  } catch (err) {
    await sendText(jid, `❌ Error: ${err.message}`);
  }
}

async function newChat(jid) {
  if (!cdp.isConnected()) {
    await sendText(jid, '❌ Not connected.');
    return;
  }

  try {
    await cdp.startNewChat();
    monitor.reset();
    await sendText(jid, '✨ New chat started!');
  } catch (err) {
    await sendText(jid, `❌ Error: ${err.message}`);
  }
}

async function acceptAction(jid) {
  try {
    const accepted = await cdp.acceptDialog();
    await sendText(jid, accepted ? '✅ Accepted!' : '⚠️ No dialog found.');
  } catch (err) {
    await sendText(jid, `❌ Error: ${err.message}`);
  }
}

async function rejectAction(jid) {
  try {
    const rejected = await cdp.rejectDialog();
    await sendText(jid, rejected ? '❌ Rejected.' : '⚠️ No dialog found.');
  } catch (err) {
    await sendText(jid, `❌ Error: ${err.message}`);
  }
}

async function showStatus(jid) {
  if (!cdp.isConnected()) {
    await sendText(jid, '📊 *Status*\nCDP: ❌ Disconnected\nWhatsApp: ✅ Connected');
    return;
  }

  try {
    const statusJson = await cdp.getStatus();
    const status = JSON.parse(statusJson || '{}');
    await sendText(jid, `📊 *Status*\nCDP: ✅ Connected\nModel: ${status.model || 'unknown'}\nMode: ${status.mode || 'unknown'}\nWhatsApp: ✅ Connected`);
  } catch (err) {
    await sendText(jid, `📊 *Status*\nCDP: ✅ Connected\nWhatsApp: ✅ Connected\n\n⚠️ Could not read model/mode info`);
  }
}

async function switchModel(jid, modelName) {
  if (!modelName) {
    await sendText(jid, '⚠️ Usage: /model <name>\nExample: /model gemini-2.5-pro');
    return;
  }
  await sendText(jid, `🔄 Model switching requested: ${modelName}\nNote: This requires matching the UI selector. Check Antigravity manually if it doesn\\'t work.`);
}

async function switchMode(jid) {
  await sendText(jid, `🔄 Mode toggle requested.\nNote: This requires matching the UI selector. Check Antigravity manually if it doesn\\'t work.`);
}

async function reconnect(jid) {
  const port = parseInt(process.env.CDP_PORT || '9222');
  await sendText(jid, '🔄 Reconnecting to Antigravity...');

  const ok = await cdp.reconnectCDP(port, 3);
  if (ok) {
    await sendText(jid, '✅ Reconnected to Antigravity!');
  } else {
    await sendText(jid, '❌ Reconnection failed. Is Antigravity running?');
  }
}

module.exports = {
  handleMessage,
};
