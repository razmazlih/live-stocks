import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PositionAssetPicker, type PositionAssetValue } from '@/components/portfolio/position-asset-picker';

vi.mock('@/components/ui/stock-avatar-image', () => ({ StockAvatarImage: () => null }));
const known = [{ symbol: 'ADBE', display: 'Adobe Inc', imageUrl: 'https://example.com/adobe.png' }];
function Harness({ assets = known }: { assets?: PositionAssetValue[] }) {
  const [value, setValue] = useState<PositionAssetValue>({ symbol: '', display: '', imageUrl: '' });
  return <><PositionAssetPicker locale="he" value={value} knownAssets={assets} onChange={setValue} /><output data-testid="value">{JSON.stringify(value)}</output></>;
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('PositionAssetPicker', () => {
  it('fills name and logo from an existing symbol, then clears metadata for a different symbol', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'adbe' } });
    expect(JSON.parse(screen.getByTestId('value').textContent!)).toEqual(known[0]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'XYZ' } });
    expect(JSON.parse(screen.getByTestId('value').textContent!)).toEqual({ symbol: 'XYZ', display: '', imageUrl: '' });
  });

  it('supports keyboard selection of matching existing assets', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'AD' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(JSON.parse(screen.getByTestId('value').textContent!)).toEqual(known[0]);
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('autofills a remote exact symbol and enriches the selected logo', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('?q=')
      ? { results: [{ symbol: 'AAPL', display: 'APPLE INC', imageUrl: '' }] }
      : { symbol: 'AAPL', display: 'Apple Inc', imageUrl: 'https://example.com/apple.png' } })));
    render(<Harness assets={[]} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
    await waitFor(() => expect(JSON.parse(screen.getByTestId('value').textContent!).imageUrl).toBe('https://example.com/apple.png'));
  });

  it('discards a late result after the symbol changes', async () => {
    let resolveFirst!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { resolveFirst = resolve; })));
    render(<Harness assets={[]} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AAPL' } });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'MSFT' } });
    await act(async () => resolveFirst({ ok: true, json: async () => ({ results: [{ symbol: 'AAPL', display: 'Apple Inc', imageUrl: '' }] }) }));
    expect(JSON.parse(screen.getByTestId('value').textContent!)).toEqual({ symbol: 'MSFT', display: '', imageUrl: '' });
  });
});
