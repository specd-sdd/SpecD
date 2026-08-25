# CLI Graph Index — Partial Compliance Audit

## Requirements Summary

Audited merged spec `cli:graph-index` and its 20 merged verification scenarios.

1. Command signature: `graph index` accepts `--force`, repeatable `--exclude-path`, mutually exclusive `--config`/`--path`, and `--format` defaulting to text.
2. Execution boundary: CLI delegates exactly once to SDK `runIsolatedGraphIndex`, supplies storage root, trusted packaged task module, serializable context descriptor, index options, and text-only progress callback.
3. CLI boundary: no CLI lock, child process, IPC, signal, cleanup, direct Code Graph dependency, or public parent-process bypass.
4. Packaged child task: reconstructs configured/bootstrap SDK context and calls `runIndexProjectGraph` once with unchanged force/exclusion options.
5. Presentation/error contract: text summaries, structured results without protocol output, CLI error mapping to exit 3, and per-file errors remain successful results.
6. Documentation and repair: graph reference documents all subcommands/configuration semantics; result presentation preserves rebuild and coverage/error fields.

## Implementation Status

| Requirement area                                | Status      | Evidence                                                                                                                                                                                                           |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command/options/context validation              | Implemented | `packages/cli/src/commands/graph/index-graph.ts:20-134` registers all options, rejects dual config/path before resolving context, and uses `parseFormat` defaults.                                                 |
| SDK-only isolated delegation                    | Implemented | `index-graph.ts:111-127` calls `runIsolatedGraphIndex` once with `storageRoot`, `new URL('./graph-index-task.js', import.meta.url)`, serializable `taskInput`, and text-only `onProgress`.                         |
| No CLI-owned worker mechanics/direct dependency | Implemented | `index-graph.ts` imports only SDK platform capability; `packages/cli/package.json` contains no `@specd/code-graph` dependency. Static guard in `packages/cli/test/commands/graph-index.spec.ts:91-96`.             |
| Child task behavior                             | Implemented | `packages/cli/src/graph-index-task.ts:54-81` opens configured SDK host or builds explicit bootstrap config, then returns exactly one `runIndexProjectGraph` invocation with force/exclusions and bridged progress. |
| Output/error behavior                           | Implemented | `index-graph.ts:129-139` renders text or full structured result and maps worker failures through `cliError(..., 3)`; `formatTextIndexResult` retains document/workspace/phase/rebuild/error fields.                |
| Documentation                                   | Implemented | `docs/cli/cli-reference.md:1184-1576` contains `graph` with `index`, `search`, `hotspots`, `stats`, and `impact`, config/bootstrap rules, exclusion semantics, and usage examples.                                 |

## Discrepancies

No functional or specification discrepancies found in the CLI-owned surface.

### Coverage-only observation — Low

`packages/cli/test/commands/graph-index-integration.spec.ts` exercises a real child for text output and lock contention, but does not execute a real child invocation in JSON/TOON mode to prove protocol traffic never reaches stdout. Unit coverage verifies structured mode omits the progress callback (`graph-index.spec.ts:59-66`), and isolation/protocol behavior is directly covered in the Code Graph worker audit surface. This is a test-depth gap, not evidence of noncompliance.

## Test Coverage

- Executed: `pnpm --filter @specd/cli exec vitest run test/commands/graph-index.spec.ts test/graph-index-task.spec.ts`
  - Result: 2 files passed, 8 tests passed.
- `graph-index.spec.ts` covers configured delegation, exact bootstrap descriptor, text progress/result rendering, mutually exclusive flags before SDK call, worker-error exit 3, absence of CLI worker environment branches, and absence of direct Code Graph dependency.
- `graph-index-task.spec.ts` covers configured and bootstrap SDK-context reconstruction, one indexing call, force/exclusion forwarding, progress bridge, and static SDK-boundary restrictions.
- `graph-index-integration.spec.ts` provides publish-shaped built-artifact coverage: actual child task indexing and busy lock exit 3.
- Documentation inspection confirms all required graph command reference sections and index configuration semantics are present.

## Missing Tests

1. Add a publish-shaped integration invocation with `--format json` (and optionally TOON) to assert stdout parses as exactly one final structured result with no worker/progress protocol records. Severity: low; current unit test supplies direct evidence for the CLI branch.
2. Optionally test repeated `--exclude-path` in the real child path; unit delegation coverage verifies serialized forwarding, while SDK/worker tests own process-boundary protocol validation. Severity: low.

## Spec Dependency Chain

`cli:graph-index` depends directly on:

- `cli:entrypoint` for parser/error/output behavior.
- `core:config` and `core:list-workspaces` for configured/bootstrap context semantics.
- `sdk:run-index-project-graph` and `sdk:host-context` for child-task orchestration/context reconstruction.
- `code-graph:isolated-index-worker` for lock, spawn, IPC, signal forwarding, termination classification, and cleanup.

Graph impact reports this spec as CRITICAL-risk with 5 direct, 12 indirect, and 72 transitive dependent specs; the CLI change confines its high-risk boundary to SDK imports and the packaged task rather than reimplementing worker mechanics.

## Summary counts

- Requirements audited: 6 requirement areas / 20 merged scenarios.
- Fully implemented: 6.
- Functional discrepancies: 0.
- High/critical discrepancies: 0.
- Test-coverage observations: 1 low.
- Missing-test recommendations: 2 low.
