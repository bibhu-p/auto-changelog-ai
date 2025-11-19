// src/updater.js
// ESM module - responsible for creating/ensuring CHANGELOG.md and appending new entries.
// Exports:
// - appendToChangelog(entry, opts) -> Promise<{ path: string, changed: boolean }>
//
// Behavior:
// - Creates CHANGELOG.md with a header if it does not exist.
// - Avoids duplicate entries by doing a simple substring check (if the exact entry already exists, won't append).
// - Writes atomically via a temp file + rename to reduce risk of partial writes.
// - Respects cwd (no hard-coded repo paths).
// - Returns the absolute path and whether a change was made.

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const DEFAULT_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

`;

/**
 * Append an entry to CHANGELOG.md (creates file if missing).
 *
 * @param {string} entry - fully formatted markdown entry (should include surrounding newlines if desired)
 * @param {{ changelogPath?: string, header?: string, dedupe?: boolean }} opts
 * @returns {Promise<{ path: string, changed: boolean }>}
 */
export async function appendToChangelog(entry, opts = {}) {
  const changelogPath = path.resolve(process.cwd(), opts.changelogPath || 'CHANGELOG.md');
  const header = typeof opts.header === 'string' ? opts.header : DEFAULT_HEADER;
  const dedupe = opts.dedupe === undefined ? true : Boolean(opts.dedupe);

  if (!entry || String(entry).trim().length === 0) {
    throw new Error('appendToChangelog: entry must be a non-empty string');
  }

  // Normalize entry: ensure it ends with a single newline
  let normalizedEntry = String(entry);
  normalizedEntry = normalizedEntry.replace(/\r\n/g, '\n');
  if (!/\n$/.test(normalizedEntry)) normalizedEntry += '\n';
  // Ensure there is a blank line separating previous content and the new entry
  normalizedEntry = '\n' + normalizedEntry;

  try {
    // Ensure parent dir exists (usually cwd, but handle nested paths)
    const parent = path.dirname(changelogPath);
    try {
      await fs.mkdir(parent, { recursive: true });
    } catch (err) {
      // ignore mkdir errors (unlikely)
    }

    // If file doesn't exist, create with header
    let existing = '';
    try {
      existing = await fs.readFile(changelogPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Create file with header
        await writeAtomic(changelogPath, header + '\n'); // ensure header ends with newline(s)
        existing = header + '\n';
      } else {
        // Other read error -> surface
        throw err;
      }
    }

    // Dedupe: if exact entry already in file, skip
    if (dedupe && existing.includes(normalizedEntry.trim())) {
      return { path: changelogPath, changed: false };
    }

    // Append new entry to end
    const newContent = existing.replace(/\s*$/u, '') + '\n\n' + normalizedEntry.trim() + '\n';
    await writeAtomic(changelogPath, newContent);

    return { path: changelogPath, changed: true };
  } catch (err) {
    throw new Error('Failed to append to CHANGELOG.md: ' + (err && err.message ? err.message : String(err)));
  }
}

/**
 * Atomically write contents to targetPath by writing to a tmp file then renaming.
 * This reduces the odds of leaving a partial file on failure.
 *
 * @param {string} targetPath
 * @param {string} contents
 */
async function writeAtomic(targetPath, contents) {
  const dir = path.dirname(targetPath);
  const name = path.basename(targetPath);
  // Use process.pid and timestamp to avoid collisions
  const tmpName = `.${name}.${process.pid}.${Date.now()}.tmp`;
  const tmpPath = path.join(dir, tmpName);

  // Write tmp file with restrictive permissions
  await fs.writeFile(tmpPath, contents, { encoding: 'utf8', mode: 0o644 });
  // Rename over target (atomic on most POSIX systems)
  await fs.rename(tmpPath, targetPath);
}
