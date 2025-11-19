// src/formatter.js
// ESM module - formats an AI-generated changelog entry into the project's CHANGELOG.md markdown format.
//
// Exports:
// - formatChangelogEntry(aiOutput, commitHash, dateString = null, opts = {}) -> Promise<string>
//
// Behavior:
// - Produces the exact markdown structure required by the project:
//     ## <title> (<YYYY-MM-DD>)
//
//     **Summary:**  
//     <description>
//
//     **Technical Explanation:**  
//     <explanation>
//
//     **Commit:** <hash or link>
//
// - Sanitizes inputs, trims excessive whitespace, and enforces safe lengths so changelog entries remain readable.
// - If GITHUB_REPOSITORY env var is present, commit will be rendered as a link to the commit on GitHub.
// - Returns a Promise<string> (async for consistency with async/await usage across the project).

/**
 * @param {{title?:string, description?:string, explanation?:string}} aiOutput
 * @param {string} commitHash
 * @param {string|null} dateString - optional YYYY-MM-DD. If not provided, uses current date in UTC YYYY-MM-DD.
 * @param {{maxTitle?:number, maxDescription?:number, maxExplanation?:number}} opts
 * @returns {Promise<string>}
 */
export async function formatChangelogEntry(aiOutput = {}, commitHash = '', dateString = null, opts = {}) {
  const maxTitle = opts.maxTitle || 120;
  const maxDescription = opts.maxDescription || 1000;
  const maxExplanation = opts.maxExplanation || 3000;

  // Helpers
  const safeString = (s) => {
    if (s === null || s === undefined) return '';
    // Normalize line endings and trim
    let out = String(s).replace(/\r\n/g, '\n').trim();
    // Collapse repeated empty lines to at most one
    out = out.replace(/\n{3,}/g, '\n\n');
    return out;
  };

  const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1).trim() + '…' : s);

  // Ensure we have values
  const rawTitle = safeString(aiOutput.title || aiOutput.t || '');
  const rawDescription = safeString(aiOutput.description || aiOutput.desc || '');
  const rawExplanation = safeString(aiOutput.explanation || aiOutput.explain || '');

  const title = truncate(rawTitle || deriveTitleFromFallback(aiOutput), maxTitle) || 'Update';
  const description = truncate(rawDescription || deriveDescriptionFromFallback(aiOutput), maxDescription) || 'No summary available.';
  const explanation = truncate(rawExplanation || deriveExplanationFromFallback(aiOutput), maxExplanation) || 'No technical explanation available.';

  // Date in YYYY-MM-DD (UTC)
  const date = dateString ? String(dateString) : new Date().toISOString().slice(0, 10);

  // Prepare commit display: if GITHUB_REPOSITORY present, link to commit
  const hash = (commitHash || '').toString().trim() || 'unknown';
  const repo = process.env.GITHUB_REPOSITORY || process.env.NPM_PACKAGE_REPOSITORY || null;
  const commitDisplay = (repo && hash && hash !== 'unknown')
    ? `[\`${hash}\`](https://github.com/${repo}/commit/${hash})`
    : `\`${hash}\``;

  // Construct markdown with exact formatting required
  // Use two spaces before newline after the Summary and Technical Explanation headings for markdown line-break behavior
  const entry = [
    `## ${escapeMarkdownInline(title)} (${date})`,
    '',
    `**Summary:**  `,
    `${escapeMarkdownBlock(description)}`,
    '',
    `**Technical Explanation:**  `,
    `${escapeMarkdownBlock(explanation)}`,
    '',
    `**Commit:** ${commitDisplay}`,
    ''
  ].join('\n');

  return entry;
}

/**
 * Escape inline markdown-sensitive characters for headings / inline text.
 * We keep it minimal so the AI content remains readable. This prevents accidental heading breaks.
 */
function escapeMarkdownInline(s) {
  // Remove stray leading/trailing hashes that may create headings, and trim
  let out = String(s).trim();
  // If the line starts with '#', prefix with a zero-width space character to avoid creating sub-headings
  if (/^#+\s*/.test(out)) out = '\u200B' + out;
  // Avoid unclosed backticks: replace backticks with a similar character
  out = out.replace(/`/g, 'ˋ');
  return out;
}

/**
 * Escape block content but preserve paragraphs and code fences.
 * - Ensures no accidental ``` fences appear (replace with backtick alternatives).
 */
function escapeMarkdownBlock(s) {
  let out = String(s);
  // Replace triple backticks to avoid ending/starting code blocks unexpectedly
  out = out.replace(/```/g, 'ˋˋˋ');
  // Replace isolated backticks to avoid inline code issues
  out = out.replace(/`/g, 'ˋ');
  // Trim trailing/leading whitespace
  out = out.trim();
  // Ensure paragraphs are separated by single blank line
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

function deriveTitleFromFallback(aiOutput) {
  // Try to infer a short title from content
  const candidates = [
    aiOutput.title,
    (aiOutput.description || '').split('\n')[0],
    (aiOutput.explanation || '').split('\n')[0]
  ].filter(Boolean);
  return (candidates[0] || '').slice(0, 80).trim();
}

function deriveDescriptionFromFallback(aiOutput) {
  if (aiOutput.description) return aiOutput.description;
  const candidate = (aiOutput.explanation || '').split('\n').slice(0, 2).join(' ');
  return candidate || '';
}

function deriveExplanationFromFallback(aiOutput) {
  if (aiOutput.explanation) return aiOutput.explanation;
  return (aiOutput.description || '') || '';
}
