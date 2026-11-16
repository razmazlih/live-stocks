import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_SYNC_APP_HTML, CHAT_SYNC_RESOURCE_MIME, CHAT_SYNC_RESOURCE_URI } from '@/lib/chat-sync-app';

const plan = () => ({ location: '10000000-0000-4000-8000-000000000001', sourceName: 'בית השקעות אישי', observedAt: '2026-11-16', changes: [{ symbol: 'AAPL', previousQuantity: 8, quantity: 5, previousAverageCostUsd: 100, averageCostUsd: 110 }], unchanged: [], blocked: [], canApply: true });
const prepared = (secret = 'private-widget-secret') => ({ structuredContent: { proposalId: 'proposal-one', status: 'pending', expiresAt: '2026-11-16T10:15:00Z', plan: plan() }, _meta: secret ? { confirmationSecret: secret } : {} });
let frame: HTMLIFrameElement;
let app: Window;
let doc: Document;
let sent: Record<string, unknown>[];
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function message(data: unknown, source: MessageEventSource = app.parent) {
  app.dispatchEvent(new MessageEvent('message', { source, data }));
}
function boot(compatibility?: Record<string, unknown>) {
  frame = document.createElement('iframe'); document.body.appendChild(frame);
  app = frame.contentWindow!; doc = frame.contentDocument!;
  const script = CHAT_SYNC_APP_HTML.match(/<script>([\s\S]*?)<\/script>/)![1];
  doc.open(); doc.write(CHAT_SYNC_APP_HTML.replace(/<script>[\s\S]*?<\/script>/, '')); doc.close();
  vi.spyOn((app as Window & { Date: DateConstructor }).Date, 'now').mockImplementation(() => new Date('2026-11-16T10:00:00Z').getTime());
  if (compatibility) Object.defineProperty(app, 'openai', { configurable: true, value: compatibility });
  vi.spyOn(app.parent, 'postMessage').mockImplementation((message: unknown) => { sent.push(message as Record<string, unknown>); });
  (app as Window & { eval: (source: string) => unknown }).eval(script);
}
async function initialize() {
  const init = sent.find(item => item.method === 'ui/initialize')!;
  expect(init).toMatchObject({ jsonrpc: '2.0', params: { appInfo: { name: 'LiveStocks screenshot review' }, protocolVersion: '2026-01-26' } });
  message({ jsonrpc: '2.0', id: init.id, result: { hostCapabilities: { serverTools: {} }, hostContext: {} } });
  await flush();
}
function receive(result = prepared()) { message({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result }); }
function button(name: 'confirm' | 'cancel') { return doc.getElementById(name) as HTMLButtonElement; }
function toolCalls() { return sent.filter(item => item.method === 'tools/call') as { id: number; params: { name: string; arguments: unknown } }[]; }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  sent = [];
  vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => { sent.push(message as Record<string, unknown>); });
});
afterEach(() => { frame?.contentWindow?.close(); frame?.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('inline ChatGPT synchronization approval', () => {
  it('declares a standard self-contained MCP App without external scripts or fetch', () => {
    expect(CHAT_SYNC_RESOURCE_URI).toBe('ui://livestocks/screenshot-sync-v5.html');
    expect(CHAT_SYNC_RESOURCE_MIME).toBe('text/html;profile=mcp-app');
    expect(CHAT_SYNC_APP_HTML).not.toMatch(/<script[^>]+src=|fetch\(|localStorage|sessionStorage/);
  });
  it('renders an immutable review but never invokes a write before user interaction', async () => {
    boot(); await initialize(); receive();
    expect(doc.body.textContent).toContain('AAPL');
    expect(doc.body.textContent).toContain('בית השקעות אישי');
    expect(doc.body.textContent).not.toContain('private-widget-secret');
    expect(button('confirm').disabled).toBe(false);
    expect(doc.getElementById('summary-count')?.textContent).toBe('מניה אחת לעדכון');
    expect(doc.getElementById('summary-state')?.textContent).toBe('עוד לא שינינו כלום');
    expect(doc.querySelector('.holding-total')?.textContent).toContain('550.00');
    expect(toolCalls()).toHaveLength(0);
    expect(doc.querySelector('details')?.open).toBe(false);
  });
  it('keeps existing and updated values explicitly labelled in the responsive holding card', async () => {
    boot(); await initialize(); receive();
    const card = doc.querySelector('.holding-card')!;
    expect(card.getAttribute('role')).toBe('row');
    expect(card.querySelector('.ticker-symbol')?.textContent).toBe('AAPL');
    const stats = [...card.querySelectorAll('.holding-stat')];
    expect(stats.map(stat => stat.querySelector('.before bdi')?.textContent)).toEqual(['8', '100']);
    expect(stats.map(stat => stat.querySelector('.after bdi')?.textContent)).toEqual(['5', '110']);
    expect(stats.every(stat => stat.querySelector('.before small')?.textContent === 'בתיק')).toBe(true);
    expect(stats.every(stat => stat.querySelector('.after small')?.textContent === 'מהצילום')).toBe(true);
    expect(toolCalls()).toHaveLength(0);
  });
  it('shows confirmed and estimated purchase dates as distinct parts of the review', async () => {
    boot(); await initialize();
    const review = prepared();
    Object.assign(review.structuredContent.plan.changes[0], { acquiredOn: '2026-01-02' });
    review.structuredContent.plan.changes.push({ symbol: 'NVDA', previousQuantity: 0, quantity: 3, previousAverageCostUsd: 0, averageCostUsd: 140, estimatedAcquiredOn: '2026-03-04' } as unknown as ReturnType<typeof plan>['changes'][number]);
    receive(review);
    expect(doc.getElementById('rows')?.textContent).toContain('נקנה ב־02.01.2026');
    expect(doc.getElementById('rows')?.textContent).toContain('תאריך משוער: 04.03.2026');
    expect(toolCalls()).toHaveLength(0);
  });
  it('renders unchanged and unresolved plans without an unusable confirmation button', async () => {
    boot(); await initialize();
    message({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { status: 'unchanged', plan: plan() } } });
    expect(doc.getElementById('status')?.textContent).toBe('לא נדרש שינוי.');
    expect(button('confirm').disabled).toBe(true);
    message({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { status: 'needs_details', plan: { ...plan(), blocked: [{ symbol: 'ABC', reason: 'missing_cost' }] } } } });
    expect(doc.getElementById('status')?.textContent).toContain('ABC');
    expect(button('confirm').disabled).toBe(true);
    receive();
    expect(button('confirm').disabled).toBe(false);
  });
  it('submits only the hidden capability on click, prevents double clicks, and shows the server receipt', async () => {
    boot(); await initialize(); receive();
    button('confirm').click(); button('confirm').click();
    expect(toolCalls()).toHaveLength(1);
    expect(toolCalls()[0].params).toEqual({ name: 'confirm_screenshot_sync', arguments: { proposalId: 'proposal-one', confirmationSecret: 'private-widget-secret' } });
    message({ jsonrpc: '2.0', id: toolCalls()[0].id, result: { structuredContent: { proposalId: 'proposal-one', status: 'applied', applied: true } } });
    await flush();
    expect(doc.getElementById('status')?.textContent).toContain('השינויים נשמרו');
    expect(button('confirm').disabled).toBe(true);
    expect(button('cancel').disabled).toBe(true);
    expect(doc.querySelector('main')?.dataset.state).toBe('applied');
    expect(doc.getElementById('summary-state')?.textContent).toBe('השינויים שנשמרו');
  });
  it('moves from saving to the actual full portfolio after the server receipt, preserving untouched accounts', async () => {
    boot(); await initialize(); receive(); button('confirm').click();
    expect(doc.querySelector('main')?.dataset.state).toBe('saving');
    expect(doc.querySelector('main')?.getAttribute('aria-busy')).toBe('true');
    expect(doc.getElementById('portfolio')?.hidden).toBe(true);
    const portfolio = { status: 'available', fetchedAt: '2026-11-16T10:01:00Z', holdings: [
      { symbol: 'AAPL', quantity: 5, averageCostUsd: 110, location: plan().location, sourceName: 'בית השקעות אישי' },
      { symbol: 'MSFT', quantity: 7, averageCostUsd: 200, location: 'another-account', sourceName: 'חשבון נוסף' },
    ] };
    message({ jsonrpc: '2.0', id: toolCalls()[0].id, result: { structuredContent: { proposalId: 'proposal-one', status: 'applied', portfolio } } }); await flush();
    expect(doc.querySelector('main')?.dataset.state).toBe('applied');
    expect(doc.querySelector('main')?.getAttribute('aria-busy')).toBe('false');
    expect(doc.getElementById('portfolio')?.hidden).toBe(false);
    expect(doc.getElementById('review')?.hidden).toBe(true);
    expect(doc.getElementById('headline')?.textContent).toBe('התיק שלך מעודכן');
    expect(doc.getElementById('portfolio-list')?.textContent).toContain('MSFT');
    expect(doc.getElementById('portfolio-list')?.textContent).toContain('חשבון נוסף');
    expect(doc.querySelectorAll('.updated-tag')).toHaveLength(1);
    expect(doc.getElementById('portfolio-total')?.textContent).toContain('1,950.00');
    expect(doc.getElementById('portfolio-count')?.textContent).toBe('2');
    (doc.getElementById('toggle-review') as HTMLButtonElement).click();
    expect(doc.getElementById('review')?.hidden).toBe(false);
    expect(doc.getElementById('toggle-review')?.getAttribute('aria-expanded')).toBe('true');
    receive();
    expect(doc.getElementById('portfolio-list')?.textContent).toContain('MSFT');
    message({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { proposalId: 'proposal-one', status: 'applied' } } });
    expect(doc.getElementById('portfolio-list')?.textContent).toContain('MSFT');
    expect(toolCalls()).toHaveLength(1);
  });
  it('keeps an applied update final when the optional portfolio refresh fails', async () => {
    boot(); await initialize(); receive(); button('confirm').click();
    message({ jsonrpc: '2.0', id: toolCalls()[0].id, result: { structuredContent: { proposalId: 'proposal-one', status: 'applied', portfolio: { status: 'unavailable', holdings: [] } } } }); await flush();
    expect(doc.getElementById('headline')?.textContent).toBe('התיק שלך מעודכן');
    expect(doc.getElementById('portfolio-note')?.textContent).toContain('לא הצלחנו לטעון');
    expect(doc.getElementById('portfolio-overview')?.hidden).toBe(true);
    expect(button('confirm').disabled).toBe(true);
    expect(doc.getElementById('error')?.textContent).toBe('');
  });
  it('does not invent portfolio totals for missing costs, and escapes names in the saved portfolio', async () => {
    boot(); await initialize(); receive();
    message({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { proposalId: 'proposal-one', status: 'applied', portfolio: { status: 'available', holdings: [{ symbol: '<img src=x>', quantity: 3, averageCostUsd: null, sourceName: '<script>oops</script>', location: 'other' }] } } } });
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.getElementById('portfolio-total')?.textContent).toBe('חסרים נתוני קנייה');
    expect(doc.getElementById('portfolio-list')?.textContent).toContain('<script>oops</script>');
    expect(doc.getElementById('portfolio-list')?.textContent).toContain('—');
  });
  it('cancels only through the app-only owner-bound tool after an explicit click', async () => {
    boot(); await initialize(); receive(); button('cancel').click();
    expect(toolCalls()[0].params).toEqual({ name: 'cancel_screenshot_sync', arguments: { proposalId: 'proposal-one', confirmationSecret: 'private-widget-secret' } });
    message({ jsonrpc: '2.0', id: toolCalls()[0].id, result: { structuredContent: { proposalId: 'proposal-one', status: 'cancelled' } } });
    await flush();
    expect(doc.getElementById('status')?.textContent).toContain('לא עדכנו שום דבר');
    expect(button('confirm').disabled).toBe(true);
  });
  it.each(['applied', 'cancelled'])('preserves %s after host globals replay the original pending review', async status => {
    const original = prepared();
    const callTool = vi.fn().mockResolvedValue({ structuredContent: { proposalId: 'proposal-one', status } });
    boot({ toolResponseMetadata: { mcp_tool_result: original }, callTool });
    button(status === 'applied' ? 'confirm' : 'cancel').click(); await flush();
    const receipt = doc.getElementById('status')?.textContent;
    app.dispatchEvent(new Event('openai:set_globals')); receive(original);
    expect(doc.getElementById('status')?.textContent).toBe(receipt);
    expect(receipt).toContain(status === 'applied' ? 'השינויים נשמרו' : 'לא עדכנו שום דבר');
    expect(button('confirm').disabled).toBe(true);
    expect(button('cancel').disabled).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(1);
    const next = prepared('next-secret'); next.structuredContent.proposalId = 'proposal-two'; receive(next);
    expect(button('confirm').disabled).toBe(false);
    expect(doc.getElementById('status')?.textContent).toBe('');
  });
  it('preserves an uncertain failure on pending replay and permits an explicit retry', async () => {
    const callTool = vi.fn().mockRejectedValueOnce(new Error(JSON.stringify({ detail: 'INVALID_ARGUMENT private-widget-secret confirmationSecret RuntimeException' })))
      .mockResolvedValueOnce({ structuredContent: { proposalId: 'proposal-one', status: 'applied' } });
    boot({ toolResponseMetadata: { mcp_tool_result: prepared() }, callTool });
    button('confirm').click(); await flush();
    app.dispatchEvent(new Event('openai:set_globals')); receive(prepared(''));
    expect(doc.getElementById('error')?.textContent).toBe('לא הצלחנו לוודא שהעדכון נשמר. אפשר לנסות שוב — הוא לא יישמר פעמיים.');
    expect(doc.body.textContent).not.toMatch(/private-widget-secret|confirmationSecret|INVALID_ARGUMENT|RuntimeException/);
    expect(button('confirm').textContent).toBe('ניסיון חוזר');
    expect(button('confirm').disabled).toBe(false);
    button('confirm').click(); await flush();
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(button('confirm').textContent).toBe('עודכן');
    expect(button('confirm').disabled).toBe(true);
    expect(doc.getElementById('status')?.textContent).toContain('השינויים נשמרו');
    const next = prepared('next-secret'); next.structuredContent.proposalId = 'proposal-two'; receive(next);
    expect(button('confirm').textContent).toBe('כן, לעדכן את התיק');
  });
  it.each(['applied', 'cancelled'])('clears an earlier uncertain error when a late %s receipt arrives', async status => {
    const callTool = vi.fn().mockRejectedValue(new Error('lost reply'));
    boot({ toolResponseMetadata: { mcp_tool_result: prepared() }, callTool });
    button('confirm').click(); await flush();
    expect(doc.getElementById('error')?.textContent).toContain('אפשר לנסות שוב');
    message({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { proposalId: 'proposal-one', status } } });
    expect(doc.getElementById('error')?.textContent).toBe('');
    expect(doc.getElementById('status')?.textContent).toContain(status === 'applied' ? 'השינויים נשמרו' : 'לא עדכנו שום דבר');
    expect(button('confirm').disabled).toBe(true);
  });
  it('accepts private metadata arriving after an initial public pending review', async () => {
    boot(); await initialize(); receive(prepared(''));
    expect(button('confirm').disabled).toBe(true);
    receive(prepared());
    expect(button('confirm').disabled).toBe(false);
    button('confirm').click();
    expect(toolCalls()[0].params.arguments).toEqual({ proposalId: 'proposal-one', confirmationSecret: 'private-widget-secret' });
  });
  it('shows a fixed cancellation error without exposing host diagnostics', async () => {
    const callTool = vi.fn().mockRejectedValue(new Error('confirmationSecret=private-widget-secret'));
    boot({ toolResponseMetadata: { mcp_tool_result: prepared() }, callTool });
    button('cancel').click(); await flush();
    expect(doc.getElementById('error')?.textContent).toBe('לא הצלחנו לוודא שהעדכון בוטל. אפשר לנסות שוב או לבדוק בצ׳אט.');
    expect(doc.body.textContent).not.toContain('private-widget-secret');
    expect(button('cancel').disabled).toBe(false);
  });
  it('does not accept a model-visible secret or a message from a different window', async () => {
    boot(); await initialize();
    message({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: prepared() }, app);
    expect(button('confirm').disabled).toBe(true);
    const publicOnly = prepared('');
    Object.assign(publicOnly.structuredContent, { confirmationSecret: 'model-generated' });
    receive(publicOnly);
    expect(button('confirm').disabled).toBe(true);
    button('confirm').click(); expect(toolCalls()).toHaveLength(0);
  });
  it('blocks expired or unresolved proposals and safely renders hostile stock text', async () => {
    boot(); await initialize();
    const value = prepared(); value.structuredContent.expiresAt = '2026-11-16T09:00:00Z';
    value.structuredContent.plan.changes[0].symbol = '<img src=x onerror=alert(1)>';
    receive(value);
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.body.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(button('confirm').disabled).toBe(true);
    const blocked = prepared(); blocked.structuredContent.plan.canApply = false; receive(blocked);
    expect(button('confirm').disabled).toBe(true);
  });
  it('keeps the proposal retryable when the server reports a failed write', async () => {
    boot(); await initialize(); receive(); button('confirm').click();
    message({ jsonrpc: '2.0', id: toolCalls()[0].id, result: { isError: true, content: [{ type: 'text', text: 'ההצעה התיישנה' }] } });
    await flush();
    expect(doc.getElementById('error')?.textContent).toContain('אפשר לנסות שוב');
    expect(doc.body.textContent).not.toContain('ההצעה התיישנה');
    expect(doc.getElementById('status')?.textContent).not.toContain('השינויים נשמרו');
    expect(button('confirm').disabled).toBe(false);
  });
  it('ignores an old receipt after a newer proposal arrives', async () => {
    boot(); await initialize(); receive(); button('confirm').click();
    const first = toolCalls()[0];
    const next = prepared('new-private-secret'); next.structuredContent.proposalId = 'proposal-two';
    receive(next);
    expect(button('confirm').disabled).toBe(false);
    receive({ structuredContent: { proposalId: 'proposal-one', status: 'applied', applied: true } } as unknown as ReturnType<typeof prepared>);
    expect(doc.getElementById('status')?.textContent).not.toContain('השינויים נשמרו');
    message({ jsonrpc: '2.0', id: first.id, result: { structuredContent: { proposalId: 'proposal-one', applied: true } } });
    await flush();
    expect(button('confirm').disabled).toBe(false);
    button('confirm').click();
    expect(toolCalls()[1].params.arguments).toEqual({ proposalId: 'proposal-two', confirmationSecret: 'new-private-secret' });
  });
  it('does not show success for an uncorrelated or missing receipt identity', async () => {
    boot(); await initialize(); receive();
    message({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { applied: true } } });
    message({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { proposalId: 'different', status: 'cancelled' } } });
    expect(button('confirm').disabled).toBe(false);
    expect(doc.getElementById('status')?.textContent).toBe('');
  });
  it('supports the ChatGPT compatibility bridge without exposing its hidden metadata', async () => {
    const callTool = vi.fn().mockResolvedValue({ structuredContent: { proposalId: 'proposal-one', applied: true } });
    boot({ toolResponseMetadata: { mcp_tool_result: prepared() }, callTool });
    button('confirm').click(); await flush();
    expect(callTool).toHaveBeenCalledExactlyOnceWith('confirm_screenshot_sync', { proposalId: 'proposal-one', confirmationSecret: 'private-widget-secret' });
    expect(doc.body.textContent).not.toContain('private-widget-secret');
  });
});
