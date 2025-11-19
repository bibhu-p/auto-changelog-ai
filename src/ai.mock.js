export async function generateAIChangelog(commitMessage, diff) {
  return {
    title: `TEST: ${String(commitMessage).split('\\n')[0].slice(0,60)}`,
    description: 'Mocked summary: verifying pipeline.',
    explanation: 'Mocked explanation: no external AI call was made.'
  };
}
