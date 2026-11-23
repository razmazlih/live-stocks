# Live quotes

The website opens a same-origin authenticated SSE response while a visible screen needs US equity prices. Each response ends within 48 seconds and reconnects through website authentication. Signing out, changing accounts, hiding the page or removing every subscribed symbol releases the browser subscription. Each symbol carries an exchange timestamp. The stream rejects incoming prices from another session, future timestamps and prints more than 15 minutes old. During a same-session interruption, the browser retains its last accepted price and timestamp as stale until a newer print arrives. The next session and account sign-out clear retained prices.

The server opens Finnhub's trade WebSocket using the account's encrypted credential. A PostgreSQL lease elects one upstream owner per credential fingerprint across processes and devices. Each tab receives only its subscribed symbols. Leaders publish at most four browser batches per second locally. Other instances read updates on their 2.5-second coordination cycle. Closing a browser stops its outstanding response, and a lost leader's database lease expires after 10 seconds. Scope rows are removed on subsequent activity after 15 idle minutes.

Selected stocks take precedence over holdings, followed by watchlist stocks. The relay subscribes up to 50 symbols per key and tracks up to 150 requested symbols. In regular hours, one fallback REST request per six seconds per key rotates among symbols lacking a recent update. This budget applies to the stream. Initial dashboard loads and explicit refresh actions use the dashboard's existing quote cache. Retries honor provider rate-limit delays. Missing credentials or unavailable coordination leave the persisted portfolio and existing price snapshots accessible.

The browser reconnects if it receives neither data nor a heartbeat for 30 seconds. The closing summary still uses verified regular closing data. Finnhub trade messages provide a price and timestamp. Extended-hour coverage depends on the provider. Overnight prices require explicit overnight evidence.

The local and preview demos simulate changes privately using the synthetic fixture and the selected session, including when the browser is offline. In a fixed scenario, prices keep updating after the simulated clock reaches the last instant of the selected trading phase. Changing the scenario starts the newly selected session immediately.

## Database and verification

Apply `20261123090405_live_quote_coordination.sql` to the database used by the server before enabling authenticated streaming there. The unexposed tables contain temporary coordination state, symbols and market prices. The service-role RPC is the only application entry point. No credential, account identifier, cost basis or trade quantity is written to these tables.

Run the stream unit and API suites with `npm test -- __tests__/live-quote-stream.test.ts __tests__/live-quote-store.test.ts __tests__/quote-stream-api.test.ts`. Run `python3 scripts/test-live-quote-coordination.py` to verify actual PostgreSQL election, failover, privileges and rate limits in a disposable local database. This script requires PostgreSQL CLI tools and binds a private Unix socket. [Finnhub trade WebSocket documentation](https://finnhub.io/docs/api/websocket-trades)
