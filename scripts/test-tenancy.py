#!/usr/bin/env python3
"""Test all migrations/RLS against synthetic, disposable local PostgreSQL only.

Run: python3 scripts/test-tenancy.py
Requires native initdb, pg_ctl and psql on PATH. Does not read .env files,
accept a database URL, reuse an existing database, or contact production.
"""
import os, pathlib, tempfile, subprocess, socket, shutil, signal, sys
root=pathlib.Path(__file__).resolve().parent.parent
run=pathlib.Path(tempfile.mkdtemp(prefix='livestocks-rls-test-')); pg=run/'data'
env={'PATH':os.environ['PATH'],'LC_ALL':'C','PGPASSFILE':'/dev/null','PGCONNECT_TIMEOUT':'5'}
def interrupted(_signum, _frame):
 raise InterruptedError('Local SQL test interrupted; cleaning up its own cluster')
signal.signal(signal.SIGTERM,interrupted)
signal.signal(signal.SIGINT,interrupted)
def call(args,expect=0):
 r=subprocess.run(args,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if r.returncode!=expect:
  print((r.stdout+r.stderr)[-12000:]); raise RuntimeError(f'Unexpected exit {r.returncode}: {args[0]}')
 return r

def sql(text=None,path=None,db='postgres',expect=0,settings=None):
 args=['psql',url.replace('/postgres?','/'+db+'?'),'-X','-q','-v','ON_ERROR_STOP=1']
 if settings: args+=['-c',settings]
 args+=['-c',text] if text is not None else ['-f',str(path)]
 return call(args,expect)
base="create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$; grant usage on schema auth,public to anon,authenticated,service_role;"
migrations=sorted((root/'supabase/migrations').glob('*.sql')); new=root/'supabase/migrations/20261114114916_auth0_user_isolation.sql'
try:
 if len(sys.argv)!=1: raise ValueError('This local-only runner accepts no arguments or database URL')
 for binary in ['initdb','pg_ctl','psql']: call([binary,'--version'])
 s=socket.socket(); s.bind(('127.0.0.1',0)); port=s.getsockname()[1]; s.close()
 url=f'postgres://postgres@127.0.0.1:{port}/postgres?hostaddr=127.0.0.1&sslmode=disable'
 call(['initdb','-D',str(pg),'-U','postgres','--auth=trust','--no-locale','-E','UTF8'])
 call(['pg_ctl','-D',str(pg),'-l',str(run/'postgres.log'),'-o',f"-h 127.0.0.1 -p {port} -c unix_socket_directories=''",'-w','-t','30','start'])
 sql(text=base)
 for migration in migrations: sql(path=migration)
 print('PASS empty-database migration without legacy owner')
 sql(path=root/'supabase/tests/multi_user_isolation.sql')
 print('PASS real-role multi-user SQL suite on empty migrated database')
 sql(path=root/'supabase/tests/position_identity.sql')
 print('PASS position identity/account/retry regression under authenticated Auth0 claims')
 sql(text='create database legacy')
 sql(text=base.replace('create role anon; create role authenticated; create role service_role bypassrls; ',''),db='legacy')
 for migration in migrations:
  if migration!=new: sql(path=migration,db='legacy')
 seed="""insert into public.positions(id,symbol,display,image_url,entry_price,quantity,entry_date,created_at,updated_at) values('11111111-1111-4111-8111-111111111111','OLD','Legacy','',12.34,5,'2020-01-01','2020-01-01Z','2020-02-01Z');
 insert into public.position_lots(position_id,side,price,quantity,executed_at,commission_amount,created_at,updated_at) values('11111111-1111-4111-8111-111111111111','BUY',12.34,5,'2020-01-01',3.21,'2020-01-01Z','2020-02-01Z');
 insert into public.position_plans(symbol,target_price,target_quantity,target_date,created_at,updated_at) values('FUTURE',99,2,'2027-01-01','2020-01-01Z','2020-02-01Z');
 insert into public.settings(finnhub_token,annual_growth_rate,created_at,updated_at) values('synthetic-finnhub-token',0.1234,'2020-01-01Z','2020-02-01Z');
 insert into public.watchlist_groups(id,name,created_at,updated_at) values('22222222-2222-4222-8222-222222222222','Legacy','2020-01-01Z','2020-02-01Z');
 insert into public.watchlist_tickers(group_id,symbol,created_at,updated_at) values('22222222-2222-4222-8222-222222222222','OLD','2020-01-01Z','2020-02-01Z');"""
 sql(text=seed,db='legacy')
 sql(path=new,db='legacy',expect=3)
 sql(text="do $$begin if to_regclass('public.user_profiles') is not null or (select finnhub_token from public.settings)<>'synthetic-finnhub-token' then raise exception 'failed migration mutated state'; end if; end$$",db='legacy')
 print('PASS populated migration without owner fails and rolls back')
 owner="select set_config('app.legacy_owner_subject','auth0|legacy-owner',false);"
 sql(path=new,db='legacy',expect=3,settings=owner)
 print('PASS populated migration without encrypted credential fails')
 sql(path=new,db='legacy',settings=owner+"select set_config('app.legacy_finnhub_encrypted','encrypted-synthetic-token',false);")
 sql(text="""do $$declare t text; n bigint; begin
 foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'] loop
 execute format('select count(*) from public.%I where user_id=''auth0|legacy-owner'' and updated_at=''2020-02-01Z''::timestamptz',t) into n;
 if n<>1 then raise exception 'preservation failed: %',t; end if; end loop;
 if (select encrypted_value from private.user_credentials where user_id='auth0|legacy-owner')<>'encrypted-synthetic-token' then raise exception 'credential lost'; end if;
 end$$;""",db='legacy')
 print('PASS all six legacy tables preserve timestamps/values and encrypted credential transfer')
 sql(path=root/'supabase/tests/multi_user_isolation.sql',db='legacy')
 print('PASS real-role multi-user SQL suite on populated migrated database')
 sql(path=root/'supabase/tests/position_identity.sql',db='legacy')
 print('PASS position identity regression with pre-existing migrated portfolio')
finally:
 # Signals during shutdown must not interrupt cleanup halfway through.
 signal.signal(signal.SIGTERM,signal.SIG_IGN)
 signal.signal(signal.SIGINT,signal.SIG_IGN)
 try:
  r=subprocess.run(['pg_ctl','-D',str(pg),'-m','immediate','-w','-t','30','stop'],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=35)
  stopped=r.returncode==0
 except (OSError,subprocess.TimeoutExpired): stopped=False
 if stopped or not (pg/'postmaster.pid').exists(): shutil.rmtree(run)
 else:
  print('Could not confirm shutdown; retained synthetic runtime:',run,file=sys.stderr)
  raise RuntimeError('Local test cleanup requires inspection; runtime was not deleted')
