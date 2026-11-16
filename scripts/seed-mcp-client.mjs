#!/usr/bin/env node
/** Operator-only static client bootstrap. No dotenv, HTTP admin API, secret output or implicit target. */
import { open, realpath, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_KEYS = ['APP_BASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_DATABASE_URL', 'BETTER_AUTH_DATABASE_CA', 'BETTER_AUTH_WEBSITE_CLIENT_ID', 'BETTER_AUTH_MCP_CLIENT_ID', 'BETTER_AUTH_MCP_CLIENT_SECRET'];
export async function readPrivateFile(filename) {
  const path = await realpath(filename);
  const inRepo = relative(root, path);
  if (!inRepo.startsWith('..') && !isAbsolute(inRepo)) throw Error('Secret files must be outside the checkout');
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.() || stat.size > 32_768) throw Error('Use an owner-only regular file (0600)');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
export function validateBootstrap(config, callbacks, confirmation) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Invalid bootstrap configuration');
  if (Object.keys(config).some(key => !CONFIG_KEYS.includes(key))) throw Error('Unsupported configuration key');
  for (const key of CONFIG_KEYS.filter(key => key !== 'BETTER_AUTH_DATABASE_CA')) if (typeof config[key] !== 'string' || !config[key]) throw Error('Incomplete bootstrap configuration');
  const origin = new URL(config.APP_BASE_URL), db = new URL(config.BETTER_AUTH_DATABASE_URL);
  if (origin.origin !== confirmation.origin || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password
    || config.BETTER_AUTH_MCP_CLIENT_ID !== confirmation.clientId || !confirmation.operatorId || confirmation.operatorId.length > 255) throw Error('Target confirmation does not match configuration');
  const local = ['localhost', '127.0.0.1', '[::1]'];
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local.includes(origin.hostname) && local.includes(db.hostname))) throw Error('HTTPS is required outside local tests');
  if (!['postgres:', 'postgresql:'].includes(db.protocol)) throw Error('Invalid authentication storage');
  if (!Array.isArray(callbacks) || callbacks.length < 1 || callbacks.length > 3 || new Set(callbacks).size !== callbacks.length) throw Error('Provide one to three exact callback URLs');
  for (const value of callbacks) {
    if (typeof value !== 'string' || /[\s*\\]/.test(value)) throw Error('Exact callback URLs required');
    const url = new URL(value);
    if (url.username || url.password || url.hash || url.href !== value || url.searchParams.has('code') || url.searchParams.has('state')
      || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local.includes(url.hostname) && local.includes(origin.hostname)))) throw Error('Invalid exact callback URL');
  }
  return { origin: origin.origin, clientId: config.BETTER_AUTH_MCP_CLIENT_ID, operatorId: confirmation.operatorId, callbacks };
}

async function main(argv) {
  if (argv.includes('--help')) { console.log('Usage: node scripts/seed-mcp-client.mjs --config-file /private/config.json --cookie-file /private/session-cookie.txt --callbacks-file /private/callbacks.json --origin https://your-site --client-id exact-client --operator-id verified-user-id [--enable-portfolio-sync] [--apply]\nOptional sync scope requires this explicit flag and separate user OAuth consent. Default: validate and show the exact nonsecret target only. --apply verifies the operator session and creates the static MCP registration; existing differing registrations are refused.'); return; }
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--apply') { args.apply = true; continue; }
    if (key === '--enable-portfolio-sync') { args.enablePortfolioSync = true; continue; }
    if (!['--config-file', '--cookie-file', '--callbacks-file', '--origin', '--client-id', '--operator-id'].includes(key) || args[key] || !argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('Invalid arguments; use --help');
    args[key] = argv[++i];
  }
  for (const key of ['--config-file', '--cookie-file', '--callbacks-file', '--origin', '--client-id', '--operator-id']) if (!args[key]) throw Error('Missing arguments; use --help');
  const config = JSON.parse(await readPrivateFile(args['--config-file']));
  const callbacks = JSON.parse(await readPrivateFile(args['--callbacks-file']));
  const target = { ...validateBootstrap(config, callbacks, { origin: args['--origin'], clientId: args['--client-id'], operatorId: args['--operator-id'] }), enablePortfolioSync: args.enablePortfolioSync === true };
  const cookie = (await readPrivateFile(args['--cookie-file'])).trim();
  if (!cookie || cookie.length > 16_384 || /[\r\n]/.test(cookie)) throw Error('Invalid private session cookie file');
  if (!args.apply) { console.log(JSON.stringify({ mode: 'review-only', ...target })); return; }
  // Only supplied configuration is used. No ambient provider or mail configuration is inherited.
  for (const name of Object.keys(process.env)) if (/^(BETTER_AUTH_|APP_BASE_URL$|PASSWORD_AUTH_ENABLED$|GOOGLE_|SMTP_)/.test(name)) delete process.env[name];
  Object.assign(process.env, config);
  process.env.NODE_ENV = target.origin.startsWith('http:') ? 'development' : 'production';
  const directory = await mkdtemp(join(tmpdir(), 'livestocks-mcp-bootstrap-'));
  try {
    const outfile = join(directory, 'bootstrap.mjs');
    // Build the same server module used by Next; only the server-only marker is removed for CLI execution.
    const result = await build({ stdin: { contents: 'export {getBetterAuthSession,seedMcpClient,shutdownBetterAuth} from "./lib/auth/better-auth.ts";', resolveDir: root, loader: 'ts' },
      bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
      plugins: [{ name: 'cli-server-only', setup(builder) { builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' })); builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }));
        builder.onResolve({ filter: /^(better-auth|@better-auth\/|pg$|jose$|nodemailer$)/ }, async ({ path }) => ({ path: fileURLToPath(import.meta.resolve(path)), external: true })); } }],
    });
    await writeFile(outfile, result.outputFiles[0].text, { mode: 0o600 });
    const auth = await import(pathToFileURL(outfile).href);
    try {
      const headers = new Headers({ cookie, origin: target.origin });
      const session = await auth.getBetterAuthSession(headers);
      if (!session?.user.emailVerified || session.user.id !== target.operatorId) throw Error('Verified operator session does not match confirmation');
      const result = await auth.seedMcpClient(headers, target.callbacks, { enablePortfolioSync: target.enablePortfolioSync });
      console.log(JSON.stringify({ ...target, created: result.created, clientId: result.clientId }));
    } finally { await auth.shutdownBetterAuth(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => { console.error('MCP bootstrap failed. Check private configuration, exact target, operator session and existing registration. No secrets were printed.'); process.exitCode = 1; });
}
