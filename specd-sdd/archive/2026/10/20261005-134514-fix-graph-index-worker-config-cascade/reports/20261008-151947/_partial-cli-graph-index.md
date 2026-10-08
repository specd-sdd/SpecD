# Compliance audit — `cli:graph-index`

## Requirements Summary

The merged `cli:graph-index` specification contains 7 requirements and 29 verification scenarios. This change modifies only **Indexing behaviour**; the other six requirements remain compatibility constraints.

| Requirement                         | Status                | Evidence                                                                                                                                                                                                                                        |
| ----------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature                   | Compliant             | `registerGraphIndex` retains `--force`, repeatable `--exclude-path`, mutually exclusive `--config`/`--path`, and text default. Existing validation remains before worker invocation.                                                            |
| Indexing behaviour                  | Compliant             | Parent emits explicit `forced`, `discovered`, or `bootstrap` descriptors; child dispatches them to exact-file loading, start-directory discovery, or explicit bootstrap respectively; indexing is invoked once after successful reconstruction. |
| Output format                       | Compliant / unchanged | Result formatting and structured passthrough were not changed. CLI suite passes.                                                                                                                                                                |
| Forced indexing result completeness | Compliant / unchanged | `force`, exclusions, result fields, progress, and diagnostics remain passthrough values; no result inference was added.                                                                                                                         |
| Error cases                         | Compliant             | Mutual-exclusion remains exit 1; worker/task failures remain exit 3; discovered reconstruction rejection is propagated without bootstrap fallback.                                                                                              |
| CLI reference documentation         | Compliant / unchanged | `docs/cli/cli-reference.md` contains the `graph` section, all subcommands, flags, configured/bootstrap model, graph filtering fields, defaults, replacement semantics, and negation example.                                                    |
| Visible incompatibility repair      | Compliant / unchanged | Repair remains SDK/provider-owned and no backend deletion or repair logic was introduced in CLI.                                                                                                                                                |

## Implementation Status

### Parent command

`packages/cli/src/commands/graph/index-graph.ts` complies with the merged requirement:

- Captures `process.cwd()` before asynchronous resolution (`discoveryStartDir`).
- Preserves explicit `--config` as `{ mode: 'forced', configPath: context.configFilePath }`.
- Preserves automatic discovery as `{ mode: 'discovered', startDir: discoveryStartDir }`.
- Preserves bootstrap roots for `--path` and no-config fallback.
- Keeps `storageRoot` from the parent's effective config, preserving lock/storage identity.
- Calls `runIsolatedGraphIndex` once through `@specd/sdk`; no lock, fork, IPC, or direct `@specd/code-graph` ownership was introduced.
- Keeps force, exclusions, progress selection, result rendering, and error exits unchanged.

### Packaged child task

`packages/cli/src/graph-index-task.ts` complies with the merged requirement:

- `CliGraphIndexContextDescriptor` is a JSON-safe discriminated union with exact required fields.
- Forced mode calls `openSpecdHost({ configPath, options: { kernel } })`.
- Discovered mode calls `openSpecdHost({ startDir, options: { kernel } })` and supplies no bootstrap fallback.
- Bootstrap mode retains `createBootstrapGraphConfig` plus `createSdkContext`.
- `runIndexProjectGraph` remains one shared post-reconstruction invocation, so a failed discovery cannot index or silently bootstrap.
- Force, optional exclusion paths, progress, and the SDK result cross the task boundary unchanged.

### Architecture and blast radius

- CLI continues to import platform capabilities only from `@specd/sdk`, consistent with `default:_global/architecture`.
- `packages/cli/package.json` has `@specd/sdk` and no runtime dependency on `@specd/core` or `@specd/code-graph`.
- No business logic or infrastructure adapter was moved into CLI; the command selects a serializable delivery descriptor and delegates loading/orchestration.
- Implementation tracking resolves all declared symbols and has no open or out-of-scope files.
- Fresh graph impact for the two production files is **MEDIUM**. `graph-index-task.ts` reaches 7 files and 5 covering specs through program registration/tests. The implementation avoids the shared `GraphCliContext`/resolver mutation that the design identified as CRITICAL.
- Spec-dependent impact for `cli:graph-index` is LOW with no downstream dependent spec, so no additional spec delta is indicated.

## Discrepancies

### LOW — no durable CLI-to-loader integration test materializes the local cascade

**Evidence:**

- `packages/cli/test/commands/graph-index.spec.ts` mocks `resolveGraphCliContext` and `runIsolatedGraphIndex`; it proves that automatic discovery serializes the captured absolute start directory.
- `packages/cli/test/graph-index-task.spec.ts` mocks `openSpecdHost`; it proves that the child passes `startDir`, and separately proves rejection propagation with no bootstrap substitution.
- `packages/sdk/test/composition/host-context.spec.ts` proves that `openSpecdHost({ startDir })` selects discovery and `openSpecdHost({ configPath })` selects forced loading.
- `packages/core/test/infrastructure/fs/config-loader.spec.ts` covers local-file discovery/cascade and forced-mode behavior.
- Task 6.3 records a disposable built-CLI check, but that fixture/result is not retained as an automated regression test.

**Impact:** This is not an observed code/spec mismatch. The implementation composes already-tested contracts correctly, and the full CLI suite passes. However, the strongest new scenario says that the child observes the same local cascade values as the parent; current committed CLI tests prove that transitively rather than in one cross-layer test. A future regression in integration wiring could require multiple suites to expose.

**Code/test resolution:** Add a durable integration test using a temporary repository containing `specd.yaml`, an extending `specd.local.yaml`, and distinguishable graph exclusions. Exercise the packaged task or built CLI once without `--config` and once with explicit `--config`, asserting the discovered/forced difference.

**Spec resolution:** If cross-layer observation is intentionally considered satisfied by contract composition, clarify the verification scenario to state that descriptor routing plus `sdk:host-context`/`core:config-loader` dependency scenarios are acceptable evidence. Weakening or removing the behavior itself is not recommended because it is the defect being fixed.

No HIGH, MEDIUM, or correctness discrepancies were found.

## Test Coverage

### Change-specific scenarios

| Scenario                                        | Coverage                                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Command delegates once with explicit descriptor | Direct command test; exact worker call asserted.                                                                                  |
| CLI owns no lock/subprocess mechanics           | Source/package boundary assertion plus import inspection.                                                                         |
| Explicit config remains forced                  | Parent descriptor test + child exact `configPath` call test + SDK/Core dependency tests.                                          |
| Automatic discovery replays local cascade       | Parent captured-CWD descriptor test + child exact `startDir` call test + SDK/Core discovery tests; cross-layer proof is indirect. |
| Discovery replay does not bootstrap             | Direct child rejection test and command exit-3 mapping test.                                                                      |
| Packaged task indexes exactly once              | Direct forced/discovered tests assert one invocation; bootstrap test asserts the shared call and forwarding.                      |
| Bootstrap remains explicit                      | Direct command and task tests assert roots and absence of discovery.                                                              |
| Index options unchanged                         | Direct command/task assertions cover `force` and exclusion paths.                                                                 |
| Text progress / structured silence              | Existing command test asserts callback behavior and rendered progress.                                                            |
| Production isolation / SDK boundary             | Source/package assertions and imports.                                                                                            |

### Executed evidence

- `pnpm --filter @specd/cli test -- test/commands/graph-index.spec.ts test/graph-index-task.spec.ts` completed successfully. Because of the package script's Vitest invocation semantics, it ran the full CLI suite: **87 files, 1103 tests, all passed**.
- `changes implementation review` reports a fresh graph with complete coverage; four changed files are resolved and all symbol links are valid.

## Missing Tests

1. **Recommended, LOW priority:** committed cross-layer integration test for real local cascade replay versus explicit forced loading.
2. **Optional hardening:** assert `discoveryStartDir` remains the captured value if `process.cwd()` is changed after context resolution starts. The implementation captures before `await`, so current code is correct; this would protect the stated TOCTOU-of-CWD design decision.
3. **Optional hardening:** runtime serialization validation of each descriptor shape through the real isolated-worker protocol. The shapes contain strings/booleans/arrays only and the generic worker already tests JSON validation, so this is not a current gap in correctness.

## Spec Dependency Chain

```text
cli:graph-index
├─ cli:entrypoint
│  └─ defines --config exact-file semantics, exit codes, and output conventions
├─ sdk:host-context
│  └─ maps configPath -> forced loader and startDir -> discovery loader
├─ core:config-loader
│  ├─ startDir -> filename discovery + active cascade/local layers
│  └─ configPath -> explicit chain only, without discovered sibling layers
├─ core:config
│  └─ defines cascade identity, local overrides, and graph configuration
├─ code-graph:isolated-index-worker
│  └─ transports opaque JSON task input and owns process/lock/IPC lifecycle
├─ sdk:run-index-project-graph
│  └─ owns provider/index orchestration and repair
└─ default:_global/architecture
   └─ requires CLI delivery through SDK and forbids direct code-graph dependency
```

Consistency result: the new forced/discovered split is the missing adapter-level provenance needed to preserve both `cli:entrypoint` exact-file semantics and `core:config-loader` discovery semantics across the isolated process boundary. It does not alter either dependency contract and introduces no package-cycle or ownership conflict.

## Summary counts

| Category                       |                       Count |
| ------------------------------ | --------------------------: |
| Requirements reviewed          |                           7 |
| Merged scenarios reviewed      |                          29 |
| Production files changed       |                           2 |
| Test files changed             |                           2 |
| Tests executed                 |      1103 passed / 0 failed |
| HIGH discrepancies             |                           0 |
| MEDIUM discrepancies           |                           0 |
| LOW discrepancies              | 1 (test-evidence hardening) |
| Confirmed code/spec mismatches |                           0 |
| Missing recommended tests      |                           1 |
| Optional hardening tests       |                           2 |

**Audit conclusion:** `cli:graph-index` is compliant with the merged specification and its direct/global dependency contracts. The implementation is suitable to proceed. The only finding is a low-severity durability gap in cross-layer automated evidence; it does not block verification or transition.
