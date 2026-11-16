// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { applyChatSyncResourceDiagnostic, overrideChatSyncResourceResponse, RESOURCE_DIAGNOSTIC_FLAG } from '@/scripts/lib/chat-sync-resource-diagnostic.mjs';
const uri = 'ui://livestocks/screenshot-sync-v2.html';
const actual = '<!doctype html><html><body>Actual app<script>/* no fixture behavior */</script></body></html>';
const metadata = { ui: { csp: { connectDomains: [] } }, 'openai/widgetDescription': 'Actual app' };
const packet = () => ({ jsonrpc: '2.0', id: 'request-id', result: { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: actual, _meta: metadata }] } });
const request = () => ({ productionAccess: false, rpc: { method: 'resources/read', params: { uri } }, statusCode: 200, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', etag: 'old' }, body: Buffer.from(JSON.stringify(packet())) });
const runtimes: string[] = [];
afterEach(async () => { await Promise.all(runtimes.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
describe('isolated MCP UI response diagnostics', () => {
  it('does not alter a response when no policy exists', async () => {
    const runtime = await mkdtemp(join(tmpdir(), 'chat-ui-test-')); runtimes.push(runtime);
    const initial = request(), result = await applyChatSyncResourceDiagnostic({ ...initial, runtime });
    expect(result.body).toBe(initial.body); expect(result.headers).toBe(initial.headers); expect(result.observation).toEqual({ applied: false });
  });
  it('changes MIME only for actual mode, preserving HTML, metadata, auth-independent JSON shape and content length', () => {
    const initial = request(), result = overrideChatSyncResourceResponse({ ...initial, policy: { mode: 'actual', mime: 'legacy' } });
    const value = JSON.parse(result.body.toString());
    expect(value).toMatchObject({ jsonrpc: '2.0', id: 'request-id', result: { contents: [{ uri, mimeType: 'text/html+skybridge', text: actual, _meta: metadata }] } });
    expect(result.headers['content-length']).toBe(String(result.body.length)); expect(result.headers).not.toHaveProperty('etag');
  });
  it('really serves a static payload without scripts or metadata rather than only creating an unused flag', () => {
    const result = overrideChatSyncResourceResponse({ ...request(), policy: { mode: 'static', mime: 'standard', resourceMeta: 'none' } });
    const resource = JSON.parse(result.body.toString()).result.contents[0];
    expect(resource.text).toContain('Isolated static UI diagnostic'); expect(resource.text).not.toContain('Actual app');
    expect(resource.text).not.toMatch(/<script/i); expect(resource).not.toHaveProperty('_meta');
    expect(result.observation).toMatchObject({ applied: true, mode: 'static', hasScript: false, hasResourceMetadata: false });
  });
  it('serves a minimal read-only host handshake separately from a static document', () => {
    const result = overrideChatSyncResourceResponse({ ...request(), policy: { mode: 'minimal_bridge', mime: 'standard' } });
    const html = JSON.parse(result.body.toString()).result.contents[0].text;
    expect(html).toContain('ui/initialize'); expect(html).toContain('ui/notifications/initialized');
    expect(html).toContain('ui/notifications/tool-result'); expect(html).not.toContain('tools/call');
    expect(html).not.toContain('<button'); expect(result.observation).toMatchObject({ hasScript: true });
  });
  it.each(['gzip', 'br'])('decodes %s and clears stale compression/length headers', encoding => {
    const initial = request();
    const encoded = encoding === 'gzip' ? gzipSync(initial.body) : brotliCompressSync(initial.body);
    const result = overrideChatSyncResourceResponse({ ...initial, headers: { ...initial.headers, 'content-encoding': encoding, 'content-length': '1' }, body: encoded, policy: { mode: 'static', mime: 'standard' } });
    expect(() => JSON.parse(result.body.toString())).not.toThrow(); expect(result.headers).not.toHaveProperty('content-encoding');
    expect(result.headers['content-length']).toBe(String(result.body.length));
  });
  it('refuses production use and invalid flags while leaving non-resource/auth error replies alone', () => {
    expect(() => overrideChatSyncResourceResponse({ ...request(), productionAccess: true, policy: { mode: 'static', mime: 'standard' } })).toThrow();
    expect(() => overrideChatSyncResourceResponse({ ...request(), policy: { mode: 'bad', mime: 'standard' } })).toThrow();
    expect(overrideChatSyncResourceResponse({ ...request(), statusCode: 401, policy: { mode: 'static', mime: 'standard' } }).observation.applied).toBe(false);
    expect(overrideChatSyncResourceResponse({ ...request(), rpc: { method: 'tools/call' }, policy: { mode: 'static', mime: 'standard' } }).observation.applied).toBe(false);
  });
  it('reads a changed file flag on each request without a gateway restart', async () => {
    const runtime = await mkdtemp(join(tmpdir(), 'chat-ui-test-')); runtimes.push(runtime);
    await writeFile(join(runtime, RESOURCE_DIAGNOSTIC_FLAG), JSON.stringify({ mode: 'static', mime: 'standard' }));
    expect((await applyChatSyncResourceDiagnostic({ ...request(), runtime })).observation).toMatchObject({ mode: 'static' });
    await writeFile(join(runtime, RESOURCE_DIAGNOSTIC_FLAG), JSON.stringify({ mode: 'minimal_bridge', mime: 'legacy' }));
    expect((await applyChatSyncResourceDiagnostic({ ...request(), runtime })).observation).toMatchObject({ mode: 'minimal_bridge', mimeType: 'text/html+skybridge' });
  });
});
