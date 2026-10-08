# Compliance audit — `core:config-loader`

## Requirements Summary

The merged artifacts for `core:config-loader` are unchanged by this change (`op: no-op`). The authoritative merged spec contains 17 requirements and the merged verification artifact contains 66 scenarios. This audit therefore checks two things: that the existing loader contract remains implemented, and that the new isolated graph-index handoff selects the correct existing loader mode.

The requirements group into these contracts:

1. `createDefaultConfigLoader` accepts exactly the discovery form `{ startDir }` or forced form `{ configPath }`, resolves the VCS boundary, and returns the `ConfigLoader` port.
2. Discovery walks from `startDir` up to the VCS root (or checks only `startDir` without a VCS), orders all discoverable candidates, constructs the active cascade, includes extending local layers, and fails with `ConfigValidationError` when no config is found.
3. Forced mode resolves an exact entrypoint plus only its declared `extends` chain; filename-discovered sibling layers are not appended.
4. `resolvePath()` preserves the distinction: discovery returns the active chain root or `null`; forced returns the absolute requested path without an existence check; it does not throw.
5. Active layers obey scalar/object/array merge and deterministic removal rules, with standalone layers resetting prior state.
6. Parsing, environment precedence, path resolution, containment, workspace defaults/external inference, pattern validation, plugin/context mapping, approvals defaults, and error typing remain loader invariants.
7. The config-loading boundary remains architectural: the public composition factory returns a port, YAML validation stays in infrastructure, and the CLI reaches it through `@specd/sdk`.

For this change, the critical cross-spec obligations are:

- implicit `graph index` discovery must transport the original parent `startDir` and call `openSpecdHost({ startDir })` in the child, so `specd.local.yaml` and `specd.local.*.yaml` can attach normally;
- explicit `--config` must transport the resolved `configPath` and call `openSpecdHost({ configPath })`, retaining closed-chain forced semantics;
- discovery replay failure must propagate and must not become bootstrap.

## Implementation Status

### Loader and cascade implementation

**PASS — factory mode and VCS boundary.** `packages/core/src/composition/config-loader.ts:15-31` derives `probeDir` from `startDir` or `configPath`, resolves the VCS adapter once, normalizes `NullVcsAdapter` to `rootPath = null`, and constructs `FsConfigLoader(rootPath, options)`. The public factory returns `Promise<ConfigLoader>`. This matches `core:composition`, `core:vcs-adapter`, and the global architecture rule that hosts use composition factories rather than constructing infrastructure adapters.

**PASS — discriminated mode selection.** `packages/core/src/infrastructure/fs/config-loader.ts:52` defines `FsConfigLoaderOptions` as `{ startDir: string } | { configPath: string }`. `FsConfigLoader._resolveCascade()` dispatches `configPath` to `resolveForcedCascade()` and `startDir` to `findCandidateDirectory()` plus discovery/active-chain resolution.

**PASS — discovery and local cascade.** `packages/core/src/infrastructure/fs/config-cascade.ts` implements the specified candidate order (`specd.yaml`, named shared variants, `specd.local.yaml`, named local variants), VCS-bounded directory search, parsing, and `resolveActiveChain()`. A local layer with `extends: true` attaches to the prior active layer; a standalone local layer resets the chain; an explicit-base variant attaches only when its base is active. `FsConfigLoader._resolveCascade()` parses every discovered candidate and merges the resolved active chain, so local layers are not reduced to a single selected filename.

**PASS — no-config failure.** If discovery cannot find a candidate directory, `FsConfigLoader._resolveCascade()` throws `ConfigValidationError` with `no specd.yaml found (searched up to VCS root)`. Outside a VCS, `findCandidateDirectory()` checks only `startDir`. The isolated task does not set `allowBootstrapFallback`, so this failure is not converted into bootstrap.

**PASS — forced closed chain.** `resolveForcedCascade()` resolves the entry path absolutely and follows only explicit `extends` or the previous sorted candidate for `extends: true`. It never performs forward sibling discovery. Missing entries/targets, an impossible previous candidate, and cycles become `ConfigValidationError` paths.

**PASS — path probing.** `FsConfigLoader.resolvePath()` returns `path.resolve(configPath)` directly in forced mode. Discovery uses the same candidate-directory and active-chain machinery and returns `cascade.rootPath`; all discovery probe failures are caught and returned as `null`.

**PASS — remaining loader invariants.** The reviewed loader/cascade implementation validates each YAML layer before constructing the final config, applies merge/removal semantics, loads `.env` and `.env.local`, applies supported environment overrides before final Zod validation, resolves configured paths relative to the active root config directory, enforces repository containment where applicable, applies workspace defaults and external inference, validates context patterns, retains mapped schema/plugin/context fields, defaults approvals, and wraps validation/cascade failures as `ConfigValidationError`. These paths are exercised by the existing focused Core suite.

### Use by the changed graph-index flow

**PASS — parent preserves discovery intent.** `packages/cli/src/commands/graph/index-graph.ts:73-104` captures `process.cwd()` before asynchronous context resolution. A configured context without `--config` becomes `{ mode: 'discovered', startDir: discoveryStartDir }`; it is no longer degraded to a root `configFilePath`.

**PASS — explicit config preserves forced intent.** In the same branch, presence of `opts.config` produces `{ mode: 'forced', configPath: context.configFilePath }` after the existing non-null guard. The descriptor uses the already-resolved path, while Core still applies exact-file semantics.

**PASS — child chooses the matching SDK/Core mode.** `packages/cli/src/graph-index-task.ts:69-92` maps `forced` to `openSpecdHost({ configPath })`, maps `discovered` to `openSpecdHost({ startDir })`, and leaves bootstrap on `createBootstrapGraphConfig()`/`createSdkContext()`. `packages/sdk/src/composition/host-context.ts:100-125` rejects simultaneous `configPath` and `startDir`, passes the selected form to `createDefaultConfigLoader`, and only permits bootstrap fallback when explicitly requested. The graph task does not request it.

**PASS — architecture and scope.** The CLI imports these capabilities only through `@specd/sdk`; Core files are unchanged; the generic isolated-worker and SQLite-worker boundaries are untouched. The Git diff for the audited surface contains only the two intended CLI production files and their two tests.

## Discrepancies

### No blocking spec/code discrepancies

No HIGH, MEDIUM, or LOW correctness discrepancy was found between the merged `core:config-loader` requirements and the implementation used by this change. The no-op delta is appropriate: the defect was a loss of loading mode at the CLI-to-child handoff, not missing loader behavior.

### INFO — no committed real-filesystem cross-boundary regression test

**Evidence:** `packages/cli/test/commands/graph-index.spec.ts` verifies the parent descriptor while mocking `runIsolatedGraphIndex`; `packages/cli/test/graph-index-task.spec.ts` verifies child dispatch while mocking `openSpecdHost`. Core separately tests discovery, cascade, forced mode, and missing-config behavior. Task 6.3 records a disposable-repository E2E check, but that fixture is not a durable automated test in the repository.

**Impact:** This does not make the implementation non-compliant: the constituent contracts and handoff branches are automated, the focused suites pass, and the change's prescribed manual E2E was completed. It leaves a small regression-detection seam between parent descriptor construction, real IPC/task execution, SDK host reconstruction, and real Core cascade loading.

**Code possibility:** add one integration test using a temporary git repository, a base config, an extending local config, and the packaged isolated task, asserting that discovery observes the local layer while explicit `--config` does not. This would be defense in depth and is not required to correct current code.

**Spec possibility:** none required. The merged `cli:graph-index` verification scenarios already express the behavior; if the project wants to mandate a real-process/filesystem test level, that belongs in a test-strategy/global-testing requirement rather than changing config-loader semantics.

### INFO — graph freshness signal was not perfectly uniform

`project status --context --graph` reported `stale: false` but `fingerprintMismatch: true`; `changes implementation list` independently reported a fresh graph with complete coverage and all tracked symbols resolved. This is an evidence-quality observation, not a detected implementation discrepancy. Direct source inspection, merged artifacts, diffs, and executable tests were used to avoid relying solely on graph freshness metadata.

## Test Coverage

### Executed in this audit

- Core focused suites:
  - `packages/core/test/infrastructure/fs/config-loader.spec.ts`
  - `packages/core/test/infrastructure/fs/config-loader-root-containment.spec.ts`
  - Result: **2 files passed, 131 tests passed**.
- CLI handoff suites:
  - `packages/cli/test/commands/graph-index.spec.ts`
  - `packages/cli/test/graph-index-task.spec.ts`
  - Result: **2 files passed, 12 tests passed**.

### Scenario coverage assessment

- Factory/port shape and mode discrimination: covered by composition/loader code and Core/SDK tests.
- `startDir` discovery from selected and ancestor directories: covered by Core loader tests.
- Candidate ordering, extending local layers, standalone reset, inactive explicit bases: covered by Core cascade tests.
- No VCS and no config failure paths: covered by Core tests; child propagation/no-bootstrap is covered by the new CLI task test.
- Forced exact entrypoint, relative paths, `extends: true`, explicit extends, missing target, and circular chain: covered by Core tests.
- Root probing with later local attachments: covered by Core `resolvePath` tests.
- Merge/removal semantics, env precedence, validation, defaults, containment, external inference, pattern validation, mappings, and error type: covered across the 131 passing focused Core tests.
- Parent discovery descriptor, forced descriptor, original CWD capture, error routing, bootstrap preservation, and child dispatch: covered by the 12 passing CLI tests.
- Real disposable-repository distinction between discovery and explicit forced behavior: recorded as completed by task 6.3/manual E2E, but not persisted as an automated test artifact.

## Missing Tests

No test is missing at a level that blocks compliance. Recommended additional coverage:

1. **Integration/E2E (recommended, non-blocking):** run the actual isolated packaged task against a temporary git repository containing `specd.yaml` and `specd.local.yaml` with `extends: true`; assert a configuration-derived graph inclusion/exclusion difference between implicit discovery and explicit `--config`.
2. **TOCTOU real-boundary test (optional):** remove/invalidates the discovered config after parent resolution and before child reconstruction, then assert worker exit code 3 and absence of bootstrap indexing without mocking `openSpecdHost`.
3. **Relative explicit path through the full CLI (optional):** verify that a relative `--config` is transported as the resolved absolute `configFilePath` and still excludes later sibling locals.

These suggestions strengthen cross-layer regression detection; they do not indicate an unmet merged scenario because the relevant behaviors are already covered separately and the implementation paths are direct.

## Spec Dependency Chain

The effective dependency chain reviewed is:

```text
cli:graph-index
  -> sdk:host-context
     -> core:config-loader
        -> core:config
        -> core:composition
        -> core:schema-merge
        -> core:vcs-adapter-port
        -> core:vcs-adapter
        -> default:_global/architecture
  -> code-graph:isolated-index-worker (opaque JSON transport only)
```

- `core:config` confirms the semantic distinction between discovery-root mode and explicit `--config`, candidate ordering, local cascade behavior, forced closed chains, startup failures, and config field semantics.
- `core:composition` confirms that `createDefaultConfigLoader` is the host-facing factory, resolves VCS-derived root data, and returns the port rather than exposing the concrete adapter publicly.
- `core:vcs-adapter` confirms normalized roots and `NullVcsAdapter` behavior used to determine discovery bounds.
- `default:_global/architecture` confirms YAML validation at the infrastructure boundary and CLI access through SDK/composition rather than concrete Core infrastructure.
- `core:schema-merge` is relevant to `schemaOverrides` preservation but is not altered by the handoff fix.
- `code-graph:isolated-index-worker` does not interpret configuration; it transports the JSON-safe descriptor. Therefore no change to its protocol or SQLite storage worker is necessary.

The dependency chain supports the chosen design: carrying `{ startDir }` replays the existing discovery contract, while carrying `{ configPath }` replays the existing forced contract. Serializing a merged `SpecdConfig` or changing Core forced semantics would have expanded or contradicted these dependencies.

## Summary counts

| Category                               | Count | Result                             |
| -------------------------------------- | ----: | ---------------------------------- |
| Merged requirements audited            |    17 | 17 compliant                       |
| Merged verification scenarios assessed |    66 | 66 satisfied by code/test evidence |
| Focused test files executed            |     4 | 4 passed                           |
| Focused tests executed                 |   143 | 143 passed                         |
| Blocking discrepancies                 |     0 | none                               |
| HIGH discrepancies                     |     0 | none                               |
| MEDIUM discrepancies                   |     0 | none                               |
| LOW discrepancies                      |     0 | none                               |
| INFO observations                      |     2 | non-blocking                       |
| Recommended missing integration tests  |     1 | defense in depth                   |
| Optional additional boundary tests     |     2 | defense in depth                   |

**Verdict:** `core:config-loader` is compliant for this change. Its no-op spec/verification deltas are justified, the discovery/forced contracts are correctly reused by the new worker handoff, and no loader or dependency-contract change is required.
