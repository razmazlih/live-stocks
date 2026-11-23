import { NextRequest, NextResponse } from 'next/server';
import { hasLocalDemoSession, localDemoOriginAllowed } from '@/lib/demo/server';
import { executeDemoOperation, localDemoDashboard } from '@/lib/demo/ledger';
import { readDemoState, migrateDemoState, updateDemoState, resetDemoState, seedDemoState,
  validateDemoSettings, validateDemoPreferences, type DemoImport } from '@/lib/demo/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Origin' };
type Context = { params: Promise<{ path: string[] }> };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

async function handler(request: NextRequest, context: Context) {
  if (!hasLocalDemoSession(request)) return json({ error: 'Local account is unavailable' }, 404);
  const write = !['GET','HEAD'].includes(request.method);
  if (!localDemoOriginAllowed(request, !write)) return json({ error: 'Request origin is not allowed' }, 403);
  const parts = (await context.params).path;
  const endpoint = parts.join('/');
  try {
    let body: unknown;
    if (write && request.method !== 'DELETE') {
      const text = await request.text();
      if (text.length > 2_000_000) return json({ error: 'Local account request is too large' }, 413);
      body = text ? JSON.parse(text) : {};
    }
    if (endpoint === 'state' && request.method === 'GET') {
      const state = await readDemoState();
      return json({ exists: Boolean(state), ...(state ?? { settings: null, preferences: {} }) });
    }
    if (['migrate','import'].includes(endpoint) && request.method === 'POST') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid local account import' }, 400);
      const result = await migrateDemoState(body as DemoImport);
      return json({ imported: result.imported, ...result.state });
    }
    if (endpoint === 'reset' && request.method === 'POST') {
      if (!body || typeof body !== 'object' || (body as { confirm?: unknown }).confirm !== true) return json({ error: 'Explicit reset confirmation is required' }, 400);
      return json({ reset: true, ...await resetDemoState() });
    }
    if (endpoint === 'settings') {
      if (request.method === 'GET') return json((await readDemoState() ?? seedDemoState()).settings);
      if (request.method === 'PATCH') {
        if (!body || typeof body !== 'object' || !('annualGrowthRate' in body) || Object.keys(body).length !== 1) {
          return json({ error: 'Expected an annual growth rate' }, 400);
        }
        const rate = body.annualGrowthRate;
        const saved = await updateDemoState(state => {
          const settings = { ...state.settings, annualGrowthRate: rate };
          validateDemoSettings(settings);
          state.settings = settings;
          return settings;
        });
        return json(saved);
      }
      if (request.method === 'PUT') {
        validateDemoSettings(body);
        await updateDemoState(state => { state.settings = body; });
        return json(body);
      }
    }
    if (endpoint === 'preferences') {
      if (request.method === 'GET') return json((await readDemoState() ?? seedDemoState()).preferences);
      if (['PATCH','PUT'].includes(request.method)) {
        validateDemoPreferences(body);
        const preferences = await updateDemoState(state => { state.preferences = { ...state.preferences, ...body }; return state.preferences; });
        return json(preferences);
      }
    }
    if (endpoint === 'dashboard' && request.method === 'GET') return json(localDemoDashboard((await readDemoState() ?? seedDemoState()).ledger));
    if (parts[0] === 'rest' && parts[1] === 'v1' && parts.length >= 3) {
      const resource = parts.slice(2).join('/');
      if (resource === 'settings') {
        const state = await readDemoState() ?? seedDemoState();
        let row = { id: 'demo-settings', annual_growth_rate: state.settings.annualGrowthRate, currency: state.settings.currency, refresh_interval: state.settings.refreshInterval, is_active: true };
        if (write && ['POST','PATCH'].includes(request.method)) {
          if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ message: 'Invalid settings' }, 400);
          row = { ...row, ...body };
          const settings = { annualGrowthRate: row.annual_growth_rate, currency: row.currency, refreshInterval: row.refresh_interval };
          validateDemoSettings(settings);
          await updateDemoState(value => { value.settings = settings; });
        } else if (write) return json({ message: 'Unsupported settings operation' }, 400);
        return json(request.headers.get('accept')?.includes('application/vnd.pgrst.object+json') ? row : [row]);
      }
      const operation = (state: Awaited<ReturnType<typeof seedDemoState>>) => {
        const result = executeDemoOperation(state.ledger, resource, request.method, request.nextUrl.searchParams, body, request.headers.get('prefer')?.includes('resolution=merge-duplicates'));
        state.ledger = result.ledger;
        return result.data;
      };
      const data = write ? await updateDemoState(operation) : operation(await readDemoState() ?? seedDemoState());
      const single = request.headers.get('accept')?.includes('application/vnd.pgrst.object+json');
      return new NextResponse(request.method === 'HEAD' ? null : JSON.stringify(single ? data[0] ?? null : data), { status: 200,
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Range': `0-${Math.max(data.length - 1, 0)}/${data.length}` } });
    }
    return json({ error: 'Unknown local account endpoint' }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to access the local account', message: error instanceof Error ? error.message : 'Unable to access the local account', code: 'DEMO_LOCAL_ERROR' }, 400);
  }
}
export const GET = handler;
export const HEAD = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
