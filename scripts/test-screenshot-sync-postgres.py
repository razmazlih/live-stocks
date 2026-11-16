#!/usr/bin/env python3
"""Verify screenshot import SQL in disposable LOCAL PostgreSQL, never a hosted DB.

Identity resolution is a synthetic fixture; existing auth tests own JWT/session
verification. These checks run as the real authenticated role with real RLS,
write fences, transactions, constraints and purchase RPCs.
"""
import json
import hashlib
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile
import uuid

if len(__import__('sys').argv) != 1:
    raise ValueError('Local-only runner accepts no arguments')
root = pathlib.Path(__file__).resolve().parent.parent
runtime = pathlib.Path(tempfile.mkdtemp(prefix='livestocks-screenshot-native-'))
runtime.chmod(0o700)
env = {'PATH': os.environ['PATH'], 'LC_ALL': 'C'}
started = False


def call(args, input_text=None):
    result = subprocess.run(args, env=env, text=True, capture_output=True, input=input_text)
    if result.returncode:
        raise RuntimeError(result.stderr[-3000:])
    return result.stdout.strip()


sock = socket.socket()
sock.bind(('127.0.0.1', 0))
port = sock.getsockname()[1]
sock.close()
url = f'postgres://postgres@127.0.0.1:{port}/postgres?sslmode=disable'


def sql(query=None, path=None):
    return call(['psql', url, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'] +
                (['-f', str(path)] if path else []), input_text=None if path else query)


def as_user(query, owner='fixture-a', write=True, extra=None):
    claims = json.dumps({'sub': owner, 'write': write, **(extra or {})})
    return sql(f"begin;set local role authenticated;set local request.jwt.claims='{claims}';{query};commit")


def rejected(query, owner='fixture-a', write=True):
    try:
        as_user(query, owner, write)
    except RuntimeError:
        return
    raise AssertionError('Unsafe import unexpectedly succeeded')


def apply(fingerprint, rows):
    return "select public.apply_screenshot_sync('%s','%s'::jsonb)" % (fingerprint, json.dumps(rows))


fixture_grant = str(uuid.uuid4())


def mcp(query, owner='fixture-a', sync=False, session='fixture-session', grant=fixture_grant, **extra):
    return as_user(query, owner, False, {'azp': 'fixture-mcp', 'sid': session,
        'https://livestocks.app/grant_id': grant, 'https://livestocks.app/read_only': True,
        'scope': 'portfolio:read' + (' portfolio:sync' if sync else ''), **extra})


def mcp_rejected(query, **kwargs):
    try:
        mcp(query, **kwargs)
    except RuntimeError:
        return
    raise AssertionError('Unsafe chat confirmation unexpectedly succeeded')


def create_proposal(proposal_id, fingerprint, target, secret, previous=None, misleading=False):
    change = {key: value for key, value in target.items() if key not in ('lotId', 'location', 'observedAt')}
    if misleading:
        change['quantity'] += 1
    review = {'input': {'location': target['location'], 'observedAt': target['observedAt'], 'rows': [change]},
              'plan': {'location': target['location'], 'observedAt': target['observedAt'], 'changes': [change], 'blocked': [], 'canApply': True}}
    digest = hashlib.sha256(secret.encode()).hexdigest()
    return "select public.create_chat_sync_proposal('%s','%s','%s','%s','%s',%s)" % (
        proposal_id, fingerprint, json.dumps([target]), json.dumps(review), digest,
        "'%s'" % previous if previous else 'null')


try:
    call(['initdb', '-D', str(runtime / 'data'), '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8'])
    call(['pg_ctl', '-D', str(runtime / 'data'), '-l', str(runtime / 'postgres.log'), '-o',
          f"-h 127.0.0.1 -p {port} -c unix_socket_directories=''", '-w', 'start'])
    started = True
    sql("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;"
        "create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;"
        "grant usage on schema auth,public to anon,authenticated,service_role")
    for migration in sorted((root / 'supabase/migrations').glob('*.sql')):
        sql(path=migration)
    sql("insert into public.user_profiles(id) values('fixture-a'),('fixture-b');"
        "insert into private.auth_config(singleton,issuer,website_client_id,mcp_client_id,website_audience,mcp_audience,auth_provider) values(true,'https://fixture.invalid/auth','fixture-web','fixture-mcp','https://fixture.invalid/web','https://fixture.invalid/mcp','better_auth');"
        "create or replace function private.authorized_subject(require_write boolean default false) returns text language sql stable security definer set search_path='' as $$"
        "select case when (not require_write or auth.jwt()->>'write'='true') and auth.jwt()->>'live' is distinct from 'false' and auth.jwt()->>'sub' in ('fixture-a','fixture-b') then auth.jwt()->>'sub' end$$")
    snapshot = json.loads(as_user('select public.screenshot_sync_snapshot()'))
    assert snapshot['positions'] == [] and snapshot['lots'] == []
    rows = [{'symbol': 'ABC', 'quantity': 1.25, 'averageCostUsd': 12.5, 'acquiredOn': '2026-01-01', 'estimatedAcquiredOn': None, 'observedAt': '2026-02-01',
             'location': 'bank_one', 'lotId': str(uuid.uuid4())}]
    rejected(apply(snapshot['fingerprint'], rows), write=False)
    result = json.loads(as_user(apply(snapshot['fingerprint'], rows)))
    assert result['applied'] and not result['replayed']
    assert json.loads(as_user(apply(snapshot['fingerprint'], rows)))['replayed']
    assert json.loads(as_user('select public.screenshot_sync_snapshot()', 'fixture-b'))['positions'] == []
    tampered = [dict(rows[0], quantity=2)]
    rejected(apply(snapshot['fingerprint'], tampered))
    before = json.loads(as_user('select public.screenshot_sync_snapshot()'))
    new = dict(rows[0], symbol='XYZ', lotId=str(uuid.uuid4()))
    rejected(apply(snapshot['fingerprint'], [new]))  # stale review
    rejected(apply(before['fingerprint'], [new, dict(rows[0], observedAt='2026-01-01', lotId=str(uuid.uuid4()))]))  # rollback first insert
    assert json.loads(as_user('select public.screenshot_sync_snapshot()')) == before
    rejected(apply(before['fingerprint'], [new, dict(new)]))
    rejected(apply(before['fingerprint'], [dict(new, acquiredOn='2099-01-01')]))
    rejected(apply(before['fingerprint'], [dict(new, estimatedAcquiredOn='2026-01-02')]))  # actual and estimated are exclusive
    rejected(apply(before['fingerprint'], [dict(new, acquiredOn=None, estimatedAcquiredOn='2099-01-01')]))
    rejected(apply(before['fingerprint'], [dict(new, quantity=0.00001)]))
    rejected(apply(before['fingerprint'], [dict(new, unknown='field')]))
    json.loads(as_user(apply(before['fingerprint'], [dict(new, location='bank_two')])))
    assert len(json.loads(as_user('select public.screenshot_sync_snapshot()'))['positions']) == 2
    checkpoint_id = rows[0]['lotId']
    position_id = result['positions'][0]['positionId']
    rejected(f"update public.position_lots set quantity=7 where id='{checkpoint_id}'")
    rejected(f"delete from public.position_lots where id='{checkpoint_id}'")
    rejected(f"delete from public.positions where id='{position_id}'")
    # A real subsequent purchase is a BUY and remains intact across a correction.
    buy_id = str(uuid.uuid4())
    as_user(f"select * from public.record_position_purchase('{buy_id}','ABC','ABC','','bank_one',14,2,'2026-02-02',false,0)")
    sell_id = str(uuid.uuid4())
    as_user(f"insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount) values('{sell_id}','fixture-a','{position_id}','SELL',17,1,'2026-02-03',false,0)")
    # A canonical identity may retain several separate ledgers after account merge.
    consolidated_id = str(uuid.uuid4())
    sql("alter table public.positions disable trigger a_account_write_fence;"
        f"insert into public.positions(id,user_id,symbol,display,image_url,location,entry_price,quantity,entry_date,consolidated_into_position_id) values('{consolidated_id}','fixture-a','ABC','ABC','','bank_one',9,4,'2026-01-01','{position_id}');"
        "alter table public.positions enable trigger a_account_write_fence")
    original = json.loads(as_user('select public.screenshot_sync_snapshot()'))
    corrected = dict(rows[0], quantity=8, averageCostUsd=11, acquiredOn=None, estimatedAcquiredOn='2026-01-15', observedAt='2026-02-04', lotId=str(uuid.uuid4()))
    json.loads(as_user(apply(original['fingerprint'], [corrected])))
    reconciled = json.loads(as_user('select public.screenshot_sync_snapshot()'))
    previous = {item['id']: item for item in original['lots']}
    current = {item['id']: item for item in reconciled['lots']}
    assert all(current[key] == item for key, item in previous.items())
    assert current[corrected['lotId']]['side'] == 'RECONCILE'
    assert current[corrected['lotId']]['quantity'] == 8 and current[corrected['lotId']]['basis_acquired_on'] is None
    assert current[corrected['lotId']]['basis_date_estimate'] == '2026-01-15'
    rejected(apply(original['fingerprint'], [dict(corrected, estimatedAcquiredOn='2026-01-16')]))
    zeroes = [item for item in reconciled['lots'] if item['position_id'] == consolidated_id]
    assert len(zeroes) == 2
    assert any(item['side'] == 'RECONCILE' and item['quantity'] == 0 for item in zeroes)
    assert any(item['side'] == 'BUY' and item['quantity'] == 4 and item['price'] == 9 and item['executed_at'] == '2026-01-01' for item in zeroes)
    assert json.loads(as_user(apply(original['fingerprint'], [corrected])))['replayed']
    closed = dict(corrected, quantity=0, averageCostUsd=0, observedAt='2026-02-05', lotId=str(uuid.uuid4()))
    json.loads(as_user(apply(reconciled['fingerprint'], [closed])))
    closed_snapshot = json.loads(as_user('select public.screenshot_sync_snapshot()'))
    assert next(item for item in closed_snapshot['lots'] if item['id'] == closed['lotId'])['quantity'] == 0
    # No screenshot import ever creates a SELL or edits prior historical events.
    assert len([item for item in closed_snapshot['lots'] if item['side'] == 'SELL']) == 1
    # The existing privileged account-merge path can move checkpoint ownership
    # without altering its financial fields or losing its immutable provenance.
    transferred_position = next(item['id'] for item in closed_snapshot['positions'] if item['symbol'] == 'XYZ')
    sql("begin;set local role livestocks_merge_executor;"
        "set constraints public.position_lots_position_owner_fkey deferred;"
        f"update public.positions set user_id='fixture-b' where id='{transferred_position}';"
        f"update public.position_lots set user_id='fixture-b' where position_id='{transferred_position}';commit")
    transferred = json.loads(as_user('select public.screenshot_sync_snapshot()', 'fixture-b'))
    assert len(transferred['lots']) == 1 and transferred['lots'][0]['side'] == 'RECONCILE'
    assert sql("select has_function_privilege('anon','public.apply_screenshot_sync(text,jsonb)','EXECUTE')") == 'f'
    assert sql("select has_function_privilege('service_role','public.apply_screenshot_sync(text,jsonb)','EXECUTE')") == 'f'
    # Persisted in-chat reviews: read OAuth can prepare, only the exact secret-
    # confirmed review plus optional sync scope may enter the financial worker.
    live_snapshot = json.loads(mcp('select public.screenshot_sync_snapshot()'))
    target = dict(corrected, quantity=12, observedAt='2026-02-06', lotId=str(uuid.uuid4()))
    proposal_id, secret = str(uuid.uuid4()), uuid.uuid4().hex + uuid.uuid4().hex
    create = create_proposal(proposal_id, live_snapshot['fingerprint'], target, secret)
    saved = json.loads(mcp(create))
    assert saved['status'] == 'pending' and saved['receipt'] is None
    assert not {'confirmation_hash', 'rows', 'expected', 'session_id', 'grant_id'} & saved.keys()
    assert json.loads(mcp(create)) == saved  # retry preserves original expiry
    read = f"select public.read_chat_sync_proposal('{proposal_id}')"
    confirm = f"select public.confirm_chat_sync_proposal('{proposal_id}','{secret}')"
    mcp_rejected(read, owner='fixture-b')
    mcp_rejected(read, session='different-session')
    mcp_rejected(read, grant=str(uuid.uuid4()))
    mcp_rejected(read, live=False)
    mcp_rejected(read, azp='unapproved-client')
    mcp_rejected(read, scope='portfolio:read portfolio:sync portfolio:write')
    mcp_rejected("select confirmation_hash from private.chat_sync_proposals", sync=True)
    mcp_rejected(confirm)  # read-only token has no optional sync capability
    mcp_rejected(f"select public.confirm_chat_sync_proposal('{proposal_id}','{'x' * 64}')", sync=True)
    mcp_rejected(apply(live_snapshot['fingerprint'], [target]), sync=True)
    mcp_rejected("select public.apply_chat_screenshot_sync('%s','%s')" % (live_snapshot['fingerprint'], json.dumps([target])), sync=True)
    assert sql("select pg_has_role('authenticated','livestocks_sync_executor','MEMBER')") == 'f'
    mcp_rejected(f"insert into public.position_lots(user_id,position_id,side,price,quantity,executed_at) values('fixture-a','{position_id}','BUY',2,1,'2026-02-06')", sync=True)
    mcp(f"update public.positions set quantity=999 where id='{position_id}'", sync=True)
    mcp(f"delete from public.position_lots where position_id='{position_id}'", sync=True)
    assert json.loads(mcp('select public.screenshot_sync_snapshot()')) == live_snapshot
    receipt = json.loads(mcp(confirm, sync=True))
    assert receipt['applied'] and len(receipt['positions']) == 1
    assert json.loads(mcp(confirm, sync=True)) == receipt  # saved exact receipt
    assert json.loads(mcp(read))['status'] == 'applied'
    mcp_rejected(confirm, sync=True, live=False)
    mcp_rejected(f"select public.cancel_chat_sync_proposal('{proposal_id}','{secret}')")
    fresh = json.loads(mcp('select public.screenshot_sync_snapshot()'))
    # New holdings use the same isolated worker, including its positions INSERT
    # fence and owner RLS, and a two-row confirmation remains one transaction.
    batch = [dict(target, symbol=symbol, acquiredOn=None, estimatedAcquiredOn=None, lotId=str(uuid.uuid4()))
             for symbol in ('CHATNEW', 'CHATMORE')]
    batch_changes = [{key: value for key, value in item.items() if key not in ('lotId', 'location', 'observedAt')}
                     for item in batch]
    batch_review = {'input': {'location': 'bank_one', 'observedAt': target['observedAt'], 'rows': batch_changes},
                    'plan': {'location': 'bank_one', 'observedAt': target['observedAt'], 'changes': batch_changes, 'blocked': [], 'canApply': True}}
    batch_id = str(uuid.uuid4())
    batch_query = "select public.create_chat_sync_proposal('%s','%s','%s','%s','%s')" % (
        batch_id, fresh['fingerprint'], json.dumps(batch), json.dumps(batch_review), hashlib.sha256(secret.encode()).hexdigest())
    mcp(batch_query)
    batch_receipt = json.loads(mcp(f"select public.confirm_chat_sync_proposal('{batch_id}','{secret}')", sync=True))
    assert len(batch_receipt['positions']) == 2
    fresh = json.loads(mcp('select public.screenshot_sync_snapshot()'))
    assert all(any(item['id'] == row['lotId'] and item['side'] == 'RECONCILE' for item in fresh['lots']) for row in batch)
    next_target = dict(target, quantity=13, lotId=str(uuid.uuid4()))
    mcp_rejected(create_proposal(str(uuid.uuid4()), fresh['fingerprint'], next_target, secret, misleading=True))
    old_id, revised_id = str(uuid.uuid4()), str(uuid.uuid4())
    mcp(create_proposal(old_id, fresh['fingerprint'], next_target, secret))
    mcp(create_proposal(revised_id, fresh['fingerprint'], next_target, secret, previous=old_id))
    assert json.loads(mcp(f"select public.read_chat_sync_proposal('{old_id}')"))['status'] == 'superseded'
    mcp_rejected(f"select public.confirm_chat_sync_proposal('{old_id}','{secret}')", sync=True)
    cancel = f"select public.cancel_chat_sync_proposal('{revised_id}','{secret}')"
    assert json.loads(mcp(cancel))['status'] == 'cancelled'
    assert json.loads(mcp(cancel))['status'] == 'cancelled'
    invalidated_id = str(uuid.uuid4())
    mcp(create_proposal(invalidated_id, fresh['fingerprint'], next_target, secret))
    invalidate = f"select public.supersede_chat_sync_proposal('{invalidated_id}')"
    mcp_rejected(invalidate, session='another-session')
    assert json.loads(mcp(invalidate))['status'] == 'superseded'
    assert json.loads(mcp(invalidate))['status'] == 'superseded'
    mcp_rejected(f"select public.confirm_chat_sync_proposal('{invalidated_id}','{secret}')", sync=True)
    expiring_id = str(uuid.uuid4())
    mcp(create_proposal(expiring_id, fresh['fingerprint'], next_target, secret))
    sql("alter table private.chat_sync_proposals disable trigger chat_sync_proposal_immutable;"
        f"update private.chat_sync_proposals set created_at=clock_timestamp()-interval '16 minutes',expires_at=clock_timestamp()-interval '2 minutes' where id='{expiring_id}';"
        "alter table private.chat_sync_proposals enable trigger chat_sync_proposal_immutable")
    mcp_rejected(f"select public.confirm_chat_sync_proposal('{expiring_id}','{secret}')", sync=True)
    stale_id = str(uuid.uuid4())
    mcp(create_proposal(stale_id, fresh['fingerprint'], next_target, secret))
    as_user(f"select * from public.record_position_purchase('{uuid.uuid4()}','AFTER','AFTER','','bank_one',1,1,'2026-02-06',false,0)")
    mcp_rejected(f"select public.confirm_chat_sync_proposal('{stale_id}','{secret}')", sync=True)
    assert json.loads(mcp(f"select public.read_chat_sync_proposal('{stale_id}')"))['status'] == 'pending'
    assert sql("select has_function_privilege('authenticated','public.apply_chat_screenshot_sync(text,jsonb)','EXECUTE')") == 'f'
    assert sql("select has_function_privilege('anon','public.confirm_chat_sync_proposal(uuid,text)','EXECUTE')") == 'f'
    # A model can omit previousProposalId. Only one pending card may remain in
    # the exact binding, while independent sessions/grants/accounts stay intact.
    unchanged_financial = json.loads(mcp('select public.screenshot_sync_snapshot()'))
    auto_a, auto_b = str(uuid.uuid4()), str(uuid.uuid4())
    auto_target = dict(next_target, lotId=str(uuid.uuid4()))
    auto_a_query = create_proposal(auto_a, unchanged_financial['fingerprint'], auto_target, secret)
    foreign_id, other_session_id, other_grant_id = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    another_grant = str(uuid.uuid4())
    foreign_query = create_proposal(foreign_id, transferred['fingerprint'], auto_target, secret)
    mcp(foreign_query, owner='fixture-b')
    mcp(create_proposal(other_session_id, unchanged_financial['fingerprint'], auto_target, secret), session='isolated-session')
    mcp(create_proposal(other_grant_id, unchanged_financial['fingerprint'], auto_target, secret), grant=another_grant)
    mcp(auto_a_query)
    auto_b_query = create_proposal(auto_b, unchanged_financial['fingerprint'], dict(auto_target, lotId=str(uuid.uuid4())), secret)
    mcp(auto_b_query)  # no explicit previous ID
    assert json.loads(mcp(f"select public.read_chat_sync_proposal('{auto_a}')"))['status'] == 'superseded'
    mcp_rejected(f"select public.confirm_chat_sync_proposal('{auto_a}','{secret}')", sync=True)
    assert json.loads(mcp(auto_a_query))['status'] == 'superseded'
    assert json.loads(mcp(create))['status'] == 'applied'  # old saved receipt retry
    assert json.loads(mcp(f"select public.read_chat_sync_proposal('{auto_b}')"))['status'] == 'pending'
    mcp_rejected(create_proposal(str(uuid.uuid4()), unchanged_financial['fingerprint'], auto_target, secret, misleading=True))
    assert json.loads(mcp(f"select public.read_chat_sync_proposal('{auto_b}')"))['status'] == 'pending'  # failed replacement rolls back retirement
    mcp_rejected(create_proposal(str(uuid.uuid4()), unchanged_financial['fingerprint'], auto_target, secret, previous=foreign_id))
    mcp_rejected("select public.supersede_pending_chat_sync_proposals()")  # requires sync scope
    mcp_rejected(f"select public.supersede_pending_chat_sync_proposals('{foreign_id}')", sync=True)
    assert json.loads(mcp(f"select public.read_chat_sync_proposal('{auto_b}')"))['status'] == 'pending'
    assert json.loads(mcp('select public.supersede_pending_chat_sync_proposals()', sync=True))['superseded'] == 1
    assert json.loads(mcp('select public.supersede_pending_chat_sync_proposals()', sync=True))['superseded'] == 0
    mcp_rejected(f"select public.confirm_chat_sync_proposal('{auto_b}','{secret}')", sync=True)
    assert json.loads(mcp(f"select public.read_chat_sync_proposal('{foreign_id}')", owner='fixture-b'))['status'] == 'pending'
    assert json.loads(mcp(f"select public.read_chat_sync_proposal('{other_session_id}')", session='isolated-session'))['status'] == 'pending'
    assert json.loads(mcp(f"select public.read_chat_sync_proposal('{other_grant_id}')", grant=another_grant))['status'] == 'pending'
    assert json.loads(mcp('select public.screenshot_sync_snapshot()')) == unchanged_financial
    assert sql("select has_function_privilege('authenticated','private.chat_sync_dispatch_saved(text,uuid,text,jsonb,jsonb,text,text,uuid)','EXECUTE')") == 'f'
    # Local catalog security checks supplement the runtime owner/RLS tests. CLI
    # 2.54 has no advisors command and native Postgres has no plpgsql_check addon.
    assert sql("select relrowsecurity from pg_class where oid='private.chat_sync_proposals'::regclass") == 't'
    assert sql("select has_table_privilege('authenticated','private.chat_sync_proposals','SELECT')") == 'f'
    assert sql("select has_function_privilege('anon','public.supersede_pending_chat_sync_proposals(uuid)','EXECUTE')") == 'f'
    assert sql("select has_function_privilege('service_role','public.supersede_pending_chat_sync_proposals(uuid)','EXECUTE')") == 'f'
    assert sql("select not prosecdef and proconfig @> array['search_path=\"\"'] from pg_proc where oid='public.supersede_pending_chat_sync_proposals(uuid)'::regprocedure") == 't'
    assert sql("select prosecdef and pg_get_userbyid(proowner)='livestocks_sync_executor' and proconfig @> array['search_path=\"\"'] from pg_proc where oid='private.chat_sync_dispatch(text,uuid,text,jsonb,jsonb,text,text,uuid)'::regprocedure") == 't'
    assert sql("select indisunique and indpred is not null from pg_index where indexrelid='private.chat_sync_one_pending_binding_idx'::regclass") == 't'

    # Hold a real transaction after replacement to force the old confirmation to
    # wait on the same binding lock. It must wake to a superseded card, not apply.
    race_old, race_new = str(uuid.uuid4()), str(uuid.uuid4())
    race_target = dict(auto_target, quantity=15, lotId=str(uuid.uuid4()))
    mcp(create_proposal(race_old, unchanged_financial['fingerprint'], race_target, secret))
    new_query = create_proposal(race_new, unchanged_financial['fingerprint'], dict(race_target, quantity=16, lotId=str(uuid.uuid4())), secret)
    claims = json.dumps({'sub': 'fixture-a', 'write': False, 'azp': 'fixture-mcp', 'sid': 'fixture-session',
        'https://livestocks.app/grant_id': fixture_grant, 'https://livestocks.app/read_only': True,
        'scope': 'portfolio:read portfolio:sync'})
    held = subprocess.Popen(['psql', url, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
        env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        held.stdin.write(f"begin;set local role authenticated;set local request.jwt.claims='{claims}';{new_query};select pg_sleep(0.5);commit;")
        held.stdin.close();held.stdin = None
        assert json.loads(held.stdout.readline())['id'] == race_new
        mcp_rejected(f"select public.confirm_chat_sync_proposal('{race_old}','{secret}')", sync=True)
        _, diagnostics = held.communicate(timeout=10)
        assert held.returncode == 0, diagnostics
    finally:
        if held.poll() is None:
            held.kill();held.communicate()
    assert json.loads(mcp(f"select public.read_chat_sync_proposal('{race_new}')"))['status'] == 'pending'
    assert json.loads(mcp('select public.screenshot_sync_snapshot()')) == unchanged_financial
    print('PASS automatic single pending card, omitted previous ID, terminal retry preservation, isolated binding invalidation, and real replacement-versus-confirm transaction serialization')
    print('PASS persisted inline chat reviews, exact display binding, scope-limited confirmation, session/grant isolation, hidden hash, retry receipt, supersession/cancellation, expiry, revocation and stale rejection; direct MCP writes remain denied')
    sql("update public.user_profiles set merge_state='frozen' where id='fixture-a'")
    rejected(apply(before['fingerprint'], [dict(new, symbol='LOCKED', lotId=str(uuid.uuid4()))]))
    print('PASS SQL checkpoints, actual/estimated date separation, existing-balance correction, explicit zero, consolidated ledger zeroing, legacy baseline preservation, immutable history, merge ownership transfer, later BUY/SELL preservation, replay/tamper, isolation, read-only denial, stale/backdated review, rollback, limits, role grants and frozen-account fence')
finally:
    if started:
        call(['pg_ctl', '-D', str(runtime / 'data'), '-m', 'immediate', '-w', '-t', '30', 'stop'])
    shutil.rmtree(runtime)
    print('PASS disposable local runtime cleanup; no production access')
