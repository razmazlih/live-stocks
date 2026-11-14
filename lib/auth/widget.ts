import 'server-only';
import { z } from 'zod';

const ownedRecord = z.object({ id: z.string().min(1), user_id: z.string().min(1) }).passthrough();
const widgetSnapshotSchema = z.object({
  user_id: z.string().min(1), expires_at: z.string(),
  positions: z.array(ownedRecord),
  position_lots: z.array(ownedRecord.extend({ position_id: z.string().min(1) })),
  settings: ownedRecord.nullable(),
  encrypted_credential: z.string().nullable(), credential_aad_subject: z.string().min(1),
});

/** The server-only RPC captures financial rows and credentials under one profile fence. */
export function parseWidgetSnapshot(value: unknown) {
  const parsed = widgetSnapshotSchema.safeParse(value);
  if (!parsed.success) return null;
  const data = parsed.data;
  const positionIds = new Set(data.positions.map(position => position.id));
  if (!Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= Date.now()
    || data.credential_aad_subject !== data.user_id
    || data.positions.some(position => position.user_id !== data.user_id)
    || data.position_lots.some(lot => lot.user_id !== data.user_id || !positionIds.has(lot.position_id))
    || (data.settings && (data.settings.user_id !== data.user_id || data.settings.is_active !== true))) return null;
  return data;
}

export function widgetMetadata(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, createdAt: row.created_at, expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? null, lastUsedAt: row.last_used_at ?? null };
}
