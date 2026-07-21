# Spec-compliance audit — SDK host/provider factory and graph CLI

Scope: `sdk:host-context`, `sdk:with-open-graph-provider`, `cli:graph-stats`, `cli:graph-impact`, `cli:graph-search`, and `cli:graph-hotspots`; direct dependencies `sdk:composition`, `cli:graph-cli-context`, and `code-graph:composition`; project-wide architecture, conventions, testing, docs, ESLint, error-handling, logging, and spec-layout constraints.

Audit date: 2026-07-19. Graph: fresh (`926` files, `4,102` symbols, `241` specs; no fingerprint mismatch). This was a read-only audit of merged change artifacts, implementation, tests, package manifests, CLI reference, and graph relationships.

## Summary

| Area                           | Requirements/scenarios reviewed | Status                                        |
| ------------------------------ | ------------------------------: | --------------------------------------------- |
| `sdk:host-context`             |    4 requirements / 9 scenarios | 1 discrepancy; otherwise covered              |
| `sdk:with-open-graph-provider` |                           4 / 8 | 1 discrepancy in error path                   |
| `cli:graph-stats`              |                          5 / 13 | 1 discrepancy; remaining coverage present     |
| `cli:graph-impact`             |                          6 / 24 | 1 discrepancy in multi-file structured output |
| `cli:graph-search`             |                         4 / 36+ | Conformant in inspected command surface       |
| `cli:graph-hotspots`           |                          7 / 20 | Conformant in inspected command surface       |

Counts: **6 assigned specs**, **3 direct dependency specs**, and **8 project-wide constraints** considered. **4 findings**: 1 high, 2 medium, 1 low. Relevant focused test declarations total **89** (SDK 17; CLI stats 16, impact 27, search 16, hotspots 13). The requested Vitest invocations passed: SDK suite **37/37** tests and CLI suite **804/804** tests. The CLI command forwards positional arguments in a way that executed the complete CLI suite, so the 804 passing count is broader than the four assigned test files.

## Findings

### H1 — `graph impact` leaks canonical workspace paths in multi-file JSON/TOON output

**Spec:** `cli:graph-impact`, Output format. The merged requirement says all file paths rendered in both text and JSON must be project-root-relative. The single-file structured branch converts `affectedFiles` through `toDisplayPath`, but the multi-file branch emits `affectedFiles: result.affectedFiles` unchanged in `packages/cli/src/commands/graph/impact.ts` (the aggregate result also retains canonical `targets`). Those provider paths are canonical workspace identities such as `core:src/...`, not project-root-relative paths such as `packages/core/src/...`.

**Impact:** automation consuming `--file a b --format json|toon` receives a different path namespace from single-file output and the documented output contract.

**Evidence:** `handleFilesImpact` normalizes only each `perFile[].result.affectedFiles`; its aggregate structured payload keeps `result.affectedFiles` raw. Existing multi-file JSON test coverage checks payload shape but not this conversion.

**Resolution direction:** translate aggregate affected files (and any user-facing target/path fields governed by the requirement) with the same `toDisplayPath` helper before structured output; add a multi-file JSON/TOON regression case with a workspace-prefixed affected path.

### M1 — `graph stats` does not use the specified `openSpecdHost` bootstrap entry point

**Specs:** `cli:graph-stats` Statistics retrieval / Host context scenario; `sdk:host-context` `openSpecdHost`. The merged stats spec explicitly requires host context from `openSpecdHost`. Instead, `packages/cli/src/commands/graph/stats.ts:5,58` resolves graph context independently and calls `resolveSdkHostContext(config, kernel)`, whose configured path constructs `{ kernel, createGraphProvider }` directly (`packages/cli/src/helpers/sdk-host.ts:17`). It never calls `openSpecdHost` (`packages/sdk/src/composition/host-context.ts:95`).

**Impact:** this bypasses the declared SDK host bootstrap surface and its tested config/warning/path behavior. The observable current behavior may be equivalent for a normal configured invocation, but it is an implementation/spec divergence and weakens the intended single host-entry-point abstraction.

**Coverage gap:** `graph-stats.spec.ts` has 16 passing tests, but no test asserts that configured stats obtains its host through `openSpecdHost`; current tests only assert `withProvider` delegation and graph-context options.

**Resolution direction:** either route configured stats through `openSpecdHost` while retaining `cli:graph-cli-context` bootstrap semantics, or revise the merged stats requirement/scenario to specify `resolveGraphCliContext` plus `resolveSdkHostContext` as the intended host composition.

### M2 — `withOpenGraphProvider` can invoke `afterClose` twice after an `afterClose` failure

**Spec:** `sdk:with-open-graph-provider`, lifecycle hook ordering and error propagation. On a successful callback, `packages/sdk/src/composition/with-open-graph-provider.ts:30-31` closes then awaits `afterClose`. If that hook rejects, the outer catch runs, closes again at line 35, then invokes `afterClose` again at line 40 before rethrowing the first hook failure. The merged contract says `afterClose` runs after the helper finishes its close path; it describes propagation of a successful-operation cleanup failure, not repeated cleanup-hook invocation or a second provider close.

**Impact:** teardown hooks that release a lock, publish an event, or mutate host state can run twice when they fail, creating duplicated side effects. A second `close()` can also be unsafe for providers whose close is not idempotent.

**Coverage gap:** the seven SDK helper tests cover successful ordering, callback-error preservation, and open failures, but no test makes `afterClose` reject after a successful callback and asserts a single close/single hook call.

**Resolution direction:** separate the primary-operation error path from the post-close-hook failure path (or track whether close/hook have already run), preserving the allowed terminal propagation without re-entering cleanup.

### L1 — `sdk:host-context` does not test the declared no-duplicate-config shape directly

**Spec:** `sdk:host-context`, `SdkHostContext shape`. Implementation is conformant: the interface and returned context contain only `kernel` and `createGraphProvider`, and the function closes over the same `config` reference. However, `host-context.spec.ts` does not explicitly assert that `createSdkContext` returns no top-level `config` field; the closest assertions exercise the `openSpecdHost` result, which intentionally does expose config.

**Impact:** a future accidental widening of `SdkHostContext` could pass current tests while violating its no-duplicated-config boundary.

**Resolution direction:** add a direct context-shape assertion (`'config' in context === false`) alongside the current same-reference and fresh-provider tests.

## Conformant coverage

- **SDK context and composition:** `createSdkContext` awaits `createKernel`, supplies the same config and optional graph composition options to new provider factories, and `openSpecdHost` correctly enforces mutually exclusive bootstrap inputs, loader mode selection, warnings retention, and config-file-path propagation. Package manifest dependencies are only `@specd/core` and `@specd/code-graph`; the CLI depends on SDK rather than those packages directly.
- **SDK lifecycle:** provider creation, `beforeOpen`, open, callback, close, no `process.exit`, callback-error preservation despite close failure, and open-failure cleanup are implemented and tested. M2 is restricted to the untested hook-failure-after-success branch.
- **Shared CLI context:** all four graph handlers resolve through `resolveGraphCliContext` and use `withProvider`; `withProvider` delegates open/close to SDK `withOpenGraphProvider`, retaining CLI signal handling, formatting, and explicit successful exit as required by `cli:graph-cli-context`.
- **Stats:** uses `GetGraphHealth`, passes mapped kernel workspaces where available, renders all declared counters and non-zero relations, returns the structured stale/current/fingerprint fields, and reports fingerprint mismatch on stderr. It correctly relies on provider-owned busy/stale availability rather than the removed pre-open lock probe.
- **Impact:** selector exclusivity, direction aliases, depth parsing, file/symbol/spec delegation, missing-spec error propagation, structured aggregate counters, and provider-owned busy/stale errors are present. H1 is limited to multi-file aggregate structured path rendering.
- **Search:** category selection, kind validation, store-level filters, snippets only on request, line ranges, structured fields, normalized text snippets, and provider delegation are present. Ranking is delegated to the active graph-store as required; no CLI-side ranking logic was found.
- **Hotspots:** default kinds, filter pass-through, explicit-kind replacement, importer-only widening, context precedence, output fields, provider delegation, and current busy/stale semantics are present. `docs/cli/cli-reference.md:1215+` documents the command, bootstrap behavior, default kinds, replacement semantics, and importer-only switch.
- **Global/dependency consistency:** inspected SDK/CLI sources use ESM named exports, explicit public return types, readonly public option/context properties, SDK-barrel platform imports, manual composition, and no new package cycle. Tests are Vitest files under mirrored `test/` directories; no snapshot-based coverage was observed in the assigned test surface. No contradiction was found with architecture, conventions, testing, docs, ESLint, error handling, logging, or spec-layout constraints.

## Test and audit evidence

- `rtk node packages/cli/dist/index.js graph stats --format json`: graph fresh, 926 files / 4,102 symbols / 241 specs.
- `rtk pnpm --filter @specd/sdk test -- test/composition/host-context.spec.ts test/composition/with-open-graph-provider.spec.ts`: passed, 6 files / 37 tests (including assigned 17 tests).
- `rtk pnpm --filter @specd/cli test -- test/commands/graph-stats.spec.ts test/commands/graph-impact.spec.ts test/commands/graph-search.spec.ts test/commands/graph-hotspots.spec.ts`: passed, 73 files / 804 tests (assigned files: 16 + 27 + 16 + 13 = 72 tests).

## Dependency chain checked

`cli:{graph-stats,graph-impact,graph-search,graph-hotspots}` → `cli:graph-cli-context` → `sdk:{host-context,with-open-graph-provider,composition}` → `code-graph:composition`, with global architecture/conventions/testing and CLI documentation constraints applied. The code conforms to this chain except the explicit `openSpecdHost` requirement identified in M1.
