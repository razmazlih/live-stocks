// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { databaseEnvironment, trustedDatabaseCertificate } from '../scripts/prepare-account-migration.mjs';

let directory;
let certificate;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'livestocks-preparation-test-'));
  certificate = join(directory, 'ca.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', join(directory, 'key.pem'), '-out', certificate, '-days', '1',
    '-subj', '/CN=LiveStocks synthetic test CA', '-addext', 'basicConstraints=critical,CA:TRUE'],
  { stdio: 'ignore' });
  await chmod(certificate, 0o600);
});
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

describe('migration source TLS trust', () => {
  it('uses explicit CA and hostname verification with a clean read-only environment', async () => {
    const env = await databaseEnvironment('postgresql://test:synthetic@db.example/postgres', certificate);
    expect(env.PGSSLMODE).toBe('verify-full');
    expect(env.PGSSLROOTCERT).toBe(await trustedDatabaseCertificate(certificate));
    expect(env.PGOPTIONS).toContain('default_transaction_read_only=on');
    expect(env.PGTZ).toBe('UTC');
    expect(env.PGPASSFILE).toBe('/dev/null');
    expect(env.PGSERVICEFILE).toBe('/dev/null');
    expect(env.PGSERVICE).toBeUndefined();
  });
  it.each(['disable', 'allow', 'prefer', 'require', 'verify-ca'])('rejects sslmode=%s', async mode => {
    await expect(databaseEnvironment(`postgresql://test@db.example/postgres?sslmode=${mode}`, certificate))
      .rejects.toThrow('verify-full');
  });
  it('accepts explicitly selected verify-full', async () => {
    expect((await databaseEnvironment('postgresql://test@db.example/postgres?sslmode=verify-full', certificate)).PGSSLMODE)
      .toBe('verify-full');
  });
  it.each([undefined, 'system', './ca.pem'])('rejects absent or non-absolute CA setting %s', async path => {
    await expect(databaseEnvironment('postgresql://test@db.example/postgres', path)).rejects.toThrow('absolute');
  });
  it('rejects untrusted connection overrides', async () => {
    await expect(databaseEnvironment('postgresql://test@db.example/postgres?sslrootcert=/tmp/other.pem', certificate))
      .rejects.toThrow('unsupported');
  });
  it('rejects CA symlinks and files writable by other users', async () => {
    const link = join(directory, 'link.pem');
    await symlink(certificate, link);
    await expect(trustedDatabaseCertificate(link)).rejects.toThrow('not a symlink');
    await chmod(certificate, 0o666);
    await expect(trustedDatabaseCertificate(certificate)).rejects.toThrow('writable by others');
    await chmod(certificate, 0o600);
  });
  it('rejects malformed files and private-key material', async () => {
    const invalid = join(directory, 'invalid.pem');
    await writeFile(invalid, '-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----', { mode: 0o600 });
    await expect(trustedDatabaseCertificate(invalid)).rejects.toThrow('current PEM CA');
  });
});
