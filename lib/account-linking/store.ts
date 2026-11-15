import 'server-only';
import type { Pool } from 'pg';
import { AccountMergeError, type MergeCeremony, type MergeStore } from './service';
export const MERGE_RECORD_PREFIX = 'livestocks:account-merge:v1:';

/** Auth-only role and existing private verification storage; no financial grants.
 * Rows outlive browser capabilities so SDK expiry cleanup cannot erase a frozen job recovery binding. */
export class PostgresMergeStore implements MergeStore {
  constructor(private readonly pool: Pool) {}
  async create(value: MergeCeremony) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='3s'; set local statement_timeout='15s'");
      // One outstanding intent per initiating canonical profile, including aliases and concurrent tabs.
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [MERGE_RECORD_PREFIX + value.actorProfileId]);
      const identifier = MERGE_RECORD_PREFIX + value.actorProfileId;
      const previous = await client.query("select 1 from livestocks_auth.verification where identifier=$1 and coalesce(value::jsonb->>'workerDone','false')<>'true' limit 1", [identifier]);
      if (previous.rowCount) throw new AccountMergeError('CONFLICT');
      await client.query('insert into livestocks_auth.verification(id,identifier,value,"expiresAt") values($1,$2,$3,$4)',
        [MERGE_RECORD_PREFIX + value.id, identifier, JSON.stringify(value), '9999-12-31T00:00:00Z']);
      await client.query('commit');
    } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async locked<T>(id: string, operation: (value: MergeCeremony) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='3s'; set local statement_timeout='15s'");
      const result = await client.query('select value from livestocks_auth.verification where id=$1 and identifier like $2 for update', [MERGE_RECORD_PREFIX + id, MERGE_RECORD_PREFIX + '%']);
      if (result.rowCount !== 1) throw new AccountMergeError('CONFLICT', 403);
      const value = JSON.parse(result.rows[0].value) as MergeCeremony;
      if (value.id !== id) throw new AccountMergeError('CONFLICT', 403);
      const response = await operation(value);
      await client.query('update livestocks_auth.verification set value=$2,"updatedAt"=clock_timestamp() where id=$1', [MERGE_RECORD_PREFIX + id, JSON.stringify(value)]);
      await client.query('commit');
      return response;
    } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async pending(limit: number): Promise<string[]> {
    // Expiry limits browser capabilities. Durable job recovery uses the same record while it exists.
    const { rows } = await this.pool.query('select value::jsonb->>\'id\' id from livestocks_auth.verification where id like $1 and coalesce(value::jsonb->>\'workerDone\',\'false\')<>\'true\' order by (value::jsonb->>\'workerReady\'=\'true\') desc nulls last,(value::jsonb->\'review\') is not null desc,"updatedAt" limit $2', [MERGE_RECORD_PREFIX + '%', limit]);
    return rows.map(row => row.id);
  }
}
