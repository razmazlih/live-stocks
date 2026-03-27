export const APP_NAVBAR_ROUTES = [
  '/',
  '/positions',
  '/portfolio',
  '/watchlist',
  '/realized',
  '/insights',
  '/ai-prompts',
  '/settings',
] as const;

function normalizeHref(href: string) {
  const [withoutHash] = href.split('#');
  const [withoutQuery] = withoutHash.split('?');
  const normalized = withoutQuery.trim();

  if (!normalized) {
    return '';
  }

  if (normalized.length > 1 && normalized.endsWith('/')) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

export function isNavbarHref(href?: string) {
  if (!href || !href.startsWith('/')) {
    return false;
  }

  const normalizedHref = normalizeHref(href);

  return APP_NAVBAR_ROUTES.some((route) => {
    if (route === '/') {
      return normalizedHref === '/';
    }

    return normalizedHref === route || normalizedHref.startsWith(`${route}/`);
  });
}
