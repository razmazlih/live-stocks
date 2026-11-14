# LiveStocks personal widget v8 — 2026-11-14

This distribution requires the personal-account backend and `POST /api/widget/summary`. It is not installed on the user's device or deployed by this change. Physical iPhone sync and native rendering remain unverified.

## Connect your account

1. Sign in to LiveStocks and open **Settings → Personal widget tokens**. Create a named token and copy it while it is displayed.
2. Install `Stocks Status.js` in Scriptable and run it inside the app. Paste the token into the secure prompt. It is stored in Scriptable's native Keychain under the exact HTTPS site origin.
3. Add a Scriptable widget and select this script. Optional parameters: `currency=ILS;mode=value`. To use another deployment, use `baseurl=https://your-host` and run the script with that same host to set up its separate credential.
4. Run the script inside Scriptable again to replace the token or disconnect this device. Revoke a token from the website to invalidate server access. Tokens expire after 90 days.

Never paste a token into the script source, widget parameters, a URL, or an iCloud text file. The script does not write tokens to the filesystem. A changed host does not receive credentials saved for another host; HTTP redirects are disabled. Website sign-out and ChatGPT disconnection do not revoke a separately issued widget token.

The widget caches portfolio data locally for up to one hour and no later than token expiry. Cache names and records are scoped to the HTTPS origin and a non-secret token fingerprint. Missing credentials, known expiry, and HTTP 401/403 clear the cache and show a reconnect prompt; denied requests never fall back to a saved portfolio. The upgrade removes only this widget's legacy `stocks-glance-v3-<hex>.json` cache files. Keychain behavior and prompts are tested with mocked Scriptable APIs; no physical-device claim is made.

## Portfolio display

All sizes now show net profit/loss and the forecast gap together. The authoritative summary.totalForecastGapIls/Usd field is used; when unavailable, fallback subtracts totalProjectedPnL from totalNetPnL in the same currency only when both exist. Positive means above forecast; negative below. Missing data stays unavailable. This is the personal compound growth target accrued to today, not an analyst price forecast. API defaults for rates/quotes are unchanged.

Small/medium always show portfolio value plus both requested metrics. Large/extraLarge retain the mode=pnl hero option. Large metric rail replaces winner/loser counts with P/L and forecast gap; ticker badges removed for space.

Validation: 222 display assertions and 36 mock renders, plus 10 personal-account security scenarios covering Keychain setup/replacement, host isolation, redirect refusal, authorization denial, credential expiry, and offline cache isolation. Source-driven browser previews use sample data and approximate native rendering; concentration ring drawing is approximate. No native Liquid Glass compatibility claim.

Run from this directory:

```sh
node widget-v7-test.cjs
node widget-auth-test.cjs
node widget-v7-preview.cjs
```

The v7 filenames are retained for the display regression harness and preview generator; both read the current v8 source.
