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
    rows = [{'symbol': 'ABC', 'quantity': 1.25, 'averageCostUsd': 12.5, 'acquiredOn': '2026-01-01',
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
    rejected(apply(before['fingerprint'], [new, dict(rows[0], lotId=str(uuid.uuid4()))]))  # rollback first insert
    assert json.loads(as_user('select public.screenshot_sync_snapshot()')) == before
    rejected(apply(before['fingerprint'], [new, dict(new)]))
    rejected(apply(before['fingerprint'], [dict(new, acquiredOn='2099-01-01')]))
    rejected(apply(before['fingerprint'], [dict(new, quantity=0.00001)]))
    rejected(apply(before['fingerprint'], [dict(new, unknown='field')]))
    json.loads(as_user(apply(before['fingerprint'], [dict(new, location='bank_two')])))
    assert len(json.loads(as_user('select public.screenshot_sync_snapshot()'))['positions']) == 2
    assert sql("select has_function_privilege('anon','public.apply_screenshot_sync(text,jsonb)','EXECUTE')") == 'f'
    assert sql("select has_function_privilege('service_role','public.apply_screenshot_sync(text,jsonb)','EXECUTE')") == 'f'
    sql("update public.user_profiles set merge_state='frozen' where id='fixture-a'")
    rejected(apply(before['fingerprint'], [dict(new, symbol='LOCKED', lotId=str(uuid.uuid4()))]))
    print('PASS SQL import, replay, tamper rejection, owner isolation, read-only denial, stale review, atomic rollback, input limits, role grants and frozen-account fence')
finally:
    if started:
        call(['pg_ctl', '-D', str(runtime / 'data'), '-m', 'immediate', '-w', '-t', '30', 'stop'])
    shutil.rmtree(runtime)
    print('PASS disposable local runtime cleanup; no production access')
