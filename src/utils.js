/**
 * naek — Utility functions
 */

const fs = require('fs');
const path = require('path');

// ── LID trust system ──────────────────────────────────────────

const LIDS_FILE = path.join(__dirname, '..', 'known_lids.json');
let knownLids = new Set();
try {
  if (fs.existsSync(LIDS_FILE)) {
    const data = JSON.parse(fs.readFileSync(LIDS_FILE, 'utf8'));
    knownLids = new Set(data);
  }
} catch (e) {
  knownLids = new Set();
}

function saveLids() {
  try { fs.writeFileSync(LIDS_FILE, JSON.stringify([...knownLids])); } catch (e) {}
}

let lidMapped = false;

function isAllowed(senderJid, allowedPhone) {
  if (!allowedPhone) return true;

  const allowedList = allowedPhone.split(',').map(p => p.trim().replace(/\+/g, ''));

  if (senderJid.endsWith('@s.whatsapp.net')) {
    const cleaned = senderJid.split('@')[0].split(':')[0].replace(/\+/g, '');
    const ok = allowedList.includes(cleaned);
    if (ok) lidMapped = true;
    return ok;
  }

  if (senderJid.endsWith('@lid')) {
    if (lidMapped) {
      if (!knownLids.has(senderJid)) { knownLids.add(senderJid); saveLids(); }
      return true;
    }
    if (knownLids.has(senderJid)) return true;
    if (knownLids.size === 0) {
      knownLids.add(senderJid);
      saveLids();
      console.log(`  ✓ Auto-trusted first LID: ${senderJid}`);
      return true;
    }
    console.log(`  ⚠ Rejecting unknown LID: ${senderJid}`);
    return false;
  }

  if (senderJid.endsWith('@g.us')) return false;
  return false;
}

// ── Message splitting ─────────────────────────────────────────

function splitMessage(text, maxLen = 4000) {
  if (!text || text.length <= maxLen) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= maxLen) { chunks.push(rest); break; }
    let at = rest.lastIndexOf('\n', maxLen);
    if (at < maxLen * 0.5) at = rest.lastIndexOf(' ', maxLen);
    if (at < maxLen * 0.3) at = maxLen;
    chunks.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  return chunks;
}

// ── Response formatting ───────────────────────────────────────

/**
 * Clean response text from DOM scraping.
 * 
 * IMPORTANT: Does NOT strip code blocks or code lines.
 * The AI's code answers must pass through intact.
 * Only strips standalone UI junk labels.
 */
function formatResponse(text) {
  if (!text) return '';

  let cleaned = text;

  // Strip CSS selector blocks: .class-name { ... }
  cleaned = cleaned.replace(/\.[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*\s*\{[^}]*\}/gi, '');
  // Strip standalone CSS property lines
  cleaned = cleaned.replace(/^[a-z-]+:\s*[^;]+;\s*$/gm, '');

  // Strip standalone UI junk (lines that are ONLY a UI label)
  const standaloneJunk = [
    /^Review Changes$/gm,
    /^\d+ Files? With Changes$/gm,
    /^Always run$/gm,
    /^Running\.?$/gm,
    /^Working\.?$/gm,
    /^Cancel$/gm,
    /^Open$/gm,
    /^Generating\.?$/gm,
    /^Thought for \d+s?$/gm,
    /^Analyzed$/gm,
    /^Edited$/gm,
    /^Background Steps$/gm,
    /^Progress Updates$/gm,
    /^Collapse all$/gm,
    /^Expand all$/gm,
    /^0 Files With Changes$/gm,
    /^Ask anything.*$/gm,
    /^Conversation mode$/gm,
    /^Step Id: \d+$/gm,
    /^tool call completed$/gm,
    /^task_boundary$/gm,
  ];

  for (const pattern of standaloneJunk) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Clean whitespace
  cleaned = cleaned
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

function sanitize(input) {
  if (!input) return '';
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { isAllowed, splitMessage, formatResponse, sanitize, timestamp, sleep };
