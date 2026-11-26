#!/usr/bin/env python3
"""Exercise executed-trade proposal security in disposable LOCAL PostgreSQL only."""
import hashlib
import json
import os
import pathlib
import socket
import subprocess
import tempfile
import uuid

if len(__import__('sys').argv) != 1:
    raise ValueError('Local-only runner accepts no arguments')
root = pathlib.Path(__file__).resolve().parent.parent
runtime = pathlib.Path(tempfile.mkdtemp(prefix='livestocks-chat-transactions-'))
runtime.chmod(0o700)
pg_bin = pathlib.Path('/opt/homebrew/opt/postgresql@17/bin')
env = {'PATH': str(pg_bin) + os.pathsep + os.environ['PATH'], 'LC_ALL': 'C'}
started = False

def call(args, query=None):
    r = subprocess.run(args, env=env, text=True, capture_output=True, input=query)
    if r.returncode:
        raise RuntimeError(r.stderr[-4000:])
    return r.stdout.strip()

sock = socket.socket(); sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]; sock.close()
url = f'postgres://postgres@127.0.0.1:{port}/postgres?sslmode=disable'

def sql(query):
    return call(['psql', url, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], query)

def invoke(query, owner='fixture-a', scopes='portfolio:read portfolio:transactions', session='fixture-session', grant='00000000-0000-4000-8000-000000000001'):
    claims = json.dumps({'sub': owner, 'write': False, 'azp': 'fixture-mcp', 'sid': session,
                         'https://livestocks.app/grant_id': grant, 'https://livestocks.app/read_only': True, 'scope': scopes})
    return sql(f"begin;set local role authenticated;set local request.jwt.claims='{claims}';{query};commit")

def reject(query, **kwargs):
    try:
        invoke(query, **kwargs)
    except RuntimeError:
        return
    raise AssertionError('Unsafe transaction call succeeded')

def snap():
    return json.loads(invoke('select public.screenshot_sync_snapshot()'))

def transaction_plan(source, side='BUY', quantity=2, price=100, date='2026-01-01', commission=0, before_quantity=0, before_average=None, after_quantity=None, after_average=None, symbol='AAPL', source_name='מקור ראשי'):
    inp = {'location': source, 'side': side, 'symbol': symbol, 'quantity': quantity, 'priceUsd': price, 'executedOn': date, 'commissionUsd': commission}
    aq = after_quantity if after_quantity is not None else before_quantity + (quantity if side == 'BUY' else -quantity)
    aa = after_average if after_average is not None else (price + (commission or 0) / quantity if before_quantity == 0 else before_average)
    return {'location': source, 'sourceName': source_name, 'transaction': inp, 'canApply': True,
            'changes': [{'symbol': symbol, 'previousQuantity': before_quantity, 'quantity': aq, 'previousAverageCostUsd': before_average, 'averageCostUsd': aa if aq > 0 else 0}]}

def proposal_query(inp, plan, proposal=None, fingerprint=None):
    proposal = proposal or str(uuid.uuid4())
    secret = 'a' * 43
    query = "select public.create_chat_transaction_proposal('%s','%s','%s'::jsonb,'%s'::jsonb,'%s')" % (proposal, fingerprint or snap()['fingerprint'], json.dumps(inp), json.dumps({'input': inp, 'plan': plan}), hashlib.sha256(secret.encode()).hexdigest())
    return proposal, secret, query

def prepare(source, *, proposal=None, fingerprint=None, **kwargs):
    plan = transaction_plan(source, **kwargs)
    return proposal_query(plan['transaction'], plan, proposal, fingerprint)

def prepare_batch(plans):
    return proposal_query({'transactions': [plan['transaction'] for plan in plans]}, {'canApply': True, 'transactions': plans})

def confirm(proposal, secret):
    return "select public.confirm_chat_transaction_proposal('%s','%s')" % (proposal, secret)

try:
    call(['initdb', '-D', str(runtime / 'data'), '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8'])
    call(['pg_ctl', '-D', str(runtime / 'data'), '-l', str(runtime / 'postgres.log'), '-o', f"-h 127.0.0.1 -p {port} -c unix_socket_directories=''", '-w', 'start']); started = True
    sql("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth,public to anon,authenticated,service_role")
    transaction_migration = root / 'supabase/migrations/20261116182648_chat_executed_transactions.sql'
    commission_migration = root / 'supabase/migrations/20261116211749_require_chat_transaction_commission.sql'
    correction_migration = root / 'supabase/migrations/20261117001000_web_reconciliation_corrections.sql'
    batch_migration = root / 'supabase/migrations/20261126205324_chat_transaction_batches.sql'
    secondary_client_migration = root / 'supabase/migrations/20261126212442_secondary_better_auth_mcp_client.sql'
    for migration in sorted((root / 'supabase/migrations').glob('*.sql')):
        if migration not in (transaction_migration, commission_migration, correction_migration, batch_migration, secondary_client_migration):
            sql(migration.read_text())
    # Reproduce managed postgres: owns project objects but is NOINHERIT and
    # NOSUPERUSER, with only CREATEROLE plus explicitly granted schema rights.
    sql("create role fixture_transaction_migrator login noinherit nosuperuser nobypassrls createrole;grant usage,create on schema private,public to fixture_transaction_migrator;grant usage on schema auth to fixture_transaction_migrator;grant references on public.user_profiles to fixture_transaction_migrator;alter schema private owner to fixture_transaction_migrator;alter schema public owner to fixture_transaction_migrator;alter schema auth owner to fixture_transaction_migrator;alter table public.positions owner to fixture_transaction_migrator;alter table public.position_lots owner to fixture_transaction_migrator;alter table public.investment_sources owner to fixture_transaction_migrator;")
    for signature in ['private.account_write_fence()', 'private.chat_sync_principal()', 'private.authorized_subject(boolean)', 'private.lock_active_profile(text)', 'private.require_active_source(uuid,text)', 'public.screenshot_sync_snapshot()', 'private.chat_sync_proposal_immutable()']:
        sql(f'alter function {signature} owner to fixture_transaction_migrator')
    # PostgreSQL 17 does not automatically give the creator SET membership.
    sql("set session authorization fixture_transaction_migrator;" + transaction_migration.read_text())
    assert sql("select pg_has_role('fixture_transaction_migrator','livestocks_transaction_executor','SET') and not pg_has_role('fixture_transaction_migrator','livestocks_transaction_executor','USAGE')") == 't'
    print('PASS managed NOSUPERUSER NOINHERIT migration ownership with explicit SET membership')
    # Restore pre-existing security-definer ownership for the independent auth
    # fixture; the new dispatcher retains the restricted executor ownership.
    for signature in ['private.account_write_fence()', 'private.chat_sync_principal()', 'private.authorized_subject(boolean)', 'private.lock_active_profile(text)', 'private.require_active_source(uuid,text)', 'public.screenshot_sync_snapshot()', 'private.chat_sync_proposal_immutable()']:
        sql(f'alter function {signature} owner to postgres;grant execute on function {signature} to fixture_transaction_migrator')
    sql("insert into public.user_profiles(id) values('fixture-a'),('fixture-b');insert into private.auth_config(singleton,issuer,website_client_id,mcp_client_id,website_audience,mcp_audience,auth_provider) values(true,'https://fixture.invalid/auth','fixture-web','fixture-mcp','https://fixture.invalid/web','https://fixture.invalid/mcp','better_auth');create or replace function private.authorized_subject(require_write boolean default false) returns text language sql stable security definer set search_path='' as $$select case when (not require_write or auth.jwt()->>'write'='true') and auth.jwt()->>'sub' in ('fixture-a','fixture-b') then auth.jwt()->>'sub' end$$")
    source = snap()['sources'][0]['id']
    pid, secret, query = prepare(source)
    for scopes in ['portfolio:read', 'portfolio:read portfolio:sync', 'portfolio:read portfolio:write']:
        reject(query, scopes=scopes)
    review = json.loads(invoke(query)); assert review['status'] == 'pending' and len(snap()['positions']) == 0
    assert 'confirmation_hash' not in json.dumps(review)
    reject(confirm(pid, 'wrong-secret'))
    reject(confirm(pid, secret), session='other-session')
    reject(confirm(pid, secret), owner='fixture-b')
    reject(confirm(pid, secret), grant='00000000-0000-4000-8000-000000000002')
    result = json.loads(invoke(confirm(pid, secret))); assert result['applied'] and result['commissionKnown']
    assert json.loads(invoke(confirm(pid, secret))) == result
    first = snap(); assert len(first['lots']) == 1 and first['lots'][0]['side'] == 'BUY'
    reject(f"insert into public.position_lots(user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount) values('fixture-a','{result['positionId']}','BUY',100,1,'2026-01-01',false,0)")
    reject(f"select private.chat_transaction_worker('{pid}','{first['fingerprint']}','{{}}','{{}}',true)")
    print('PASS separate consent, no prepare write, hidden capability, binding isolation, idempotent confirmation and generic write denial')
    # Same-day addition follows the original buy despite snapshot ID sorting.
    pid2, secret2, query2 = prepare(source, side='SELL', quantity=1, price=150, before_quantity=2, before_average=100, after_average=100)
    invoke(query2); sale = json.loads(invoke(confirm(pid2, secret2)))
    second = snap(); assert sorted(second['lots'], key=lambda row: row['id'])[-1]['id'] == sale['lotId']
    assert second['lots'][0] == first['lots'][0]
    print('PASS partial actual SELL, append-preserved same-day FIFO and immutable original BUY')
    # Replacing a proposal invalidates its earlier card; oversell rejects atomically.
    pending, ps, pq = prepare(source, side='SELL', quantity=1, price=155, before_quantity=1, before_average=100)
    invoke(pq)
    unknown_pid, unknown_secret, unknown_query = prepare(source, side='BUY', quantity=1, price=200, commission=None, before_quantity=1, before_average=100, after_average=150)
    # An old pending review may already contain unknown fees at release time.
    invoke(unknown_query)
    before_guard = snap()
    sql("set session authorization fixture_transaction_migrator;" + commission_migration.read_text())
    reject(confirm(unknown_pid, unknown_secret))
    unknown_new, uns, unq = prepare(source, side='BUY', quantity=1, price=200, commission=None, before_quantity=1, before_average=100, after_average=150)
    reject(unq)
    assert snap() == before_guard
    replacement, rs, rq = prepare(source, side='BUY', quantity=1, price=200, commission=0, before_quantity=1, before_average=100, after_average=150)
    invoke(rq); reject(confirm(pending, ps)); rr = json.loads(invoke(confirm(replacement, rs)))
    assert rr['commissionKnown']
    persisted = snap(); known = next(row for row in persisted['lots'] if row['id'] == rr['lotId']); assert known['commission_known'] is True
    bad, bs, bq = prepare(source, side='SELL', quantity=3, price=200, before_quantity=2, before_average=150, after_quantity=0, after_average=0)
    reject(bq); assert snap() == persisted
    print('PASS old pending and new unknown-fee reviews denied, explicit zero retained, oversell rejection and rollback')
    # Review values and fingerprint must match; cancelling does not write a lot.
    cancelled, cs, cq = prepare(source, side='BUY', quantity=1, price=150, commission=0, before_quantity=2, before_average=150, after_average=150)
    invoke(cq); invoke("select public.cancel_chat_transaction_proposal('%s','%s')" % (cancelled, cs)); reject(confirm(cancelled, cs)); assert snap() == persisted
    misleading, ms, mq = prepare(source, before_quantity=2, before_average=150, after_quantity=999, after_average=125)
    reject(mq)
    stale, ss, sq = prepare(source, before_quantity=2, before_average=150, after_average=125, fingerprint=first['fingerprint'])
    reject(sq)
    print('PASS exact immutable review validation, stale snapshot rejection and cancellation without financial mutation')
    # A historical buy is replayed chronologically. It changes the FIFO basis
    # of the already-recorded Jan 1 sale without mutating that sale's row.
    historical, hs, hq = prepare(source, side='BUY', quantity=1, price=50, date='2025-12-31', before_quantity=2, before_average=150, after_quantity=3, after_average=400/3)
    invoke(hq); invoke(confirm(historical, hs))
    history = snap(); assert len(history['lots']) == len(persisted['lots']) + 1
    assert all(next(row for row in history['lots'] if row['id'] == old['id']) == old for old in persisted['lots'])
    impossible, ips, ipq = prepare(source, side='SELL', quantity=1, date='2025-12-30', before_quantity=3, before_average=400/3, after_quantity=2, after_average=150)
    reject(ipq); assert snap() == history
    complete, fs, fq = prepare(source, side='SELL', quantity=3, price=180, date='2026-01-02', before_quantity=3, before_average=400/3, after_quantity=0, after_average=0)
    invoke(fq); full_sale = json.loads(invoke(confirm(complete, fs))); assert full_sale['transaction']['side'] == 'SELL'
    assert sql("select count(*) from public.position_lots where side='SELL'") == '2'
    print('PASS historical FIFO insert, historical oversell rejection, immutable earlier sale and full real sale')
    # Expired review remains terminally unusable even with its real capability.
    expired, es, eq = prepare(source, quantity=1, price=100, date='2026-01-03', before_quantity=0, before_average=None, after_average=100)
    invoke(eq)
    expired_id = str(uuid.uuid4())
    sql("update private.chat_transaction_proposals set status='superseded' where id='%s';insert into private.chat_transaction_proposals(id,owner_id,subject,session_id,client_id,grant_id,expected,input,review,confirmation_hash,created_at,expires_at) select '%s',owner_id,subject,session_id,client_id,grant_id,expected,input,review,confirmation_hash,statement_timestamp()-interval '1 hour',statement_timestamp()-interval '45 minutes' from private.chat_transaction_proposals where id='%s'" % (expired, expired_id, expired))
    final_snapshot = snap(); reject(confirm(expired_id, es)); assert snap() == final_snapshot
    print('PASS expired capability rejection without financial mutation')
    # Preserve a no-lot legacy balance before recording a same-day sale.
    sql("insert into public.positions(user_id,symbol,display,image_url,location,entry_price,quantity,entry_date) values('fixture-a','LEGACY','LEGACY','','%s',90,5,'2026-01-01')" % source)
    legacy_id, ls, lq = prepare(source, side='SELL', quantity=2, price=120, date='2026-01-01', before_quantity=5, before_average=90, after_quantity=3, after_average=90)
    lq = lq.replace('AAPL', 'LEGACY')
    invoke(lq); legacy_receipt = json.loads(invoke(confirm(legacy_id, ls)))
    legacy_lots = [row for row in snap()['lots'] if row['position_id'] == legacy_receipt['positionId']]
    assert len(legacy_lots) == 2 and [row['side'] for row in sorted(legacy_lots, key=lambda row: row['id'])] == ['BUY', 'SELL']
    assert legacy_lots[0]['quantity'] == 5
    print('PASS preserved no-lot legacy baseline and deterministic same-day sale ordering')
    for role in ['anon', 'authenticated', 'service_role', 'livestocks_auth_backend']:
        assert sql(f"select has_function_privilege('{role}','private.chat_transaction_worker(uuid,text,jsonb,jsonb,boolean)','EXECUTE')") == 'f'
    assert sql("select not rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls from pg_roles where rolname='livestocks_transaction_executor'") == 't'
    print('PASS worker ACLs and restricted non-login non-bypass executor')
    for role in ['anon', 'authenticated', 'service_role', 'livestocks_auth_backend']:
        assert sql(f"select has_function_privilege('{role}','private.chat_transaction_worker_with_legacy_fee_validation(uuid,text,jsonb,jsonb,boolean)','EXECUTE')") == 'f'
    sql(correction_migration.read_text())
    def web(query, owner='fixture-a'):
        claims = json.dumps({'sub': owner, 'write': True})
        return sql(f"begin;set local role authenticated;set local request.jwt.claims='{claims}';{query};commit")
    def web_reject(query):
        try:
            web(query)
        except RuntimeError:
            return
        raise AssertionError('Invalid website correction succeeded')
    def checkpoint(symbol, quantity=4):
        position_id, lot_id = str(uuid.uuid4()), str(uuid.uuid4())
        sql(f"insert into public.positions(id,user_id,symbol,display,image_url,location,entry_price,quantity,entry_date) values('{position_id}','fixture-a','{symbol}','{symbol}','','{source}',100,{quantity},'2026-01-01');insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount,basis_acquired_on,basis_date_estimate) values('{lot_id}','fixture-a','{position_id}','RECONCILE',100,{quantity},'2026-01-10',false,0,'2026-01-01',null)")
        return position_id, lot_id
    cp, cl = checkpoint('CORRECT')
    before = sql(f"select row_to_json(l) from public.position_lots l where id='{cl}'")
    update = f"update public.position_lots set side='BUY',price=95,executed_at='2026-01-01',has_commission=false,commission_amount=0,commission_known=true,basis_acquired_on=null,basis_date_estimate=null where id='{cl}'"
    web(update, owner='fixture-b')
    assert sql(f"select row_to_json(l) from public.position_lots l where id='{cl}'") == before
    invoke(update)
    assert sql(f"select row_to_json(l) from public.position_lots l where id='{cl}'") == before
    for patch in ["position_id='" + result['positionId'] + "'", "id='" + str(uuid.uuid4()) + "'", "created_at='2025-01-01'", "executed_at='2099-01-01'", "commission_known=false", "basis_acquired_on='2026-01-01'"]:
        web_reject(update.replace(' where id=', ',' + patch + ' where id='))
        assert sql(f"select row_to_json(l) from public.position_lots l where id='{cl}'") == before
    web(update)
    corrected = json.loads(sql(f"select row_to_json(l) from public.position_lots l where id='{cl}'"))
    assert corrected['side'] == 'BUY' and corrected['commission_known'] and corrected['basis_acquired_on'] is None
    assert sql(f"select count(*) from public.position_lots where position_id='{cp}' and (side='RECONCILE' or not commission_known)") == '0'
    summary = json.loads(sql(f"select private.chat_transaction_summary('{cp}')"))
    assert summary['quantity'] == 4 and summary['average'] == 95
    web(f"delete from public.position_lots where id='{cl}'")
    assert float(sql(f"select quantity from public.positions where id='{cp}'")) == 0
    dp, dl = checkpoint('DELETE')
    invoke(f"delete from public.position_lots where id='{dl}'")
    web(f"delete from public.position_lots where id='{dl}'", owner='fixture-b')
    assert sql(f"select count(*) from public.position_lots where id='{dl}'") == '1'
    web(f"delete from public.position_lots where id='{dl}'")
    assert float(sql(f"select quantity from public.positions where id='{dp}'")) == 0
    fp, fl = checkpoint('FIFO')
    sale_id = str(uuid.uuid4())
    sql(f"insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount) values('{sale_id}','fixture-a','{fp}','SELL',110,2,'2026-01-11',false,0)")
    fifo_before = sql(f"select jsonb_agg(to_jsonb(l) order by id) from public.position_lots l where position_id='{fp}'")
    web_reject(f"delete from public.position_lots where id='{fl}'")
    web_reject(f"update public.position_lots set side='SELL',price=95,executed_at='2026-01-01',commission_known=true,basis_acquired_on=null,basis_date_estimate=null where id='{fl}'")
    assert sql(f"select jsonb_agg(to_jsonb(l) order by id) from public.position_lots l where position_id='{fp}'") == fifo_before
    print('PASS owner website correction/removal, known-fee BUY quality restoration, empty-position zero, crossowner/MCP denial, immutable fields and FIFO rollback')

    old_pending, old_secret, old_query = prepare(source, symbol='OLDPENDING')
    invoke(old_query)
    sql("set session authorization fixture_transaction_migrator;" + batch_migration.read_text())
    sql(secondary_client_migration.read_text())
    assert json.loads(invoke(confirm(old_pending, old_secret)))['transaction']['symbol'] == 'OLDPENDING'
    assert json.loads(invoke(confirm(pid, secret))) == result
    for role in ['anon', 'authenticated', 'service_role', 'livestocks_auth_backend']:
        for signature in ['private.chat_transaction_batch_lot(text,jsonb,jsonb,jsonb,boolean)',
                          'private.chat_transaction_increment_lot_id(uuid)']:
            assert sql(f"select has_function_privilege('{role}','{signature}','EXECUTE')") == 'f'
    print('PASS managed migration privileges, existing pending confirmation and existing receipt replay')

    other_source = str(uuid.uuid4())
    sql(f"insert into public.investment_sources(id,user_id,name) values('{other_source}','fixture-a','Second account')")
    plans = [
        transaction_plan(source, symbol='BATCHA', commission=2),
        transaction_plan(other_source, symbol='BATCHB', source_name='Second account'),
        transaction_plan(source, symbol='BATCHA', side='SELL', quantity=1, before_quantity=2, before_average=101),
        transaction_plan(other_source, symbol='BATCHA', source_name='Second account', quantity=3),
    ]
    before_batch = snap()
    for invalid_plans in [[], plans * 9, [plans[0], transaction_plan(source, symbol='BATCHC', commission=None)],
                          [plans[0], transaction_plan(source, symbol='BATCHA', side='SELL', quantity=3,
                                                      before_quantity=2, before_average=101, after_quantity=0)]]:
        _, _, invalid_query = prepare_batch(invalid_plans)
        reject(invalid_query)
    batch, batch_secret, batch_query = prepare_batch(plans)
    reject(batch_query, scopes='portfolio:read')
    batch_review = json.loads(invoke(batch_query))
    assert batch_review['status'] == 'pending' and batch_review['review']['plan']['transactions'] == plans
    assert snap() == before_batch
    assert json.loads(invoke(f"select public.read_chat_transaction_proposal('{batch}')")) == batch_review
    reject(confirm(batch, batch_secret), session='other-session')
    reject(confirm(batch, batch_secret), owner='fixture-b')
    batch_receipt = json.loads(invoke(confirm(batch, batch_secret)))
    trades = batch_receipt['transactions']
    assert batch_receipt['applied'] and [trade['transaction'] for trade in trades] == [plan['transaction'] for plan in plans]
    assert trades[0]['positionId'] == trades[2]['positionId'] != trades[1]['positionId']
    assert trades[3]['positionId'] != trades[0]['positionId']
    assert trades[0]['lotId'] < trades[2]['lotId'] and all(trade['commissionKnown'] for trade in trades)
    assert json.loads(invoke(confirm(batch, batch_secret))) == batch_receipt
    assert json.loads(invoke(f"select public.read_chat_transaction_proposal('{batch}')"))['receipt'] == batch_receipt
    after_batch = snap()
    assert len(after_batch['lots']) == len(before_batch['lots']) + len(plans)
    assert json.loads(sql(f"select private.chat_transaction_summary('{trades[0]['positionId']}')"))['quantity'] == 1
    print('PASS mixed-account and same-day multi-stock review, known fees, scoped authorization, oversell and idempotent batch recording')

    stale_batch, stale_secret, stale_query = prepare_batch([
        transaction_plan(source, symbol='STALEA'), transaction_plan(source, symbol='STALEB')])
    invoke(stale_query)
    web(f"update public.positions set display='Edited after review' where id='{trades[0]['positionId']}'")
    after_edit = snap()
    assert after_edit['fingerprint'] != after_batch['fingerprint']
    reject(confirm(stale_batch, stale_secret))
    assert snap() == after_edit

    # Force a write error on the second transaction after the first has been inserted.
    sql("""create function public.fixture_batch_reject() returns trigger language plpgsql as $$
           begin
             if new.symbol='ROLLBACKB' and exists(select 1 from public.positions where symbol='ROLLBACKA') then
               raise exception 'Second position rejected after the first was inserted';
             end if;
             return new;
           end;$$;
           create trigger fixture_batch_reject before insert on public.positions
           for each row execute function public.fixture_batch_reject()""")
    rollback, rollback_secret, rollback_query = prepare_batch([
        transaction_plan(source, symbol='ROLLBACKA'), transaction_plan(source, symbol='ROLLBACKB')])
    invoke(rollback_query)
    try:
        invoke(confirm(rollback, rollback_secret))
    except RuntimeError as error:
        assert 'Second position rejected after the first was inserted' in str(error)
    else:
        raise AssertionError('Expected an error on the second write')
    assert snap() == after_edit
    assert json.loads(invoke(f"select public.read_chat_transaction_proposal('{rollback}')"))['status'] == 'pending'
    sql('drop trigger fixture_batch_reject on public.positions;drop function public.fixture_batch_reject()')
    assert len(json.loads(invoke(confirm(rollback, rollback_secret)))['transactions']) == 2
    print('PASS stale batch rejection, full rollback on second write, and safe retry of the original review')

finally:
    if started:
        call(['pg_ctl', '-D', str(runtime / 'data'), '-m', 'immediate', '-w', 'stop'])
    __import__('shutil').rmtree(runtime)
