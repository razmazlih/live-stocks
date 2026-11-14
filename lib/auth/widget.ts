import 'server-only';
export function widgetMetadata(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, createdAt: row.created_at, expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? null, lastUsedAt: row.last_used_at ?? null };
}
