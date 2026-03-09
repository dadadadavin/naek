/**
 * naek — Response Monitor
 * Polls Antigravity for new responses and streams them back
 * 
 * Two strategies:
 * 1. Text-based: Try to read response text from execution contexts
 * 2. Screenshot-based: After a prompt, wait for activity to stop, then screenshot
 */

const cdp = require('./cdp');
const { formatResponse } = require('./utils');

let polling = false;
let pollTimer = null;
let lastResponseHash = '';
let stableCount = 0;
let onResponseCallback = null;
let onStatusCallback = null;
let onScreenshotCallback = null;
let waitingForResponse = false;
let emptyPolls = 0;

/**
 * Simple hash for comparing response content
 */
function hash(str) {
  if (!str) return '';
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    h = ((h << 5) - h) + chr;
    h |= 0;
  }
  return String(h);
}

/**
 * Start polling for responses
 */
function startPolling(intervalMs = 2000) {
  if (polling) return;
  polling = true;
  stableCount = 0;
  lastResponseHash = '';
  emptyPolls = 0;

  console.log(`👁️  Response monitor started (polling every ${intervalMs}ms)`);

  pollTimer = setInterval(async () => {
    try {
      if (!cdp.isConnected()) return;

      // Try reading response text from execution contexts  
      const response = await cdp.getLatestResponse();
      const currentHash = hash(response);

      if (currentHash !== lastResponseHash && response.length > 5) {
        // New content detected
        stableCount = 1;
        lastResponseHash = currentHash;
        emptyPolls = 0;
      } else if (currentHash === lastResponseHash && response.length > 5) {
        // Same content, increment stable count
        stableCount++;

        if (stableCount >= 3 && waitingForResponse) {
          // Stable for 3 polls = response likely complete
          const formatted = formatResponse(response);
          if (formatted && onResponseCallback) {
            console.log(`   📤 Response detected (${formatted.length} chars), sending to WhatsApp...`);
            onResponseCallback(formatted);
            waitingForResponse = false;
          }
          stableCount = 0;
        }
      } else {
        emptyPolls++;
        
        // If we've been waiting and getting empty reads, send a screenshot instead
        // Wait for 20 empty polls (40 seconds) to ensure AI has finished generating
        if (waitingForResponse && emptyPolls >= 20) {
          console.log('   📸 Text read failed, sending screenshot instead...');
          try {
            const screenshot = await cdp.takeScreenshot();
            if (screenshot && onScreenshotCallback) {
              onScreenshotCallback(screenshot, '📸 Response screenshot (text extraction unavailable)');
              waitingForResponse = false;
            }
          } catch (e) {
            console.log('   ⚠️  Screenshot fallback also failed:', e.message);
          }
          emptyPolls = 0;
        }
      }
    } catch (err) {
      if (err.message.includes('not connected') || err.message.includes('WebSocket')) {
        console.log('⚠️  CDP connection lost during polling');
      }
    }
  }, intervalMs);
}

/**
 * Stop polling
 */
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  polling = false;
  console.log('⏹️  Response monitor stopped');
}

/**
 * Register callback for when a complete text response is detected
 */
function onResponse(callback) {
  onResponseCallback = callback;
}

/**
 * Register callback for screenshot responses
 */
function onScreenshot(callback) {
  onScreenshotCallback = callback;
}

/**
 * Register callback for status changes (thinking, generating)
 */
function onStatus(callback) {
  onStatusCallback = callback;
}

/**
 * Reset monitor state and mark as waiting for a response
 */
function reset() {
  stableCount = 0;
  emptyPolls = 0;
  waitingForResponse = true;
}

/**
 * Force capture current state as baseline
 */
async function captureBaseline() {
  try {
    const response = await cdp.getLatestResponse();
    lastResponseHash = hash(response);
    stableCount = 0;
  } catch (e) {
    // Ignore
  }
}

module.exports = {
  startPolling,
  stopPolling,
  onResponse,
  onScreenshot,
  onStatus,
  reset,
  captureBaseline,
};
