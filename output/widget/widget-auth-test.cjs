const assert = require('node:assert/strict');
const { run, fixture, TOKEN, HOST, fingerprint } = require('./widget-v7-test.cjs');

(async () => {
  let cases = 0;
  const check = async (name, operation) => { await operation(); cases += 1; console.log(`PASS ${name}`); };

  await check('personal bearer goes only to the configured HTTPS endpoint, without redirects', async () => {
    const result = await run();
    const request = result.requests[0];
    assert.equal(request.url, `${HOST}/api/widget/summary`);
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(request.allowInsecureRequest, false);
    assert.equal(request.onRedirect({ url: 'https://another.example' }), null);
    assert(![...result.storage.keys(), ...result.storage.values()].some(value => value.includes(TOKEN)));
    assert(result.keys.has(`livestocks.widget.v1:${HOST}:metadata`));
  });

  await check('missing credential never fetches and clears old portfolio caches', async () => {
    const previous = await run();
    previous.storage.set('stocks-glance-v3-123abc.json', 'legacy holdings');
    previous.storage.set('unrelated.json', 'preserve');
    const result = await run(fixture, { token: null, storage: previous.storage });
    assert.equal(result.requests.length, 0);
    assert(result.rendered.includes('נדרש חיבור אישי'));
    assert.deepEqual([...result.storage.keys()], ['unrelated.json']);
  });

  await check('changing the host cannot forward an existing saved token', async () => {
    const previous = await run();
    const result = await run(fixture, { baseUrl: 'https://another.example', keys: previous.keys, storage: previous.storage });
    assert.equal(result.requests.length, 0);
    assert(result.rendered.includes('נדרש חיבור אישי'));
    assert.equal(result.keys.get(`livestocks.widget.v1:${HOST}`), TOKEN);
  });

  await check('invalid origins and widget-parameter tokens are rejected', async () => {
    for (const baseUrl of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?token=secret']) {
      const result = await run(fixture, { baseUrl });
      assert.equal(result.requests.length, 0);
    }
    const result = await run(fixture, { token: null, parameter: `token=${TOKEN}` });
    assert.equal(result.requests.length, 0);
  });

  await check('401/403 erase credentials and cache even if the response is not JSON', async () => {
    for (const status of [401, 403]) for (const invalidJSON of [false, true]) {
      const previous = await run();
      const result = await run(fixture, { status, invalidJSON, keys: previous.keys, storage: previous.storage });
      assert(result.rendered.includes('נדרש חיבור אישי'));
      assert.equal(result.storage.size, 0);
      assert.equal(result.keys.size, 0);
      const offline = await run(fixture, { offline: true, keys: result.keys, storage: result.storage });
      assert.equal(offline.requests.length, 0);
      assert(!offline.rendered.some(text => text.includes('₪+321')));
    }
  });

  await check('offline cache survives past one hour and stays scoped to the same token', async () => {
    const fresh = await run(fixture, { cached: true, offline: true });
    assert(fresh.rendered.some(text => text.includes('שמור')));
    const old = await run(fixture, { cached: true, offline: true, savedAt: new Date(Date.now() - 3600001).toISOString() });
    assert(old.rendered.some(text => text.includes('שמור')));
    assert.equal(old.storage.size, 1);
    const previous = await run();
    const switched = await run(fixture, { token: `lst_widget_${'b'.repeat(43)}`, storage: previous.storage, offline: true });
    assert(switched.rendered.includes('לא ניתן לטעון את התיק'));
    assert(!switched.rendered.some(text => text.includes('₪+321')));
  });

  await check('expired token metadata blocks even offline cache without a network request', async () => {
    const previous = await run();
    previous.keys.set(`livestocks.widget.v1:${HOST}:metadata`, JSON.stringify({ identity: fingerprint(TOKEN), expiresAt: new Date(Date.now() - 1).toISOString() }));
    const result = await run(fixture, { offline: true, keys: previous.keys, storage: previous.storage });
    assert.equal(result.requests.length, 0);
    assert(result.rendered.includes('נדרש חיבור אישי'));
    assert.equal(result.storage.size, 0);
  });

  await check('failed HTTP refreshes and malformed responses reuse the local snapshot', async () => {
    for (const status of [200, 302, 404, 429, 503]) {
      const result = await run(fixture, { cached: true, status, invalidJSON: status === 200 });
      assert(result.rendered.some(text => text.includes('שמור')));
      assert(result.rendered.some(text => text.includes('₪+321')));
    }
  });

  await check('consecutive partial refreshes preserve the last usable snapshot, then recover', async () => {
    const previous = await run();
    const partial = structuredClone(fixture);
    partial.summary.totalNetPnLIls = null;
    partial.summary.totalForecastGapIls = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await run(partial, { keys: previous.keys, storage: previous.storage });
      assert(result.rendered.some(text => text.includes('שמור')));
      assert(result.rendered.some(text => text.includes('₪+321')));
      assert.equal(JSON.parse([...result.storage.values()][0]).payload.summary.totalNetPnLIls, 321);
    }
    const fresh = structuredClone(fixture);
    fresh.summary.totalNetPnLIls = 456;
    const recovered = await run(fresh, { keys: previous.keys, storage: previous.storage });
    assert(recovered.rendered.some(text => text.includes('₪+456')));
    assert(!recovered.rendered.some(text => text.includes('שמור')));

    partial.dataQuality = { completeTransactionHistory: false };
    const limited = await run(partial, { keys: previous.keys, storage: previous.storage });
    assert(!limited.rendered.some(text => text.includes('₪+456')));
  });

  await check('native setup uses a secure prompt and stores token only in host-specific Keychain', async () => {
    const result = await run(fixture, { token: null, runsInWidget: false, alerts: [{ choice: 0, token: TOKEN }] });
    assert.equal(result.shownAlerts[0].secure, true);
    assert(result.shownAlerts[0].message.includes(HOST));
    assert.equal(result.keys.get(`livestocks.widget.v1:${HOST}`), TOKEN);
    assert.equal(result.requests[0].headers.Authorization, `Bearer ${TOKEN}`);
    assert(![...result.storage.values()].some(value => value.includes(TOKEN)));
  });

  await check('native replace/disconnect clears the previous credential portfolio', async () => {
    const previous = await run();
    const replacement = `lst_widget_${'c'.repeat(43)}`;
    const replaced = await run(fixture, { keys: previous.keys, storage: previous.storage, runsInWidget: false, alerts: [{ choice: 1 }, { choice: 0, token: replacement }] });
    assert.equal(replaced.keys.get(`livestocks.widget.v1:${HOST}`), replacement);
    assert(![...replaced.storage.keys()].some(key => key.includes(fingerprint(TOKEN))));
    const disconnected = await run(fixture, { keys: replaced.keys, storage: replaced.storage, runsInWidget: false, alerts: [{ choice: 2 }] });
    assert.equal(disconnected.requests.length, 0);
    assert.equal(disconnected.keys.size, 0);
    assert.equal(disconnected.storage.size, 0);
  });
  console.log(`PASS ${cases} personal widget security scenarios (mocked Scriptable APIs).`);
})().catch(error => { console.error(error); process.exit(1); });
