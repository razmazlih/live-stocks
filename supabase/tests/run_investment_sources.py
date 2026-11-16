#!/usr/bin/env python3
"""Disposable native PostgreSQL rehearsal. No .env files, hosted URLs or existing databases."""
from pathlib import Path
import os
import shutil
import socket
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = Path(tempfile.mkdtemp(prefix='livestocks-investment-sources-'))
ENV = {'PATH': os.environ['PATH'], 'LC_ALL': 'C'}
started = False

def call(args):
    result = subprocess.run(args, env=ENV, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-5000:])
    return result.stdout

with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
url = f'postgres://postgres@127.0.0.1:{port}/postgres?sslmode=disable'

def sql(query=None, path=None):
    return call(['psql', url, '-X', '-q', '-v', 'ON_ERROR_STOP=1'] +
                (['-f', str(path)] if path else ['-c', query]))

try:
    call(['initdb', '-D', str(RUNTIME / 'data'), '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8'])
    call(['pg_ctl', '-D', str(RUNTIME / 'data'), '-l', str(RUNTIME / 'postgres.log'), '-o',
          f"-h 127.0.0.1 -p {port} -c unix_socket_directories=''", '-w', 'start'])
    started = True
    sql("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;"
        "create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;"
        "grant usage on schema auth,public to anon,authenticated,service_role;")
    for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
        if migration.name.endswith('_personal_investment_sources.sql'):
            sql("""
              insert into public.user_profiles(id) values('legacy-source-a'),('legacy-source-b'),('legacy-empty');
              insert into public.positions(id,user_id,symbol,display,image_url,entry_price,quantity,entry_date,location)
              values('73000000-0000-4000-8000-000000000001','legacy-source-a','SAME','Same','',10,3,'2026-01-01','bank_one'),
                    ('73000000-0000-4000-8000-000000000002','legacy-source-a','SAME','Same','',20,4,'2026-02-01','bank_two');
              insert into public.position_lots(user_id,position_id,side,price,quantity,executed_at)
              values('legacy-source-a','73000000-0000-4000-8000-000000000001','BUY',10,3,'2026-01-01');
              insert into public.position_plans(user_id,symbol,target_price,target_quantity,target_date,location)
              values('legacy-source-b','PLAN',10,2,'2027-01-01',null);
              create table public.sources_rehearsal_before as
              select 'positions'::text table_name,to_jsonb(p)-'location' row from public.positions p union all
              select 'position_lots',to_jsonb(l) from public.position_lots l union all
              select 'position_plans',to_jsonb(p)-'location' from public.position_plans p;
            """)
        sql(path=migration)
    sql("""
      do $$begin
       if exists(select table_name,row from public.sources_rehearsal_before except
        (select 'positions',to_jsonb(p)-'location' from public.positions p union all
         select 'position_lots',to_jsonb(l) from public.position_lots l union all
         select 'position_plans',to_jsonb(p)-'location' from public.position_plans p)) then
        raise exception 'Legacy financial rows changed';end if;
       if (select count(*) from public.investment_sources where user_id='legacy-source-a')<>2 then raise exception 'Legacy banks collapsed';end if;
       if (select count(*) from public.investment_sources where user_id='legacy-empty')<>1 then raise exception 'Empty user must have one source';end if;
       if (select count(*) from public.investment_sources where user_id='legacy-source-b')<>1 then raise exception 'Null plan must resolve to one source';end if;
       if exists(select 1 from public.positions p join public.investment_sources s on s.id=p.location
        where (p.entry_price=10 and s.legacy_location<>'bank_one') or (p.entry_price=20 and s.legacy_location<>'bank_two')) then raise exception 'Legacy source mapping changed';end if;
      end$$;
    """)
    print('PASS complete migration history and lossless legacy source backfill')
    sql(path=ROOT / 'supabase/tests/investment_sources.sql')
    print('PASS owner isolation, three sources, archive/reconcile guards, purchase retries, restricted account merge')
finally:
    if started:
        call(['pg_ctl', '-D', str(RUNTIME / 'data'), '-m', 'immediate', '-w', '-t', '30', 'stop'])
    shutil.rmtree(RUNTIME)
    print('PASS disposable runtime cleanup; no production access')
