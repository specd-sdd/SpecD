# Studio UI E2E

Playwright does **not** start the API here (that path often hangs with no output). Use two terminals:

## 1. Build once

From repo root:

```bash
pnpm --filter @specd/cli build
pnpm --filter @specd/ui build
pnpm --filter @specd/studio-web build
```

## 2. Terminal A — server (leave running)

```bash
node packages/cli/dist/index.js ui serve -p 4450
```

Wait until you see `specd Studio listening` and `curl http://127.0.0.1:4450/v1/health` returns 200.

## 3. Terminal B — tests

```bash
cd apps/specd-studio-web
pnpm exec playwright install chromium   # once, ~150MB
pnpm test:e2e
```

**Node.js:** use **Node 20 or 22 LTS**, or `@playwright/test` **≥ 1.53** (1.52 hangs silently on Node 25).

## One-liner from repo root

```bash
pnpm studio-web:test:e2e
```

That script builds, starts the server with logs, runs Playwright, then stops the server.

## If it still “does nothing”

1. Kill stuck processes: `pkill -f '@playwright/test/cli'`
2. Confirm health: `curl http://127.0.0.1:4450/v1/health`
3. Confirm Google Chrome is installed (tests use `channel: 'chrome'`), or set `PW_CHROMIUM_CHANNEL=chromium` after `pnpm exec playwright install chromium`
4. Run a single test: `pnpm exec playwright test tests/e2e/studio.ui.spec.ts -g "loads studio"`
