# Compliance audit: Core identity and mutations

Change: `support-commas-in-names`. Mode: specific change. Date: 2026-11-08.

## Requirements Summary

This batch covers nine change specs, with the complete merged requirements and 379 compiled scenarios inventoried below. Merged previews were fetched with `changes spec-preview` for each spec; the compiled context and merged previews agree on the behaviors discussed here. The report distinguishes supported named scenarios from additional requirement edge cases. A passing package suite is not a claim that every scenario has a unique executable test.

Graph navigation used `graph impact` for `parse-spec-id.ts`, `core:spec-lock`, and `workspacesFromSpecIds`, and graph symbol search for the dependency-seeding helper and archive path type. The graph was current at audit entry. Parser impact is CRITICAL (324 affected files), supporting review beyond the primary comma parsing paths.

## Implementation Status

The main changes work as intended: whole strings are forwarded without comma splitting; spec-ID syntax and configured workspaces are validated at Core boundaries; batch file mutation validates before applying; readonly scope additions reject atomically; dependency repair uses a narrowly lenient lock read; default strict reads use typed errors; concurrency revisions are retained; invalidation policies are validated in Core; and public factories delegate through the resolver.

The batch is not clean. Three additional implementation edge cases were reproduced, one diagnostic requirement is incomplete, and two groups of older merged requirements/scenarios conflict with the implementation or their dependencies.

## Discrepancies

### CM1 — Medium: newly introduced case aliases survive as two files in one batch

Specs: `core:update-implementation-tracking`, requirement **File names are whole names**; global `default:_global/cross-platform`, **Case sensitivity**.

The requirement says case-only differences denote the same file on macOS/Windows and retain the already-recorded spelling. `packages/core/src/application/use-cases/update-implementation-tracking.ts:137` builds an exact-string `seen` set. At line 142 `_recordedSpelling` looks only at the pre-mutation change; it does not consider entries already collected in this batch. When neither spelling was previously recorded, both names survive collection and are applied separately. `_recordedSpelling` starts at line 266.

Reproduction on this macOS host, against the rebuilt public package:

```js
import { Change, createUpdateImplementationTracking } from './packages/core/dist/public.js'
const change = new Change({
  name: 'probe',
  createdAt: new Date(),
  specIds: ['core:change'],
  schemaName: 'test-schema',
  schemaVersion: 1,
  history: [],
})
const changes = {
  async mutate(name, fn) {
    return { change, result: await fn(change) }
  },
}
const uc = createUpdateImplementationTracking({
  changes,
  files: {
    async read() {
      return 'ok'
    },
  },
  projectRoot: '/tmp',
  specRepositories: new Map([['core', {}]]),
})
const result = await uc.execute({
  name: 'probe',
  action: 'add',
  specId: 'core:change',
  files: ['Docs/Notes.md', 'docs/notes.md'],
})
console.log(result.implementationTracking)
```

Observed: two tracked files and two links, spelling `Docs/Notes.md` and `docs/notes.md`. Expected under the requirement: one file/link using the first spelling. Ports are in-memory duck-typed test doubles; no repository files were mutated.

This is an additional requirement gap, not a failure of the narrower named scenario that begins with one spelling already tracked. Current tests at `packages/core/test/application/use-cases/update-implementation-tracking.spec.ts:920` cover that existing-entry case; exact duplicate batching is covered at line 839. The combination of a new batch and case aliases is missing. If two case aliases in a single batch are intentionally distinct, the spec/global contract needs an explicit exception; that interpretation conflicts with the present same-file rule.

### CM2 — Medium: defaultWorkspace bypasses workspace syntax validation

Spec: `core:spec-id-format`, **Canonical format**, **Workspace name rule**, **Single validator**.

At `packages/core/src/domain/services/parse-spec-id.ts:46`, workspace-name validation is conditional on an explicit colon in the input. A caller-supplied `defaultWorkspace` is used at line 44 without the same validation. The documented result promises a fully-qualified validated ID, but invalid overrides produce IDs that `isFullyQualifiedSpecId` rejects.

Reproduction:

```js
import { parseSpecId, isFullyQualifiedSpecId } from './packages/core/dist/public.js'
for (const defaultWorkspace of ['a', 'Bad Id', 'nul', '']) {
  const result = parseSpecId('auth/login', { defaultWorkspace })
  console.log(result.specId, isFullyQualifiedSpecId(result.specId))
}
```

Observed: `a:auth/login`, `Bad Id:auth/login`, `nul:auth/login`, and `:auth/login`, each with `false`. Expected: `InvalidSpecIdError`. The same invalid override can be accepted even with a workspace iterable containing that string; membership is not syntax validation.

The named **Default workspace override** scenario uses a valid override and passes. This is a missing negative edge case. Tests in `packages/core/test/domain/services/parse-spec-id.spec.ts:25` exercise only a valid override. Either validate the resolved workspace in all cases, or explicitly narrow the API contract to trusted prevalidated overrides; the latter would weaken the current single-validator guarantee.

### CM3 — Low: a one-shot workspace iterable is exhausted after one use-case call

Spec: `core:update-spec-deps`, **Spec ID validation** and **Config-based factory delegates through resolveUpdateSpecDepsDeps**; public `UpdateSpecDepsDeps.workspaces` accepts `Iterable<string | {name:string}>`.

`packages/core/src/application/use-cases/update-spec-deps.ts:66` retains the input iterable. Line 102 spreads it on every execution. A `Map.keys()` iterator is valid for the exposed type and the spec-ID iterable contract, but it is consumed by the first execution. A reusable public factory instance then rejects every workspace on its second execution. The normal config-based factory supplies an array, so normal CLI invocations are unaffected; direct dependency-based SDK construction is affected.

Reproduction (reuse `change` and `changes` from CM1):

```js
import { createUpdateSpecDeps } from './packages/core/dist/public.js'
const depUc = createUpdateSpecDeps({
  changes,
  workspaces: new Map([['core', true]]).keys(),
})
await depUc.execute({ name: 'probe', specId: 'core:change', clear: true })
await depUc.execute({ name: 'probe', specId: 'core:change', clear: true })
```

Observed: the first call succeeds, the second throws `WORKSPACE_NOT_FOUND` with an empty known-workspace list. Missing coverage: two successive calls after construction with a one-shot iterable. Snapshot the iterable at construction, or document/type a reusable collection contract. There is no named compiled scenario explicitly testing repeated execution with an iterator; this is a public input-contract gap.

### CM4 — Medium, spec reconciliation: metadata-only dependency seeding is required but no longer implemented

Specs: `core:create-change`, **Initial specDependsOn seeding**; `core:edit-change`, **Seed specDependsOn for added specs**.

Both merged specs require fallback to `metadata.json.dependsOn` when semantic persisted state is absent, even when the metadata is stale. Both use cases call `loadPersistedSpecDependsOn`. At `packages/core/src/application/use-cases/_shared/load-persisted-spec-depends-on.ts:36`, the helper reads `readPersistedState`; line 41 returns an empty result when state is absent. It never reads metadata. The old `readPersistedDependsOn` method named by the requirements no longer exists in the aggregate repository port.

Read-only probe:

```js
import { loadPersistedSpecDependsOn } from './packages/core/src/application/use-cases/_shared/load-persisted-spec-depends-on.ts'
let metadataReads = 0
const repo = {
  async get() {
    return {}
  },
  async readPersistedState() {
    return null
  },
  async readMetadataSnapshot() {
    metadataReads++
    return { kind: 'present', metadata: { dependsOn: ['default:shared/auth'] }, revision: 'x' }
  },
}
console.log(
  await loadPersistedSpecDependsOn(
    new Map([['default', { specRepo: repo }]]),
    'default:auth/login',
  ),
)
console.log(metadataReads)
```

Observed: `{dependsOn:[], source:'empty'}`, zero metadata reads. The named **Legacy metadata seeds when persisted semantic state is absent** and **Stale metadata still seeds as legacy fallback** scenarios in each spec cannot pass against this helper.

Tests obscure the gap: `create-change.spec.ts:236` claims sidecar absence but actually provides `auth/login/spec-lock.json`; line 262 also provides a lock. `edit-change.spec.ts:206` claims stale metadata with no persisted dependencies but supplies a lock containing the expected dependencies. These tests exercise lock seeding rather than the required metadata-only fallback.

Two legitimate resolutions exist. If legacy cache fallback remains intended, implement it through an allowed application-level semantic operation and test metadata-only fixtures. If the modern aggregate-state design intentionally removed cache imports, revise the requirements and four obsolete scenarios, and rename the misleading tests. The current spec repository contract reserves raw metadata snapshots for materialization/diagnostics, which supports the spec-drift interpretation; restoring direct raw-cache reads without considering that dependency would create another inconsistency.

### CM5 — Medium, spec reconciliation: primary-workspace archive semantics contradict direct dependencies

Merged `core:workspace`, **Primary workspace**, says the first `change.workspaces` entry is the primary workspace and supplies `{{change.workspace}}` for archive patterns. Its named **Primary workspace is first spec's workspace** and **Primary workspace used for archive path template** scenarios demand this behavior.

Canonical direct dependency `core:change` expressly says a change has no home/singular workspace and forbids deriving one from `workspaces[0]`. `core:storage`, a direct dependency of `core:archived-change-index-entry`, expressly forbids `{{change.workspace}}` and requires `UnsupportedPatternError` when it is configured. Current archive contracts implement that newer rule. The old `core:workspace` scenarios therefore contradict the surrounding requirements, not merely a test implementation detail.

Related stale scenario: `core:archived-change-index-entry` **Helper is not used for list rows** says `workspacesFromSpecIds` is used by archive path templating. Graph impact resolves zero production logical callers; the helper remains a public pure function, with tests, but current archive path semantics no longer need a workspace projection. The helper implementation itself correctly validates IDs and preserves encounter order.

Preferred direction must be decided at the spec level: remove obsolete singular-workspace requirements/scenarios if the no-primary design is intended; otherwise deliberately revise `core:change`, `core:storage`, implementation and tests together. Do not reintroduce the old token based only on the stale workspace scenario.

### CM6 — Low: invalid persisted dependency values are omitted from lock diagnostics

Merged `core:spec-id-format`, **Persisted IDs are fully qualified**, requires invalid persisted ID diagnostics to quote both the value and its field path. `parseSpecLock` converts the Zod issue to `InvalidSpecLockError` using its message and path, but never adds the rejected value (`packages/core/src/domain/services/parse-spec-lock.ts:124`; error formatting at `packages/core/src/domain/errors/invalid-spec-lock-error.ts:26`).

Probe with `dependsOn:['Bad Id']`, `specId:'core:auth'`, and `location:'/tmp/spec-lock.json'` produces:

```text
Invalid spec-lock for 'core:auth' at /tmp/spec-lock.json: field 'dependsOn.0' must be a fully-qualified valid spec ID (workspace:capabilityPath).
```

It correctly names the owner, location, field, rule and typed code, but omits `Bad Id`. Current named lock-error scenarios check the former fields and pass; none checks the invalid value required by the cross-spec contract. Add value-preserving diagnostic coverage, or reconcile the more detailed identity requirement with the deliberately shorter lock-error contract. No repair advice should be added to the domain error.

## Test Coverage and Missing Tests

Parent verification ran fresh suites: Core 2,889, CLI 1,285, SDK 134, Skills 52 and Guide 155 tests passed. Full fresh build and direct TypeScript checks also passed. This batch ran the small public-API/read-only probes above; it did not rerun those broad suites. Existing suites cover normal ID validation, whole names, atomic mutation, strict/lenient locks, readonly errors and revisions well.

Missing meaningful regressions: new case aliases in one batch (CM1); invalid default workspace overrides with/without configured workspaces (CM2); reuse with `Map.keys()` (CM3); genuine metadata-only fallback fixtures if that behavior is retained (CM4); spec-consistent archive workspace scenarios (CM5); and offending lock-value quoting (CM6). Passing tests do not resolve the spec conflicts.

A small additional vocabulary drift is recorded rather than counted as a separate finding: `core:workspace` still names removed `saveMetadata()` as readonly-blocked, while the aggregate repository contract explicitly allows disposable cache writes through `writeMetadataSnapshot` for readonly source workspaces. This should be reconciled when updating the obsolete ownership wording; it is not a request to block generated caches.

## Spec Dependency Chain and Global Conformance

The batch read direct dependency specs for Change, refresh tracking, composition/resolver, manifest, metadata, context compilation, repository port/base, initialization, storage, configuration, active-schema resolution and overlap. Other changed direct dependencies are the merged specs in this batch or the full compiled change context. No recursive whole-project audit is implied.

Architecture: identity helpers remain pure domain functions; `WorkspaceNotFoundError` is one domain class re-exported by application; Core use cases use ports; factories use shared resolver delegation. Error conventions are satisfied for the exercised errors. Cross-platform behavior is isolated in `sameTrackedFile` and `toLogicalFilePath`, with CM1 an uncovered case-comparison combination. Preserving a reference to an existing POSIX filename containing quotes/spaces does not itself create a filename; no additional global-name finding is asserted on that basis. Windows execution was not performed in this macOS session; platform-specific helpers and stubbed-host tests provide local evidence, with three-OS CI remaining the enforcement gate.

## Per-spec Evidence Matrix

The generated inventory below names every merged requirement and scenario in this batch. `Supported` means source review corroborated the behavior and the related package suite passed, not that a unique test was mapped to each row. Explicit drift and requirement-edge findings above remain controlling. Static type/shape/factory requirements use source/TypeScript evidence where no runtime assertion is meaningful.

### core:update-implementation-tracking

Requirements: 14; scenarios: 41. Findings: CM1.

Implementation evidence: packages/core/src/application/use-cases/update-implementation-tracking.ts.

Related test evidence: packages/core/test/application/use-cases/update-implementation-tracking.spec.ts.

| Requirement                                                                    | Assessment                                      |
| ------------------------------------------------------------------------------ | ----------------------------------------------- |
| Input contract                                                                 | Supported by source and related test suite      |
| File names are whole names                                                     | Partially supported; new batch aliases fail CM1 |
| Multi-file mutations are all-or-nothing                                        | Supported by source and related test suite      |
| Path separators are normalized on Windows hosts                                | Supported by source and related test suite      |
| Add mutation creates or enriches implementation links                          | Supported by source and related test suite      |
| Remove mutation removes implementation links                                   | Supported by source and related test suite      |
| Resolve mutation closes tracked-file review                                    | Supported by source and related test suite      |
| Unresolve mutation reopens tracked-file review                                 | Supported by source and related test suite      |
| Ignore mutation preserves tracked history                                      | Supported by source and related test suite      |
| Start mutation activates implementation tracking                               | Supported by source and related test suite      |
| Change must exist                                                              | Supported by source and related test suite      |
| Missing-file validation uses typed errors                                      | Supported by source and related test suite      |
| Persistence and result projection                                              | Supported by source and related test suite      |
| Config-based factory delegates through resolveUpdateImplementationTrackingDeps | Supported by source and related test suite      |

| #   | Merged scenario                                                                                                                         | Requirement                                                                    | Assessment                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| 1   | Execute accepts implementation-tracking mutation input                                                                                  | Input contract                                                                 | Supported (source + related suite) |
| 2   | Invalid specId rejected before any mutation                                                                                             | Input contract                                                                 | Supported (source + related suite) |
| 3   | Bare specId normalized                                                                                                                  | Input contract                                                                 | Supported (source + related suite) |
| 4   | specId is validated for start                                                                                                           | Input contract                                                                 | Supported (source + related suite) |
| 5   | Add without specId fails with a typed input error                                                                                       | Input contract                                                                 | Supported (source + related suite) |
| 6   | Unknown workspace in specId is rejected                                                                                                 | Input contract                                                                 | Supported (source + related suite) |
| 7   | specId is validated for any action                                                                                                      | Input contract                                                                 | Supported (source + related suite) |
| 8   | Add requires file existence and opens tracking when needed                                                                              | Add mutation creates or enriches implementation links                          | Supported (source + related suite) |
| 9   | Add allows specId declared in change or existing in canonical repository                                                                | Add mutation creates or enriches implementation links                          | Supported (source + related suite) |
| 10  | Add throws SpecNotFoundError when specId is absent from change and repository                                                           | Add mutation creates or enriches implementation links                          | Supported (source + related suite) |
| 11  | Batch add with invalid specId fails atomically and leaves change untouched                                                              | Add mutation creates or enriches implementation links                          | Supported (source + related suite) |
| 12  | Remove with symbols deletes only those refinements                                                                                      | Remove mutation removes implementation links                                   | Supported (source + related suite) |
| 13  | Resolve requires tracked existing file                                                                                                  | Resolve mutation closes tracked-file review                                    | Supported (source + related suite) |
| 14  | Unresolve reopens resolved file                                                                                                         | Unresolve mutation reopens tracked-file review                                 | Supported (source + related suite) |
| 15  | Unresolve refuses removed file                                                                                                          | Unresolve mutation reopens tracked-file review                                 | Supported (source + related suite) |
| 16  | Ignore preserves confirmed links for tracked file                                                                                       | Ignore mutation preserves tracked history                                      | Supported (source + related suite) |
| 17  | Start mutation activates tracking on change without requiring file                                                                      | Start mutation activates implementation tracking                               | Supported (source + related suite) |
| 18  | Unknown change throws ChangeNotFoundError                                                                                               | Change must exist                                                              | Supported (source + related suite) |
| 19  | Missing file throws ImplementationFileNotFoundError                                                                                     | Missing-file validation uses typed errors                                      | Supported (source + related suite) |
| 20  | Mutation persists and returns implementation projection                                                                                 | Persistence and result projection                                              | Supported (source + related suite) |
| 21  | createUpdateImplementationTracking config form derives UpdateImplementationTrackingDeps through resolveUpdateImplementationTrackingDeps | Config-based factory delegates through resolveUpdateImplementationTrackingDeps | Supported (source + related suite) |
| 22  | Name with a comma is matched exactly                                                                                                    | File names are whole names                                                     | Supported (source + related suite) |
| 23  | Missing name is reported whole                                                                                                          | File names are whole names                                                     | Supported (source + related suite) |
| 24  | Leading and trailing spaces are preserved                                                                                               | File names are whole names                                                     | Supported (source + related suite) |
| 25  | Quote, backslash, and non-ASCII names are preserved                                                                                     | File names are whole names                                                     | Supported (source + related suite) |
| 26  | Equivalent array input through the SDK                                                                                                  | File names are whole names                                                     | Supported (source + related suite) |
| 27  | Quote, backslash, and non-ASCII names are each preserved separately                                                                     | File names are whole names                                                     | Supported (source + related suite) |
| 28  | Duplicate names collapse to one                                                                                                         | File names are whole names                                                     | Supported (source + related suite) |
| 29  | Both file and files are combined                                                                                                        | File names are whole names                                                     | Supported (source + related suite) |
| 30  | Windows error quotes the original value                                                                                                 | File names are whole names                                                     | Supported (source + related suite) |
| 31  | Case-only difference denotes the same file on a case-insensitive host                                                                   | File names are whole names                                                     | Supported (source + related suite) |
| 32  | Case-only difference is distinct on a case-sensitive host                                                                               | File names are whole names                                                     | Supported (source + related suite) |
| 33  | Backslash path matches the tracked forward-slash entry on Windows                                                                       | Path separators are normalized on Windows hosts                                | Supported (source + related suite) |
| 34  | Stored name uses forward slashes on Windows                                                                                             | Path separators are normalized on Windows hosts                                | Supported (source + related suite) |
| 35  | Backslash is preserved on POSIX hosts                                                                                                   | Path separators are normalized on Windows hosts                                | Supported (source + related suite) |
| 36  | Comma names are unaffected by separator normalization                                                                                   | Path separators are normalized on Windows hosts                                | Supported (source + related suite) |
| 37  | Normalization applies to batches and every action                                                                                       | Path separators are normalized on Windows hosts                                | Supported (source + related suite) |
| 38  | Every other action normalizes on Windows                                                                                                | Path separators are normalized on Windows hosts                                | Supported (source + related suite) |
| 39  | Separator helper is a pure function of the platform                                                                                     | Path separators are normalized on Windows hosts                                | Supported (source + related suite) |
| 40  | A missing fourth file leaves the change untouched                                                                                       | Multi-file mutations are all-or-nothing                                        | Supported (source + related suite) |
| 41  | All valid files are applied together                                                                                                    | Multi-file mutations are all-or-nothing                                        | Supported (source + related suite) |

### core:edit-change

Requirements: 18; scenarios: 50. Findings: CM4.

Implementation evidence: packages/core/src/application/use-cases/edit-change.ts.

Related test evidence: packages/core/test/application/use-cases/edit-change.spec.ts.

| Requirement                                                  | Assessment                                 |
| ------------------------------------------------------------ | ------------------------------------------ |
| Input contract                                               | Supported by source and related test suite |
| Spec ID validation                                           | Supported by source and related test suite |
| ReadOnly workspace rejection                                 | Supported by source and related test suite |
| Invalidation policy edits                                    | Supported by source and related test suite |
| Change lookup                                                | Supported by source and related test suite |
| No-op when no spec changes requested                         | Supported by source and related test suite |
| Description update does not invalidate                       | Supported by source and related test suite |
| Removal precedes addition                                    | Supported by source and related test suite |
| Removal of absent spec throws                                | Supported by source and related test suite |
| Addition is idempotent                                       | Supported by source and related test suite |
| Seed specDependsOn for added specs                           | Metadata-only fallback absent; CM4         |
| No-op when specIds unchanged after processing                | Supported by source and related test suite |
| Approval invalidation on effective change                    | Supported by source and related test suite |
| Directory cleanup on removal                                 | Supported by source and related test suite |
| Implementation tracking refresh on spec change               | Supported by source and related test suite |
| Output contract                                              | Supported by source and related test suite |
| Dependencies                                                 | Supported by source and related test suite |
| Config-based factory delegates through resolveEditChangeDeps | Supported by source and related test suite |

| #   | Merged scenario                                                                   | Requirement                                                  | Assessment                         |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| 1   | Change does not exist                                                             | Change lookup                                                | Supported (source + related suite) |
| 2   | Description provided with no spec changes                                         | No-op when no spec changes requested                         | Supported (source + related suite) |
| 3   | Both add and remove are absent                                                    | No-op when no spec changes requested                         | Supported (source + related suite) |
| 4   | Both add and remove are empty arrays                                              | No-op when no spec changes requested                         | Supported (source + related suite) |
| 5   | Description and addSpecIds together                                               | No-op when no spec changes requested                         | Supported (source + related suite) |
| 6   | addSpecIds with no effective change                                               | No-op when no spec changes requested                         | Supported (source + related suite) |
| 7   | Description-only update does not invalidate                                       | Description update does not invalidate                       | Supported (source + related suite) |
| 8   | Remove and add in same call                                                       | Removal precedes addition                                    | Supported (source + related suite) |
| 9   | Removing a spec not in the change                                                 | Removal of absent spec throws                                | Supported (source + related suite) |
| 10  | Adding a spec already present                                                     | Addition is idempotent                                       | Supported (source + related suite) |
| 11  | Persisted dependency state seeds new spec entry                                   | Seed specDependsOn for added specs                           | Supported (source + related suite) |
| 12  | Legacy metadata seeds when persisted semantic state is absent                     | Seed specDependsOn for added specs                           | Contradicted by helper; CM4        |
| 13  | Stale metadata still seeds as legacy fallback                                     | Seed specDependsOn for added specs                           | Contradicted by helper; CM4        |
| 14  | Existing in-change dependency snapshot is not overwritten                         | Seed specDependsOn for added specs                           | Supported (source + related suite) |
| 15  | Remove and re-add the same spec                                                   | No-op when specIds unchanged after processing                | Supported (source + related suite) |
| 16  | Adding a new spec triggers invalidation                                           | Approval invalidation on effective change                    | Supported (source + related suite) |
| 17  | Removing a spec triggers invalidation                                             | Approval invalidation on effective change                    | Supported (source + related suite) |
| 18  | Effective change is applied on the freshest persisted spec list                   | Approval invalidation on effective change                    | Supported (source + related suite) |
| 19  | Removing a spec cleans up its scaffolded directories                              | Directory cleanup on removal                                 | Supported (source + related suite) |
| 20  | Removing multiple specs cleans up all their directories                           | Directory cleanup on removal                                 | Supported (source + related suite) |
| 21  | Adding a spec does not trigger unscaffold                                         | Directory cleanup on removal                                 | Supported (source + related suite) |
| 22  | Spec removal triggers implementation tracking refresh                             | Implementation tracking refresh on spec change               | Supported (source + related suite) |
| 23  | execute accepts EditChangeInput                                                   | Input contract                                               | Supported (source + related suite) |
| 24  | Editing invalidationPolicy persists the new value                                 | Invalidation policy edits                                    | Supported (source + related suite) |
| 25  | Editing invalidationPolicy does not invent drift                                  | Invalidation policy edits                                    | Supported (source + related suite) |
| 26  | Unknown invalidation policy rejected                                              | Invalidation policy edits                                    | Supported (source + related suite) |
| 27  | Invalid invalidation policy is rejected together with valid edits                 | Invalidation policy edits                                    | Supported (source + related suite) |
| 28  | execute returns EditChangeResult                                                  | Output contract                                              | Supported (source + related suite) |
| 29  | Uses ChangeRepository port                                                        | Dependencies                                                 | Supported (source + related suite) |
| 30  | Uses ActorResolver port                                                           | Dependencies                                                 | Supported (source + related suite) |
| 31  | Uses spec repositories map for existence checks and dependency seeding            | Dependencies                                                 | Supported (source + related suite) |
| 32  | createEditChange config form derives EditChangeDeps through resolveEditChangeDeps | Config-based factory delegates through resolveEditChangeDeps | Supported (source + related suite) |
| 33  | Uninitialized spec fallback allows addition if global schema matches change       | Schema compatibility guardrail                               | Supported (source + related suite) |
| 34  | Adding a spec with identical schema succeeds                                      | Schema compatibility guardrail                               | Supported (source + related suite) |
| 35  | Adding a spec with a different but compatible schema succeeds                     | Schema compatibility guardrail                               | Supported (source + related suite) |
| 36  | Adding a spec with an incompatible schema throws IncompatibleSchemaError          | Schema compatibility guardrail                               | Supported (source + related suite) |
| 37  | Invalid ID rejected and nothing persisted                                         | Spec ID validation                                           | Supported (source + related suite) |
| 38  | Empty ID rejected                                                                 | Spec ID validation                                           | Supported (source + related suite) |
| 39  | ID containing a comma is one invalid ID                                           | Spec ID validation                                           | Supported (source + related suite) |
| 40  | Unknown workspace rejected                                                        | Spec ID validation                                           | Supported (source + related suite) |
| 41  | Bare ID stored qualified                                                          | Spec ID validation                                           | Supported (source + related suite) |
| 42  | One invalid entry among valid ones                                                | Spec ID validation                                           | Supported (source + related suite) |
| 43  | Spec that does not exist yet is accepted                                          | Spec ID validation                                           | Supported (source + related suite) |
| 44  | Removal entry is not syntax-validated                                             | Spec ID validation                                           | Supported (source + related suite) |
| 45  | Duplicate removal entries collapse                                                | Spec ID validation                                           | Supported (source + related suite) |
| 46  | Removal of a bare ID matches the qualified stored form                            | Spec ID validation                                           | Supported (source + related suite) |
| 47  | Adding a readOnly spec fails with the typed error                                 | ReadOnly workspace rejection                                 | Supported (source + related suite) |
| 48  | One line per offending spec and nothing applied                                   | ReadOnly workspace rejection                                 | Supported (source + related suite) |
| 49  | Removal is not subject to ownership                                               | ReadOnly workspace rejection                                 | Supported (source + related suite) |
| 50  | SDK callers are covered                                                           | ReadOnly workspace rejection                                 | Supported (source + related suite) |

### core:spec-id-format

Requirements: 14; scenarios: 62. Findings: CM2, CM6.

Implementation evidence: packages/core/src/domain/services/parse-spec-id.ts; spec-id-rules.ts; parse-spec-pattern.ts; manifest-change-loader.ts; parse-metadata.ts.

Related test evidence: packages/core/test/domain/services/parse-spec-id.spec.ts; spec-id-rules.spec.ts; parse-spec-pattern.spec.ts; packages/core/test/spec-id-guards.spec.ts.

| Requirement                                     | Assessment                                   |
| ----------------------------------------------- | -------------------------------------------- |
| Canonical format                                | Partially supported; override edge fails CM2 |
| Bare path shorthand                             | Supported by source and related test suite   |
| Unknown workspace rejection                     | Supported by source and related test suite   |
| Parsing rules                                   | Supported by source and related test suite   |
| Capability segments reject Windows device names | Supported by source and related test suite   |
| Normalization                                   | Supported by source and related test suite   |
| Workspace name rule                             | Partially supported; override edge fails CM2 |
| Capability path segment rule                    | Supported by source and related test suite   |
| Syntax validation                               | Supported by source and related test suite   |
| Single validator                                | Partially supported; override edge fails CM2 |
| Use cases validate and normalize                | Supported by source and related test suite   |
| Patterns and schema references                  | Supported by source and related test suite   |
| Persisted IDs are fully qualified               | Partial diagnostic contract; CM6             |
| specDependsOn format                            | Supported by source and related test suite   |

| #   | Merged scenario                                               | Requirement                                     | Assessment                         |
| --- | ------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------- |
| 1   | Simple spec ID with default workspace                         | Canonical format                                | Supported (source + related suite) |
| 2   | Non-default workspace                                         | Canonical format                                | Supported (source + related suite) |
| 3   | Multi-segment capability path                                 | Canonical format                                | Supported (source + related suite) |
| 4   | Nested capability path is valid                               | Canonical format                                | Supported (source + related suite) |
| 5   | Bare path defaults to default workspace                       | Bare path shorthand                             | Supported (source + related suite) |
| 6   | Single-segment bare path                                      | Bare path shorthand                             | Supported (source + related suite) |
| 7   | Bare path at an input boundary resolves to default            | Bare path shorthand                             | Supported (source + related suite) |
| 8   | Bare dependsOn entry resolves to the owning workspace         | Bare path shorthand                             | Supported (source + related suite) |
| 9   | Colon syntax with unknown workspace                           | Unknown workspace rejection                     | Supported (source + related suite) |
| 10  | Unknown workspace with a workspace set raises the typed error | Unknown workspace rejection                     | Supported (source + related suite) |
| 11  | One error class from either import path                       | Unknown workspace rejection                     | Supported (source + related suite) |
| 12  | Syntax-only validation without a workspace set                | Unknown workspace rejection                     | Supported (source + related suite) |
| 13  | Workspace set accepts workspace objects                       | Unknown workspace rejection                     | Supported (source + related suite) |
| 14  | Bare path with a project that lacks the default workspace     | Unknown workspace rejection                     | Supported (source + related suite) |
| 15  | Unknown workspace in a context pattern is a warning           | Unknown workspace rejection                     | Supported (source + related suite) |
| 16  | Colon takes precedence over slash                             | Parsing rules                                   | Supported (source + related suite) |
| 17  | Slash is never a workspace separator                          | Parsing rules                                   | Supported (source + related suite) |
| 18  | Result is always fully qualified                              | Parsing rules                                   | Supported (source + related suite) |
| 19  | Only the first colon separates the workspace                  | Parsing rules                                   | Supported (source + related suite) |
| 20  | A device-name segment is rejected                             | Capability segments reject Windows device names | Supported (source + related suite) |
| 21  | con-foo remains a legal segment                               | Capability segments reject Windows device names | Supported (source + related suite) |
| 22  | specDependsOn uses canonical format                           | specDependsOn format                            | Supported (source + related suite) |
| 23  | Cross-workspace specDependsOn                                 | specDependsOn format                            | Supported (source + related suite) |
| 24  | Bare path normalized to fully-qualified                       | Normalization                                   | Supported (source + related suite) |
| 25  | Adapters do not normalize                                     | Normalization                                   | Supported (source + related suite) |
| 26  | Display paths do not qualify IDs                              | Normalization                                   | Supported (source + related suite) |
| 27  | Two-character workspace is accepted                           | Workspace name rule                             | Supported (source + related suite) |
| 28  | One-character workspace is rejected                           | Workspace name rule                             | Supported (source + related suite) |
| 29  | Uppercase, leading digit, and underscore are rejected         | Workspace name rule                             | Supported (source + related suite) |
| 30  | Hyphen inside is accepted                                     | Workspace name rule                             | Supported (source + related suite) |
| 31  | Windows device name as workspace is rejected                  | Workspace name rule                             | Supported (source + related suite) |
| 32  | One shared implementation                                     | Workspace name rule                             | Supported (source + related suite) |
| 33  | Project init rejects what the loader rejects                  | Workspace name rule                             | Supported (source + related suite) |
| 34  | Valid segments                                                | Capability path segment rule                    | Supported (source + related suite) |
| 35  | Uppercase segment rejected                                    | Capability path segment rule                    | Supported (source + related suite) |
| 36  | Space, comma, dot, quote, and backslash rejected              | Capability path segment rule                    | Supported (source + related suite) |
| 37  | Segment may start with a digit or underscore but not a hyphen | Capability path segment rule                    | Supported (source + related suite) |
| 38  | Device name segment rejected at any depth                     | Capability path segment rule                    | Supported (source + related suite) |
| 39  | Prefix segments use the same rule                             | Capability path segment rule                    | Supported (source + related suite) |
| 40  | SpecPath applies the same rule                                | Capability path segment rule                    | Supported (source + related suite) |
| 41  | Empty and blank IDs are rejected                              | Syntax validation                               | Supported (source + related suite) |
| 42  | Missing workspace or path around the colon                    | Syntax validation                               | Supported (source + related suite) |
| 43  | Empty and dot segments rejected                               | Syntax validation                               | Supported (source + related suite) |
| 44  | Backslash is not a separator                                  | Syntax validation                               | Supported (source + related suite) |
| 45  | Windows-style path given as a spec ID                         | Syntax validation                               | Supported (source + related suite) |
| 46  | Error quotes the full value                                   | Syntax validation                               | Supported (source + related suite) |
| 47  | Remove operations do not validate syntax                      | Syntax validation                               | Supported (source + related suite) |
| 48  | Domain service has no application dependency                  | Single validator                                | Supported (source + related suite) |
| 49  | Name iterables are accepted                                   | Single validator                                | Supported (source + related suite) |
| 50  | Default workspace override                                    | Single validator                                | Supported (source + related suite) |
| 51  | Use case rejects an invalid ID raised through MCP or SDK      | Use cases validate and normalize                | Supported (source + related suite) |
| 52  | Use case stores the qualified form                            | Use cases validate and normalize                | Supported (source + related suite) |
| 53  | CLI holds no spec ID helper                                   | Use cases validate and normalize                | Supported (source + related suite) |
| 54  | Wildcard patterns parse                                       | Patterns and schema references                  | Supported (source + related suite) |
| 55  | Misplaced wildcard rejected                                   | Patterns and schema references                  | Supported (source + related suite) |
| 56  | Patterns validated at load are interpreted identically        | Patterns and schema references                  | Supported (source + related suite) |
| 57  | Schema references split into workspace and name               | Patterns and schema references                  | Supported (source + related suite) |
| 58  | No lenient generic splitter                                   | Patterns and schema references                  | Supported (source + related suite) |
| 59  | Workspace prefixes are derived through the validator          | Patterns and schema references                  | Supported (source + related suite) |
| 60  | Bare dependency in a lock is rejected on read                 | Persisted IDs are fully qualified               | Supported (source + related suite) |
| 61  | Manifest rejects an invalid ID                                | Persisted IDs are fully qualified               | Supported (source + related suite) |
| 62  | Metadata is written strictly but read leniently               | Persisted IDs are fully qualified               | Supported (source + related suite) |

### core:update-spec-deps

Requirements: 14; scenarios: 40. Findings: CM3.

Implementation evidence: packages/core/src/application/use-cases/update-spec-deps.ts; \_shared/apply-depends-on-mutation.ts.

Related test evidence: packages/core/test/application/use-cases/update-spec-deps.spec.ts; packages/core/test/composition/use-cases/update-spec-deps.spec.ts.

| Requirement                                                      | Assessment                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Input contract                                                   | Supported by source and related test suite                  |
| Change lookup                                                    | Supported by source and related test suite                  |
| Spec must belong to the change                                   | Supported by source and related test suite                  |
| Mutual exclusivity of set vs add/remove                          | Supported by source and related test suite                  |
| At least one operation required                                  | Supported by source and related test suite                  |
| Set replaces all dependencies                                    | Supported by source and related test suite                  |
| Clear removes all dependencies                                   | Supported by source and related test suite                  |
| Spec ID validation                                               | Normal factory supported; repeated iterator input fails CM3 |
| Remove validates existence                                       | Supported by source and related test suite                  |
| Add is idempotent                                                | Supported by source and related test suite                  |
| Remove is applied before add                                     | Supported by source and related test suite                  |
| Persistence and output                                           | Supported by source and related test suite                  |
| Typed errors for dependency update failures                      | Supported by source and related test suite                  |
| Config-based factory delegates through resolveUpdateSpecDepsDeps | Normal factory supported; repeated iterator input fails CM3 |

| #   | Merged scenario                                                                               | Requirement                                                      | Assessment                         |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| 1   | execute accepts UpdateSpecDepsInput                                                           | Input contract                                                   | Supported (source + related suite) |
| 2   | Input accepts clear                                                                           | Input contract                                                   | Supported (source + related suite) |
| 3   | Change does not exist                                                                         | Change lookup                                                    | Supported (source + related suite) |
| 4   | Spec ID not in change                                                                         | Spec must belong to the change                                   | Supported (source + related suite) |
| 5   | Set used together with add                                                                    | Mutual exclusivity of set vs add/remove                          | Supported (source + related suite) |
| 6   | Set used together with remove                                                                 | Mutual exclusivity of set vs add/remove                          | Supported (source + related suite) |
| 7   | clear with set rejected                                                                       | Mutual exclusivity of set vs add/remove                          | Supported (source + related suite) |
| 8   | clear with add or remove rejected                                                             | Mutual exclusivity of set vs add/remove                          | Supported (source + related suite) |
| 9   | add and remove together still allowed                                                         | Mutual exclusivity of set vs add/remove                          | Supported (source + related suite) |
| 10  | Same ID in remove and add ends up present                                                     | Mutual exclusivity of set vs add/remove                          | Supported (source + related suite) |
| 11  | No operation specified                                                                        | At least one operation required                                  | Supported (source + related suite) |
| 12  | clear alone satisfies the minimum operation                                                   | At least one operation required                                  | Supported (source + related suite) |
| 13  | Set overwrites existing dependencies                                                          | Set replaces all dependencies                                    | Supported (source + related suite) |
| 14  | Set with empty array clears dependencies                                                      | Set replaces all dependencies                                    | Supported (source + related suite) |
| 15  | set with an empty string stores nothing                                                       | Set replaces all dependencies                                    | Supported (source + related suite) |
| 16  | Removing a dependency not in current deps                                                     | Remove validates existence                                       | Supported (source + related suite) |
| 17  | Adding a dependency already present                                                           | Add is idempotent                                                | Supported (source + related suite) |
| 18  | Remove and add in same call                                                                   | Remove is applied before add                                     | Supported (source + related suite) |
| 19  | Change is persisted and result returned through serialized mutation                           | Persistence and output                                           | Supported (source + related suite) |
| 20  | Dependencies with no prior state                                                              | Persistence and output                                           | Supported (source + related suite) |
| 21  | Mutually exclusive flags throw validation error                                               | Typed errors for dependency update failures                      | Supported (source + related suite) |
| 22  | Dependency not found throws error                                                             | Typed errors for dependency update failures                      | Supported (source + related suite) |
| 23  | createUpdateSpecDeps config form derives UpdateSpecDepsDeps through resolveUpdateSpecDepsDeps | Config-based factory delegates through resolveUpdateSpecDepsDeps | Supported (source + related suite) |
| 24  | resolveUpdateSpecDepsDeps resolves the workspace set                                          | Config-based factory delegates through resolveUpdateSpecDepsDeps | Supported (source + related suite) |
| 25  | clear empties the list                                                                        | Clear removes all dependencies                                   | Supported (source + related suite) |
| 26  | clear on an already empty list                                                                | Clear removes all dependencies                                   | Supported (source + related suite) |
| 27  | Use case asks for no confirmation                                                             | Clear removes all dependencies                                   | Supported (source + related suite) |
| 28  | Clear with no prior dependency state                                                          | Clear removes all dependencies                                   | Supported (source + related suite) |
| 29  | Invalid-input errors carry the INVALID_INPUT code                                             | Clear removes all dependencies                                   | Supported (source + related suite) |
| 30  | Blank dependency rejected on add                                                              | Spec ID validation                                               | Supported (source + related suite) |
| 31  | Malformed dependency rejected on set                                                          | Spec ID validation                                               | Supported (source + related suite) |
| 32  | Unknown workspace rejected                                                                    | Spec ID validation                                               | Supported (source + related suite) |
| 33  | Dependency on a spec that does not exist yet is accepted                                      | Spec ID validation                                               | Supported (source + related suite) |
| 34  | Bare dependency is stored qualified                                                           | Spec ID validation                                               | Supported (source + related suite) |
| 35  | One invalid entry among valid ones stores nothing                                             | Spec ID validation                                               | Supported (source + related suite) |
| 36  | Remove can delete an invalid stored value                                                     | Spec ID validation                                               | Supported (source + related suite) |
| 37  | Same behavior through the SDK                                                                 | Spec ID validation                                               | Supported (source + related suite) |
| 38  | Remove normalizes a bare valid ID                                                             | Spec ID validation                                               | Supported (source + related suite) |
| 39  | Remove entry that is not a valid ID is matched literally                                      | Spec ID validation                                               | Supported (source + related suite) |
| 40  | Comma-containing dependency is one invalid ID                                                 | Spec ID validation                                               | Supported (source + related suite) |

### core:update-persisted-spec-deps

Requirements: 13; scenarios: 43. Findings: No additional confirmed behavior gap.

Implementation evidence: packages/core/src/application/use-cases/update-persisted-spec-deps.ts; resolve-initial-persisted-depends-on.ts; apply-persisted-spec-state-patch.ts.

Related test evidence: packages/core/test/application/use-cases/update-persisted-spec-deps.spec.ts.

| Requirement                                                               | Assessment                                 |
| ------------------------------------------------------------------------- | ------------------------------------------ |
| Input contract                                                            | Supported by source and related test suite |
| Mutual exclusivity and minimum operation                                  | Supported by source and related test suite |
| Spec ID validation and existing targets                                   | Supported by source and related test suite |
| Remove is applied before add                                              | Supported by source and related test suite |
| Reading current persisted state                                           | Supported by source and related test suite |
| Set and clear create missing persisted state                              | Supported by source and related test suite |
| Non-empty add creates missing persisted state                             | Supported by source and related test suite |
| Remove and empty add against missing state are no-ops                     | Supported by source and related test suite |
| Applying the mutation through the shared patch helper                     | Supported by source and related test suite |
| Conditional write and concurrency                                         | Supported by source and related test suite |
| Unknown spec fails with a typed error                                     | Supported by source and related test suite |
| Result contract                                                           | Supported by source and related test suite |
| Config-based factory delegates through resolveUpdatePersistedSpecDepsDeps | Supported by source and related test suite |

| #   | Merged scenario                                                                                      | Requirement                                                               | Assessment                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | specId is required                                                                                   | Input contract                                                            | Supported (source + related suite)                                                                      |
| 2   | set combined with add is rejected                                                                    | Mutual exclusivity and minimum operation                                  | Supported (source + related suite)                                                                      |
| 3   | clear combined with remove is rejected                                                               | Mutual exclusivity and minimum operation                                  | Supported (source + related suite)                                                                      |
| 4   | No operation provided is rejected                                                                    | Mutual exclusivity and minimum operation                                  | Supported (source + related suite)                                                                      |
| 5   | A dependency present in both remove and add ends up present without duplication                      | Remove is applied before add                                              | Supported (source + related suite)                                                                      |
| 6   | originalHash from the read snapshot is used for optimistic concurrency                               | Reading current persisted state                                           | Supported (source + related suite)                                                                      |
| 7   | set against a lock-less spec creates state with exactly the supplied list                            | Set and clear create missing persisted state                              | Supported (source + related suite)                                                                      |
| 8   | clear against a lock-less spec creates state with an empty list                                      | Set and clear create missing persisted state                              | Supported (source + related suite)                                                                      |
| 9   | add against a lock-less spec derives an initial base before adding                                   | Non-empty add creates missing persisted state                             | Supported (source + related suite)                                                                      |
| 10  | add against a lock-less spec falls back to an empty base when the schema cannot extract dependencies | Non-empty add creates missing persisted state                             | Supported (source + related suite)                                                                      |
| 11  | remove against a lock-less spec does not create state                                                | Remove and empty add against missing state are no-ops                     | Supported (source + related suite)                                                                      |
| 12  | add whose resulting merge would be empty against missing state does not create state                 | Remove and empty add against missing state are no-ops                     | Supported (source + related suite)                                                                      |
| 13  | Only dependsOn is included in the patch                                                              | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 14  | Remove before add with overlapping ID                                                                | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 15  | Original hash is passed as expected revision                                                         | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 16  | Set against a lock-less spec creates exactly the given list                                          | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 17  | Clear against a lock-less spec creates an empty list                                                 | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 18  | Add against a lock-less spec derives the base first                                                  | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 19  | Remove with non-empty add against a lock-less spec removes from the derived base                     | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 20  | Add with no resolver result starts from the empty list                                               | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 21  | Remove alone against a lock-less spec is a no-op                                                     | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 22  | Empty add against a lock-less spec is a no-op                                                        | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 23  | Patch helper carries the other persisted fields unchanged                                            | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 24  | Concurrent modification propagates without retry                                                     | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 25  | Existing state with add reports created false                                                        | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 26  | ReadOnly workspace rejected before any I/O                                                           | Applying the mutation through the shared patch helper                     | Supported (source + related suite)                                                                      |
| 27  | Factory resolves collaborators from the resolver                                                     | Applying the mutation through the shared patch helper                     | Initial-dependency behavior supported; collaborator is direct service deps, not named initializer field |
| 28  | Stale expectedRevision produces ArtifactConflictError without retry                                  | Conditional write and concurrency                                         | Supported (source + related suite)                                                                      |
| 29  | Unresolvable spec identity throws SpecNotFoundError                                                  | Unknown spec fails with a typed error                                     | Supported (source + related suite)                                                                      |
| 30  | created is false when mutating existing persisted state                                              | Result contract                                                           | Supported (source + related suite)                                                                      |
| 31  | Config-based factory resolves the initializePersistedSpecState collaborator                          | Config-based factory delegates through resolveUpdatePersistedSpecDepsDeps | Initial-dependency behavior supported; collaborator is direct service deps, not named initializer field |
| 32  | Empty dependency rejected before any I/O                                                             | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |
| 33  | Dependency target that does not exist rejected                                                       | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |
| 34  | Unknown workspace rejected                                                                           | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |
| 35  | Bare dependency stored qualified                                                                     | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |
| 36  | Remove deletes an invalid stored value                                                               | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |
| 37  | Remove normalizes a bare valid ID                                                                    | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |
| 38  | Clear and set repair a lock with invalid dependencies                                                | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |
| 39  | Add reads strictly                                                                                   | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |
| 40  | Remaining invalid entry after mutation fails                                                         | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |
| 41  | Invalid lock on strict read raises the typed lock error                                              | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |
| 42  | Clear works on a valid lock                                                                          | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |
| 43  | Valid entries accepted                                                                               | Spec ID validation and existing targets                                   | Supported (source + related suite)                                                                      |

### core:spec-lock

Requirements: 11; scenarios: 45. Findings: CM6 cross-spec diagnostic detail.

Implementation evidence: packages/core/src/domain/services/parse-spec-lock.ts; infrastructure/fs/spec-repository.ts; archive-change.ts; persisted-state mutation use cases.

Related test evidence: packages/core/test/domain/services/parse-spec-lock.spec.ts; packages/core/test/infrastructure/fs/spec-repository.spec.ts; packages/core/test/application/use-cases/archive-change.spec.ts; update-persisted-spec-schema.spec.ts; update-persisted-spec-optimizations.spec.ts.

| Requirement                                 | Assessment                                 |
| ------------------------------------------- | ------------------------------------------ |
| Sidecar location and naming                 | Supported by source and related test suite |
| Durable schema identity                     | Supported by source and related test suite |
| Guarded schema reassignment                 | Supported by source and related test suite |
| Persistent dependencies                     | Supported by source and related test suite |
| Invalid lock fails with a typed error       | Supported by source and related test suite |
| Archived implementation links               | Supported by source and related test suite |
| Optional persisted optimization state       | Supported by source and related test suite |
| Lock-less specs and explicit initialization | Supported by source and related test suite |
| Archive-time materialization                | Supported by source and related test suite |
| Sidecar is the durable source of truth      | Supported by source and related test suite |
| Repository hash of persisted lock state     | Supported by source and related test suite |

| #   | Merged scenario                                                                    | Requirement                                 | Assessment                         |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| 1   | Sidecar is written next to archived spec artifacts                                 | Sidecar location and naming                 | Supported (source + related suite) |
| 2   | Schema identity remains immutable after first persistence                          | Durable schema identity                     | Supported (source + related suite) |
| 3   | Non-reassignment write paths cannot replace schema                                 | Durable schema identity                     | Supported (source + related suite) |
| 4   | Reassignment validates target schema before replacing schema                       | Guarded schema reassignment                 | Supported (source + related suite) |
| 5   | Reassignment preserves dependsOn when target schema has no dependency extraction   | Guarded schema reassignment                 | Supported (source + related suite) |
| 6   | Reassignment fails when extracted dependencies differ from canonical dependsOn     | Guarded schema reassignment                 | Supported (source + related suite) |
| 7   | Reassignment preserves implementation and optimization values                      | Guarded schema reassignment                 | Supported (source + related suite) |
| 8   | Reassignment makes existing optimizations stale without deleting them              | Guarded schema reassignment                 | Supported (source + related suite) |
| 9   | Reassigning to the currently recorded schema is a no-op                            | Guarded schema reassignment                 | Supported (source + related suite) |
| 10  | Sidecar dependencies are used as durable fallback                                  | Persistent dependencies                     | Supported (source + related suite) |
| 11  | Empty dependency entry rejected                                                    | Persistent dependencies                     | Supported (source + related suite) |
| 12  | Bare dependency entry rejected                                                     | Persistent dependencies                     | Supported (source + related suite) |
| 13  | Qualified valid entries accepted                                                   | Persistent dependencies                     | Supported (source + related suite) |
| 14  | File-level link is stored without symbols                                          | Archived implementation links               | Supported (source + related suite) |
| 15  | Symbol-level link preserves symbol list                                            | Archived implementation links               | Supported (source + related suite) |
| 16  | Optimized field records value, schema baseline, and artifact state                 | Optional persisted optimization state       | Supported (source + related suite) |
| 17  | Independent field baselines                                                        | Optional persisted optimization state       | Supported (source + related suite) |
| 18  | Clearing the last optimized field omits the optimizations block                    | Optional persisted optimization state       | Supported (source + related suite) |
| 19  | Pre-existing lock without optimizations remains valid                              | Optional persisted optimization state       | Supported (source + related suite) |
| 20  | No migration synthesizes optimizations from agent-generated metadata               | Optional persisted optimization state       | Supported (source + related suite) |
| 21  | Lock-less spec with canonical artifacts is valid                                   | Lock-less specs and explicit initialization | Supported (source + related suite) |
| 22  | Explicit initialization adopts existing artifacts                                  | Lock-less specs and explicit initialization | Supported (source + related suite) |
| 23  | Explicit initialization fails when persisted state already exists                  | Lock-less specs and explicit initialization | Supported (source + related suite) |
| 24  | Semantic no-op mutation does not create persisted state                            | Lock-less specs and explicit initialization | Supported (source + related suite) |
| 25  | Persisted lock sidecars cannot be created without canonical artifacts              | Lock-less specs and explicit initialization | Supported (source + related suite) |
| 26  | Excluded path is ignored during materialization                                    | Archive-time materialization                | Supported (source + related suite) |
| 27  | Workspace-boundary mismatch fails archive                                          | Archive-time materialization                | Supported (source + related suite) |
| 28  | Non-archive writers use conditional revision-guarded writes                        | Archive-time materialization                | Supported (source + related suite) |
| 29  | Metadata regeneration does not mutate sidecar implementation links                 | Sidecar is the durable source of truth      | Supported (source + related suite) |
| 30  | Generated projection excludes a stale optimization field                           | Sidecar is the durable source of truth      | Supported (source + related suite) |
| 31  | persistedStateMeta hash matches lock sidecar bytes                                 | Repository hash of persisted lock state     | Supported (source + related suite) |
| 32  | Presence stamps do not expose lock as an artifact                                  | Repository hash of persisted lock state     | Supported (source + related suite) |
| 33  | there is no persistedStateHash method on the port                                  | Repository hash of persisted lock state     | Supported (source + related suite) |
| 34  | Sidecar is omitted from generic artifact metadata                                  | Sidecar is not a schema artifact            | Supported (source + related suite) |
| 35  | Generic artifact reads reject the sidecar                                          | Sidecar is not a schema artifact            | Supported (source + related suite) |
| 36  | Error names spec, file, and field path                                             | Invalid lock fails with a typed error       | Supported (source + related suite) |
| 37  | No raw validation-library error escapes                                            | Invalid lock fails with a typed error       | Supported (source + related suite) |
| 38  | Reading never rewrites or drops entries                                            | Invalid lock fails with a typed error       | Supported (source + related suite) |
| 39  | Lenient dependsOn read tolerates only invalid dependsOn entries                    | Invalid lock fails with a typed error       | Supported (source + related suite) |
| 40  | Lenient read still validates other fields                                          | Invalid lock fails with a typed error       | Supported (source + related suite) |
| 41  | Repository lenient read returns invalid dependsOn as given                         | Invalid lock fails with a typed error       | Supported (source + related suite) |
| 42  | Repository lenient read still rejects other invalid fields                         | Invalid lock fails with a typed error       | Supported (source + related suite) |
| 43  | writePersistedState repairs a lock with invalid dependsOn                          | Invalid lock fails with a typed error       | Supported (source + related suite) |
| 44  | Strict read of a lock with one valid and one invalid entry changes nothing on disk | Invalid lock fails with a typed error       | Supported (source + related suite) |
| 45  | Error code and message form                                                        | Invalid lock fails with a typed error       | Supported (source + related suite) |

### core:workspace

Requirements: 13; scenarios: 43. Findings: CM5 and old metadata-port vocabulary.

Implementation evidence: packages/core/src/infrastructure/fs/config-loader.ts; application/ports/config-schema.ts; domain/entities/change.ts; application/use-cases/archive-change.ts.

Related test evidence: packages/core/test/infrastructure/fs/config-loader.spec.ts; packages/core/test/application/use-cases/create-change.spec.ts; edit-change.spec.ts; archive-change.spec.ts.

| Requirement                              | Assessment                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Workspace identity                       | Supported by source and related test suite                                            |
| Workspace properties                     | Supported by source and related test suite                                            |
| External workspace inference             | Supported by source and related test suite                                            |
| Ownership semantics                      | Canonical-write guards supported; removed cache-write vocabulary needs reconciliation |
| Prefix semantics                         | Supported by source and related test suite                                            |
| Workspace-qualified spec IDs             | Supported by source and related test suite                                            |
| Active workspace determination           | Supported by source and related test suite                                            |
| Primary workspace                        | Conflicts with dependency requirements; CM5                                           |
| Port-per-workspace pattern               | Supported by source and related test suite                                            |
| Workspace-level context patterns         | Supported by source and related test suite                                            |
| Cross-workspace references               | Supported by source and related test suite                                            |
| Workspace directory structure in changes | Supported by source and related test suite                                            |
| Sole source of truth                     | Supported by source and related test suite                                            |

| #   | Merged scenario                                       | Requirement                              | Assessment                                                                     |
| --- | ----------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Valid workspace names accepted                        | Workspace identity                       | Supported (source + related suite)                                             |
| 2   | Invalid workspace name rejected                       | Workspace identity                       | Supported (source + related suite)                                             |
| 3   | Missing default workspace                             | Workspace identity                       | Supported (source + related suite)                                             |
| 4   | Duplicate workspace name                              | Workspace identity                       | Supported (source + related suite)                                             |
| 5   | A device-name workspace is rejected                   | Workspace identity                       | Supported (source + related suite)                                             |
| 6   | con-foo remains a legal workspace name                | Workspace identity                       | Supported (source + related suite)                                             |
| 7   | One-character workspace name rejected                 | Workspace identity                       | Supported (source + related suite)                                             |
| 8   | Two-character workspace name accepted                 | Workspace identity                       | Supported (source + related suite)                                             |
| 9   | Names produced by project init are loadable           | Workspace identity                       | Supported (source + related suite)                                             |
| 10  | Existing project workspaces remain valid              | Workspace identity                       | Supported (source + related suite)                                             |
| 11  | Default workspace inherits defaults                   | Workspace properties                     | Supported (source + related suite)                                             |
| 12  | Non-default workspace requires codeRoot               | Workspace properties                     | Supported (source + related suite)                                             |
| 13  | Non-default workspace defaults                        | Workspace properties                     | Supported (source + related suite)                                             |
| 14  | Workspace with path inside repo root                  | External workspace inference             | Supported (source + related suite)                                             |
| 15  | Workspace with path outside repo root                 | External workspace inference             | Supported (source + related suite)                                             |
| 16  | Owned workspace allows all operations                 | Ownership semantics                      | Supported (source + related suite)                                             |
| 17  | Shared workspace allows all operations                | Ownership semantics                      | Supported (source + related suite)                                             |
| 18  | ReadOnly workspace blocks change scope addition       | Ownership semantics                      | Supported (source + related suite)                                             |
| 19  | ReadOnly workspace blocks archive                     | Ownership semantics                      | Supported (source + related suite)                                             |
| 20  | ReadOnly workspace blocks direct spec writes          | Ownership semantics                      | save supported; removed saveMetadata term conflicts with cache-write exemption |
| 21  | ReadOnly workspace allows reads                       | Ownership semantics                      | Supported (source + related suite)                                             |
| 22  | Error messages do not suggest remediation             | Ownership semantics                      | Supported (source + related suite)                                             |
| 23  | Prefix prepended to capability path                   | Prefix semantics                         | Supported (source + related suite)                                             |
| 24  | No prefix uses bare path                              | Prefix semantics                         | Supported (source + related suite)                                             |
| 25  | Invalid prefix rejected                               | Prefix semantics                         | Supported (source + related suite)                                             |
| 26  | Prefix segment violating the segment rule             | Prefix semantics                         | Supported (source + related suite)                                             |
| 27  | Bare path resolves to default workspace               | Workspace-qualified spec IDs             | Supported (source + related suite)                                             |
| 28  | Unknown workspace rejected                            | Workspace-qualified spec IDs             | Supported (source + related suite)                                             |
| 29  | Unknown workspace in a spec ID raises the typed error | Workspace-qualified spec IDs             | Supported (source + related suite)                                             |
| 30  | Malformed spec ID raises the typed error              | Workspace-qualified spec IDs             | Supported (source + related suite)                                             |
| 31  | Adapters do not qualify IDs even for display          | Workspace-qualified spec IDs             | Supported (source + related suite)                                             |
| 32  | Workspace active when change has spec in it           | Active workspace determination           | Supported (source + related suite)                                             |
| 33  | Workspace inactive when no specs target it            | Active workspace determination           | Supported (source + related suite)                                             |
| 34  | Primary workspace is first spec's workspace           | Primary workspace                        | Stale/conflicting contract; CM5                                                |
| 35  | Primary workspace used for archive path template      | Primary workspace                        | Stale/conflicting contract; CM5                                                |
| 36  | Repository map passed to cross-workspace use cases    | Port-per-workspace pattern               | Supported (source + related suite)                                             |
| 37  | Spec references another workspace's spec              | Cross-workspace references               | Supported (source + related suite)                                             |
| 38  | Unknown workspace reference at config validation time | Cross-workspace references               | Supported (source + related suite)                                             |
| 39  | Unqualified pattern resolves to own workspace         | Workspace-level context patterns         | Supported (source + related suite)                                             |
| 40  | DependsOn specs exempt from excludes                  | Workspace-level context patterns         | Supported (source + related suite)                                             |
| 41  | Single-workspace change includes workspace segment    | Workspace directory structure in changes | Supported (source + related suite)                                             |
| 42  | External workspace config is never read               | Sole source of truth                     | Supported (source + related suite)                                             |
| 43  | root workspace name is rejected                       | Sole source of truth                     | Supported (source + related suite)                                             |

### core:create-change

Requirements: 14; scenarios: 49. Findings: CM4.

Implementation evidence: packages/core/src/application/use-cases/create-change.ts; \_shared/load-persisted-spec-depends-on.ts.

Related test evidence: packages/core/test/application/use-cases/create-change.spec.ts; packages/core/test/composition/use-cases/create-change.spec.ts.

| Requirement                                                    | Assessment                                 |
| -------------------------------------------------------------- | ------------------------------------------ |
| Input contract                                                 | Supported by source and related test suite |
| Spec ID validation                                             | Supported by source and related test suite |
| ReadOnly workspace rejection                                   | Supported by source and related test suite |
| Active schema resolution                                       | Supported by source and related test suite |
| Optional overlap check                                         | Supported by source and related test suite |
| Initial invalidation policy                                    | Supported by source and related test suite |
| Name uniqueness enforcement                                    | Supported by source and related test suite |
| Actor resolution                                               | Supported by source and related test suite |
| Initial history contains a single created event                | Supported by source and related test suite |
| Change construction                                            | Supported by source and related test suite |
| Initial specDependsOn seeding                                  | Metadata-only fallback absent; CM4         |
| Persistence and scaffolding                                    | Supported by source and related test suite |
| Dependencies                                                   | Supported by source and related test suite |
| Config-based factory delegates through resolveCreateChangeDeps | Supported by source and related test suite |

| #   | Merged scenario                                                                         | Requirement                                                    | Assessment                         |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| 1   | Change with duplicate name is rejected                                                  | Name uniqueness enforcement                                    | Supported (source + related suite) |
| 2   | Change with unique name succeeds                                                        | Name uniqueness enforcement                                    | Supported (source + related suite) |
| 3   | Actor identity is recorded in the created event                                         | Actor resolution                                               | Supported (source + related suite) |
| 4   | History contains exactly one created event                                              | Initial history contains a single created event                | Supported (source + related suite) |
| 5   | Active schema identity recorded when not provided on input                              | Initial history contains a single created event                | Supported (source + related suite) |
| 6   | Description is included when provided                                                   | Change construction                                            | Supported (source + related suite) |
| 7   | Description is omitted when not provided                                                | Change construction                                            | Supported (source + related suite) |
| 8   | Initial state is drafting                                                               | Change construction                                            | Supported (source + related suite) |
| 9   | Persisted dependency state seeds dependencies at creation time                          | Initial specDependsOn seeding                                  | Supported (source + related suite) |
| 10  | Legacy metadata seeds when persisted semantic state is absent                           | Initial specDependsOn seeding                                  | Contradicted by helper; CM4        |
| 11  | Stale metadata still seeds as legacy fallback                                           | Initial specDependsOn seeding                                  | Contradicted by helper; CM4        |
| 12  | New spec starts without seeded dependency entry                                         | Initial specDependsOn seeding                                  | Supported (source + related suite) |
| 13  | execute accepts CreateChangeInput without schema fields                                 | Input contract                                                 | Supported (source + related suite) |
| 14  | execute accepts explicit schema override                                                | Input contract                                                 | Supported (source + related suite) |
| 15  | Partial schema override is rejected                                                     | Input contract                                                 | Supported (source + related suite) |
| 16  | specIds are recorded in the created event                                               | Input contract                                                 | Supported (source + related suite) |
| 17  | Delegates to GetActiveSchema in project mode                                            | Active schema resolution                                       | Supported (source + related suite) |
| 18  | Schema resolution errors propagate                                                      | Active schema resolution                                       | Supported (source + related suite) |
| 19  | Overlap report included when requested                                                  | Optional overlap check                                         | Supported (source + related suite) |
| 20  | Overlap detection failure does not fail creation                                        | Optional overlap check                                         | Supported (source + related suite) |
| 21  | Overlap check skipped when flag absent                                                  | Optional overlap check                                         | Supported (source + related suite) |
| 22  | Overlap check skipped when specIds empty                                                | Optional overlap check                                         | Supported (source + related suite) |
| 23  | New change persists the project default invalidationPolicy                              | Initial invalidation policy                                    | Supported (source + related suite) |
| 24  | Unknown invalidation policy rejected                                                    | Initial invalidation policy                                    | Supported (source + related suite) |
| 25  | Change is created via repository create                                                 | Persistence and scaffolding                                    | Supported (source + related suite) |
| 26  | Change is created then scaffolded                                                       | Persistence and scaffolding                                    | Supported (source + related suite) |
| 27  | Scaffolding uses specExists callback                                                    | Persistence and scaffolding                                    | Supported (source + related suite) |
| 28  | Result includes changePath                                                              | Persistence and scaffolding                                    | Supported (source + related suite) |
| 29  | Uses ChangeRepository port                                                              | Dependencies                                                   | Supported (source + related suite) |
| 30  | Uses ActorResolver port                                                                 | Dependencies                                                   | Supported (source + related suite) |
| 31  | Uses ListWorkspaces for spec existence and dependency seeding                           | Dependencies                                                   | Supported (source + related suite) |
| 32  | Uses GetActiveSchema for active schema resolution                                       | Dependencies                                                   | Supported (source + related suite) |
| 33  | Uses DetectOverlap for optional overlap check                                           | Dependencies                                                   | Supported (source + related suite) |
| 34  | createCreateChange config form derives CreateChangeDeps through resolveCreateChangeDeps | Config-based factory delegates through resolveCreateChangeDeps | Supported (source + related suite) |
| 35  | Uninitialized spec fallback allows addition if global schema matches change             | Schema compatibility guardrail                                 | Supported (source + related suite) |
| 36  | Adding a spec with identical schema succeeds                                            | Schema compatibility guardrail                                 | Supported (source + related suite) |
| 37  | Adding a spec with a different but compatible schema succeeds                           | Schema compatibility guardrail                                 | Supported (source + related suite) |
| 38  | Adding a spec with an incompatible schema throws IncompatibleSchemaError                | Schema compatibility guardrail                                 | Supported (source + related suite) |
| 39  | Invalid ID rejected and no change created                                               | Spec ID validation                                             | Supported (source + related suite) |
| 40  | Empty ID rejected                                                                       | Spec ID validation                                             | Supported (source + related suite) |
| 41  | Duplicate IDs collapse                                                                  | Spec ID validation                                             | Supported (source + related suite) |
| 42  | Existing name is reported before spec ID validation                                     | Spec ID validation                                             | Supported (source + related suite) |
| 43  | Comma in an ID is not split                                                             | Spec ID validation                                             | Supported (source + related suite) |
| 44  | Unknown workspace rejected                                                              | Spec ID validation                                             | Supported (source + related suite) |
| 45  | Bare ID stored qualified                                                                | Spec ID validation                                             | Supported (source + related suite) |
| 46  | Spec that does not exist yet accepted                                                   | Spec ID validation                                             | Supported (source + related suite) |
| 47  | readOnly spec rejected                                                                  | ReadOnly workspace rejection                                   | Supported (source + related suite) |
| 48  | Mixed owned and readOnly specs                                                          | ReadOnly workspace rejection                                   | Supported (source + related suite) |
| 49  | SDK callers are covered                                                                 | ReadOnly workspace rejection                                   | Supported (source + related suite) |

### core:archived-change-index-entry

Requirements: 2; scenarios: 6. Findings: CM5 stale helper-usage scenario.

Implementation evidence: packages/core/src/domain/archived-change-index-entry.ts; infrastructure/fs/archive-repository.ts.

Related test evidence: packages/core/test/domain/archived-change-index-entry.spec.ts; packages/core/test/infrastructure/fs/archive-repository.spec.ts.

| Requirement           | Assessment                                 |
| --------------------- | ------------------------------------------ |
| Index entry fields    | Supported by source and related test suite |
| No manifest-only data | Supported by source and related test suite |

| #   | Merged scenario                                                   | Requirement           | Assessment                                                             |
| --- | ----------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------- |
| 1   | ArchiveListEntry contains required fields                         | Index entry fields    | Supported (source + related suite)                                     |
| 2   | archivedBy appears only when includeArchivedBy is set             | Index entry fields    | Supported (source + related suite)                                     |
| 3   | Workspace prefixes are derived through the validator              | Index entry fields    | Supported (source + related suite)                                     |
| 4   | Invalid ID in the input is rejected                               | Index entry fields    | Supported (source + related suite)                                     |
| 5   | Helper is not used for list rows                                  | Index entry fields    | No list-row use supported; archive-templating usage clause stale (CM5) |
| 6   | ArchiveListEntry is sufficient for listing without manifest reads | No manifest-only data | Supported (source + related suite)                                     |

## Summary counts and limitations

- Change specs: 9. Merged requirement groups: 113. Merged scenarios inventoried: 379.
- Findings: 6 (CM1–CM6): 3 additional runtime implementation edges, 1 diagnostic requirement gap, 2 groups of spec/implementation or dependency drift. Four are medium and two low by this report's local severity assessment.
- Named scenarios explicitly contradictory/stale under CM4/CM5: 7 (4 metadata-only fallback, 2 primary workspace, 1 mixed helper-usage scenario). These are not passing just because related suites are green.
- This is a source/contract/coverage audit, not an independent execution of 379 individually named scenario tests. Existing suite results were supplied by the parent and exact missing tests are listed above. Unchanged infrastructure and aggregate-state operations were reviewed through their contracts and related tests; no new Windows or Linux process was run. No source, spec, test, configuration, or lifecycle state was changed by this batch.
