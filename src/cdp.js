/**
 * naek — CDP Bridge to Antigravity
 * 
 * Uses DOM manipulation and keyboard simulation to interact with
 * Antigravity's chat via Chrome DevTools Protocol.
 * 
 * Architecture:
 *   - DOM focus  → find and click the chat input element
 *   - insertText → type the prompt
 *   - Enter      → submit
 *   - TreeWalker → extract AI response text (skip style/script/svg)
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

    // Listen for disconnect so isConnected() never lies
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

/**
 * Focus the chat input by finding it in the DOM and clicking it.
 */
async function focusChatInput() {
  if (!Runtime) throw new Error('CDP not connected');
  
  const r = await Runtime.evaluate({
    expression: `(function() {
      // Strategy 1: textarea with "Ask anything" placeholder
      var inputs = document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]');
      for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].placeholder && inputs[i].placeholder.indexOf("Ask anything") !== -1) {
          inputs[i].focus();
          inputs[i].click();
          return "placeholder";
        }
      }
      
      // Strategy 2: aria-label
      var labeled = document.querySelector('[aria-label*="Ask anything"]');
      if (labeled) {
        labeled.focus();
        labeled.click();
        return "aria";
      }
      
      // Strategy 3: any visible textarea (skip querySelectorAll('*') — too slow)
      var textareas = document.querySelectorAll('textarea');
      for (var k = 0; k < textareas.length; k++) {
        if (textareas[k].offsetParent !== null) {
          textareas[k].focus();
          textareas[k].click();
          return "textarea";
        }
      }
      
      return "not-found";
    })()`,
    returnByValue: true,
  });
  
  const result = r.result?.value || 'error';
  if (result === 'not-found') {
    console.log('  ⚠ Chat input not found via DOM');
  }
  await sleep(300);
}

/**
 * Inject a prompt into Antigravity's chat.
 */
async function injectPrompt(text) {
  if (!Input) throw new Error('CDP not connected');
  
  await focusChatInput();
  
  // Clear any existing text: Home → Shift+End → overwrite
  await sendSpecialKey('Home', 'Home', 36);
  await sleep(50);
  await sendSpecialKey('End', 'End', 35, 1); // Shift+End
  await sleep(50);
  
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
 * Uses TreeWalker to extract text, filters out UI junk via indexOf checks.
 */
async function getLatestResponse() {
  if (!Runtime) return '';

  try {
    const r = await Runtime.evaluate({
      expression: `(function() {
        var conv = document.getElementById('conversation');
        if (!conv) return "";

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
        
        // Find "Ask anything" input boundary
        var inputIdx = -1;
        for (var i = texts.length - 1; i >= 0; i--) {
          if (texts[i].indexOf("Ask anything") !== -1) { inputIdx = i; break; }
        }
        if (inputIdx === -1) return "";

        var beforeInput = texts.slice(0, inputIdx);

        // Exact-match junk
        var junkSet = {
          "New": 1, "Planning": 1, "Fast": 1, "Conversation mode": 1, "Model": 1,
          "Review Changes": 1, "Always run": 1, "Cancel": 1, "Running": 1, "Running.": 1,
          "Generating": 1, "Generating.": 1, "..": 1, "Open": 1, "Analyzed": 1, "Edited": 1,
          "0 Files With Changes": 1, "Background Steps": 1, "Progress Updates": 1,
          "Collapse all": 1, "Expand all": 1, "Working": 1, "Working.": 1, "Task": 1,
          "Agent can plan before executing tasks. Use for deep research, complex tasks, or collaborative work": 1,
          "Agent will execute tasks directly. Use for simple tasks that can be completed faster": 1
        };

        var filtered = [];
        for (var j = 0; j < beforeInput.length; j++) {
          var txt = beforeInput[j];
          if (junkSet[txt]) continue;
          if (txt.indexOf("Gemini ") === 0) continue;
          if (txt.indexOf("Claude ") === 0) continue;
          if (txt.indexOf("GPT-OSS ") === 0) continue;
          if (txt.indexOf("Thought for ") === 0) continue;
          if (txt.charAt(0) >= "0" && txt.charAt(0) <= "9" && txt.indexOf("Files") !== -1) continue;
          if (txt.indexOf("d:" + String.fromCharCode(92)) === 0) continue;
          if (txt.indexOf("> node ") === 0) continue;
          if (txt.indexOf("Exit code ") === 0) continue;
          if (txt.indexOf("Step Id: ") === 0) continue;
          if (txt.charAt(0) === "." && txt.length > 1 && txt.charAt(1) >= "a" && txt.charAt(1) <= "z") continue;
          if (txt.indexOf(": ") > 0 && (txt.indexOf(";") !== -1 || txt.indexOf("{") !== -1)) {
            var colonPos = txt.indexOf(": ");
            var beforeColon = txt.substring(0, colonPos);
            if (beforeColon.length < 30 && beforeColon.indexOf(" ") === -1) continue;
          }
          if (txt.length > 300 && txt.indexOf("{") !== -1 && txt.indexOf("}") !== -1) continue;
          filtered.push(txt);
        }

        if (filtered.length > 80) {
          filtered = filtered.slice(filtered.length - 80);
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
 * Check if Antigravity is actively generating a response
 */
async function isGenerating() {
  if (!Runtime) return false;
  try {
    const r = await Runtime.evaluate({
      expression: `(function() {
        var spans = document.querySelectorAll('span, div, p');
        for (var i = 0; i < spans.length; i++) {
          var el = spans[i];
          if (el.offsetParent === null) continue;
          if (el.children.length > 0) continue;
          var t = el.textContent.trim();
          if (t === 'Generating' || t === 'Generating.' || t === 'Running' || t === 'Running.' || t === 'Working' || t === 'Working.') {
            return true;
          }
        }
        var buttons = document.querySelectorAll('button');
        for (var j = 0; j < buttons.length; j++) {
          if (buttons[j].offsetParent === null) continue;
          if (buttons[j].textContent.trim() === 'Stop') return true;
        }
        return false;
      })()`,
      returnByValue: true,
    });
    return r.result?.value || false;
  } catch { return false; }
}

/**
 * Get current model and mode
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
        var models = ['Gemini 2.5 Pro', 'Gemini 2.0 Flash', 'Claude 3.5 Sonnet', 'Claude 3 Opus', 'GPT-4o'];
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
  await sendSpecialKey('P', 'KeyP', 80, 10); // Ctrl+Shift+P
  await sleep(400);
  await typeText('Antigravity: New Chat');
  await sleep(500);
  await pressEnter();
  await sleep(300);
  return true;
}

async function acceptDialog() {
  if (!Runtime) return false;
  try {
    const r = await Runtime.evaluate({
      expression: `(function() {
        var buttons = document.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          if (btn.offsetParent === null) continue;
          var txt = btn.textContent.trim().toLowerCase();
          if (txt === 'accept' || txt === 'approve' || txt === 'allow' || txt === 'always run' || txt === 'run' || txt === 'always allow') {
            btn.click();
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
