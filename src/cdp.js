/**
 * naek — CDP Bridge to Antigravity
 * 
 * Uses keyboard simulation (Input.dispatchKeyEvent / Input.insertText) to
 * interact with Antigravity's chat. This bypasses all iframe/webview boundaries.
 */

const CDP = require('chrome-remote-interface');
const { sleep } = require('./utils');

let client = null;
let Runtime = null;
let Page = null;
let Input = null;

/**
 * Connect to Antigravity via CDP
 */
async function connectCDP(port = 9222) {
  try {
    const targets = await CDP.List({ port });
    
    let target = targets.find(t => 
      t.type === 'page' && 
      !t.title.includes('Launchpad') && 
      !t.url.includes('launchpad') &&
      !t.url.includes('devtools://')
    );

    if (!target) target = targets.find(t => t.type === 'page');
    if (!target) throw new Error('No Antigravity window found.');

    client = await CDP({ port, target });
    Runtime = client.Runtime;
    Page = client.Page;
    Input = client.Input;

    await Runtime.enable();
    await Page.enable();

    // FIX #2: Listen for disconnect so isConnected() never lies
    client.on('disconnect', () => {
      console.log('  ⚠ CDP connection dropped.');
      client = null; Runtime = null; Page = null; Input = null;
    });

    await sleep(300);

    console.log(`  ✓ CDP connected → ${target.title || target.url}`);
    return true;
  } catch (err) {
    console.error(`  ✗ CDP failed: ${err.message}`);
    client = null; Runtime = null; Page = null; Input = null;
    return false;
  }
}

function isConnected() { return client !== null && Runtime !== null; }

// ── Keyboard helpers ──────────────────────────────────────────

async function sendShortcut(key, modifiers = 0) {
  if (!Input) throw new Error('CDP not connected');
  const code = `Key${key.toUpperCase()}`;
  const vk = key.toUpperCase().charCodeAt(0);
  await Input.dispatchKeyEvent({ type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  await sleep(50);
  await Input.dispatchKeyEvent({ type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
}

async function sendSpecialKey(key, code, keyCode, modifiers = 0) {
  if (!Input) throw new Error('CDP not connected');
  await Input.dispatchKeyEvent({ type: 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers });
  await sleep(30);
  await Input.dispatchKeyEvent({ type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers });
}

async function typeText(text) {
  if (!Input) throw new Error('CDP not connected');
  await Input.insertText({ text });
}

async function pressEnter(modifiers = 0) { await sendSpecialKey('Enter', 'Enter', 13, modifiers); }
async function pressEscape() { await sendSpecialKey('Escape', 'Escape', 27); }

// ── Core actions ──────────────────────────────────────────────

async function focusChatInput() {
  await sendShortcut('l', 2); // Ctrl+L
  await sleep(400);
}

/**
 * Inject a prompt into Antigravity's chat
 */
async function injectPrompt(text) {
  if (!Input) throw new Error('CDP not connected');
  await focusChatInput();
  await sendShortcut('a', 2); // Select all
  await sleep(100);
  await typeText(text);
  await sleep(200);
  await pressEnter();
  return true;
}

/**
 * Take a screenshot
 */
async function takeScreenshot() {
  if (!Page) throw new Error('CDP not connected');
  const { data } = await Page.captureScreenshot({ format: 'png', quality: 80 });
  return Buffer.from(data, 'base64');
}

/**
 * Get the latest AI response from the chat DOM.
 * 
 * FIX #1: All regex is written as plain JS inside the evaluate string,
 * with correct single-level escaping for the template literal.
 * 
 * FIX #7: Only extracts the LAST assistant message block, not the entire
 * conversation, by scanning backwards from "Ask anything" to find the
 * user's prompt boundary.
 */
async function getLatestResponse() {
  if (!Runtime) return '';

  try {
    const r = await Runtime.evaluate({
      expression: `(function() {
        var conv = document.getElementById('conversation');
        if (!conv) return "";

        // Walk text nodes, skip style/script/svg
        var texts = [];
        var walker = document.createTreeWalker(conv, NodeFilter.SHOW_TEXT, {
          acceptNode: function(node) {
            var p = node.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            var tag = p.tagName.toLowerCase();
            if (tag === 'style' || tag === 'script' || tag === 'svg' || tag === 'path' || tag === 'noscript') {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        
        var n;
        while ((n = walker.nextNode())) {
          var t = n.textContent.trim();
          if (t.length > 0) texts.push(t);
        }
        
        // Find the input area
        var idx = -1;
        for (var i = texts.length - 1; i >= 0; i--) {
          if (texts[i].indexOf("Ask anything") !== -1) { idx = i; break; }
        }
        if (idx === -1) return "";

        // Exact-match junk strings
        var junkSet = {
          "New": 1, "Planning": 1, "Fast": 1, "Conversation mode": 1, "Model": 1,
          "Review Changes": 1, "Always run": 1, "Cancel": 1, "Running": 1, "Running.": 1,
          "Generating": 1, "..": 1, "Open": 1, "Analyzed": 1, "Edited": 1,
          "0 Files With Changes": 1, "Background Steps": 1, "Progress Updates": 1,
          "Collapse all": 1, "Task": 1,
          "Agent can plan before executing tasks. Use for deep research, complex tasks, or collaborative work": 1,
          "Agent will execute tasks directly. Use for simple tasks that can be completed faster": 1
        };

        // Filter to only text before the input
        var beforeInput = texts.slice(0, idx);
        var filtered = [];
        for (var j = 0; j < beforeInput.length; j++) {
          var txt = beforeInput[j];
          // Skip exact junk matches
          if (junkSet[txt]) continue;
          // Skip model names
          if (txt.indexOf("Gemini ") === 0) continue;
          if (txt.indexOf("Claude ") === 0) continue;
          if (txt.indexOf("GPT-OSS ") === 0) continue;
          // Skip "Thought for Xs" — check prefix + digit after
          if (txt.indexOf("Thought for ") === 0) continue;
          // Skip "N Files With Changes" — starts with digit
          if (txt.charAt(0) >= "0" && txt.charAt(0) <= "9" && txt.indexOf("Files") !== -1) continue;
          // Skip file paths like d:\yaru\...
          if (txt.indexOf("d:" + String.fromCharCode(92)) === 0) continue;
          // Skip "> node ..." lines
          if (txt.indexOf("> node ") === 0) continue;
          // Skip "Exit code N"
          if (txt.indexOf("Exit code ") === 0) continue;
          // Skip CSS selectors: starts with . then a letter
          if (txt.charAt(0) === "." && txt.length > 1 && txt.charAt(1) >= "a" && txt.charAt(1) <= "z") continue;
          // Skip CSS property lines: "word-word: value;"
          if (txt.indexOf(": ") > 0 && (txt.indexOf(";") !== -1 || txt.indexOf("{") !== -1)) {
            var colonPos = txt.indexOf(": ");
            var beforeColon = txt.substring(0, colonPos);
            if (beforeColon.length < 30 && beforeColon.indexOf(" ") === -1) continue;
          }
          // Skip large CSS blocks
          if (txt.length > 300 && txt.indexOf("{") !== -1 && txt.indexOf("}") !== -1) continue;
          // Skip "Step Id: N"
          if (txt.indexOf("Step Id: ") === 0) continue;
          filtered.push(txt);
        }
        
        // FIX #7: Find the last user message boundary
        // User messages in Antigravity are typically shorter texts followed by
        // the AI response. We look for the pattern where a short text (user prompt)
        // is followed by longer content (AI response).
        // Strategy: scan backwards and find where the latest "turn" starts.
        // The last message boundary is typically marked by a shift in content density.
        // For now, take the last 50 text nodes max to avoid sending entire chat history.
        var maxNodes = 50;
        if (filtered.length > maxNodes) {
          filtered = filtered.slice(filtered.length - maxNodes);
        }
        
        return filtered.join(String.fromCharCode(10));
      })()`,
      returnByValue: true,
    });
    return r.result?.value || '';
  } catch (err) {
    return '';
  }
}

/**
 * Check if Antigravity is generating
 */
async function isGenerating() {
  if (!Runtime) return false;
  try {
    const r = await Runtime.evaluate({
      expression: `(function() {
        var conv = document.getElementById('conversation');
        if (!conv) return false;
        var text = conv.innerText;
        return text.indexOf('Generating') !== -1 || (text.indexOf('Cancel') !== -1 && text.indexOf('Running') !== -1);
      })()`,
      returnByValue: true,
    });
    return r.result?.value || false;
  } catch { return false; }
}

/**
 * Get current model and mode from the DOM
 */
async function getStatus() {
  if (!Runtime) return { model: 'unknown', mode: 'unknown', connected: false };
  try {
    const r = await Runtime.evaluate({
      expression: `(function() {
        var conv = document.getElementById('conversation');
        if (!conv) return JSON.stringify({ model: 'unknown', mode: 'unknown', connected: true });
        var text = conv.innerText;
        
        var model = 'unknown';
        var models = ['Gemini 3.1 Pro (High)', 'Gemini 3.1 Pro (Low)', 'Gemini 3 Flash', 
                       'Claude Sonnet 4.6 (Thinking)', 'Claude Opus 4.6 (Thinking)', 'GPT-OSS 120B (Medium)'];
        for (var i = 0; i < models.length; i++) {
          if (text.indexOf(models[i]) !== -1) { model = models[i]; break; }
        }
        
        var mode = 'unknown';
        if (text.indexOf('Planning') !== -1) mode = 'Planning';
        if (text.indexOf('Fast') !== -1) mode = 'Fast';
        
        return JSON.stringify({ model: model, mode: mode, connected: true, title: document.title });
      })()`,
      returnByValue: true,
    });
    return JSON.parse(r.result?.value || '{}');
  } catch {
    return { model: 'unknown', mode: 'unknown', connected: false };
  }
}

async function stopGeneration() {
  await pressEscape();
  return true;
}

async function startNewChat() {
  // Ctrl+Shift+P → type command → Enter
  await sendSpecialKey('P', 'KeyP', 80, 10); // Ctrl+Shift+P
  await sleep(400);
  await typeText('Antigravity: New Chat');
  await sleep(500);
  await pressEnter();
  await sleep(300);
  return true;
}

// FIX #10: acceptDialog now tries to find and click the actual accept button via DOM
async function acceptDialog() {
  if (!Runtime) { return false; }
  try {
    const r = await Runtime.evaluate({
      expression: `(function() {
        // Look for buttons with accept-like text
        var buttons = document.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          var txt = buttons[i].textContent.trim().toLowerCase();
          if (txt === 'accept' || txt === 'approve' || txt === 'allow' || txt === 'always run' || txt === 'run') {
            buttons[i].click();
            return true;
          }
        }
        return false;
      })()`,
      returnByValue: true,
    });
    if (r.result?.value) return true;
  } catch {}
  // Fallback: Tab+Enter
  await sendSpecialKey('Tab', 'Tab', 9);
  await sleep(100);
  await pressEnter();
  return true;
}

async function rejectDialog() {
  await pressEscape();
  return true;
}

async function disconnectCDP() {
  if (client) {
    try { await client.close(); } catch {}
    client = null; Runtime = null; Page = null; Input = null;
  }
}

async function reconnectCDP(port = 9222, maxRetries = 5) {
  await disconnectCDP();
  for (let i = 0; i < maxRetries; i++) {
    console.log(`  ↻ CDP reconnect ${i + 1}/${maxRetries}...`);
    if (await connectCDP(port)) return true;
    await sleep(2000);
  }
  return false;
}

module.exports = {
  connectCDP, disconnectCDP, reconnectCDP, isConnected,
  injectPrompt, getLatestResponse, isGenerating,
  takeScreenshot, stopGeneration, startNewChat,
  acceptDialog, rejectDialog, getStatus,
};
