import { executeControlVerb, type ControlVerb } from './provider-control.js';

const VERBS: readonly ControlVerb[] = ['status', 'reprobe', 'disable', 'enable', 'clear-evidence'];

function parseArgs(argv: string[]): { verb: ControlVerb; providerId: string } {
  const [verb, providerId] = argv;
  if (!verb || !VERBS.includes(verb as ControlVerb)) {
    throw new Error(`Usage: npm run provider:control -- <${VERBS.join('|')}> <providerId>`);
  }
  if (!providerId) {
    throw new Error('A providerId is required, e.g. browser-gemini-free.');
  }
  return { verb: verb as ControlVerb, providerId };
}

async function main(): Promise<void> {
  try { process.loadEnvFile?.(); } catch { /* optional .env */ }
  const { verb, providerId } = parseArgs(process.argv.slice(2));
  const result = await executeControlVerb(verb, providerId);
  console.log(result.message);
  if (!result.ok) process.exitCode = 1;
}

const isMain = import.meta.url.startsWith('file:')
  && (process.argv[1]?.endsWith('provider-control-cli.ts') || process.argv[1]?.endsWith('provider-control-cli.js'));

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
