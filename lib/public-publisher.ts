export type PublicPublisher = { name: string; email: string };

/** Only explicitly approved public details belong here. Never infer them from OAuth credentials. */
export function getPublicPublisher(): PublicPublisher | null {
  const name = process.env.PUBLISHER_NAME?.trim();
  const email = process.env.PUBLIC_SUPPORT_EMAIL?.trim();
  if (!name || name.length > 160 || /[\r\n<>]/.test(name)) return null;
  if (!email || email.length > 254 || !/^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email)) return null;
  return { name, email };
}
