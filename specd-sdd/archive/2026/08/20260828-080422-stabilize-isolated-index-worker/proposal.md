# Proposal: stabilize-isolated-index-worker

## Motivation

Forced graph indexing can complete all index work and still fail because the isolated
child crashes during native parser teardown. This makes the `--force` recovery path
unreliable precisely when it must process the complete workspace.

## Current behaviour

With `@ast-grep/napi` 0.41.1, a forced graph index retains many native AST roots,
returns a valid indexing result, and then terminates the child with signal 11 during
process finalization. The supervisor correctly treats that abnormal post-result exit
as a failure, so the CLI reports that the graph-index worker exited unexpectedly.

Incremental indexing is not the source of the lifecycle fault and succeeds for the
small changed-file workload. The existing isolated-worker contract already requires a
clean child exit after a terminal result and must remain intact.

## Proposed solution

Upgrade the code-graph native parser dependency from `@ast-grep/napi` 0.41.1 to the
0.42.x line containing the upstream SIGSEGV repair, with matching platform lockfile
entries. Preserve the existing forked-worker supervision, clean-exit validation, and
force semantics.

Add publish-shaped regression coverage that executes a full-run-like native parser
workload in the emitted isolated child, verifies it returns its result, and verifies
the child exits naturally. This prevents a future dependency downgrade or native
teardown regression from being accepted as a successful index operation.

## Specs affected

### New specs

None.

### Modified specs

- `code-graph:isolated-index-worker`: verify clean child exit after a terminal result when executing large native parser workloads in the isolated child process.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:language-adapter`: evaluated as an existing satisfied contract with no behavioral modifications; native parser dependency upgraded to restore safe teardown.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The implementation changes the native parser dependency in
`packages/code-graph/package.json` and `pnpm-lock.yaml`. It adds a publish-shaped
fixture at `packages/code-graph/test/fixtures/isolated-index-worker/` and an isolated
worker integration test at `packages/code-graph/test/infrastructure/isolated-index-worker/dist.spec.ts`.

The supervisor's existing `runIsolatedGraphIndex` boundary remains the containment
point for native crashes. The affected host paths are the SDK index orchestration and
the CLI `graph index` command, but they require no API or behavior change. The current
graph is fresh and the implementation tracking records four resolved files with no
open files; unrelated worktree changes remain outside this change.

## Technical context

The recent force-coverage repair causes a complete logical reindex, while the isolated
worker requires a natural exit with code 0 after sending its result. Together they
exposed an older ast-grep finalizer fault rather than a defect in the supervisor:
direct invocation completed indexing and returned a valid result before signal 11.

The TypeScript language adapter deliberately retains native roots during indexing to
avoid a separate finalizer-concurrency issue. Native `SgRoot` values expose no supported
explicit disposal API, and explicit garbage collection did not prevent the crash.

Automatic retry, accepting a result before an abnormal exit, and in-process fallback
were rejected because they would mask or weaken the required process-isolation contract.
The minimal compatible remedy is the upstream native dependency repair plus regression
coverage.

## Open questions

None. The existing isolated-worker contract remains authoritative; this change adds
evidence for the clean-exit behavior it already requires.
