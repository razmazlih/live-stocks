export const PUBLIC_INFORMATION_PATHS = ['/about', '/privacy', '/terms'] as const;

export function isPublicInformationPath(pathname: string): boolean {
  return PUBLIC_INFORMATION_PATHS.some((path) => pathname === path);
}
