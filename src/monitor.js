/**
 * naek — Response Monitor
 * Polls Antigravity for new responses and sends them to WhatsApp.
 * 
 * FIX #4: captureBaseline stores both hash AND length, so we can detect
 * when a brand new response starts even if the hash collides.
 * FIX #12: Uses SHA-like string comparison instead of simple DJB2 hash
 * to reduce collision risk.
 */

const cdp = require('./cdp');
const { formatResponse } = require('./utils');

let polling = false;
let pollTimer = null;
let baselineHash = '';
let baselineLen = 0;
let lastResponseHash = '';
let lastResponseText = '';
let stableCount = 0;
let onResponseCallback = null;
let onStatusCallback = null;
let onScreenshotCallback = null;
let waitingForResponse = false;
let waitStartTime = 0;
let sentThinking = false;

const SCREENSHOT_TIMEOUT = 30000;

// FIX #12: Better hash using FNV-1a (much lower collision rate than DJB2)
function hash(str) {
  if (!str) return '0:0';
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Include length in hash to further reduce collisions
  return `${(h >>> 0).toString(36)}:${str.length}`;
}

function startPolling(intervalMs = 2000) {
  if (polling) return;
  polling = true;
  stableCount = 0;
  lastResponseHash = '';
  lastResponseText = '';

  pollTimer = setInterval(async () => {
    try {
      if (!cdp.isConnected() || !waitingForResponse) return;

      const response = await cdp.getLatestResponse();
      const currentHash = hash(response);
      const hasContent = response.length > 10;

      // FIX #4: Compare against baseline to only detect NEW content
      if (currentHash === baselineHash) {
        // Content hasn't changed from baseline — AI hasn't responded yet
        // Check screenshot timeout
        if (Date.now() - waitStartTime > SCREENSHOT_TIMEOUT) {
          try {
            const screenshot = await cdp.takeScreenshot();
            if (screenshot && onScreenshotCallback) {
              onScreenshotCallback(screenshot, '📸 AI response (text extraction failed)');
              waitingForResponse = false;
              sentThinking = false;
            }
          } catch (e) { /* ignore */ }
        }
        return;
      }

      if (hasContent && currentHash !== lastResponseHash) {
        // Content is changing → AI is generating
        stableCount = 0;
        lastResponseHash = currentHash;
        lastResponseText = response;

        if (!sentThinking && onStatusCallback) {
          onStatusCallback('thinking');
          sentThinking = true;
        }
      } else if (hasContent && currentHash === lastResponseHash) {
        // Same content as last poll → maybe done
        stableCount++;

        if (stableCount >= 2) {
          const formatted = formatResponse(lastResponseText);
          if (formatted && formatted.length > 5 && onResponseCallback) {
            onResponseCallback(formatted);
            waitingForResponse = false;
            sentThinking = false;
            // Update baseline to current so we don't re-send
            baselineHash = currentHash;
            baselineLen = response.length;
          }
          stableCount = 0;
        }
      }
    } catch (err) {
      // Silently handle CDP disconnects during polling
    }
  }, intervalMs);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  polling = false;
}

function onResponse(callback) { onResponseCallback = callback; }
function onScreenshot(callback) { onScreenshotCallback = callback; }
function onStatus(callback) { onStatusCallback = callback; }

function reset() {
  stableCount = 0;
  waitingForResponse = true;
  waitStartTime = Date.now();
  sentThinking = false;
}

async function captureBaseline() {
  try {
    const response = await cdp.getLatestResponse();
    baselineHash = hash(response);
    baselineLen = response.length;
    lastResponseHash = baselineHash;
    lastResponseText = response;
    stableCount = 0;
  } catch (e) { /* ignore */ }
}

module.exports = { startPolling, stopPolling, onResponse, onScreenshot, onStatus, reset, captureBaseline };
