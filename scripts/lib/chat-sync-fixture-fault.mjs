/** Disposable-fixture fault injection only. Never imported by application routes. */
export function makeLostConfirmationReply({ productionAccess, id, protocolVersion = '2026-07-28' }) {
  if (productionAccess !== false) throw Error('Explicit isolated fixture required');
  if ((typeof id !== 'string' && typeof id !== 'number') || (typeof id === 'number' && !Number.isFinite(id))) throw Error('Valid JSON-RPC request ID required');
  return { jsonrpc: '2.0', id, result: {
    ...(protocolVersion === '2026-07-28' ? { resultType: 'complete' } : {}),
    isError: true,
    content: [{ type: 'text', text: 'Synthetic test: confirmation response was lost after execution. Retry the same proposal.' }],
  } };
}
