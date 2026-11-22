import type { ReactNode } from 'react';

// The first response includes the requested performance tab, even before hydration.
export const dynamic = 'force-dynamic';

export default function PortfolioLayout({ children }: { children: ReactNode }) {
  return children;
}
