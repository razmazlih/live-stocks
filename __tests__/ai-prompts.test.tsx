import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import AiPromptsPage from '@/app/ai-prompts/page';

vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'he' }) }));
vi.mock('@/components/dashboard/dashboard-route-shell', () => ({ DashboardRouteShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/hooks/use-portfolio-data', () => ({ usePortfolioData: () => ({ metrics: [
  { position: { symbol: 'AAPL', display: 'Apple', quantity: 1, entryPrice: 10 }, currentValue: 20 },
  { position: { symbol: 'AAPL', display: 'Apple', quantity: 2, entryPrice: 15 }, currentValue: 40 },
  { position: { symbol: 'MSFT', display: 'Microsoft', quantity: 1, entryPrice: 10 }, currentValue: 20 },
], loading: false, refreshing: false, lastUpdate: null, reload: vi.fn(), error: null }) }));

describe('simplified AI document', () => {
  it('shows one selector per ticker and one document, and switches to structured data', async () => {
    const user = userEvent.setup();
    render(<AiPromptsPage />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Apple/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Apple/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    const textbox = screen.getByRole('textbox');
    expect(textbox).toHaveAttribute('dir', 'ltr');
    expect(JSON.parse((textbox as HTMLTextAreaElement).value).stocks).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /Apple/ }));
    expect(JSON.parse((textbox as HTMLTextAreaElement).value).stocks).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /Microsoft/ }));
    expect(screen.getByRole('button', { name: 'העתק ל-AI' })).toBeDisabled();
  });
});
