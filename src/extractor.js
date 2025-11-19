// src/extractor.js
// ESM module - responsible for extracting latest git commit data (message, short hash, diff).
//
// Exports:
// - getLatestCommitMessage(): Promise<string>
// - getLatestCommitHash(): Promise<string>   (short, e.g. abc1234)
// - getLatestCommitDiff(): Promise<string>
//
// Notes:
// - Uses `git` CLI via child_process.exec (promisified).
// - Resilient: returns empty strings or sensible fallbacks instead of throwing where appropriate,
//   but will throw for critical failures so callers can handle them.
// - Avoids hard-coded paths; operates on current working directory.

import { promisify } from 'util';
import { exec as cpExec } from 'child_process';

const exec = promisify(cpExec);

// Helper to run git commands. Returns stdout string (trimmed) or throws.
async function runGit(cmd) {
  try {
    // increase maxBuffer to be safe for large diffs
    const { stdout } = await exec(`git ${cmd}`, { maxBuffer: 10 * 1024 * 1024 });
    return String(stdout || '').trim();
  } catch (err) {
    // Re-throw with context so callers can decide to fallback
    const message = err && err.message ? err.message : String(err);
    throw new Error(`Git command failed ("git ${cmd}"): ${message}`);
  }
}

/**
 * Get the full commit message of HEAD (including body).
 * Tries `git log -1 --pretty=%B`.
 * If git fails, returns empty string.
 */
export async function getLatestCommitMessage() {
  try {
    const out = await runGit('log -1 --pretty=%B');
    return out;
  } catch (err) {
    // Non-fatal: log warning and return empty string so caller can decide
    console.warn('[auto-changelog-ai] Warning: could not read latest commit message:', err.message);
    return '';
  }
}

/**
 * Get short commit hash for HEAD (like `abc1234`).
 * Tries `git rev-parse --short HEAD`.
 * Throws if not available (hash is important downstream).
 */
export async function getLatestCommitHash() {
  try {
    const out = await runGit('rev-parse --short HEAD');
    return out || '';
  } catch (err) {
    // For many flows, a missing hash is unexpected; surface as error to caller
    throw new Error('Failed to obtain latest commit hash: ' + err.message);
  }
}

/**
 * Get the diff of the latest commit (HEAD).
 * Uses `git show HEAD --pretty=format: --unified=3` to get only the patch with limited context.
 * If it fails (e.g., not a git repo), returns empty string and logs a warning.
 */
export async function getLatestCommitDiff() {
  try {
    const out = await runGit('show HEAD --pretty=format: --unified=3');
    // If diff is very large, consider trimming to a sensible max length while keeping start/end context.
    const MAX_CHARS = 20000; // safety cap to avoid sending enormous diffs to the model
    if (out.length > MAX_CHARS) {
      // Keep the start and end parts for context
      const head = out.slice(0, 9000);
      const tail = out.slice(-9000);
      const trimmed = `${head}\n\n...TRIMMED_DIFF...\n\n${tail}`;
      return trimmed;
    }
    return out;
  } catch (err) {
    console.warn('[auto-changelog-ai] Warning: could not read commit diff (continuing with empty diff):', err.message);
    return '';
  }
}
