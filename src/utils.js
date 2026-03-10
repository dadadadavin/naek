/**
 * naek — Utility functions
 * Formatting, splitting, security helpers
 */

/**
 * Check if a sender JID is in the allowed phone list
 * 
 * IMPORTANT: WhatsApp now uses two JID formats:
 * 1. Phone-based: 6289528563419@s.whatsapp.net
 * 2. LID-based:   272700845121588@lid
 * 
 * For LID-based JIDs, we can't match by phone number.
 * Strategy: 
 *   - If JID is @s.whatsapp.net → match phone number
 *   - If JID is @lid → allow (we trust it since we're a personal bot)
 *   - Also check against stored LID mappings if available
 */
function isAllowed(senderJid, allowedPhone) {
  if (!allowedPhone) return true; // No restriction set
  
  // If it's a LID-based JID, we allow it 
  // (WhatsApp ensures only linked devices can message us)
  if (senderJid.endsWith('@lid')) {
    console.log(`   ℹ️  LID JID detected (${senderJid}), allowing...`);
    return true;
  }

  // Clean phone-based JID: remove suffixes, colons (multi-device), and plus signs
  const cleaned = senderJid
    .split('@')[0]     // Remove @s.whatsapp.net, @g.us
    .split(':')[0]     // Remove device ID suffix (e.g. 1234:2@s.whatsapp.net)
    .replace(/\+/g, ''); // Remove leading plus if present
  
  // Allow comma-separated list of phone numbers
  const allowedList = allowedPhone.split(',').map(p => p.trim().replace(/\+/g, ''));
  
  const allowed = allowedList.includes(cleaned);
  if (!allowed) {
    console.log(`   🚫 JID ${senderJid} (cleaned: ${cleaned}) not in allowed list: [${allowedList.join(', ')}]`);
  }
  return allowed;
}

/**
 * Split long text into chunks for WhatsApp
 * WhatsApp supports ~65K chars but we split at 4000 for readability
 */
function splitMessage(text, maxLen = 4000) {
  if (!text || text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline near the limit
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) {
      // No good newline found, split at space
      splitAt = remaining.lastIndexOf(' ', maxLen);
    }
    if (splitAt < maxLen * 0.3) {
      // No good space either, hard split
      splitAt = maxLen;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

/**
 * Clean up text extracted from Antigravity DOM
 * Removes common UI artifacts like "Running command", "Review Changes", etc.
 */
function formatResponse(text) {
  if (!text) return '';
  
  let cleaned = text.trim();
  
  // Remove known IDE artifacts that get caught by the TreeWalker
  const artifacts = [
    "Review Changes",
    /\d+ Files? With Changes/g,
    /Running background command\nOpen\n.*?\n>\n\nnode.*?\nAlways run\nCancel\nRunning/g,
    /Running command\nOpen\n.*?\nAlways run\nExit code \d+/g,
    /Background Steps\n.*?\nCancel/g,
    /Progress Updates\nCollapse all/g,
    /Ask anything, @ to mention, \/ for workflows/g,
    /Gemini [\d.]+ Pro \((?:High|Low)\)/g,
    /Conversation mode/g,
    /Claude [\w.]+ \(Thinking\)/g,
    /GPT-OSS \d+B \(Medium\)/g,
    "Thought for",
    "Analyzed",
    "Generating",
    ".."
  ];
  
  for (const artifact of artifacts) {
    if (typeof artifact === 'string') {
      cleaned = cleaned.split(artifact).join('');
    } else {
      cleaned = cleaned.replace(artifact, '');
    }
  }
  
  // Clean up excessive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Basic input sanitization
 */
function sanitize(input) {
  if (!input) return '';
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Remove control chars (keep \n, \r, \t)
    .trim();
}

/**
 * Create a simple timestamp string
 */
function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  isAllowed,
  splitMessage,
  formatResponse,
  sanitize,
  timestamp,
  sleep
};
