// src/run.js
import dotenv from 'dotenv';
dotenv.config();

import { detectPrefix } from './parser.js';
import {
  getLatestCommitMessage,
  getLatestCommitDiff,
  getLatestCommitHash
} from './extractor.js';
import { generateAIChangelog } from './ai.js';
import { formatChangelogEntry } from './formatter.js';
import { appendToChangelog } from './updater.js';
import { exec as _exec } from 'child_process';
import { promisify } from 'util';
const exec = promisify(_exec);

/**
 * run
 * Orchestrates the changelog generation.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.force=false] - Force generation even if no prefix detected
 * @param {boolean} [opts.verbose=false] - Verbose logging
 * @returns {Promise<{changed:boolean, path?:string, error?:string}>}
 */
export default async function run(opts = {}) {
  const force = !!(opts.force || process.env.AUTO_CHANGELOG_FORCE === '1' || process.env.FORCE === '1');
  const verbose = !!(opts.verbose || process.env.AUTO_CHANGELOG_VERBOSE === '1');

  function log(...args) {
    if (verbose) console.log('[auto-changelog-ai]', ...args);
  }

  try {
    log('Starting changelog run. force=', force);

    // 1) Read git data
    const commitMessage = await getLatestCommitMessage();
    if (!commitMessage) {
      console.log('No commit message found. Exiting.');
      return { changed: false };
    }
    log('Latest commit first line:', commitMessage.split('\n')[0]);

    const detection = detectPrefix(commitMessage);
    if (!detection && !force) {
      console.log('No configured prefix detected in latest commit. Use --force to override. Exiting.');
      return { changed: false };
    }

    if (!detection && force) {
      console.log('No prefix detected but running because force=true.');
    } else {
      console.log('Detected prefix:', detection.prefix);
    }

    // 2) Extract hash + diff
    const commitHash = await getLatestCommitHash();
    const diff = await getLatestCommitDiff(); // may be empty string

    log('Commit hash:', commitHash);
    log('Diff length:', diff ? diff.length : 0);

    // 2.5) Helpful check for Gemini auth (avoid confusing stack traces)
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.warn(
        '[auto-changelog-ai] Warning: No Gemini/Google credentials detected. ' +
        'Set GEMINI_API_KEY in your .env or configure Application Default Credentials (ADC) for local testing/CI.\n' +
        'See: https://cloud.google.com/docs/authentication/getting-started'
      );
      // We do NOT abort — generateAIChangelog should handle the error and return fallback content,
      // but we warn so the user knows why the AI call may fail.
    }

    // 3) Call AI
    console.log('Generating changelog entry via AI...');
    const aiResult = await generateAIChangelog(commitMessage, diff);
    log('AI result (raw):', aiResult);

    // Validate aiResult shape minimally
    if (!aiResult || typeof aiResult !== 'object') {
      console.warn('AI returned an unexpected result. Using fallback text.');
    }

    // 4) Format entry and append
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // IMPORTANT: formatChangelogEntry is async, must await
    const entry = await formatChangelogEntry(aiResult || {}, commitHash, date);

    log('Formatted changelog entry preview:\n', (typeof entry === 'string') ? entry.slice(0, 400) : String(entry).slice(0, 400));

    // appendToChangelog returns { path, changed }
    const result = await appendToChangelog(entry);
    if (result && result.path) {
      console.log(`Changelog updated: ${result.path} (changed=${result.changed})`);
    } else {
      console.log('Changelog append result:', result);
    }

    // 5) If running in CI, commit & push the changelog change (best-effort)
    if (process.env.GITHUB_ACTIONS || process.env.CI) {
      log('Detected CI environment. Attempting to commit & push CHANGELOG.md (best-effort).');
      try {
        await exec('git config user.name "github-actions[bot]" || true');
        await exec('git config user.email "github-actions[bot]@users.noreply.github.com" || true');
        await exec('git add CHANGELOG.md || true');
        await exec('git diff --staged --quiet || git commit -m "chore: update changelog [CI]" || true');

        const ciPushToken = process.env.CI_PUSH_TOKEN || process.env.GITHUB_TOKEN || process.env.PERSONAL_TOKEN;
        if (ciPushToken) {
          const repo = process.env.GITHUB_REPOSITORY;
          const refName = process.env.GITHUB_REF_NAME || (process.env.GITHUB_REF && process.env.GITHUB_REF.replace('refs/heads/', '')) || 'main';
          if (repo) {
            const remote = `https://x-access-token:${ciPushToken}@github.com/${repo}.git`;
            await exec(`git push "${remote}" HEAD:${refName} || true`);
            console.log('Pushed changelog changes to remote (via token).');
          } else {
            await exec('git push || true');
            console.log('Pushed changelog changes (no repo variable available).');
          }
        } else {
          await exec('git push || true');
          console.log('Attempted to push changelog changes (no token provided).');
        }
      } catch (ciErr) {
        console.warn('CI commit/push step failed (non-fatal):', ciErr.message || ciErr);
      }
    }

    return { changed: true, path: result?.path || null };
  } catch (err) {
    console.error('auto-changelog-ai run error:', err instanceof Error ? err.message : String(err));
    return { changed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// If executed directly (node ./src/run.js), call run() with env flags
if (process.argv[1] && process.argv[1].endsWith('run.js')) {
  const opts = {
    force: process.env.AUTO_CHANGELOG_FORCE === '1' || process.env.FORCE === '1',
    verbose: process.env.AUTO_CHANGELOG_VERBOSE === '1'
  };
  run(opts).catch((e) => {
    console.error('Uncaught error in run:', e);
    process.exit(2);
  });
}
