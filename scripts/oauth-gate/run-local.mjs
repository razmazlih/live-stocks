import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, chmod, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const directory = dirname(fileURLToPath(import.meta.url));
const version = 'v2.197.0';
const archiveSha256 = '3fb7998e7061e2c14f3f9555b1d94d447358c965395728e0d81eac82e0e5868b';
const authUrl = 'http://127.0.0.1:54999';
const siteUrl = 'http://127.0.0.1:54876';
const databaseUrl = 'postgres://postgres@127.0.0.1:54998/postgres?sslmode=disable';
const reportPath = resolve(process.env.GATE_REPORT_PATH ?? 'output/oauth-gate/latest.json');
const runDirectory = await mkdtemp(join(tmpdir(), 'livestocks-oauth-gate-'));
const pgDirectory = join(runDirectory, 'postgres');
const runtimeLog = join(runDirectory, 'auth.log');
let postgresAttempted = false;
let auth;
let authExit;
let retainRuntime = false;
let probe;
let interrupted = false;
const abort = new AbortController();
const cleanEnvironment = { PATH: process.env.PATH, LC_ALL: 'C', PGHOSTADDR: '127.0.0.1', PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null' };
const setupReport = { generatedAt: new Date().toISOString(), status: 'INCOMPLETE', environment: 'isolated-local-GoTrue',
  authVersion: version, incompletePhase: 'local_runtime_setup' };

function interrupt() {
  interrupted = true;
  abort.abort();
  probe?.kill('SIGTERM');
  auth?.kill('SIGTERM');
}
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);

function command(binary, args, options = {}) {
  return execFileSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnvironment, ...options });
}

async function downloadBinary() {
  if (process.env.GATE_AUTH_BINARY) return resolve(process.env.GATE_AUTH_BINARY);
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Set GATE_AUTH_BINARY to a verified native Supabase Auth v2.197.0 binary on this platform.');
  }
  const url = `https://github.com/supabase/auth/releases/download/${version}/auth-${version}-darwin-arm64.tar.gz`;
  console.log(`Downloading official Supabase Auth ${version} (pinned SHA-256).`);
  const response = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(120_000), abort.signal]) });
  if (!response.ok) throw new Error(`Auth binary download failed: HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(archive).digest('hex') !== archiveSha256) {
    throw new Error('Auth binary archive checksum mismatch.');
  }
  const archivePath = join(runDirectory, 'auth.tar.gz');
  await writeFile(archivePath, archive, { mode: 0o600 });
  const names = command('tar', ['-tzf', archivePath]).trim().split('\n');
  if (names.some(name => name.startsWith('/') || name.split('/').includes('..'))) {
    throw new Error('Unsafe path in Auth release archive.');
  }
  command('tar', ['-xzf', archivePath, '-C', runDirectory]);
  const name = names.find(name => /(^|\/)(auth|gotrue)$/.test(name));
  if (!name) throw new Error('Auth executable not found in release archive.');
  const binary = join(runDirectory, name);
  await chmod(binary, 0o700);
  return binary;
}

try {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(setupReport, null, 2)}\n`, { mode: 0o600 });
  // No repository .env is read and no hosted project is used. Ports are fixed
  // and bind only to loopback; failure never falls back to an existing database.
  command('initdb', ['--version']);
  command('pg_ctl', ['--version']);
  command('psql', ['--version']);
  const binary = await downloadBinary();
  const binarySha256 = createHash('sha256').update(await readFile(binary)).digest('hex');
  if (interrupted) throw new Error('Local OAuth gate interrupted');
  command('initdb', ['-D', pgDirectory, '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8']);
  postgresAttempted = true;
  command('pg_ctl', ['-D', pgDirectory, '-l', join(runDirectory, 'postgres.log'), '-o', "-h 127.0.0.1 -p 54998 -c unix_socket_directories=''", '-w', '-t', '30', 'start']);
  command('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f', join(directory, 'fixture.sql')]);

  const jwtSecret = randomBytes(48).toString('hex');
  const { openSync, closeSync } = await import('node:fs');
  const logFd = openSync(runtimeLog, 'a', 0o600);
  auth = spawn(binary, [], {
    cwd: runDirectory,
    env: {
      PATH: process.env.PATH,
      GOTRUE_API_HOST: '127.0.0.1',
      GOTRUE_API_PORT: '54999',
      API_EXTERNAL_URL: authUrl,
      GOTRUE_SITE_URL: siteUrl,
      GOTRUE_DB_DRIVER: 'postgres',
      GOTRUE_DB_DATABASE_URL: databaseUrl,
      GOTRUE_JWT_SECRET: jwtSecret,
      GOTRUE_JWT_ISSUER: authUrl,
      GOTRUE_JWT_AUD: 'authenticated',
      GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
      GOTRUE_JWT_ADMIN_ROLES: 'service_role',
      GOTRUE_DISABLE_SIGNUP: 'false',
      GOTRUE_MAILER_AUTOCONFIRM: 'true',
      GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
      GOTRUE_OAUTH_SERVER_ENABLED: 'true',
      GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH: '/oauth/consent',
      GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION: 'false',
      GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED: 'true',
      GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI: 'pg-functions://postgres/public/gate_access_token',
      GOTRUE_LOG_LEVEL: 'error',
    },
    stdio: ['ignore', logFd, logFd],
  });
  closeSync(logFd);
  const stopped = new Promise(resolveExit => auth.once('exit', code => { authExit = code; resolveExit(); }));
  auth.once('error', () => { authExit = -1; });
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (authExit !== undefined || interrupted) break;
    try {
      const response = await fetch(`${authUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) { ready = true; break; }
    } catch { /* bounded startup polling */ }
    await delay(500);
  }
  if (!ready) {
    // Only errors from the local runtime; do not print raw logs, which can
    // contain credentials when upstream logging behavior changes.
    const log = await readFile(runtimeLog, 'utf8');
    const reason = /migration/i.test(log) ? 'migration/startup error' : 'startup error';
    throw new Error(`Disposable Auth failed to start (${reason}); local log: ${runtimeLog}`);
  }
  console.log('Disposable Auth is ready; probing synthetic accounts and OAuth resource isolation.');
  probe = spawn(process.execPath, [join(directory, 'probe.mjs')], {
    cwd: directory,
    env: {
      PATH: process.env.PATH,
      GATE_AUTH_URL: authUrl,
      GATE_SITE_URL: siteUrl,
      GATE_DATABASE_URL: databaseUrl,
      GATE_JWT_SECRET: jwtSecret,
      GATE_REPORT_PATH: reportPath,
      GATE_AUTH_VERSION: version,
      GATE_AUTH_ARCHIVE_SHA256: process.env.GATE_AUTH_BINARY ? '' : archiveSha256,
      GATE_AUTH_BINARY_SHA256: binarySha256,
    },
    stdio: 'inherit',
  });
  const code = await new Promise(resolveCode => {
    probe.once('error', () => resolveCode(2));
    probe.once('exit', value => resolveCode(value ?? 2));
  });
  process.exitCode = code;
  retainRuntime = code === 2 && process.env.GATE_KEEP_RUNTIME === '1';
  if (interrupted) await writeFile(reportPath, `${JSON.stringify({ ...setupReport, incompletePhase: 'interrupted' }, null, 2)}\n`, { mode: 0o600 });
  auth.kill('SIGTERM');
  await Promise.race([stopped, delay(3000)]);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local OAuth gate setup failed.');
  process.exitCode = 2;
  retainRuntime = process.env.GATE_KEEP_RUNTIME === '1';
  await writeFile(reportPath, `${JSON.stringify({ ...setupReport, incompletePhase: interrupted ? 'interrupted' : 'local_runtime_setup' }, null, 2)}\n`, { mode: 0o600 });
} finally {
  if (auth && authExit === undefined) auth.kill('SIGKILL');
  if (postgresAttempted) {
    try { command('pg_ctl', ['-D', pgDirectory, '-m', 'immediate', '-w', '-t', '15', 'stop']); }
    catch {
      try { command('pg_ctl', ['-D', pgDirectory, 'status']); retainRuntime = true; }
      catch (error) { if (error.status !== 3) retainRuntime = true; }
      if (retainRuntime) console.error(`Could not confirm disposable PostgreSQL stopped; inspect ${pgDirectory}.`);
    }
  }
  if (retainRuntime) console.error(`Local debug fixture retained at ${runDirectory}; it contains synthetic credentials.`);
  else await rm(runDirectory, { recursive: true, force: true });
}
