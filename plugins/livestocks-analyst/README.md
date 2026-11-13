# LiveStocks Analyst

Private plugin source for the existing LiveStocks application. It adds no website or screen. The MCP endpoint is implemented at `app/api/mcp/route.ts` on the same server as the existing portfolio API.

![LiveStocks icon](assets/icon.png)

## Behavior

- Read the full configured shared portfolio, including timestamps and data quality.
- Obtain last-available Finnhub quotes for up to eight candidate tickers per call, including stocks outside the portfolio.
- Apply the Hebrew-first research skill, which requires external current market research, primary sources, scenario assumptions and confirmed investor inputs.
- Validate an action table: BUY only unowned stocks, SELL 100% of a symbol across accounts, one action per ticker, and purchases within confirmed cash excluding unexecuted sales.
- No trade execution, portfolio mutation, ongoing monitor or bundled news/fundamentals provider.

Tools: `get_research_brief`, `get_portfolio_snapshot`, `get_market_quotes`, `validate_action_plan`.

## Connection and privacy

The manifest targets `https://razmaz-live-stocks.vercel.app/api/mcp`. Deploy this exact backend first, verify MCP discovery and a read-only call, then save the private package through Plugin Creator. A package upload does not deploy the backend or prove installation. Do not advertise a working remote plugin before those checks pass.

The endpoint inherits the existing application's anonymous **shared portfolio** access model, not a separate authenticated user portfolio. It exposes the same configured portfolio data as `/api/portfolio/ai`. A private plugin listing does not protect the underlying public API. No provider credentials are packaged or returned. Do not share this plugin as a multi-user portfolio service.

Snapshots use the existing five-minute cache, which can serve older data during revalidation or failures. Generated time differs from market time. Action validation blocks snapshots older than 15 minutes or future-dated by over one minute; it does not verify corporate-action aliases, suitability or trade prices. Quote calls wait up to five seconds per candidate and return explicit unavailability on errors; the existing shared provider request may finish in the background. Provider coverage and limits still apply.

Research uses the host's web search or available connected financial research tools. If those are unavailable, the skill requires disclosure and withholds unsupported final recommendations. Personal cash budget, horizon and risk tolerance must be supplied; they are absent from the portfolio snapshot.

## Validation and packaging

From the application root:

```bash
npm test -- __tests__/investment-mcp.test.ts
npm run typecheck
python3 -m zipfile -c /tmp/livestocks-analyst.zip plugins/livestocks-analyst
```

The ZIP has one enclosing plugin directory. Inspect it before upload; include the manifest, skill, MCP config and icon; exclude secrets and dependencies. Public directory submission is a separate workflow, outside this private plugin's scope.
