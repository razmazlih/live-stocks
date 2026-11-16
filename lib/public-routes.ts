export const PUBLIC_INFORMATION_PATHS = ['/about', '/privacy', '/terms'] as const;
export const PUBLIC_AUTH_PATHS = ['/sign-in', '/sign-up', '/forgot-password', '/reset-password', '/verify-email'] as const;

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((path) => pathname === path);
}

export function isPublicInformationPath(pathname: string): boolean {
  return PUBLIC_INFORMATION_PATHS.some((path) => pathname === path);
}
