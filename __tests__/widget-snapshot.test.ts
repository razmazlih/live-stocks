// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { parseWidgetSnapshot } from '@/lib/auth/widget';

const snapshot = {
  user_id: 'owner', expires_at: '2099-01-01T00:00:00Z',
  sources: [{ id: '10000000-0000-4000-8000-000000000001', user_id: 'owner', name: 'My broker', archived_at: null, created_at: '2026-01-01', legacy_location: null }],
  positions: [{ id: 'position', user_id: 'owner', symbol: 'DUMMY', location: '10000000-0000-4000-8000-000000000001' }],
  position_lots: [{ id: 'lot', user_id: 'owner', position_id: 'position' }],
  settings: { id: 'settings', user_id: 'owner', is_active: true },
  encrypted_credential: null, credential_aad_subject: 'owner',
};
describe('fenced widget snapshot', () => {
  it('accepts one internally consistent live snapshot, including an empty account', () => {
    expect(parseWidgetSnapshot(snapshot)).toEqual(snapshot);
    expect(parseWidgetSnapshot({ ...snapshot, positions: [], position_lots: [], settings: null })).not.toBeNull();
  });
  it.each([
    { sources: [{ id: '10000000-0000-4000-8000-000000000001', user_id: 'other', name: 'Foreign broker', archived_at: null, created_at: '2026-01-01', legacy_location: null }] },
    { sources: [] },
    { expires_at: '2000-01-01T00:00:00Z' },
    { credential_aad_subject: 'different-owner' },
    { positions: [{ id: 'position', user_id: 'different-owner' }] },
    { position_lots: [{ id: 'lot', user_id: 'different-owner', position_id: 'position' }] },
    { position_lots: [{ id: 'lot', user_id: 'owner', position_id: 'different-position' }] },
    { settings: { ...snapshot.settings, user_id: 'different-owner' } },
    { settings: { ...snapshot.settings, is_active: false } },
  ])('rejects an expired, foreign or inconsistent snapshot %j', override => {
    expect(parseWidgetSnapshot({ ...snapshot, ...override })).toBeNull();
  });
});
