#!/usr/bin/env python3
"""Exercise the actual stream lease, quota and reader privileges in disposable PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

root = Path(__file__).resolve().parents[1]
migration = root / "supabase/migrations/20261123090405_live_quote_coordination.sql"
binpath = Path("/opt/homebrew/opt/postgresql@17/bin")
env = {"PATH": str(binpath) + os.pathsep + os.environ["PATH"], "LC_ALL": "C"}


def run(*args, data=None):
    result = subprocess.run(args, env=env, input=data, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-1800:])
    return result.stdout.strip()


with tempfile.TemporaryDirectory(prefix="quote-lease-", dir="/tmp") as runtime:
    base = Path(runtime)
    pg = str(base / "pg")
    run("initdb", "-D", pg, "-U", "postgres", "-A", "trust", "--no-locale")
    run("pg_ctl", "-D", pg, "-l", str(base / "server.log"), "-o", f"-k {base} -c listen_addresses=''", "-w", "start")
    try:
        def sql(query):
            return run("psql", "-h", str(base), "-U", "postgres", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1", data=query)

        sql("create schema private; create role service_role; create role authenticated; create role anon;")
        sql(migration.read_text())
        nodes = [str(uuid.uuid4()), str(uuid.uuid4())]
        scope = "a" * 64

        def step(node, symbols, marks=None, status="streaming", release=False, key=scope, backoff=0, wants_socket=False):
            return json.loads(sql("set role service_role; select public.server_quote_stream_step("
                f"'{key}','{node}','{json.dumps(symbols)}','{json.dumps(marks or {})}','{status}',{str(release).lower()},{backoff},{str(wants_socket).lower()});"))

        demand = [{"symbol": f"S{i}", "priority": 2} for i in range(55)]
        with ThreadPoolExecutor(2) as workers:
            race = list(workers.map(lambda node: step(node, demand), nodes))
        assert sum(row["leader"] for row in race) == 1
        leader = nodes[next(i for i, row in enumerate(race) if row["leader"])]
        follower = next(node for node in nodes if node != leader)
        assert not step(follower, [{"symbol":"VIP","priority":0}])["leader"]
        state = step(leader, demand, wants_socket=True)
        assert state["allowSocket"]
        assert not step(leader, demand, wants_socket=True)["allowSocket"]
        assert len(state["symbols"]) == 50 and state["symbols"][0] == "VIP"
        assert state["restSymbol"] is not None
        assert step(leader, demand)["restSymbol"] is None
        timestamp = int(time.time() * 1000) - 500
        mark = {"symbol":"VIP", "timestamp":timestamp, "price":10, "source":"trade", "phase":"regular"}
        step(leader, demand, {"VIP":mark})
        assert step(follower, [{"symbol":"VIP","priority":0}], {"VIP":{**mark,"price":999}})["marks"]["VIP"]["price"] == 10
        assert step(leader, demand, {"VIP":{**mark,"price":800,"timestamp":timestamp-1}})["marks"]["VIP"]["price"] == 10
        assert step(leader, demand, {"VIP":{**mark,"price":850,"source":"quote"}})["marks"]["VIP"]["price"] == 10
        assert not step(nodes[0],demand,key="b"*64)["marks"]
        assert sql("select has_function_privilege('authenticated','public.server_quote_stream_step(text,uuid,jsonb,jsonb,text,boolean,integer,boolean)','execute')") == 'f'
        assert sql("select has_table_privilege('anon','private.quote_stream_feeds','select')") == 'f'
        sql(f"update private.quote_stream_feeds set lease_until=now()-interval '1 second' where scope='{scope}'")
        state = step(follower,[{"symbol":"VIP","priority":0}],{"VIP":{**mark,"price":777}})
        assert state["leader"] and state["marks"]["VIP"]["price"] == 10
        assert not step(leader,demand)["leader"]
        step(follower, demand, backoff=300)
        assert sql(f"select rest_after > now()+interval '4 minutes' and socket_after > now()+interval '4 minutes' from private.quote_stream_feeds where scope='{scope}'") == 't'
        step(follower,[],release=True)
        assert step(leader,demand)["leader"]
        print("Verified concurrent election, fencing, failover, capped priority union, shared REST permits, key isolation, stale marks and private access.")
    finally:
        run("pg_ctl","-D",pg,"-m","immediate","-w","stop")
