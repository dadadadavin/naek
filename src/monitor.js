/**
 * naek — Response Monitor
 * Polls Antigravity for new responses and sends them to WhatsApp.
 * 
 * Uses line-count baseline to detect NEW content only.
 * Checks isGenerating() to avoid sending partial responses.
 */

const cdp = require('./cdp');
const { formatResponse } = require('./utils');

let polling = false;
let pollTimer = null;

let baselineLineCount = 0;
let lastText = '';
let stableCount = 0;

let onResponseCallback = null;
let onStatusCallback = null;
let onScreenshotCallback = null;

let awaitingResponse = false;
let awaitStartTime = 0;
let sentThinking = false;
let currentPrompt = '';

const SCREENSHOT_TIMEOUT = 30000;
const STABLE_THRESHOLD = 3; // 3 polls × 2s = 6 seconds of stability

function startPolling(intervalMs = 2000) {
  if (polling) return;
  polling = true;

  pollTimer = setInterval(async () => {
    try {
      if (!cdp.isConnected() || !awaitingResponse) return;

      // Get latest text from DOM
      const fullText = await cdp.getLatestResponse();
      if (!fullText || fullText.length < 5) {
        // No content — check screenshot timeout
        if (Date.now() - awaitStartTime > SCREENSHOT_TIMEOUT && !sentThinking) {
          try {
            const screenshot = await cdp.takeScreenshot();
            if (screenshot && onScreenshotCallback) {
              onScreenshotCallback(screenshot, '📸 _Still working..._');
              sentThinking = true;
            }
          } catch (e) {}
        }
        return;
      }

      // Extract NEW content (after baseline)
      const allLines = fullText.split('\n');
      const newLines = allLines.slice(baselineLineCount);
      const newText = newLines.join('\n').trim();

      if (!newText || newText.length < 3) return;

      // Send "thinking" notification once
      if (!sentThinking && onStatusCallback) {
        onStatusCallback('thinking');
        sentThinking = true;
      }

      // Check stability
      if (newText === lastText) {
        // Text unchanged — check if AI is still generating
        let stillGenerating = false;
        try { stillGenerating = await cdp.isGenerating(); } catch (e) {}

        if (stillGenerating) {
          stableCount = 0; // Reset — AI is still working
        } else {
          stableCount++;
        }

        if (stableCount >= STABLE_THRESHOLD) {
          // Response is stable and AI is done — deliver it
          deliverResponse(newText, allLines.length);
        }
      } else {
        // Text changed — reset stability counter
        stableCount = 0;
        lastText = newText;
      }
    } catch (err) {
      // Silently handle CDP disconnects
    }
  }, intervalMs);
}

function deliverResponse(newText, totalLines) {
  console.log(`  → Delivering (${newText.length} chars)`);
  
  // Strip echoed user prompt from start
  let cleaned = newText;
  if (currentPrompt) {
    const firstLine = cleaned.split('\n')[0];
    if (firstLine === currentPrompt || firstLine.startsWith(currentPrompt)) {
      cleaned = cleaned.substring(cleaned.indexOf('\n') + 1).trim();
    }
  }

  const formatted = formatResponse(cleaned);
  if (formatted && formatted.length > 2 && onResponseCallback) {
    onResponseCallback(formatted);
  }

  // Reset state
  awaitingResponse = false;
  sentThinking = false;
  stableCount = 0;
  lastText = '';
  baselineLineCount = totalLines; // Update baseline for next prompt
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  polling = false;
}

function onResponse(callback) { onResponseCallback = callback; }
function onScreenshot(callback) { onScreenshotCallback = callback; }
function onStatus(callback) { onStatusCallback = callback; }

function reset(prompt = '') {
  stableCount = 0;
  lastText = '';
  awaitingResponse = true;
  awaitStartTime = Date.now();
  sentThinking = false;
  currentPrompt = prompt;
}

async function captureBaseline() {
  try {
    const response = await cdp.getLatestResponse();
    const lines = response ? response.split('\n') : [];
    baselineLineCount = lines.length;
    lastText = '';
    stableCount = 0;
  } catch (e) {
    baselineLineCount = 0;
  }
}

module.exports = { startPolling, stopPolling, onResponse, onScreenshot, onStatus, reset, captureBaseline };
