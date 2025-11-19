// src/parser.js
// ESM module - responsible for detecting configured commit prefixes and parsing commit message.
//
// Exports:
// - loadPrefixesFromEnv(): string[]       // read PREFIXES env var (comma-separated)
// - detectPrefix(commitMessage, prefixes?) // returns { prefix, scope, content, rawLine } or null
//
// Behavior notes:
// - Matches prefixes case-insensitively.
// - Supports conventional commit style: `feat(scope): description` and simple `feat: description`.
// - Only inspects the first non-empty line of the commit message.
// - If no prefix matches, returns null (the caller can use a force flag to override).

/**
 * Read PREFIXES from environment and return sanitized array.
 * Defaults to `changelog:,feat:,fix:,refactor:,docs:` if not set.
 * Each prefix may optionally end with a colon; this function normalizes to no-trailing-colon.
 * @returns {string[]}
 */
export function loadPrefixesFromEnv() {
  const raw = typeof process.env.PREFIXES === 'string' && process.env.PREFIXES.trim().length > 0
    ? process.env.PREFIXES
    : 'changelog:,feat:,fix:,refactor:,docs:';

  return raw
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => p.replace(/:$/u, '').toLowerCase()); // normalize and lower-case
}

/**
 * Detects a configured prefix in the commit message.
 *
 * @param {string} commitMessage - full commit message (may contain multiple lines)
 * @param {string[]|null} prefixes - optional array of normalized prefixes (without trailing colon). If omitted, loads from env.
 * @returns {{ prefix: string, scope: string|null, content: string, rawLine: string } | null}
 *          - prefix: matched prefix (normalized, lower-case)
 *          - scope: the scope if present in conventional commit style (e.g. "api" from feat(api): ...)
 *          - content: remaining message content (trimmed). If empty, returns full first line as content.
 *          - rawLine: the raw first non-empty line from the commit message
 */
export function detectPrefix(commitMessage, prefixes = null) {
  if (!commitMessage || typeof commitMessage !== 'string') return null;

  if (!prefixes) prefixes = loadPrefixesFromEnv();
  // sanitize prefixes (ensure lower-case, no trailing colon)
  prefixes = prefixes.map(p => String(p).trim().replace(/:$/u, '').toLowerCase()).filter(Boolean);
  if (prefixes.length === 0) return null;

  // take first non-empty line
  const lines = commitMessage.split(/\r?\n/);
  let firstLine = '';
  for (const ln of lines) {
    const t = ln.trim();
    if (t.length > 0) {
      firstLine = t;
      break;
    }
  }
  if (!firstLine) return null;

  const rawLine = firstLine;

  // Build regex to match either:
  //  - prefix(scope): rest
  //  - prefix: rest
  //  - prefix rest   (less strict, but only if prefix is separated by space)
  // We want case-insensitive matching.
  // Create alternation group for prefixes: e.g. (feat|fix|docs)
  const alt = prefixes.map(p => escapeRegex(p)).join('|');
  // Regex explanation:
  // ^\s*(prefix)(\([^)]+\))?\s*:\s*(.*)$    -> conventional with colon
  // ^\s*(prefix)(\([^)]+\))?\s+\s*(.*)$    -> prefix followed by space (fallback)
  const reColon = new RegExp(`^(${alt})(?:\\(([^)]+)\\))?\\s*:\\s*(.*)$`, 'i');
  const reSpace = new RegExp(`^(${alt})(?:\\(([^)]+)\\))?\\s+(.+)$`, 'i');

  let m = firstLine.match(reColon);
  if (!m) m = firstLine.match(reSpace);

  if (!m) {
    // No match
    return null;
  }

  // m[1] = prefix, m[2] = scope (optional), m[3] = rest/content
  const matchedPrefix = String(m[1]).toLowerCase();
  const scope = m[2] ? String(m[2]).trim() : null;
  const content = m[3] ? String(m[3]).trim() : '';

  return {
    prefix: matchedPrefix,
    scope,
    content: content || rawLine,
    rawLine
  };
}

/**
 * Escape a string for safe use inside a RegExp pattern (literal).
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
