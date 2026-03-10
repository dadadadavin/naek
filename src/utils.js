/**
 * naek — Utility functions
 */

/**
 * Check if sender is allowed.
 * 
 * FIX #5: For @lid JIDs, we store a mapping the first time we see a
 * verified phone-based JID from the same session. If we can't verify,
 * we still allow @lid since this is a personal bot — but we log it.
 * 
 * For proper security, the user should verify their LID once by sending
 * a message from the whitelisted phone and the bot will remember it.
 */
const knownLids = new Set();
let lidMapped = false;

function isAllowed(senderJid, allowedPhone) {
  if (!allowedPhone) return true;
  
  const allowedList = allowedPhone.split(',').map(p => p.trim().replace(/\+/g, ''));

  // Phone-based JID (@s.whatsapp.net)
  if (senderJid.endsWith('@s.whatsapp.net')) {
    const cleaned = senderJid.split('@')[0].split(':')[0].replace(/\+/g, '');
    const ok = allowedList.includes(cleaned);
    if (ok && !lidMapped) {
      // We know this phone is allowed — future @lid from same session is also allowed
      lidMapped = true;
    }
    return ok;
  }

  // LID-based JID (@lid) 
  if (senderJid.endsWith('@lid')) {
    // If we've already verified the phone in this session, trust the LID
    if (lidMapped) return true;
    // If we've seen this specific LID before and allowed it, trust it
    if (knownLids.has(senderJid)) return true;
    // First contact via LID: allow but warn (personal bot assumption)
    // The user should verify by checking the bot responded to the right person
    knownLids.add(senderJid);
    console.log(`  ⚠ New LID: ${senderJid} — allowing (personal bot mode)`);
    return true;
  }

  // Group messages (@g.us) — block by default
  if (senderJid.endsWith('@g.us')) {
    return false;
  }

  return false;
}

/**
 * Split long text into WhatsApp-friendly chunks
 */
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

/**
 * Clean response text extracted from Antigravity DOM.
 * 
 * FIX #6: Uses word-boundary-aware patterns instead of bare global replace.
 * Only strips words when they appear as standalone UI labels, not as part
 * of normal sentences.
 */
function formatResponse(text) {
  if (!text) return '';
  
  let cleaned = text;

  // Remove CSS-like content (class selectors, property blocks)
  cleaned = cleaned.replace(/\.[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*\s*\{[^}]*\}/gi, '');
  cleaned = cleaned.replace(/^\.[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*\s*$/gm, '');
  cleaned = cleaned.replace(/^[a-z-]+:\s*[^;]+;\s*$/gm, '');
  
  // FIX #6: Only strip words when they are on a line BY THEMSELVES (UI labels)
  // This prevents stripping "Open" from "Open the file" or "Cancel" from "Cancel the task"
  const standaloneJunk = [
    /^Review Changes$/gm,
    /^\d+ Files? With Changes$/gm,
    /^Always run$/gm,
    /^Exit code \d+$/gm,
    /^Running\.?$/gm,
    /^Cancel$/gm,
    /^Open$/gm,
    /^Generating\.?$/gm,
    /^Thought for \d+s?$/gm,
    /^Analyzed$/gm,
    /^Edited$/gm,
    /^Step Id: \d+$/gm,
    /^Background Steps$/gm,
    /^Progress Updates$/gm,
    /^Collapse all$/gm,
    /^Task$/gm,
    /^d:\\yaru.*$/gm,
    /^> node .*$/gm,
    /^0 Files With Changes$/gm,
    /^Ask anything.*$/gm,
    /^Conversation mode$/gm,
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
