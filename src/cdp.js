/**
 * naek — CDP Bridge to Antigravity
 * 
 * IMPORTANT: Antigravity (VS Code-based) uses nested iframes/webviews for
 * the chat panel. This means document.querySelector() from the main page
 * CANNOT reach into the chat input. 
 * 
 * Solution: Use CDP keyboard simulation (Input.dispatchKeyEvent / Input.insertText)
 * which sends keystrokes directly to the focused element, bypassing all iframe
 * boundaries. For screenshots, we use Page.captureScreenshot which also works
 * regardless of iframe structure.
 * 
 * For reading responses, we use the VS Code command palette approach — executing
 * VS Code commands via keyboard shortcuts to copy clipboard content.
 */

const CDP = require('chrome-remote-interface');
const { sleep } = require('./utils');

let client = null;
let Runtime = null;
let Page = null;
let Input = null;

// Track all execution contexts (main page + iframes/webviews)
let executionContexts = new Map();
let chatContextId = null;

/**
 * Connect to Antigravity via CDP
 */
async function connectCDP(port = 9222) {
  try {
    const targets = await CDP.List({ port });
    
    // Find the main editor window (not Launchpad, not workers)
    let target = targets.find(t => 
      t.type === 'page' && 
      !t.title.includes('Launchpad') && 
      !t.url.includes('launchpad') &&
      !t.url.includes('devtools://')
    );

    if (!target) {
      target = targets.find(t => t.type === 'page');
    }

    if (!target) {
      throw new Error('No Antigravity target found. Is Antigravity running with --remote-debugging-port=' + port + '?');
    }

    client = await CDP({ port, target });
    Runtime = client.Runtime;
    Page = client.Page;
    Input = client.Input;

    await Runtime.enable();
    await Page.enable();

    // Track execution contexts to find the chat webview iframe
    executionContexts.clear();
    chatContextId = null;

    client.Runtime.executionContextCreated(({ context }) => {
      executionContexts.set(context.id, {
        id: context.id,
        origin: context.origin,
        name: context.name || '',
      });
    });

    client.Runtime.executionContextDestroyed(({ executionContextId }) => {
      executionContexts.delete(executionContextId);
      if (chatContextId === executionContextId) chatContextId = null;
    });

    // Wait a bit for contexts to be reported
    await sleep(500);
    
    // Try to discover the chat context
    await discoverChatContext();
    console.log(`   📋 Found ${executionContexts.size} execution contexts`);

    console.log(`🔗 Connected to Antigravity via CDP (port ${port})`);
    console.log(`   Target: ${target.title || target.url}`);

    return true;
  } catch (err) {
    console.error(`❌ CDP connection failed: ${err.message}`);
    console.error(`   Make sure Antigravity is running with: antigravity . --remote-debugging-port=${port}`);
    return false;
  }
}

/**
 * Check if CDP is connected
 */
function isConnected() {
  return client !== null;
}

// =========================================================
// KEYBOARD SIMULATION HELPERS
// These bypass iframe boundaries entirely
// =========================================================

/**
 * Send a keyboard shortcut (e.g., Ctrl+L to open chat)
 */
async function sendShortcut(key, modifiers = 0) {
  if (!Input) throw new Error('CDP not connected');
  
  // modifiers: 1=Alt, 2=Ctrl, 4=Meta, 8=Shift
  await Input.dispatchKeyEvent({
    type: 'keyDown',
    key,
    code: `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    modifiers,
  });
  await sleep(50);
  await Input.dispatchKeyEvent({
    type: 'keyUp',
    key,
    code: `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    modifiers,
  });
}

/**
 * Send a special key (Enter, Escape, Tab, etc.)
 */
async function sendSpecialKey(key, code, keyCode, modifiers = 0) {
  if (!Input) throw new Error('CDP not connected');
  
  await Input.dispatchKeyEvent({
    type: 'rawKeyDown',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers,
  });
  await sleep(30);
  await Input.dispatchKeyEvent({
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers,
  });
}

/**
 * Type text using Input.insertText (fast, works across iframes)
 */
async function typeText(text) {
  if (!Input) throw new Error('CDP not connected');
  await Input.insertText({ text });
}

/**
 * Press Enter key
 */
async function pressEnter(modifiers = 0) {
  await sendSpecialKey('Enter', 'Enter', 13, modifiers);
}

/**
 * Press Escape key
 */
async function pressEscape() {
  await sendSpecialKey('Escape', 'Escape', 27);
}

/**
 * Click at a specific coordinate on the page
 */
async function clickAt(x, y) {
  if (!Input) throw new Error('CDP not connected');
  
  await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(50);
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

/**
 * Focus the chat input using Ctrl+L
 */
async function focusChatInput() {
  console.log('   ⌨️  Focusing chat input via Ctrl+L...');
  await sendShortcut('l', 2); // Ctrl+L
  await sleep(300);
}

/**
 * Inject a prompt into Antigravity's chat and submit it
 * 
 * Strategy:
 * 1. Focus the chat input via Ctrl+L
 * 2. Select all existing text (Ctrl+A) to replace it
 * 3. Type the new prompt using Input.insertText
 * 4. Press Enter to submit
 */
async function injectPrompt(text) {
  if (!Input) throw new Error('CDP not connected');

  console.log('   ⌨️  Injecting prompt via keyboard simulation...');

  // Step 1: Focus chat
  await focusChatInput();

  // Step 2: Select all text in the input (in case there's old text)
  await sendShortcut('a', 2); // Ctrl+A
  await sleep(100);

  // Step 3: Type the prompt text (this replaces selected text)
  await typeText(text);
  await sleep(200);

  // Step 4: Press Enter to submit
  await pressEnter();
  
  console.log('   ✅ Prompt injected and submitted!');
  return true;
}

/**
 * Take a screenshot of the Antigravity window
 */
async function takeScreenshot() {
  if (!Page) throw new Error('CDP not connected');
  const { data } = await Page.captureScreenshot({ format: 'png', quality: 80 });
  return Buffer.from(data, 'base64');
}

/**
 * Discover which execution context belongs to the chat webview
 * (Legacy from iframe support, keeping for compatibility but main logic is now on main page)
 */
async function discoverChatContext() {
  // Not strictly needed anymore since we are acting on the main DOM, but kept for compatibility
}

/**
 * Get the latest response text from the chat
 * Strategy: Find the chat input ("Ask anything") and extract the text nodes immediately preceding it.
 */
async function getLatestResponse() {
  if (!Runtime) return '';

  try {
    const r = await Runtime.evaluate({
      expression: `(function() {
        // Find the "Ask anything" placeholder or chat input
        const els = Array.from(document.querySelectorAll('*'));
        let inputEl = null;
        for (let el of els) {
          if (el.textContent && el.textContent.includes("Ask anything") && el.children.length === 0) {
            inputEl = el;
            break;
          }
        }
        
        let conv = document.getElementById('conversation');
        if (!conv) return ""; // Not open yet?
        
        let texts = [];
        if (inputEl) {
            let walker = document.createTreeWalker(conv, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
              let t = node.textContent.trim();
              if (t.length > 0) texts.push(t);
            }
            let idx = texts.findIndex(t => t.includes("Ask anything"));
            if (idx !== -1) {
                // Get the text nodes before it (the assistant response)
                // Filter out UI text like model names
                let responseTexts = texts.slice(Math.max(0, idx - 15), idx).filter(t => 
                    !["New", "Planning", "Fast", "Conversation mode"].includes(t) && 
                    !t.includes("Gemini ") && 
                    !t.includes("Claude ") && 
                    !t.includes("GPT-OSS")
                );
                return responseTexts.join('\\n');
            }
        }
        
        // Fallback: just return the innerText
        return conv.innerText;
      })()`,
      returnByValue: true,
    });
    return r.result?.value || '';
  } catch (err) {
    console.error("Error getting response:", err);
    return '';
  }
}


/**
 * Check if Antigravity is currently thinking/generating
 * We check the page title or look for visual indicators
 */
async function isThinking() {
  if (!Runtime) return false;
  
  try {
    const result = await Runtime.evaluate({
      expression: `document.title`,
      returnByValue: true,
    });
    const title = result.result?.value || '';
    // VS Code-based editors often show loading indicators in the title
    return title.includes('●') || title.includes('…') || title.includes('Loading');
  } catch {
    return false;
  }
}

/**
 * Stop the current generation (Escape key)
 */
async function stopGeneration() {
  console.log('   ⏹️ Sending Escape to stop generation...');
  await pressEscape();
  return true;
}

/**
 * Start a new chat
 * In Antigravity, this is typically Ctrl+Shift+L or via command palette
 */
async function startNewChat() {
  console.log('   🆕 Starting new chat...');
  // Try Ctrl+L first to focus chat, then look for new chat shortcut
  await openChatPanel();
  await sleep(200);
  
  // Use Ctrl+Shift+P to open command palette
  await sendSpecialKey('P', 'KeyP', 80, 10); // 2(Ctrl) + 8(Shift) = 10
  await sleep(300);
  
  // Type "new chat" to find the command
  await typeText('Antigravity: New Chat');
  await sleep(300);
  
  // Press Enter to execute
  await pressEnter();
  await sleep(200);
  
  return true;
}

/**
 * Accept an approval dialog
 * In Antigravity, approval buttons appear in the chat area
 * We can try Tab to navigate to the button, then Enter
 */
async function acceptDialog() {
  console.log('   ✅ Accepting dialog...');
  // Common shortcut: Ctrl+Shift+Enter or just Tab+Enter
  // Try clicking via keyboard navigation
  await sendSpecialKey('Tab', 'Tab', 9);
  await sleep(100);
  await pressEnter();
  return true;
}

/**
 * Reject an approval dialog
 */
async function rejectDialog() {
  console.log('   ❌ Rejecting dialog...');
  await pressEscape();
  return true;
}

/**
 * Get current status info
 */
async function getStatus() {
  if (!Runtime) return JSON.stringify({ model: 'unknown', mode: 'unknown', connected: false });
  
  try {
    const result = await Runtime.evaluate({
      expression: `document.title`,
      returnByValue: true,
    });
    const title = result.result?.value || 'Unknown';
    return JSON.stringify({
      model: 'check Antigravity UI',
      mode: 'check Antigravity UI',
      connected: true,
      windowTitle: title,
    });
  } catch {
    return JSON.stringify({ model: 'unknown', mode: 'unknown', connected: false });
  }
}

/**
 * Disconnect from CDP
 */
async function disconnectCDP() {
  if (client) {
    await client.close();
    client = null;
    Runtime = null;
    Page = null;
    Input = null;
    console.log('🔌 CDP disconnected');
  }
}

/**
 * Attempt to reconnect to CDP
 */
async function reconnectCDP(port = 9222, maxRetries = 5) {
  // Disconnect first if already connected
  if (client) {
    try { await client.close(); } catch {}
    client = null;
    Runtime = null;
    Page = null;
    Input = null;
  }
  
  for (let i = 0; i < maxRetries; i++) {
    console.log(`🔄 CDP reconnect attempt ${i + 1}/${maxRetries}...`);
    const ok = await connectCDP(port);
    if (ok) return true;
    await sleep(2000);
  }
  return false;
}

// Placeholder SELECTORS for backward compatibility with commands.js
const SELECTORS = {
  chatInput: '',
  submitButton: '',
  lastResponse: '',
  allResponses: '',
  thinkingIndicator: '',
  stopButton: '',
  modelSelector: '',
  modeSelector: '',
  acceptButton: '',
  rejectButton: '',
  newChatButton: '',
};

module.exports = {
  connectCDP,
  disconnectCDP,
  reconnectCDP,
  isConnected,
  injectPrompt,
  getLatestResponse,
  isThinking,
  takeScreenshot,
  stopGeneration,
  startNewChat,
  acceptDialog,
  rejectDialog,
  getStatus,
  SELECTORS,
};
