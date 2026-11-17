# Main branch integration — 17 November 2026

Integrated `codex/chatgpt-friendly-transactions` and the remaining SMTP readiness
validation from `codex/oauth-sync-step-up-fix`. Conflicts retain the newer
transaction permissions, provider tests and verified OAuth documentation from main.
The merge records both source branches in history before their removal.

Updated the README, transaction guide and branded plugin skill to require a known
commission or explicit zero. Screenshot balance reconciliation is retired; its
guide is marked historical. Current transaction screenshots remain in the README.
The card cancellation message now refers to a new chat request rather than the
retired screenshot workflow.

Validation on the combined code:

- Vitest: 1,124 passed; three environment-dependent PostgreSQL tests skipped.
- TypeScript, ESLint and production build passed.
- Disposable PostgreSQL 17 transaction suite passed, including actual BUY/SELL,
  FIFO, known-fee requirements, owner isolation, stale/expired reviews, repeat
  confirmation, retired screenshot writes, website corrections and rollback.
- The real Better Auth provider gate passed separately against disposable
  PostgreSQL 17, including web/MCP tokens, consent, PKCE, refresh and session checks.
  Its first attempt selected an older PostgreSQL from PATH; rerunning with the
  PostgreSQL 17 binary directory passed without changing migration SQL.
- Chrome synthetic card previews: confirmed a purchase and saw the refreshed
  three-holding portfolio; cancelled a sale at a 390 × 844 viewport and saw the
  no-change state. The preview's only console error was a missing local favicon.
- Focused card tests rerun after correcting the cancellation message.

No personal portfolio writes, production schema changes or plugin publications
were performed for this integration. Browser previews use a synthetic bridge;
they do not verify a real ChatGPT transaction or a physical iPhone. Earlier live
release evidence remains in `chat-transactions-production-2026-11-16.json`.
