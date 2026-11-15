// @vitest-environment node
import { mkdtemp, writeFile, chmod, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { readPrivateFile, validateBootstrap } from '../scripts/seed-mcp-client.mjs';
const config = { APP_BASE_URL: 'https://example.test', BETTER_AUTH_SECRET: 'synthetic-secret', BETTER_AUTH_DATABASE_URL: 'postgres://livestocks_auth_backend@db.test/auth', BETTER_AUTH_WEBSITE_CLIENT_ID: 'web-client', BETTER_AUTH_MCP_CLIENT_ID: 'mcp-client', BETTER_AUTH_MCP_CLIENT_SECRET: 'synthetic-mcp-secret' };
const confirmation = { origin: 'https://example.test', clientId: 'mcp-client', operatorId: 'operator' };
describe('operator MCP bootstrap guardrails', () => {
  it('requires exact target and callback approval', () => {
    expect(validateBootstrap(config, ['https://chatgpt.com/callback'], confirmation).callbacks).toEqual(['https://chatgpt.com/callback']);
    expect(() => validateBootstrap(config, ['https://chatgpt.com/callback'], { ...confirmation, origin: 'https://different.test' })).toThrow();
    expect(() => validateBootstrap(config, ['https://chatgpt.com/callback'], { ...confirmation, clientId: 'different' })).toThrow();
  });
  it.each(['https://chatgpt.com/*', 'http://chatgpt.com/callback', 'https://u:p@chatgpt.com/callback', 'https://chatgpt.com/callback#secret', 'https://chatgpt.com/callback?code=old'])('rejects callback %s', callback => {
    expect(() => validateBootstrap(config, [callback], confirmation)).toThrow();
  });
  it('rejects public/symlink credential files and accepts owner-only files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'livestocks-seed-file-test-'));
    try {
      const path = join(dir, 'config'); await writeFile(path, 'fixture', { mode: 0o600 }); expect(await readPrivateFile(path)).toBe('fixture');
      await chmod(path, 0o644); await expect(readPrivateFile(path)).rejects.toThrow();
      await chmod(path, 0o600); const link = join(dir, 'link'); await symlink(path, link); await expect(readPrivateFile(link)).rejects.toThrow();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
