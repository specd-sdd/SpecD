# Partial Compliance Audit — CLI graph commands and Core VCS

Change: `sdk-graph-provider-factory`  
Scope: `cli:graph-stats`, `cli:graph-impact`, `cli:graph-search`, `cli:graph-hotspots`, `cli:graph-cli-context`, `core:vcs-adapter-port`, `core:vcs-adapter`  
Method: merged `changes spec-preview` artifacts, graph-first symbol/navigation queries, implementation and test inspection. Graph was fresh. This is a read-only audit.

## Summary

| Severity | Count |
| -------- | ----: |
| High     |     3 |
| Medium   |     2 |
| Low      |     0 |

The graph command implementations largely conform to their merged requirements and their CLI suites pass. The principal deviations are in the VCS public-port export, factory fall-through semantics for external providers, and `graph stats`' required explicit post-close exit. The VCS changes also have material scenario-level test gaps.

## Requirements Summary and Implementation Status

### `cli:graph-stats`

- Implemented: command signature and mutual-exclusion validation in `packages/cli/src/commands/graph/stats.ts`; explicit config, bootstrap path, and no-config bootstrap all use `openSpecdHost` from the SDK.
- Implemented: health calculation is delegated to `createGetGraphHealth`, with configured-host `listWorkspaces` results passed as the fingerprint input; text/structured formatting includes stale and derivation-fingerprint fields.
- Implemented: no CLI pre-open lock probe is present; provider-originated availability errors flow through the SDK lifecycle.
- Covered: `packages/cli/test/commands/graph-stats.spec.ts` covers host inputs, flags, health output/staleness, fingerprint output, and lifecycle delegation.
- Finding CLC-01 below: required explicit `process.exit(0)` after the SDK wrapper closes is absent.

### `cli:graph-impact`

- Implemented: exactly-one selector validation, direction aliases, positive depth validation, config/path exclusivity, provider lifecycle via `resolveGraphCliContext` + `withProvider`, and provider-owned traversal/aggregation in `packages/cli/src/commands/graph/impact.ts`.
- Implemented: symbol, file, multi-file, and spec impact handlers use provider selector resolution and display-path lookup; structured output exposes aggregate count fields.
- Covered: `packages/cli/test/commands/graph-impact.spec.ts` exercises aliases, depth, selector failures, context modes, spec errors, single/multiple symbols, and aggregate files/JSON fields.
- Result: no implementation/spec discrepancy identified in this scoped review.

### `cli:graph-search`

- Implemented: category defaults and flags, validation, SDK-only platform types, shared context/lifecycle, store-level `SearchOptions` filters, category grouping, optional snippets, and structured content/snippet omission in `packages/cli/src/commands/graph/search.ts`.
- Covered: `packages/cli/test/commands/graph-search.spec.ts` covers bootstrap/config modes, kinds, documents, validation, snippets, structured omission/inclusion, spec content, and result ordering preservation.
- Result: no CLI-layer discrepancy identified. Backend ranking guarantees belong to the graph-store specs/audit batch, rather than this command adapter.

### `cli:graph-hotspots`

- Implemented: documented default policy, selective override behavior, kind validation, shared context/lifecycle, provider-owned busy/stale handling, and text/structured presentation in `packages/cli/src/commands/graph/hotspots.ts`.
- Covered: `packages/cli/test/commands/graph-hotspots.spec.ts` exercises defaults, each selective override, importer-only widening, invalid kind rejection, context modes, and CLI-reference alignment.
- Result: no implementation/spec discrepancy identified in this scoped review.

### `cli:graph-cli-context`

- Implemented: `resolveGraphCliContext` imports platform types/factories from `@specd/sdk`, supports explicit config, explicit bootstrap, config discovery, and synthetic VCS-rooted bootstrap context in `packages/cli/src/commands/graph/resolve-graph-cli-context.ts`.
- Implemented: graph command handlers inspected (`impact`, `search`, `hotspots`) use `resolveGraphCliContext` and `withProvider`; `stats` follows its explicitly permitted direct `openSpecdHost` route.
- Covered: `packages/cli/test/commands/graph-cli-context.spec.ts` verifies `withProvider` delegation and has a minimal bootstrap smoke assertion.
- Result: no direct code/spec mismatch identified, although the test is weak for the stated bootstrap/config precedence behavior (CLC-05).

### `core:vcs-adapter-port`

- Implemented: `VcsAdapter` is an abstract class with protected readonly `cwd`; it declares the required VCS operations, `refAt`, `modifiedFiles`, and `identity` in `packages/core/src/application/ports/vcs-adapter.ts`.
- Implemented: Git/Hg/SVN adapters implement the expanded port, and `NullVcsAdapter` supplies the specified safe defaults.
- Finding CLC-02 below: the public barrel re-exports `VcsAdapter` as type-only, rather than the required public abstract class value.
- Finding CLC-04 below: port scenarios for the expanded history/change-list contract are mostly untested.

### `core:vcs-adapter`

- Implemented: factory probes supplied providers in order, defaults to git/hg/svn priority, defaults `cwd`, and returns `NullVcsAdapter` when no supplied provider matches in `packages/core/src/composition/vcs-adapter.ts`.
- Covered: `packages/core/test/composition/vcs-adapter.spec.ts` covers base detect, actual git detection, and a matching custom provider.
- Finding CLC-03 below: supplying an unmatched external provider prevents required built-in fallback probes.
- Finding CLC-04 below: required detection-priority/fallback scenarios remain untested.

## Detailed Findings

### CLC-01 — High — `graph stats` does not explicitly exit after provider close

Evidence: the merged `cli:graph-stats` constraints require `process.exit(0)` explicitly after the SDK lifecycle wrapper has closed the provider. `packages/cli/src/commands/graph/stats.ts` awaits `withOpenGraphProvider(...)` and returns without an explicit exit. In contrast, `withProvider` is documented/tested as retaining this native-thread-release concern for the other graph commands.

Impact: a stats invocation may retain native graph-store threads and fail to terminate predictably after close, contrary to the explicit lifecycle constraint.

Interpretation: either the implementation is incomplete, or the spec should explicitly establish that `withOpenGraphProvider` itself guarantees process exit. Current code and the separate `withProvider` requirement support the former.

Test gap: `graph-stats.spec.ts` tests lifecycle delegation but has no assertion that the successful action exits after the wrapper completes.

### CLC-02 — High — Public `VcsAdapter` export is type-only

Evidence: merged `core:vcs-adapter-port` requires `@specd/core` to export the abstract `VcsAdapter` class as its supported public API. `packages/core/src/application/ports/index.ts` contains `export { type VcsAdapter } from './vcs-adapter.js'`; this erases the runtime class value. The root barrel reaches this file via `src/application/index.ts` and `src/index.ts`.

Impact: a value import from `@specd/core` cannot resolve to the abstract class as required; consumers can only use the type. This violates the stated public-port requirement even though internal implementation imports work.

Interpretation: implementation should re-export `VcsAdapter` as a value. If a type-only public contract was intended, the merged spec must be revised because it explicitly says abstract class/public import.

Test gap: no barrel test imports `VcsAdapter` as a runtime value from `@specd/core`.

### CLC-03 — High — External VCS providers do not fall through to built-ins

Evidence: merged `core:vcs-adapter` requires registered external providers to be probed first _then_ git/hg/svn in built-in order when none match. `createVcsAdapter(cwd, providers = BUILTIN_VCS_PROVIDERS)` iterates only the supplied `providers`. Passing an external list therefore replaces, rather than prefixes, the built-ins. The existing custom-provider test only checks the matching case.

Impact: an unmatched extension returns `NullVcsAdapter` even in a Git/Hg/SVN workspace, violating the factory's documented fallback behavior.

Interpretation: implementation should combine registered external providers with `BUILTIN_VCS_PROVIDERS`; alternatively, the API/spec must make callers responsible for passing the combined ordered list. The current merged spec explicitly assigns that composition responsibility to the factory.

Test gap: no test covers unmatched external provider fall-through, built-in order, git-over-hg priority, Hg, SVN, or null fallback.

### CLC-04 — Medium — Expanded VCS port scenarios lack adequate automated coverage

Evidence: the merged `core:vcs-adapter-port` verification scenarios cover `refAt`, `show` error/null cases, `modifiedFiles`, null `refAt`/`modifiedFiles`, identity, and concrete detection. Existing VCS tests primarily cover cached roots and identity. `packages/core/test/infrastructure/null/vcs-adapter.spec.ts` omits `refAt` and `modifiedFiles`; Git/Hg/SVN tests omit `ref`, `refAt`, `show`, `modifiedFiles`, cleanliness, branch/detached behavior, and detect failure/success beyond factory's local git environment.

Impact: new history and changed-file behavior is not protected against regressions across the advertised adapters; command syntax/parsing and no-data normalization are unverified.

Interpretation: code may be correct, but the spec's scenario coverage expectation is not met. Add focused mocked-exec tests and temporary-repository integration coverage where needed.

### CLC-05 — Medium — Shared graph-context tests do not verify its core precedence contract

Evidence: `cli:graph-cli-context` requires direct config use, forced bootstrap for `--path`, config autodiscovery then bootstrap fallback, and synthetic default workspace rooted at VCS root. `packages/cli/test/commands/graph-cli-context.spec.ts` has only two tests; its bootstrap assertion accepts `null`, `bootstrap`, or `configured`, so it cannot fail when bootstrap semantics regress.

Impact: the shared module controls three CLI commands' host resolution; regressions can bypass config/bootstrapping semantics despite individual command tests checking the arguments passed to the resolver.

Interpretation: implementation currently appears aligned, but focused tests should mock discovery/VCS resolution and assert each required branch and context shape.

## Dependency/Global Consistency

- CLI graph commands preserve the adapter role: they delegate graph reads, ranking, hotspot computation, and traversal to the provider, consistent with the architecture boundary.
- `cli:graph-cli-context` uses SDK barrel exports for platform-facing symbols in the inspected code; no host-managed pre-open lock probe was found in the scoped handlers.
- The VCS port remains in `core` application and implementations remain in infrastructure; the public-barrel issue is an API exposure defect, not a layer inversion.

## Verification Evidence

- `pnpm --filter @specd/cli test -- graph-stats graph-impact graph-search graph-hotspots graph-cli-context`: passed (73 files, 804 tests; Vitest package invocation ran the CLI suite).
- `pnpm --filter @specd/core test -- vcs-adapter`: passed (157 files, 2154 tests; package invocation ran the Core suite).
- Passing suites do not resolve CLC-01 through CLC-05 because the requisite assertions/scenarios are absent or insufficient.
