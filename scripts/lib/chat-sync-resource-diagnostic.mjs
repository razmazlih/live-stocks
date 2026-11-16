/** Disposable-fixture UI diagnostics only. No route/auth/portfolio behavior changes.
 * Flag: <runtime>/ui-resource-diagnostic.json
 * { mode: 'actual'|'static'|'minimal_bridge', mime: 'standard'|'legacy', resourceMeta: 'preserve'|'none' }
 * Remove the flag to restore the exact upstream bytes and headers.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib';

export const RESOURCE_DIAGNOSTIC_FLAG = 'ui-resource-diagnostic.json';
export const STANDARD_UI_MIME = 'text/html;profile=mcp-app';
export const LEGACY_UI_MIME = 'text/html+skybridge';
const staticHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated UI diagnostic</title></head><body><h1>Isolated static UI diagnostic</h1><p>No scripts, actions or portfolio data.</p></body></html>';
const bridgeHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated bridge diagnostic</title></head><body><h1>Isolated bridge diagnostic</h1><p id="status">Initializing host bridge</p><script>
(function(){
'use strict';
var parentWindow=window.parent;
function status(value){document.getElementById('status').textContent=value;}
function notify(method,params){parentWindow.postMessage({jsonrpc:'2.0',method:method,params:params},'*');}
function compatibility(){if(window.openai){status('Compatibility bridge available');if(window.openai.notifyIntrinsicHeight)window.openai.notifyIntrinsicHeight(160);}}
window.addEventListener('openai:set_globals',compatibility);compatibility();
window.addEventListener('message',function(event){
 if(event.source!==parentWindow||!event.data||event.data.jsonrpc!=='2.0')return;
 var m=event.data;
 if(m.id==='isolated-ui-initialize'&&m.result){status('Host bridge initialized');notify('ui/notifications/initialized',{});notify('ui/notifications/size-changed',{height:160,width:document.documentElement.clientWidth});}
 if(m.method==='ui/notifications/tool-result')status('Host bridge and tool result received');
});
if(parentWindow!==window)parentWindow.postMessage({jsonrpc:'2.0',id:'isolated-ui-initialize',method:'ui/initialize',params:{appInfo:{name:'Isolated diagnostic',version:'1.0.0'},appCapabilities:{availableDisplayModes:['inline']},protocolVersion:'2026-01-26'}},'*');
})();
</script></body></html>`;

function policy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(key => !['mode', 'mime', 'resourceMeta'].includes(key))
    || !['actual', 'static', 'minimal_bridge'].includes(raw.mode)
    || !['standard', 'legacy'].includes(raw.mime)
    || (raw.resourceMeta !== undefined && !['preserve', 'none'].includes(raw.resourceMeta))) throw Error('Invalid isolated resource diagnostic policy');
  return { ...raw, resourceMeta: raw.resourceMeta ?? 'preserve' };
}
function decode(bytes, headers) {
  const contentEncoding = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-encoding')?.[1];
  switch (String(contentEncoding ?? '').toLowerCase()) {
    case '': case 'identity': return bytes;
    case 'gzip': return gunzipSync(bytes);
    case 'br': return brotliDecompressSync(bytes);
    case 'deflate': return inflateSync(bytes);
    default: throw Error('Unsupported isolated response encoding');
  }
}

/** Pure response override. The observation deliberately contains no auth/input/financial data. */
export function overrideChatSyncResourceResponse({ productionAccess, rpc, statusCode, headers, body, policy: requested }) {
  const unchanged = { headers, body, observation: { applied: false } };
  if (!requested || rpc?.method !== 'resources/read' || statusCode !== 200) return unchanged;
  if (productionAccess !== false) throw Error('Resource diagnostic requires explicit isolated productionAccess:false');
  const selected = policy(requested), packet = JSON.parse(decode(body, headers).toString('utf8'));
  if (!Array.isArray(packet.result?.contents)) throw Error('Isolated response lacks resource contents');
  const matches = packet.result.contents.filter(content => content.uri === rpc.params?.uri && typeof content.text === 'string');
  if (matches.length !== 1) throw Error('Expected exactly one matching isolated HTML resource');
  const content = matches[0];
  if (selected.mode === 'static') content.text = staticHtml;
  if (selected.mode === 'minimal_bridge') content.text = bridgeHtml;
  content.mimeType = selected.mime === 'legacy' ? LEGACY_UI_MIME : STANDARD_UI_MIME;
  if (selected.resourceMeta === 'none') delete content._meta;
  const bytes = Buffer.from(JSON.stringify(packet));
  const changedHeaders = Object.fromEntries(Object.entries(headers).filter(([key]) => !['content-encoding', 'content-length', 'transfer-encoding', 'etag'].includes(key.toLowerCase())));
  changedHeaders['content-type'] = 'application/json';
  changedHeaders['content-length'] = String(bytes.length);
  return { headers: changedHeaders, body: bytes, observation: { applied: true, mode: selected.mode, mimeType: content.mimeType,
    uri: content.uri, htmlCharacterCount: content.text.length, htmlSha256: createHash('sha256').update(content.text).digest('hex'),
    hasScript: /<script\b/i.test(content.text), hasResourceMetadata: Boolean(content._meta) } };
}

/** File flag read at request time, so toggles never need a gateway restart. */
export async function applyChatSyncResourceDiagnostic({ runtime, ...request }) {
  let selected;
  try { selected = JSON.parse(await readFile(join(runtime, RESOURCE_DIAGNOSTIC_FLAG), 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return { headers: request.headers, body: request.body, observation: { applied: false } }; throw error; }
  return overrideChatSyncResourceResponse({ ...request, policy: selected });
}
