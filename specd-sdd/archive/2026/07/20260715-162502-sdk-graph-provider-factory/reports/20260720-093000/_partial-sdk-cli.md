# SDK and CLI compliance partial

Audit scope: `sdk:host-context`, `sdk:with-open-graph-provider`, `cli:graph-stats`, `cli:graph-impact`, `cli:graph-search`, `cli:graph-hotspots`, and `cli:graph-cli-context`.

Method: read the merged `spec-preview` requirements and verification scenarios, inspect graph-resolved implementation symbols and their dependents, inspect focused tests and documentation, and execute the SDK and CLI test suites. The graph was fresh (`stale: false`, indexed ref equals current ref).

## Result

**1 finding: HIGH — inconsistent artifacts and an implementation mismatch in `graph stats` bootstrap mode.**

All other inspected SDK/CLI lifecycle and command-routing requirements are implemented or have focused test evidence. Several end-to-end error/bootstrapping scenarios remain coverage gaps because their tests mock the host/provider boundary.

Counts:

| Category                               |                 Count |
| -------------------------------------- | --------------------: |
| Specs audited                          |                     7 |
| Requirements/scenario groups inspected |              38 / 70+ |
| Confirmed compliance findings          |                1 high |
| Test-coverage gaps                     |          4 medium/low |
| Focused test suites passed             |                     2 |
| Tests passed                           | 843 (SDK 39, CLI 804) |

## Evidence and scenario status

### `sdk:host-context` — PASS

- `createSdkContext` awaits `createKernel(config, options?.kernel)` and captures the same config reference in a synchronous, fresh `createGraphProvider` factory (`packages/sdk/src/composition/host-context.ts`).
- `SdkContextOptions` supplies both kernel and graph composition options, and `openSpecdHost` forwards `input.options`.
- `openSpecdHost` rejects simultaneous `configPath`/`startDir`, loads through `createDefaultConfigLoader`, returns loader config/path plus the context, and does not duplicate `config.warnings`.
- The host context has only `kernel` and `createGraphProvider`, with no config-write methods.
- Test evidence: `packages/sdk/test/composition/host-context.spec.ts` exercises same-config forwarding, fresh providers, cwd/explicit discovery, forced config, mixed-input rejection, option forwarding, and warning placement. SDK suite passed.

Coverage note: loader calls are mocked, so this is unit evidence rather than a real config-discovery integration test.

### `sdk:with-open-graph-provider` — PASS

- `withOpenGraphProvider` creates a provider, runs `beforeOpen`, opens it, invokes the callback, attempts close, and invokes `afterClose` after the close path.
- Its catch path suppresses close/after-close failures when preserving the original callback/open failure, so callback/open error propagation matches the merged scenarios.
- It has no `process.exit` side effect.
- Test evidence: `packages/sdk/test/composition/with-open-graph-provider.spec.ts` covers successful ordering, callback failure plus close failure, close and after-close following both open-failure variants, after-close failures, and no exit. SDK suite passed.

### `cli:graph-cli-context` — PASS for the changed lifecycle rule

- `resolveGraphCliContext` uses SDK barrel imports, delegates configured mode to `resolveCliContext`, and creates a synthetic default workspace from the VCS root for `--path`/no-config fallback.
- `withProvider` builds an SDK context and delegates provider open/close to `withOpenGraphProvider`; CLI-only signals, formatted errors, and the intentional process exit remain local.
- `search`, `impact`, and `hotspots` use `resolveGraphCliContext` followed by `withProvider`. `stats` does not call `resolveGraphCliContext` and performs no pre-open lock probe, matching the amended `cli:graph-cli-context` scenario.
- Test evidence: `graph-cli-context.spec.ts` verifies delegation, but its bootstrap assertion is permissive (`null || bootstrap || configured`) and therefore is weak regression coverage.

### `cli:graph-search` — PASS, with test-depth gap

- The handler obtains context through `resolveGraphCliContext`, opens through `withProvider`, and delegates symbol/spec/document searching to the provider.
- It validates kinds before provider access, forwards filters, supports document-only selection, and renders category/structured output from provider results.
- Test evidence: `graph-search.spec.ts` verifies config/path routing, filter delegation, document-only routing, output shape, snippets and validation; CLI suite passed.

Coverage gap (medium): busy/stale/provider-open exit-code-3 behavior is specified but the focused command tests mock `withProvider`; the real `handleError`/provider error path is not exercised by these command tests.

### `cli:graph-impact` — PASS, with test-depth gap

- The handler validates selector/direction/config-vs-path before resolving context, then uses `withProvider` and provider selector/impact APIs.
- File, symbol and spec routes use the provider; no handler-level pre-open lock probe is present.
- Test evidence: `graph-impact.spec.ts` covers selector validation, direction mapping, routing and display cases with mocked context/provider; CLI suite passed.

Coverage gap (medium): no focused integration test proves `GRAPH_BUSY`/`GRAPH_PROVIDER_STALE` yields the specified formatted exit code 3 through the real lifecycle/error boundary.

### `cli:graph-hotspots` — PASS, with test-depth gap

- The handler resolves graph context, opens via `withProvider`, delegates the complete option set to `getHotspots`, and retains default kinds while explicit `--kind` replaces them.
- It contains no pre-open lock probe. The checked CLI reference documents bootstrap semantics and kind/default behavior.
- Test evidence: `graph-hotspots.spec.ts` checks config/path routing, defaults, explicit override behavior, kind parsing and output; CLI suite passed.

Coverage gap (low): tests use mocked provider/context and do not prove a real bootstrap/no-config command path or provider busy error path.

### `cli:graph-stats` — FAIL (HIGH)

Merged artifacts and implementation conflict in two connected ways:

1. The amended `cli:graph-cli-context` contract says stats must own SDK host bootstrap and **must not** use `resolveGraphCliContext`; `stats.ts` follows that rule by calling `openSpecdHost` directly. However, the merged `cli:graph-stats` spec and verification scenario still say graph context/lifecycle must go through `cli:graph-cli-context` (verification: "Command delegates health to GetGraphHealth via SDK"). This is an artifact contradiction in the same change. The code is consistent with the newer `cli:graph-cli-context` requirement; `cli:graph-stats` needs correction.

2. `cli:graph-stats` advertises `--path` as synthetic bootstrap mode. Its merged verification scenario requires `/tmp/repo` to ignore discovery and open synthetic workspace `default`. But `stats.ts` calls:

   ```ts
   openSpecdHost({ startDir: opts.path })
   ```

   `openSpecdHost` explicitly maps `startDir` to `createDefaultConfigLoader({ startDir })`, i.e. config discovery, not `createBootstrapGraphConfig` synthetic mode. Therefore `graph stats --path /tmp/repo` discovers a config if one exists (contrary to the scenario) and fails if none exists (rather than falling back to synthetic bootstrap). Its no-config path has the same absence of synthetic fallback.

   `graph-stats.spec.ts` codifies this current behavior by expecting `{ startDir: '/tmp/repo' }`; it does not assert synthetic config/root behavior, so it cannot catch the violation.

Interpretation: The explicit `cli:graph-stats` command signature and its verification scenario are unambiguous about bootstrap semantics, and match search/impact/hotspots. Implementation is therefore the likely defect. Separately, the stale `cli:graph-stats` wording that requires `cli:graph-cli-context` is a spec defect introduced/left behind during the factory-only correction.

## Dependency and global-rule consistency

- SDK composition respects manual DI and port boundaries: host bootstrap is a composition concern, and graph lifecycle is owned by the SDK helper.
- CLI handlers use the SDK public barrel rather than package-internal paths for platform symbols.
- No direct global architecture/conventions violation was found in this sub-scope.
- The `graph stats` internal spec contradiction is the only direct inter-spec inconsistency found: its legacy `cli:graph-cli-context` statement conflicts with the amended source spec’s explicit prohibition.

## Test commands and results

```text
pnpm --filter @specd/sdk test -- test/composition/host-context.spec.ts test/composition/with-open-graph-provider.spec.ts
  Test Files  6 passed (6)
  Tests  39 passed (39)

pnpm --filter @specd/cli test -- test/commands/graph-cli-context.spec.ts test/commands/graph-stats.spec.ts test/commands/graph-search.spec.ts test/commands/graph-impact.spec.ts test/commands/graph-hotspots.spec.ts
  Test Files  73 passed (73)
  Tests  804 passed (804)
```

The CLI filter invokes the package’s complete Vitest suite; both commands exited successfully.

## Recommended disposition

Route to **Both**:

1. In design, remove/correct the stale `cli:graph-stats` references requiring `cli:graph-cli-context`, retaining direct SDK host bootstrap/lifecycle wording.
2. In implementation, add a stats-specific bootstrap resolver or SDK bootstrap-host path so `--path` and no-config fallback build `createBootstrapGraphConfig` at the resolved VCS root, then add real/near-integration regression tests for explicit path and no-config fallback.
3. Add focused busy/stale error-path tests for search, impact, hotspots and stats if complete scenario coverage is required before signoff.
