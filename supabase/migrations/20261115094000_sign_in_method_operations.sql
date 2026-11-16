-- Explicit sign-in method addition. Does not transfer or modify portfolio data.
begin;
create table private.signin_method_operations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references livestocks_auth."user"(id) on delete cascade,
  session_id text not null references livestocks_auth."session"(id) on delete cascade,
  purpose text not null check(purpose in ('google','password')),
  status text not null default 'started' check(status in ('started','pending','used')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  used_at timestamptz
);
create index signin_method_user_attempts on private.signin_method_operations(user_id,created_at);
alter table private.signin_method_operations enable row level security;
revoke all on private.signin_method_operations from public,anon,authenticated,service_role;
grant select,insert,update,delete on private.signin_method_operations to livestocks_auth_backend;
create policy auth_backend_only on private.signin_method_operations to livestocks_auth_backend using(true) with check(true);

create function private.begin_signin_method_operation(subject text, session_id text, purpose text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  -- Serialize attempts across every instance, before doing expensive password verification.
  perform 1 from livestocks_auth."user" u join livestocks_auth."session" s on s."userId"=u.id
    where u.id=subject and u."emailVerified" and s.id=session_id and s."expiresAt">now() for update of u;
  if not found then raise exception 'Verified live session required'; end if;
  if (select count(*) from private.signin_method_operations o where o.user_id=subject and o.created_at>now()-interval '15 minutes')>=5 then
    raise exception 'Sign-in method attempt limit';
  end if;
  insert into private.signin_method_operations(user_id,session_id,purpose)
    values(subject,session_id,purpose) returning id into result;
  return result;
end $$;
revoke all on function private.begin_signin_method_operation(text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.begin_signin_method_operation(text,text,text) to livestocks_auth_backend;
commit;
