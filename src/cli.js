#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import run from './run.js';
import { argv } from 'process';

function parseArgs(args) {
  const flags = {
    help: false,
    force: false, // force generation even if no prefix is detected
    verbose: false
  };

  for (const a of args) {
    if (a === '--help' || a === '-h') flags.help = true;
    if (a === '--force' || a === '-f') flags.force = true;
    if (a === '--verbose' || a === '-v') flags.verbose = true;
  }
  return flags;
}

async function cli() {
  const args = argv.slice(2);
  const flags = parseArgs(args);

  if (flags.help) {
    console.log(`auto-changelog-ai — CLI
Usage:
  auto-changelog-ai [options]

Options:
  -h, --help       Show this help
  -f, --force      Force changelog generation even if no prefix detected
  -v, --verbose    Increase logging

Examples:
  auto-changelog-ai
  auto-changelog-ai --force
`);
    process.exit(0);
  }

  try {
    // run() should accept an options object for CLI control (we'll pass flags)
    // run() currently ignores args; but if you want CLI control, we'll update run.js later.
    // For now we expose flags on process.env for minimal change.
    if (flags.force) process.env.AUTO_CHANGELOG_FORCE = '1';
    if (flags.verbose) process.env.AUTO_CHANGELOG_VERBOSE = '1';

    await run();
    process.exit(0);
  } catch (err) {
    console.error('auto-changelog-ai CLI error:', err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

cli();
