// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { makeLostConfirmationReply } from '@/scripts/lib/chat-sync-fixture-fault.mjs';
describe('isolated lost-confirmation response contract', () => {
  it('returns a valid complete tool error for the negotiated modern protocol', () => {
    const reply = makeLostConfirmationReply({ productionAccess: false, id: 'test-request', protocolVersion: '2026-07-28' });
    expect(reply).toMatchObject({ jsonrpc: '2.0', id: 'test-request', result: { resultType: 'complete', isError: true } });
    expect(reply.result.content[0].text).toContain('lost after execution');
    expect(reply.result).not.toHaveProperty('structuredContent');
  });
  it('preserves the legacy tool-result shape without unsupported resultType', () => {
    expect(makeLostConfirmationReply({ productionAccess: false, id: 4, protocolVersion: '2025-11-25' }).result).not.toHaveProperty('resultType');
  });
  it('cannot be used without explicit isolation or a valid request ID', () => {
    expect(() => makeLostConfirmationReply({ productionAccess: true, id: 'test' })).toThrow();
    expect(() => makeLostConfirmationReply({ productionAccess: undefined, id: 'test' })).toThrow();
    expect(() => makeLostConfirmationReply({ productionAccess: false, id: Number.NaN })).toThrow();
  });
});
