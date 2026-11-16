#!/usr/bin/env python3
"""Verify screenshot import SQL in disposable LOCAL PostgreSQL, never a hosted DB.

Identity resolution is a synthetic fixture; existing auth tests own JWT/session
verification. These checks run as the real authenticated role with real RLS,
write fences, transactions, constraints and purchase RPCs.
"""
import json
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


def as_user(query, owner='fixture-a', write=True):
    claims = json.dumps({'sub': owner, 'write': write})
    return sql(f"begin;set local role authenticated;set local request.jwt.claims='{claims}';{query};commit")


def rejected(query, owner='fixture-a', write=True):
    try:
        as_user(query, owner, write)
    except RuntimeError:
        return
    raise AssertionError('Unsafe import unexpectedly succeeded')


def apply(fingerprint, rows):
    return "select public.apply_screenshot_sync('%s','%s'::jsonb)" % (fingerprint, json.dumps(rows))


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
        "create or replace function private.authorized_subject(require_write boolean default false) returns text language sql stable security definer set search_path='' as $$"
        "select case when (not require_write or auth.jwt()->>'write'='true') and auth.jwt()->>'sub' in ('fixture-a','fixture-b') then auth.jwt()->>'sub' end$$")
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
    sql("update public.user_profiles set merge_state='frozen' where id='fixture-a'")
    rejected(apply(before['fingerprint'], [dict(new, symbol='LOCKED', lotId=str(uuid.uuid4()))]))
    print('PASS SQL checkpoints, actual/estimated date separation, existing-balance correction, explicit zero, consolidated ledger zeroing, legacy baseline preservation, immutable history, merge ownership transfer, later BUY/SELL preservation, replay/tamper, isolation, read-only denial, stale/backdated review, rollback, limits, role grants and frozen-account fence')
finally:
    if started:
        call(['pg_ctl', '-D', str(runtime / 'data'), '-m', 'immediate', '-w', '-t', '30', 'stop'])
    shutil.rmtree(runtime)
    print('PASS disposable local runtime cleanup; no production access')
