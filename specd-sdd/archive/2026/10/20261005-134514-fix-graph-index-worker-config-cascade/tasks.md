# Tasks: fix-graph-index-worker-config-cascade

## 1. Serializable context contract

- [x] 1.1 Split the configured task descriptor into forced and discovered variants
      `packages/cli/src/graph-index-task.ts`: `CliGraphIndexContextDescriptor` — replace `mode: 'configured'` with the exact `forced`, `discovered`, and existing `bootstrap` union defined by the design
      Approach: use required string fields `configPath`, `startDir`, `projectRoot`, and `vcsRoot`; add complete JSDoc; keep every variant structurally JSON-safe and do not add fallback fields
      (Req: Indexing behaviour)

## 2. Parent task construction

- [x] 2.1 Capture the automatic-discovery start directory before context resolution
      `packages/cli/src/commands/graph/index-graph.ts`: `registerGraphIndex()` action — retain the parent's absolute discovery anchor
      Approach: assign `const discoveryStartDir = process.cwd()` before awaiting `resolveGraphCliContext`; do not modify the shared `GraphCliContext` interface
      (Req: Indexing behaviour, scenario: Automatic discovery replays local cascade in the child)
- [x] 2.2 Emit the forced descriptor for explicit config input
      `packages/cli/src/commands/graph/index-graph.ts`: task-context branch — preserve exact-file semantics for `--config`
      Approach: when `context.mode === 'configured'` and `opts.config !== undefined`, retain the non-null `configFilePath` guard and emit `{ mode: 'forced', configPath: context.configFilePath }`
      (Req: Indexing behaviour, scenario: Explicit config remains forced in the child)
- [x] 2.3 Emit the discovered descriptor for implicit project discovery
      `packages/cli/src/commands/graph/index-graph.ts`: task-context branch — prevent a discovered root file from being reopened in forced mode
      Approach: when `context.mode === 'configured'` and `opts.config === undefined`, emit `{ mode: 'discovered', startDir: discoveryStartDir }`; keep `storageRoot` derived from `context.config.configPath`
      (Req: Indexing behaviour, scenario: Automatic discovery replays local cascade in the child)
- [x] 2.4 Preserve bootstrap and command transport behaviour
      `packages/cli/src/commands/graph/index-graph.ts`: bootstrap descriptor and `runIsolatedGraphIndex` call — keep roots, options, progress, output, and error routing unchanged
      Approach: retain the existing bootstrap branch, force/exclude payload, packaged task URL, text-only progress callback, and one worker invocation
      (Req: Command signature, Output format, Error cases, Forced indexing result completeness, Indexing behaviour, Visible incompatibility repair)

## 3. Child reconstruction

- [x] 3.1 Reconstruct forced descriptors through exact config loading
      `packages/cli/src/graph-index-task.ts`: `runGraphIndexTask` — preserve explicit `--config` semantics
      Approach: dispatch `mode: 'forced'` to `openSpecdHost({ configPath: input.context.configPath, options: { kernel } })`
      (Req: Indexing behaviour, scenario: Explicit config remains forced in the child)
- [x] 3.2 Reconstruct discovered descriptors through start-directory discovery
      `packages/cli/src/graph-index-task.ts`: `runGraphIndexTask` — replay the parent's discovery mode and local cascade
      Approach: dispatch `mode: 'discovered'` to `openSpecdHost({ startDir: input.context.startDir, options: { kernel } })`; omit `allowBootstrapFallback`
      (Req: Indexing behaviour, scenarios: Automatic discovery replays local cascade in the child; Discovery replay does not silently substitute bootstrap)
- [x] 3.3 Preserve bootstrap reconstruction and single SDK indexing invocation
      `packages/cli/src/graph-index-task.ts`: `runGraphIndexTask` — keep explicit bootstrap creation and shared post-reconstruction indexing flow
      Approach: retain `createBootstrapGraphConfig` plus `createSdkContext` for bootstrap, then call `runIndexProjectGraph` exactly once for all modes with unchanged force, exclusions, and progress forwarding
      (Req: Indexing behaviour, Forced indexing result completeness, Visible incompatibility repair)

## 4. Command tests

- [x] 4.1 Verify explicit config produces a forced descriptor
      `packages/cli/test/commands/graph-index.spec.ts`: graph-index command tests — assert resolved config path and parent storage root
      Approach: invoke the command with `--config`, mock configured context, and assert task input contains `{ mode: 'forced', configPath: '/project/specd.yaml' }`
      (Req: Indexing behaviour, scenario: Explicit config remains forced in the child)
- [x] 4.2 Verify automatic discovery produces a discovered descriptor
      `packages/cli/test/commands/graph-index.spec.ts`: graph-index command tests — assert deterministic parent discovery anchor
      Approach: mock `process.cwd()` and configured context, invoke without `--config`, and assert task input contains `{ mode: 'discovered', startDir: capturedCwd }`
      (Req: Indexing behaviour, scenario: Automatic discovery replays local cascade in the child)
- [x] 4.3 Preserve bootstrap and command-level regression coverage
      `packages/cli/test/commands/graph-index.spec.ts`: existing bootstrap, progress, output, validation, and boundary tests — update only descriptor expectations required by the new union
      Approach: retain assertions for exact bootstrap roots, force/exclusions, one worker call, structured-output silence, exit codes, result diagnostics, and absence of direct isolation imports
      (Req: Command signature, Output format, Error cases, Forced indexing result completeness, Indexing behaviour, Visible incompatibility repair)

## 5. Task tests

- [x] 5.1 Verify forced child reconstruction
      `packages/cli/test/graph-index-task.spec.ts`: `runGraphIndexTask` tests — replace the old configured test with exact forced loading assertions
      Approach: assert one `openSpecdHost` call with `configPath` and kernel options, no `createSdkContext` call, and one `runIndexProjectGraph` call
      (Req: Indexing behaviour, scenario: Explicit config remains forced in the child)
- [x] 5.2 Verify discovered child reconstruction and local-discovery input
      `packages/cli/test/graph-index-task.spec.ts`: `runGraphIndexTask` tests — cover the new `startDir` branch
      Approach: pass a discovered descriptor and assert one `openSpecdHost` call with `startDir` and kernel options, no bootstrap construction, and one indexing call
      (Req: Indexing behaviour, scenario: Automatic discovery replays local cascade in the child)
- [x] 5.3 Verify discovery failure propagates without bootstrap fallback
      `packages/cli/test/graph-index-task.spec.ts`: `runGraphIndexTask` error test — cover TOCTOU disappearance
      Approach: reject `openSpecdHost` for a discovered descriptor, assert the rejection propagates, and assert neither `createSdkContext` nor `runIndexProjectGraph` runs
      (Req: Error cases, Indexing behaviour, scenario: Discovery replay does not silently substitute bootstrap)
- [x] 5.4 Preserve bootstrap, option, progress, result, and boundary tests
      `packages/cli/test/graph-index-task.spec.ts`: existing bootstrap and orchestration tests — keep non-target behaviour stable
      Approach: retain exact roots, force/exclusion forwarding, progress emission, unmodified result, one indexing call, and no CLI direct code-graph/process imports
      (Req: Output format, Forced indexing result completeness, Indexing behaviour, Visible incompatibility repair)

## 6. Validation and end-to-end checks

- [x] 6.1 Run focused graph-index tests
      `packages/cli/test/commands/graph-index.spec.ts` and `packages/cli/test/graph-index-task.spec.ts` — confirm all descriptor and reconstruction scenarios
      Approach: run `pnpm --filter @specd/cli test -- test/commands/graph-index.spec.ts test/graph-index-task.spec.ts` and fix every failure
      (Req: Indexing behaviour)
- [x] 6.2 Run CLI package quality gates
      `packages/cli` — verify type safety, lint, complete tests, and publish-shaped build
      Approach: run package `typecheck`, `lint`, `test`, and `build` scripts; no warnings or failures attributable to this change may remain
      (Req: Command signature, Output format, Error cases, Forced indexing result completeness, Indexing behaviour, Visible incompatibility repair)
- [x] 6.3 Verify discovered and forced cascades in a disposable repository
      built CLI plus temporary repository fixture — confirm end-to-end local-layer behaviour without changing repository data
      Approach: create `specd.yaml` plus extending `specd.local.yaml` with distinguishable graph paths; run `graph index --force --format toon` from a nested directory and confirm the local layer applies, then run with explicit `--config specd.yaml` and confirm the sibling local layer does not apply
      (Req: Indexing behaviour, scenarios: Automatic discovery replays local cascade in the child; Explicit config remains forced in the child)
- [x] 6.4 Verify fail-fast behaviour for discovery replay drift
      isolated task test seam — confirm the child never substitutes bootstrap after parent discovery
      Approach: make discovered `openSpecdHost` fail as if config disappeared, verify fatal task handling/exit code 3 at the command boundary, and verify no bootstrap graph is created
      (Req: Error cases, Indexing behaviour, scenario: Discovery replay does not silently substitute bootstrap)
