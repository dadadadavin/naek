/**
 * naek — Utility functions
 * Formatting, splitting, security helpers
 */

/**
 * Check if a sender JID is in the allowed phone list
 */
function isAllowed(senderJid, allowedPhone) {
  if (!allowedPhone) return true;
  // Clean JID: remove suffixes, colons (multi-device), and plus signs
  const cleaned = senderJid
    .split('@')[0]     // Remove @s.whatsapp.net, @g.us, @lid
    .split(':')[0]     // Remove device ID suffix (e.g. 1234:2@s.whatsapp.net)
    .replace('+', ''); // Remove leading plus if present
  
  // Allow comma-separated list
  const allowedList = allowedPhone.split(',').map(p => p.trim().replace('+', ''));
  return allowedList.includes(cleaned);
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
 * - Trims excessive whitespace
 * - Cleans up code block formatting
 */
function formatResponse(text) {
  if (!text) return '';
  
  let cleaned = text.trim();
  
  // Remove known IDE artifacts that get caught by the TreeWalker
  const artifacts = [
    "Review Changes",
    /\d+ Files? With Changes/g,
    /Running background command\nOpen\n.*?\n>\n\nnode.*?\nAlways run\nCancel\nRunning/g,
    /Running command\nOpen\n.*?\nAlways run\nExit code 0/g,
    /Background Steps\n.*?\nCancel/g,
    /Progress Updates\nCollapse all/g,
    /Ask anything, @ to mention, \/ for workflows/g,
    /Gemini 3.1 Pro \(High\)/g,
    /Conversation mode/g,
    /Planning/g,
    /Fast/g,
    "Thought for",
    "Analyzed",
    "Task",
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
  
  // Clean up excessive newlines caused by the line-by-line walker
  // Replace 3+ newlines with 2 newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned
    // Collapse multiple blank lines to max 2 (after initial cleanup)
    .replace(/\n{4,}/g, '\n\n\n')
    // Trim each line
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
