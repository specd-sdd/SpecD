# Full verification and compliance: support-commas-in-names

Date: 2026-11-08. Result: **NOT CLEAN — user decision required**. Lifecycle remains `verifying`.

## Verification

31 merged change specs, 368 compiled requirement groups and 1,311 compiled scenario entries were inventoried and reviewed against implementation and tests. Inventories include duplicate/overlapping scenarios; they are not counts of independently executed test cases. Requirement-level source and suite evidence, focused reproductions and coverage limitations are recorded in each partial report.

Fresh checks passed: full build (13 tasks, zero cache hits); direct TypeScript checks in core/cli/sdk/skills/guide; 4,515 tests in those five packages (345 files); ESLint on 151 modified/new TypeScript files; `git diff --check`. Verifying post-hooks returned no hooks/instructions. The graph was refreshed and reported current. Local execution was macOS/Node 25.9.0; Windows/Linux/Node 22 CI was not executed locally.

The primary comma-preservation behavior is supported, but the full merged acceptance contracts are not all satisfied. Passing tests do not override contradictory scenarios or reproduced missing branches.

## Current implementation gaps

| ID  | Priority | Finding                                                                                          | Evidence                                                                                                                     |
| --- | -------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| CM1 | Medium   | A new batch with case aliases records two files/links on case-insensitive hosts.                 | `update-implementation-tracking.ts:137`; reproduced with `Docs/Notes.md` and `docs/notes.md` against the rebuilt public API. |
| CM2 | Medium   | Invalid `defaultWorkspace` overrides bypass syntax validation and produce invalid qualified IDs. | `parse-spec-id.ts:46`; reproduced with one-character, uppercase, device-name and empty overrides.                            |
| CM3 | Low      | A one-shot workspace iterable is exhausted after the first use-case execution.                   | `update-spec-deps.ts:66` and `:102`; the second call after construction with `Map.keys()` throws WORKSPACE_NOT_FOUND.        |
| CM6 | Low      | Lock errors omit the invalid persisted ID value required by the identity spec.                   | `parse-spec-lock.ts:124`; error includes field/path/rule, but not the offending value.                                       |

These are three runtime edge cases and one diagnostic-contract gap, not failures of the ordinary whole-name list behavior. Their missing regression tests are described in the Core mutation report.

## Baseline discrepancies and specification reconciliation

Fourteen additional finding groups concern unchanged behavior, stale artifacts or neighboring-spec contradictions. They are included because Full mode audits the complete merged scope; they are **not fourteen regressions introduced by this change**.

| IDs            | Area                                | Required review                                                                                                                                                   |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CM4            | Change dependency seeding           | Four scenarios require a metadata-only fallback that the aggregate-state helper no longer implements; current tests claiming that case actually provide locks.    |
| CM5            | Workspace/archive contracts         | Primary/singular workspace requirements conflict with the newer no-home-workspace archive contracts; metadata-port vocabulary is also stale.                      |
| CLI-S1, CLI-S2 | Change dependency command           | Two old output scenarios expect bare dependency IDs; the all-list delegation constraint conflicts with the query's required specId and intentional status branch. |
| CLI-I1, CLI-I2 | Init/help                           | Explicit default-valued flags still open the TTY wizard; several structured-output command leaves omit the required help schemas.                                 |
| CP1, CP2, CP3  | Spec validation                     | Stale optimizations do not independently fail validation; materialization warnings disappear; lock-less mismatch validation disagrees with the contract.          |
| CP4, CP5       | Metadata generation                 | Result-shape requirements have drifted; an explicit null lock observation can be associated with a later lock hash.                                               |
| CP6, CP7, CP8  | Composition/config/schema artifacts | Shared instance versus per-workspace map, configuration wording/error contradictions, and absent-artifact parsing exceptions need reconciliation.                 |

Total: **18 finding groups**, including **4 current implementation/diagnostic gaps** and **14 baseline/reconciliation groups**. Some groups contain multiple related clauses; this count is not a count of failed tests or individually failing scenarios. Severity is medium/low; no critical/high finding was established.

## Next action

Recommended: **Both** — `/specd-design support-commas-in-names` first to reconcile the intended contracts and decide treatment of baseline findings, then `/specd-implement support-commas-in-names` for implementation/test fixes. The active Full verification skill requires an explicit choice among Update Specs, Fix Implementation, Both or Proceed. No done/archivable transition, human approval or archive operation was performed.

## Detailed findings

The compiled report appends all four partial reports verbatim. Partial files and execution logs remain alongside it for traceability.

<!-- BEGIN _partial-global.md -->

# Global constraints and verification evidence

Change: `support-commas-in-names`. Audit mode: change. Date: 2026-11-08.

## Requirements summary

Project context was obtained through `project context`; full global artifacts were retrieved through `specs show` for architecture, conventions, cross-platform, testing, docs, eslint, logging, error-handling-conventions and continuous-integration. These are supporting constraints for the 31 change specs, not nine additional complete implementation audits of unrelated subsystems. The other partial reports cover the concrete requirement and scenario comparisons, including contradictions with dependencies.

## Implementation status and evidence

| Global area    | Scope assessment and evidence                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture   | New ID/pattern/path services are pure domain functions. WorkspaceNotFoundError is defined in domain and re-exported from application. Mutations receive repository/file-reader ports. GetChangeSpecDeps has standalone composition and a kernel operation. CLI uses the SDK. No layer violation was reported by scoped ESLint. |
| Conventions    | Direct TypeScript checks passed for core, cli, sdk, skills and guide. Modified and new TypeScript files passed ESLint. No edits were made by this verification run.                                                                                                                                                            |
| Cross-platform | Spec ID validation rejects device names and invalid segments on every host. Separator and case helpers have platform-parameterized tests. Runtime review nevertheless uncovered a case-insensitive batch defect, documented in the core-mutations report. Native Windows/Linux execution was not performed locally.            |
| Testing        | Fresh Vitest runs passed: core 2,889; CLI 1,285; SDK 134; skills 52; guide 155. This is 4,515 tests across 345 files. Passing suites are not treated as proof that every scenario has adequate coverage; gaps are documented in the other reports.                                                                             |
| Documentation  | CLI/Core/SDK/guide documentation and generated guide bundles are included in the implementation. CLI documentation coverage and guide tests passed. Detailed CLI/spec documentation consistency is reviewed in the CLI/skills report.                                                                                          |
| ESLint         | 128 modified tracked TypeScript files and 23 untracked new TypeScript files passed separate checks (151 total). `git diff --check` passed.                                                                                                                                                                                     |
| Error handling | New ID, pattern, lock and workspace errors extend SpecdError and expose uppercase codes. Original ID values are retained in parser errors. Lock repair hints are scoped to dependency commands. Detailed message and persistence contracts are covered by area reports.                                                        |
| Logging        | No new logging implementation is introduced by this change. CLI renders through its delivery output/error helpers; no new business-layer logging bypass was observed.                                                                                                                                                          |
| CI             | Tracked `.github/workflows/ci.yml` uses macOS/Ubuntu/Windows, Node 22, pnpm 10.6.5, frozen install, then build/typecheck/test. Copilot instructions remain ignored. Local verification used macOS and Node 25.9.0; this does not establish the remote three-OS gate.                                                           |

## Executed checks

- Full fresh monorepo build excluding public-web: 13 successful tasks, zero cache hits. Initial forced execution inside the sandbox failed on the local tsx IPC socket; the same build passed with execution permission outside the sandbox.
- Fresh relevant suites through Turbo: 17 successful tasks, zero cache hits; 4,515 tests passed.
- Direct `tsc --noEmit` for the five affected packages: passed.
- Scoped ESLint: passed for 151 modified/new TypeScript files.
- `git diff --check`: passed.
- Graph incrementally refreshed; subsequent graph stats reported current/contentFresh true. Parser impact reported CRITICAL, with 324 affected files; this motivated the broad package checks.
- Verifying post-hooks executed immediately after the scenario/test assessment: no hooks and no instructions.

## Test coverage and limitations

The complete compiled change context contains 1,311 scenario entries across 31 specs. Some entries duplicate behavior, and many cover pre-existing behavior. Automated test counts and scenario counts measure different things. Area reports record failures, spec drift and uncovered conditions rather than assigning every passing test to an acceptance scenario by title alone.

No source/spec fixes, human approvals, archive operations or final lifecycle transitions were performed. The change remains in verifying pending the required user decision after full-mode results.

## Evidence files

`build.log`, `tests.log`, `typecheck.log`, `eslint-modified.log`, `eslint-new.log` are retained in this report directory. Additional exploratory sandbox runs were superseded by the fresh successful execution above.

## Discrepancies and dependency chain

Confirmed implementation and specification findings are owned by the area reports and must be counted once during aggregation. Global dependencies: architecture/conventions; cross-platform/testing/continuous-integration; conventions/error-handling-conventions/eslint; docs; logging.

## Summary counts

31 change specs; 1,311 compiled scenario entries; 9 supporting global specs; 4,515 fresh passing tests; 151 linted changed/new TypeScript files. No additional independent global finding is added by this partial report.

<!-- END _partial-global.md -->

<!-- BEGIN _partial-core-mutations.md -->

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

<!-- END _partial-core-mutations.md -->

<!-- BEGIN _partial-core-persistence.md -->

# Compliance audit — Core persistence/configuration

Change: support-commas-in-names
Mode: specific change; full merged specs + project globals + direct dependencies
Date: 2026-11-08

## Outcome and limits

No newly introduced strict-ID, list-forwarding, persisted-dependency-repair, ownership, or schema-parse regression was confirmed in this batch. Eight confirmed **baseline** discrepancy groups remain in the full merged contracts. They predate the current implementation diff or are contradictions in existing artifacts; they must not be represented as bugs introduced by support-commas-in-names.

This is static code/contract review plus existing suite evidence and focused runtime reproductions. The parent ran 4,515 fresh tests (Core 2,889; CLI 1,285; SDK 134; Skills 52; Guide 155), fresh build, direct TypeScript checking, and lint on changed TypeScript. Successful suites do not prove one automated test for each prose scenario. The inventory below maps every compiled scenario in this batch to its parent requirement and source/suite evidence; it does not claim an independent execution for every scenario. Cross-platform branches were inspected and have portable/stubbed tests; no fresh Windows/Linux runner was executed here. Broad unchanged graph-discovery contracts rely partly on the parent general-suite cached graph results and static integration review, not a newly executed graph suite.

## Confirmed discrepancies

### CP1 — Baseline implementation gap: stale optimizations do not fail ValidateSpecs (medium)

- Contract: core:validate-specs, “Persisted optimization staleness is an independent failure”; scenarios “Stale optimization field fails validation independently” and “Optimization staleness failure is reported even when metadata materialization succeeds”.
- Code: packages/core/src/application/use-cases/validate-specs.ts:491 (metadata consistency routine), :515 (materialization), :527 (persisted read). The entire use case only checks dependency equality; it never evaluates optimization freshness or records stale fields.
- Reproduction: an injected persisted state with optimizedContext baseline schema old-schema and current persisted schema schema, valid materialized dependsOn:[], and no failing artifact rules produces passed:true, failures:[], warnings:[]. Runtime reproduced with the existing makeSpec/makeSpecRepository/makeSchema test helpers.
- Coverage: current validate-specs.spec.ts has dependency, cache, artifact, and ID tests but no stale-optimization assertion.
- Resolution: implement the independent check and add a regression test if the spec is intended; otherwise revise the requirement/scenarios to document a different policy. No evidence supports dismissing this by suite success.

### CP2 — Baseline implementation gap: materialization warnings are discarded (low)

- Contract: core:validate-specs, “Metadata materialization and validation”; scenario “metadata-cache-write-failed is a warning, not a failure”.
- Code: validate-specs.ts:515 selects only .metadata from the GetSpecMetadata result and ignores .warnings; nothing maps the cache warning into entry.warnings.
- Reproduction: return warnings:[{kind:'metadata-cache-write-failed',specId:'default:auth/login',error:'cache write failed'}] together with a valid projection. Result warnings is [].
- Coverage: no current assertion for propagating this warning.
- Resolution: preserve/map warnings, or revise the spec if the intended contract is logging-only. This is unchanged baseline behavior.

### CP3 — Baseline implementation gap: lock-less metadata dependency mismatches are never checked (medium)

- Contract: core:validate-specs “Metadata materialization and validation” explicitly compares with [] for a lock-less spec; scenario “Post-materialization dependsOn mismatch becomes a validation failure” includes that case.
- Code: validate-specs.ts:527-529 returns immediately when readPersistedState returns null.
- Reproduction: readPersistedState=>null and materialized metadata.dependsOn=>['default:unexpected'] produces passed:true with no failure.
- Coverage: tests cover mismatches against present persisted state, not the null-state branch.
- Resolution: compare to the specified empty baseline, or revise the lock-less contract if extracted dependencies should instead be authoritative. core:generate-metadata currently says lock-less metadata derives dependencies from artifacts, so the contracts also need a deliberate consistency decision.

### CP4 — Baseline output-contract drift in GenerateSpecMetadata (low/medium)

- Contract: core:generate-metadata “Schema resolution” requires metadata:{} without extraction; “dependsOn resolution” requires [] when no lock and no extracted dependencies; “Assembled result” requires generatedBy:'core'. core:spec-metadata likewise states newly generated documents use generatedBy:'core'.
- Code: generate-spec-metadata.ts:197-223 always assembles provenance/optimizationStatus/contentHashes, omits generatedBy; :331-338 returns undefined for a lock-less omitted dependsOn. parse-metadata.ts:288 explicitly labels generatedBy legacy/never emitted by writers. PersistSpecMetadata does not add the marker either.
- Focused runtime results:
  - schema without metadataExtraction => hasExtraction:false, metadata keys ['optimizationStatus','contentHashes','provenance'] (not {}).
  - metadataExtraction:{} and absent lock => hasExtraction:true, 'dependsOn' in metadata === false, 'generatedBy' in metadata === false.
- Attribution: these assembly branches are unchanged by the current diff, which tightens parsing and normalizes specId. The implementation/comment suggests intentional evolution and stale artifacts, especially for generatedBy.
- Coverage: the bare-ID test asserts only metadata defined and hasExtraction false; it does not assert metadata:{} or these required keys.
- Resolution: reconcile spec/scenario contracts with the intended current projection; if the old contract is still intended, add missing fields/early return and tests.

### CP5 — Baseline implementation gap: explicit lock absence can receive a later lock hash (medium)

- Contract: core:generate-metadata “One consistent lock snapshot or explicit absence”, particularly “Explicit absence is treated as one consistent observation”.
- Code: generate-spec-metadata.ts:116 reads persisted state once; :168-171 uses persistedState?.originalHash ?? await persistedStateMeta(...). With null it makes another observation.
- Deterministic reproduction: readPersistedState=>null, then persistedStateMeta=>{hash:'sha256:'+ 'b'.repeat(64), lastModified:'2026-11-08T00:00:00.000Z'} (a lock created between observations). The result semantically uses absence but metadata.provenance.persistedStateHash is sha256:bbbb… rather than null. Reproduced against source via node --import tsx using the existing stub repository.
- Impact: provenance/freshness can certify a projection of absent semantics against a present lock. Materialization rechecks source state, but that does not make GenerateSpecMetadata’s own result fulfill its atomic-observation contract.
- Coverage: no test changes the Meta observation after a null persisted read.
- Resolution: preserve null as the observed hash for explicit absence, or weaken the snapshot guarantee explicitly. This code is unchanged by the current diff.

### CP6 — Baseline composition artifact drift: GetSpecMetadata instance versus map (low)

- Contract: core:validate-specs factory requirement/scenario demands getMetadata:ReadonlyMap<string,GetSpecMetadata> with one instance per workspace.
- Code: packages/core/src/composition/use-cases/validate-specs.ts:28 declares one GetSpecMetadata; :43 wires one shared use case; ValidateSpecs constructor accepts a single instance with a repository map.
- Resolution: update the artifact to the shared multiworkspace operation if intended, or implement/map the documented dependencies. Existing composition works through the single shared resolver; this is not an introduced runtime regression.

### CP7 — Baseline configuration artifact inconsistencies (low)

- core:config “Plugin declarations” says plugins MUST be present, but config-schema.ts:241 makes it optional and minimal-config tests accept omission. Decide whether to update the wording or enforce required plugins.
- core:config-loader “Path probe” says discovery resolvePath does not read/parse, but config-loader.ts:312 calls parseCascadeLayer for every candidate to determine the active root. Discovery-chain scenarios require this resolution and existing tests validate it; a spec clarification is the likely fix.
- core:config-loader “All errors are ConfigValidationError” conflicts with core:config “Missing directories throw StorageDirectoryNotFoundError”; config-loader.ts:594 implements StorageDirectoryNotFoundError. Limit the universal wording or change the error contract deliberately.
- No new shared workspace-rule/pattern bug was confirmed: validation uses isValidWorkspaceName/parseSpecPattern and prefixes use isValidCapabilitySegment; malformed patterns fail before matching and contextual defaults are supplied.

### CP8 — Baseline/in-change artifact contradiction about absent artifacts on schema reassignment (low)

- core:update-persisted-spec-schema “Loading and parsing declared artifacts under the target schema” says lack of a registered parser is the only skipped case. The existing implementation test explicitly requires skipping absent files; the merged requirement does not state that exception.
- update-persisted-spec-schema.ts:170 skips an absent artifact; the test “skips artifacts that do not exist on disk” enforces that branch.
- Resolution: make the requirement explicitly permit absent artifacts if the current test is intended, or change implementation/test to enforce the stated sole exception. Unconditional parsing of every present parseable artifact is implemented correctly; this is a requirement/test discrepancy, not evidence of a new parse-validation regression.

## Reproduction snippets

All commands are read-only against implementation/spec content. The common setup imports real use cases and existing test helpers; no production files were written.

```js
import { GenerateSpecMetadata } from './packages/core/src/application/use-cases/generate-spec-metadata.ts'
import { ValidateSpecs } from './packages/core/src/application/use-cases/validate-specs.ts'
import { makeSpec } from './packages/core/test/helpers/make-spec.ts'
import {
  makeSpecRepository,
  makeSchema,
  makeSchemaProvider,
  makeArtifactType,
  makeParsers,
  makeContentHasher,
  makeListWorkspaces,
} from './packages/core/test/application/use-cases/helpers.ts'
const spec = makeSpec({ workspace: 'default', name: 'auth/login', filenames: ['spec.md'] })
const repo = makeSpecRepository({ specs: [spec], artifacts: { 'auth/login/spec.md': '# Login' } })
repo.readPersistedState = async () => null
repo.persistedStateMeta = async () => ({
  lastModified: '2026-11-08T00:00:00.000Z',
  hash: 'sha256:' + 'b'.repeat(64),
})
const generator = new GenerateSpecMetadata(
  makeListWorkspaces(new Map([['default', repo]])),
  makeSchemaProvider(
    makeSchema({
      artifacts: [
        makeArtifactType('specs', {
          scope: 'spec',
          output: 'spec.md',
          format: 'markdown',
        }),
      ],
    }),
  ),
  makeParsers(),
  makeContentHasher(),
  new Map(),
)
const result = await generator.execute({ specId: 'auth/login' })
console.log(
  result.hasExtraction,
  Object.keys(result.metadata),
  result.metadata.provenance.persistedStateHash,
)
// false, [optimizationStatus,contentHashes,provenance], sha256:bbbb…
// Expected for CP5: the explicit-null observation retains null provenance hash.

const getMetadata = {
  execute: async () => ({
    metadata: { dependsOn: ['default:unexpected'] },
    warnings: [
      {
        kind: 'metadata-cache-write-failed',
        specId: 'default:auth/login',
        error: 'cache write failed',
      },
    ],
  }),
}
const validator = new ValidateSpecs(
  new Map([['default', repo]]),
  makeSchemaProvider(makeSchema()),
  makeParsers(),
  getMetadata,
  makeContentHasher(),
)
console.log(await validator.execute({ specPath: 'default:auth/login' }))
// One entry: passed:true, failures:[], warnings:[] (CP2 and CP3).

repo.readPersistedState = async () => ({
  schema: { name: 'schema', version: 1 },
  dependsOn: [],
  implementation: [],
  originalHash: 'sha256:' + 'a'.repeat(64),
  optimizations: {
    optimizedContext: {
      value: 'stale',
      schema: { name: 'old-schema', version: 0 },
      artifactState: {},
    },
  },
})
getMetadata.execute = async () => ({ metadata: { dependsOn: [] }, warnings: [] })
console.log(await validator.execute({ specPath: 'default:auth/login' }))
// Again passed:true, failures:[] despite schema-stale optimization (CP1).
```

Run using `rtk proxy node --import tsx --input-type=module` with the snippet on stdin. The malformed/null inputs are deliberate injected-port observations permitted by the use-case contracts; they do not mutate repository fixtures.

## Requirement and scenario evidence matrix

Counts use compiled Rules headings as requirements and compiled scenario records; prose bullets/constraints are checked within their parent headings, not counted as separate invented requirements. A scenario can share a requirement-level proof with others. 'Supported' means source behavior supports the condition with suite evidence in that area; it does not claim a separate executed test for each row. 'Review' names the discrepancy above.

| Spec                                      | Requirements | Scenarios | Current-change behavior             | Baseline exceptions |
| ----------------------------------------- | -----------: | --------: | ----------------------------------- | ------------------- |
| core:generate-metadata                    |           11 |        37 | No introduced discrepancy confirmed | CP4; CP5; CP4 / CP5 |
| core:validate-specs                       |           13 |        41 | No introduced discrepancy confirmed | CP1; CP2 / CP3; CP6 |
| core:preview-spec                         |           11 |        32 | No introduced discrepancy confirmed | None confirmed      |
| core:config                               |           30 |       167 | No introduced discrepancy confirmed | CP7                 |
| core:get-persisted-spec-deps              |            7 |        16 | No introduced discrepancy confirmed | None confirmed      |
| core:get-persisted-spec-implementation    |            7 |        16 | No introduced discrepancy confirmed | None confirmed      |
| core:get-persisted-spec-optimizations     |           10 |        29 | No introduced discrepancy confirmed | None confirmed      |
| core:get-persisted-spec-schema            |            7 |        17 | No introduced discrepancy confirmed | None confirmed      |
| core:update-persisted-spec-implementation |           13 |        36 | No introduced discrepancy confirmed | None confirmed      |
| core:update-persisted-spec-optimizations  |           12 |        40 | No introduced discrepancy confirmed | None confirmed      |
| core:update-persisted-spec-schema         |           14 |        32 | No introduced discrepancy confirmed | CP8                 |
| core:spec-metadata                        |           11 |        73 | No introduced discrepancy confirmed | CP4                 |
| core:config-loader                        |           19 |        78 | No introduced discrepancy confirmed | CP7                 |
| core:spec-repository-port                 |           20 |        65 | No introduced discrepancy confirmed | None confirmed      |
| **Total**                                 |      **185** |   **679** |                                     |                     |

### core:generate-metadata

Implementation evidence (under packages/core/src): application/use-cases/generate-spec-metadata.ts.

Test evidence (under packages/core/test): application/use-cases/generate-spec-metadata.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                            | Assessment                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| Input and output                                                       | Review CP4 / CP5                                 |
| Schema resolution                                                      | Review CP4                                       |
| Spec resolution                                                        | Supported by source/area suite; see scope limits |
| Artifact loading and parsing                                           | Supported by source/area suite; see scope limits |
| Metadata extraction                                                    | Supported by source/area suite; see scope limits |
| dependsOn resolution                                                   | Review CP4                                       |
| One consistent lock snapshot or explicit absence                       | Review CP5                                       |
| Fresh lock-owned optimizations only                                    | Supported by source/area suite; see scope limits |
| Content hashes                                                         | Supported by source/area suite; see scope limits |
| Assembled result                                                       | Review CP4                                       |
| Config-based factory delegates through resolveGenerateSpecMetadataDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Schema resolution failure propagates** — Schema resolution. Review CP4 for relevant branch; other branches supported.
2. **Schema has no metadataExtraction** — Schema resolution. Review CP4 for relevant branch; other branches supported.
3. **Unknown workspace** — Spec resolution. Supported at requirement level by the source/suite evidence above.
4. **Spec not found** — Spec resolution. Supported at requirement level by the source/suite evidence above.
5. **Invalid spec ID rejected** — Spec resolution. Supported at requirement level by the source/suite evidence above.
6. **Empty spec ID rejected** — Spec resolution. Supported at requirement level by the source/suite evidence above.
7. **Bare spec ID normalized** — Spec resolution. Supported at requirement level by the source/suite evidence above.
8. **Unknown workspace rejected** — Spec resolution. Supported at requirement level by the source/suite evidence above.
9. **Artifact with unknown parser format skipped** — Artifact loading and parsing. Supported at requirement level by the source/suite evidence above.
10. **Artifact not on disk skipped** — Artifact loading and parsing. Supported at requirement level by the source/suite evidence above.
11. **Fields extracted from valid spec** — Metadata extraction. Supported at requirement level by the source/suite evidence above.
12. **Extraction uses shared transform registry with origin context** — Metadata extraction. Supported at requirement level by the source/suite evidence above.
13. **Extraction awaits async transform resolution** — Metadata extraction. Supported at requirement level by the source/suite evidence above.
14. **Relative spec path resolved during extraction** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
15. **Cross-workspace relative spec path resolves through repository-backed normalization** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
16. **Persisted state overrides omitted extracted dependsOn** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
17. **Mismatched extracted and persisted dependencies fail generation** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
18. **Lock-less spec derives dependsOn as a live projection of current artifacts** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
19. **Unresolvable dependency value fails extraction instead of being omitted** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
20. **Canonical spec ID may pass through resolveSpecPath when enabled by args** — dependsOn resolution. Review CP4 for relevant branch; other branches supported.
21. **Single persisted-state read is reused across all dependent fields** — One consistent lock snapshot or explicit absence. Review CP5 for relevant branch; other branches supported.
22. **Persisted state is not re-read partway through assembly** — One consistent lock snapshot or explicit absence. Review CP5 for relevant branch; other branches supported.
23. **Explicit absence is treated as one consistent observation** — One consistent lock snapshot or explicit absence. Review CP5 for relevant branch; other branches supported.
24. **provenance.persistedStateHash uses persistedStateMeta includeHash or snapshot originalHash** — One consistent lock snapshot or explicit absence. Review CP5 for relevant branch; other branches supported.
25. **Fresh optimization field is projected** — Fresh lock-owned optimizations only. Supported at requirement level by the source/suite evidence above.
26. **Stale optimization field is omitted, not fabricated** — Fresh lock-owned optimizations only. Supported at requirement level by the source/suite evidence above.
27. **Generation never mutates persisted optimization state** — Fresh lock-owned optimizations only. Supported at requirement level by the source/suite evidence above.
28. **Hashes computed for loaded artifacts** — Content hashes. Supported at requirement level by the source/suite evidence above.
29. **Missing artifacts excluded from hashes** — Content hashes. Supported at requirement level by the source/suite evidence above.
30. **Result includes generatedBy marker** — Assembled result. Review CP4 for relevant branch; other branches supported.
31. **Result merges extracted fields and hashes** — Assembled result. Review CP4 for relevant branch; other branches supported.
32. **Result includes fresh optimization fields and provenance** — Assembled result. Review CP4 for relevant branch; other branches supported.
33. **execute accepts specId string** — Input and output. Review CP4 / CP5 for relevant branch; other branches supported.
34. **Returns metadata and hasExtraction flag** — Input and output. Review CP4 / CP5 for relevant branch; other branches supported.
35. **metadata contains extracted fields and hashes** — Input and output. Review CP4 / CP5 for relevant branch; other branches supported.
36. **Result includes a provenance record reflecting the exact call state** — Input and output. Review CP4 / CP5 for relevant branch; other branches supported.
37. **createGenerateSpecMetadata config form derives GenerateSpecMetadataDeps through resolveGenerateSpecMetadataDeps** — Config-based factory delegates through resolveGenerateSpecMetadataDeps. Supported at requirement level by the source/suite evidence above.

### core:validate-specs

Implementation evidence (under packages/core/src): application/use-cases/validate-specs.ts.

Test evidence (under packages/core/test): application/use-cases/validate-specs.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                     | Assessment                                       |
| --------------------------------------------------------------- | ------------------------------------------------ |
| Resolve the active schema                                       | Supported by source/area suite; see scope limits |
| Filter to spec-scoped artifact types                            | Supported by source/area suite; see scope limits |
| Single spec validation mode                                     | Supported by source/area suite; see scope limits |
| Workspace validation mode                                       | Supported by source/area suite; see scope limits |
| All-workspaces validation mode                                  | Supported by source/area suite; see scope limits |
| Per-spec artifact validation                                    | Supported by source/area suite; see scope limits |
| Per-spec cross-artifact validation                              | Supported by source/area suite; see scope limits |
| Aggregated result                                               | Supported by source/area suite; see scope limits |
| Format inference and parser resolution                          | Supported by source/area suite; see scope limits |
| Metadata materialization and validation                         | Review CP2 / CP3                                 |
| Persisted optimization staleness is an independent failure      | Review CP1                                       |
| Transparent validation result cache                             | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveValidateSpecsDeps | Review CP6                                       |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Schema resolution failure propagates** — Resolve the active schema. Supported at requirement level by the source/suite evidence above.
2. **Change-scoped artifacts excluded** — Filter to spec-scoped artifact types. Supported at requirement level by the source/suite evidence above.
3. **Validate a single spec by qualified path** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
4. **Unknown workspace in specPath throws WorkspaceNotFoundError** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
5. **Spec not found throws SpecNotFoundError** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
6. **Invalid specPath rejected** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
7. **Bare specPath resolved to the default workspace** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
8. **Comma in specPath is not split** — Single spec validation mode. Supported at requirement level by the source/suite evidence above.
9. **All specs in workspace validated** — Workspace validation mode. Supported at requirement level by the source/suite evidence above.
10. **Unknown workspace throws WorkspaceNotFoundError** — Workspace validation mode. Supported at requirement level by the source/suite evidence above.
11. **All specs across all workspaces validated** — All-workspaces validation mode. Supported at requirement level by the source/suite evidence above.
12. **Missing required artifact recorded as failure** — Per-spec artifact validation. Supported at requirement level by the source/suite evidence above.
13. **Missing optional artifact skipped silently** — Per-spec artifact validation. Supported at requirement level by the source/suite evidence above.
14. **Artifact with no validation rules skipped** — Per-spec artifact validation. Supported at requirement level by the source/suite evidence above.
15. **Artifact with no local rules is still parsed for cross-artifact validation** — Per-spec artifact validation. Supported at requirement level by the source/suite evidence above.
16. **Validation rules evaluated against parsed AST** — Per-spec artifact validation. Supported at requirement level by the source/suite evidence above.
17. **Cross-artifact mismatch becomes a spec failure** — Per-spec cross-artifact validation. Supported at requirement level by the source/suite evidence above.
18. **Deferred rule is surfaced when a participant is not locally valid** — Per-spec cross-artifact validation. Supported at requirement level by the source/suite evidence above.
19. **ValidateSpecs reuses ValidateArtifacts cross-artifact semantics** — Per-spec cross-artifact validation. Supported at requirement level by the source/suite evidence above.
20. **Counts reflect validation outcomes** — Aggregated result. Supported at requirement level by the source/suite evidence above.
21. **Cross-artifact failures and deferred warnings are aggregated per spec** — Aggregated result. Supported at requirement level by the source/suite evidence above.
22. **Format inferred from filename when not explicit** — Format inference and parser resolution. Supported at requirement level by the source/suite evidence above.
23. **No parser available skips artifact silently** — Format inference and parser resolution. Supported at requirement level by the source/suite evidence above.
24. **Stale persisted metadata is self-healed, not a failure** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
25. **Materialization failure becomes a validation failure** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
26. **Post-materialization dependsOn mismatch becomes a validation failure** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
27. **Extracted dependsOn mismatch becomes a validation failure** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
28. **Persisted dependency projection remains valid without extraction** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
29. **metadata-cache-write-failed is a warning, not a failure** — Metadata materialization and validation. Review CP2 / CP3 for relevant branch; other branches supported.
30. **Stale optimization field fails validation independently** — Persisted optimization staleness is an independent failure. Review CP1 for relevant branch; other branches supported.
31. **Optimization staleness failure is reported even when metadata materialization succeeds** — Persisted optimization staleness is an independent failure. Review CP1 for relevant branch; other branches supported.
32. **No optimizations or only fresh optimizations does not fail this check** — Persisted optimization staleness is an independent failure. Review CP1 for relevant branch; other branches supported.
33. **Hard hit skips full validation work** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
34. **Soft hit is invisible to ValidateSpecs** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
35. **Miss runs full validation and upserts including failures** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
36. **Lock content change forces miss via cacheFingerprint** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
37. **Hosts observe identical public behaviour on hit or miss** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
38. **Workspace discovery lists with includeMeta** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
39. **Warm hard hit does not N×get solely for stamps** — Transparent validation result cache. Supported at requirement level by the source/suite evidence above.
40. **createValidateSpecs config form derives ValidateSpecsDeps through resolveValidateSpecsDeps** — Config-based factory delegates through resolveValidateSpecsDeps. Review CP6 for relevant branch; other branches supported.
41. **resolveValidateSpecsDeps wires one GetSpecMetadata instance per workspace** — Config-based factory delegates through resolveValidateSpecsDeps. Review CP6 for relevant branch; other branches supported.

### core:preview-spec

Implementation evidence (under packages/core/src): application/use-cases/preview-spec.ts.

Test evidence (under packages/core/test): application/use-cases/preview-spec.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                   | Assessment                                       |
| ------------------------------------------------------------- | ------------------------------------------------ |
| Ports and constructor                                         | Supported by source/area suite; see scope limits |
| Input                                                         | Supported by source/area suite; see scope limits |
| Spec ID validation                                            | Supported by source/area suite; see scope limits |
| File discovery via change artifacts                           | Supported by source/area suite; see scope limits |
| Delta application                                             | Supported by source/area suite; see scope limits |
| Artifact file ordering                                        | Supported by source/area suite; see scope limits |
| Diff generation                                               | Supported by source/area suite; see scope limits |
| Result shape                                                  | Supported by source/area suite; see scope limits |
| Error handling                                                | Supported by source/area suite; see scope limits |
| Schema name guard                                             | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolvePreviewSpecDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Constructor receives required dependencies** — Ports and constructor. Supported at requirement level by the source/suite evidence above.
2. **execute receives change name and specId** — Input. Supported at requirement level by the source/suite evidence above.
3. **includeDiff is opt-in** — Input. Supported at requirement level by the source/suite evidence above.
4. **includeDiff enables diff generation** — Input. Supported at requirement level by the source/suite evidence above.
5. **specId not in change throws error** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
6. **Invalid specId rejected before membership check** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
7. **Empty and comma specIds rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
8. **Bare specId normalized then checked against the change** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
9. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
10. **Valid specId outside the change rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
11. **Documented errors** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
12. **Delta files discovered from change artifacts** — File discovery via change artifacts. Supported at requirement level by the source/suite evidence above.
13. **New spec files discovered from change artifacts** — File discovery via change artifacts. Supported at requirement level by the source/suite evidence above.
14. **Delta merged into base spec content** — Delta application. Supported at requirement level by the source/suite evidence above.
15. **No-op delta records status** — Delta application. Supported at requirement level by the source/suite evidence above.
16. **Missing delta file records status** — Delta application. Supported at requirement level by the source/suite evidence above.
17. **All schema artifacts returned** — Delta application. Supported at requirement level by the source/suite evidence above.
18. **spec.md appears first** — Artifact file ordering. Supported at requirement level by the source/suite evidence above.
19. **Remaining files sorted alphabetically** — Artifact file ordering. Supported at requirement level by the source/suite evidence above.
20. **Merged entry includes generated diff** — Diff generation. Supported at requirement level by the source/suite evidence above.
21. **New spec entry uses empty base for diff generation** — Diff generation. Supported at requirement level by the source/suite evidence above.
22. **no-op and missing entries omit diff output** — Diff generation. Supported at requirement level by the source/suite evidence above.
23. **DiffGenerationError produces warning without downgrading merged entry** — Diff generation. Supported at requirement level by the source/suite evidence above.
24. **Base content and status included for delta files** — Result shape. Supported at requirement level by the source/suite evidence above.
25. **Base is null and status is merged for new specs** — Result shape. Supported at requirement level by the source/suite evidence above.
26. **diff field is omitted when diff generation is disabled** — Result shape. Supported at requirement level by the source/suite evidence above.
27. **diff field is present for merged entries when enabled** — Result shape. Supported at requirement level by the source/suite evidence above.
28. **Delta application failure produces warning and missing status** — Error handling. Supported at requirement level by the source/suite evidence above.
29. **Other files still returned on partial failure** — Error handling. Supported at requirement level by the source/suite evidence above.
30. **DiffGenerationError remains a warning-only partial result** — Error handling. Supported at requirement level by the source/suite evidence above.
31. **Schema mismatch throws** — Schema name guard. Supported at requirement level by the source/suite evidence above.
32. **createPreviewSpec config form derives PreviewSpecDeps through resolvePreviewSpecDeps** — Config-based factory delegates through resolvePreviewSpecDeps. Supported at requirement level by the source/suite evidence above.

### core:config

Implementation evidence (under packages/core/src): application/ports/config-schema.ts; infrastructure/fs/config-loader.ts; infrastructure/fs/config-cascade.ts; application/use-cases/\_shared/spec-pattern-matching.ts.

Test evidence (under packages/core/test): infrastructure/fs/config-loader.spec.ts; application/use-cases/compile-context.spec.ts; application/use-cases/\_shared/spec-pattern-matching.spec.ts; code-graph discovery/filter suites (parent general test command used cache). Relevant matching composition factories delegate through resolver helpers.

| Requirement                                               | Assessment                                       |
| --------------------------------------------------------- | ------------------------------------------------ |
| Config file location and format                           | Supported by source/area suite; see scope limits |
| Privacy settings                                          | Supported by source/area suite; see scope limits |
| Environment variable overrides                            | Supported by source/area suite; see scope limits |
| Forced actor provider                                     | Supported by source/area suite; see scope limits |
| Local config override                                     | Supported by source/area suite; see scope limits |
| Cascade identity and removal model                        | Supported by source/area suite; see scope limits |
| Schema reference                                          | Supported by source/area suite; see scope limits |
| Invalidation policy configuration                         | Supported by source/area suite; see scope limits |
| Workspaces                                                | Supported by source/area suite; see scope limits |
| Workspace names and context patterns use the shared rules | Supported by source/area suite; see scope limits |
| Workspace-level graph configuration                       | Supported by source/area suite; see scope limits |
| Project-relative graph path semantics                     | Supported by source/area suite; see scope limits |
| Storage configuration                                     | Supported by source/area suite; see scope limits |
| Named storage adapters                                    | Supported by source/area suite; see scope limits |
| Config path and derived directories                       | Supported by source/area suite; see scope limits |
| Template variables                                        | Supported by source/area suite; see scope limits |
| Schema plugins                                            | Supported by source/area suite; see scope limits |
| Schema overrides                                          | Supported by source/area suite; see scope limits |
| Context spec selection                                    | Supported by source/area suite; see scope limits |
| Context mode                                              | Supported by source/area suite; see scope limits |
| Project context instructions                              | Supported by source/area suite; see scope limits |
| Approvals                                                 | Supported by source/area suite; see scope limits |
| Logging configuration                                     | Supported by source/area suite; see scope limits |
| LLM optimization                                          | Supported by source/area suite; see scope limits |
| Plugin declarations                                       | Review CP7                                       |
| Config writer port                                        | Supported by source/area suite; see scope limits |
| Startup validation                                        | Supported by source/area suite; see scope limits |
| Legacy configuration warnings                             | Supported by source/area suite; see scope limits |
| Project-level graph configuration                         | Supported by source/area suite; see scope limits |
| Graph file size limit                                     | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Discover config walking up to VCS root** — Config file location and format. Supported at requirement level by the source/suite evidence above.
2. **No VCS repo checks only CWD** — Config file location and format. Supported at requirement level by the source/suite evidence above.
3. **Host bootstrap may supply an explicit discovery root** — Config file location and format. Supported at requirement level by the source/suite evidence above.
4. **Mode hash requires salt** — Privacy settings. Supported at requirement level by the source/suite evidence above.
5. **excludeActors defaults applied** — Privacy settings. Supported at requirement level by the source/suite evidence above.
6. **Variable takes precedence over specd.yaml** — Environment variable overrides. Supported at requirement level by the source/suite evidence above.
7. **Selection by name** — Forced actor provider. Supported at requirement level by the source/suite evidence above.
8. **Local standalone file replaces shared config** — Local config override. Supported at requirement level by the source/suite evidence above.
9. **Local file absent** — Local config override. Supported at requirement level by the source/suite evidence above.
10. **Local file joins the cascade when extends is true** — Local config override. Supported at requirement level by the source/suite evidence above.
11. **Local file must be valid when standalone** — Local config override. Supported at requirement level by the source/suite evidence above.
12. **Local named variants apply in filename order** — Local config override. Supported at requirement level by the source/suite evidence above.
13. **Local variant patterns are gitignored** — Local config override. Supported at requirement level by the source/suite evidence above.
14. **Context entry removed by id** — Cascade identity and removal model. Supported at requirement level by the source/suite evidence above.
15. **Plugin entry removed by name identity** — Cascade identity and removal model. Supported at requirement level by the source/suite evidence above.
16. **Workspace removed by name** — Cascade identity and removal model. Supported at requirement level by the source/suite evidence above.
17. **Explicit-base local variant is skipped until its base is active** — Cascade identity and removal model. Supported at requirement level by the source/suite evidence above.
18. **npm package schema** — Schema reference. Supported at requirement level by the source/suite evidence above.
19. **Bare name resolved from default workspace** — Schema reference. Supported at requirement level by the source/suite evidence above.
20. **Hash-prefixed name resolved from default workspace** — Schema reference. Supported at requirement level by the source/suite evidence above.
21. **Workspace-qualified schema reference** — Schema reference. Supported at requirement level by the source/suite evidence above.
22. **Direct path schema** — Schema reference. Supported at requirement level by the source/suite evidence above.
23. **Schema not found** — Schema reference. Supported at requirement level by the source/suite evidence above.
24. **Schema fails validation** — Schema reference. Supported at requirement level by the source/suite evidence above.
25. **Schema field missing** — Schema reference. Supported at requirement level by the source/suite evidence above.
26. **Schema-independent command skips resolution** — Schema reference. Supported at requirement level by the source/suite evidence above.
27. **Root invalidationPolicy accepts the four canonical values** — Invalidation policy configuration. Supported at requirement level by the source/suite evidence above.
28. **Unknown invalidationPolicy is rejected** — Invalidation policy configuration. Supported at requirement level by the source/suite evidence above.
29. **Default workspace only (simple project)** — Workspaces. Supported at requirement level by the source/suite evidence above.
30. **specd init creates default workspace** — Workspaces. Supported at requirement level by the source/suite evidence above.
31. **Non-default workspace resolves outside repo** — Workspaces. Supported at requirement level by the source/suite evidence above.
32. **Non-default workspace with custom schemas path** — Workspaces. Supported at requirement level by the source/suite evidence above.
33. **Workspace-qualified schema with no schemas section declared** — Workspaces. Supported at requirement level by the source/suite evidence above.
34. **Workspace name collision** — Workspaces. Supported at requirement level by the source/suite evidence above.
35. **Missing default workspace** — Workspaces. Supported at requirement level by the source/suite evidence above.
36. **Missing codeRoot in non-default workspace** — Workspaces. Supported at requirement level by the source/suite evidence above.
37. **Allowed paths constrain workspace indexing** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
38. **excludePaths replaces built-in defaults** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
39. **graph block absent — no field on workspace config** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
40. **respectGitignore defaults to true** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
41. **respectGitignore set to false** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
42. **Workspace testPaths and ignorePaths configured** — Workspace-level graph configuration. Supported at requirement level by the source/suite evidence above.
43. **Anchored workspace pattern is written against the project root** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
44. **Coderoot-relative form no longer matches** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
45. **Same pattern means the same file in global and workspace discovery** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
46. **Unanchored patterns keep matching at any depth** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
47. **Workspace testPaths and ignorePaths are project-relative** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
48. **allowedPaths are project-relative globs** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
49. **Global exclusion cannot be re-included by a workspace negation** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
50. **Workspace negation only reverses earlier workspace patterns** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
51. **Nested workspaces and the same project-relative pattern** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
52. **Code root outside the project root** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
53. **gitignore keeps absolute priority** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
54. **No migration of earlier semantics** — Project-relative graph path semantics. Supported at requirement level by the source/suite evidence above.
55. **Project graph include paths discovered** — Project-level graph configuration. Supported at requirement level by the source/suite evidence above.
56. **Project graph exclude paths discovered** — Project-level graph configuration. Supported at requirement level by the source/suite evidence above.
57. **Project testPaths and ignorePaths configured** — Project-level graph configuration. Supported at requirement level by the source/suite evidence above.
58. **Project testPaths omitted defaults applied** — Project-level graph configuration. Supported at requirement level by the source/suite evidence above.
59. **Project-level size fields are accepted** — Project-level graph configuration. Supported at requirement level by the source/suite evidence above.
60. **An omitted limit is absent in the configuration** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
61. **Zero is accepted** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
62. **A negative limit is rejected** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
63. **A fractional limit is rejected** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
64. **A non-number limit is rejected** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
65. **A workspace value replaces the project value** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
66. **Exemptions are combined** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
67. **Negation within the list is supported** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
68. **Unknown graph keys are still rejected** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
69. **Layers merge scalars and append arrays** — Graph file size limit. Supported at requirement level by the source/suite evidence above.
70. **Storage layout uses generic adapter bindings** — Storage configuration. Supported at requirement level by the source/suite evidence above.
71. **Legacy storage layout is normalized at load time** — Storage configuration. Supported at requirement level by the source/suite evidence above.
72. **Omitted storage section resolves to standard fs defaults** — Storage configuration. Supported at requirement level by the source/suite evidence above.
73. **Workspace selects a registered named adapter** — Named storage adapters. Supported at requirement level by the source/suite evidence above.
74. **Workspace selects an unknown adapter** — Named storage adapters. Supported at requirement level by the source/suite evidence above.
75. **specdPath defaults to repo-local .specd directory** — Config path and derived directories. Supported at requirement level by the source/suite evidence above.
76. **Explicit specdPath stays project-level** — Config path and derived directories. Supported at requirement level by the source/suite evidence above.
77. **configPath also defines change-locks directory** — Config path and derived directories. Supported at requirement level by the source/suite evidence above.
78. **Missing directories throw StorageDirectoryNotFoundError** — Config path and derived directories. Supported at requirement level by the source/suite evidence above.
79. **Archive pattern with year prefix** — Template variables. Supported at requirement level by the source/suite evidence above.
80. **Unknown template variable emits warning** — Template variables. Supported at requirement level by the source/suite evidence above.
81. **Unknown variable without callback is silent** — Template variables. Supported at requirement level by the source/suite evidence above.
82. **Plugin resolved and applied** — Schema plugins. Supported at requirement level by the source/suite evidence above.
83. **Plugin reference not found** — Schema plugins. Supported at requirement level by the source/suite evidence above.
84. **Plugin reference points to a full schema** — Schema plugins. Supported at requirement level by the source/suite evidence above.
85. **Override appends rules to an artifact** — Schema overrides. Supported at requirement level by the source/suite evidence above.
86. **Override removes a workflow hook** — Schema overrides. Supported at requirement level by the source/suite evidence above.
87. **Invalid override structure rejected at startup** — Schema overrides. Supported at requirement level by the source/suite evidence above.
88. **Flag absent — deterministic mode** — LLM optimization. Supported at requirement level by the source/suite evidence above.
89. **Flag false — deterministic mode** — LLM optimization. Supported at requirement level by the source/suite evidence above.
90. **Flag true — LLM mode** — LLM optimization. Supported at requirement level by the source/suite evidence above.
91. **Non-boolean value — startup error** — LLM optimization. Supported at requirement level by the source/suite evidence above.
92. **Plugins section with agents array** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
93. **Agent plugin entry** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
94. **Invalid plugin structure rejected at startup** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
95. **ConfigWriter.addPlugin adds to array** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
96. **ConfigWriter.addPlugin with config** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
97. **ConfigWriter.removePlugin removes from array** — Plugin declarations. Review CP7 for relevant branch; other branches supported.
98. **Project-level patterns always apply** — Context spec selection. Supported at requirement level by the source/suite evidence above.
99. **Workspace-level patterns only apply when workspace is active** — Context spec selection. Supported at requirement level by the source/suite evidence above.
100. **Workspace-level patterns apply when workspace is active** — Context spec selection. Supported at requirement level by the source/suite evidence above.
101. **Qualifier omitted at workspace level resolves to that workspace** — Context spec selection. Supported at requirement level by the source/suite evidence above.
102. **Default project-level include is all default workspace specs** — Context spec selection. Supported at requirement level by the source/suite evidence above.
103. **Default workspace-level include is all specs in that workspace** — Context spec selection. Supported at requirement level by the source/suite evidence above.
104. **Resolution order — project includes, project excludes, workspace includes, workspace excludes** — Context spec selection. Supported at requirement level by the source/suite evidence above.
105. **Project-level exclude applied before workspace-level includes** — Context spec selection. Supported at requirement level by the source/suite evidence above.
106. **Project-level exclude always applied regardless of active workspace** — Context spec selection. Supported at requirement level by the source/suite evidence above.
107. **Workspace declaration order determines workspace-level priority** — Context spec selection. Supported at requirement level by the source/suite evidence above.
108. **Spec matched by multiple patterns appears once** — Context spec selection. Supported at requirement level by the source/suite evidence above.
109. **Workspace-level exclude only applied when workspace is active** — Context spec selection. Supported at requirement level by the source/suite evidence above.
110. **Workspace-level exclude qualifier resolves to that workspace** — Context spec selection. Supported at requirement level by the source/suite evidence above.
111. **Direct include path selects only that spec** — Context spec selection. Supported at requirement level by the source/suite evidence above.
112. **Direct exclude path removes only that spec** — Context spec selection. Supported at requirement level by the source/suite evidence above.
113. **Non-existent spec ID silently skipped at compile time** — Context spec selection. Supported at requirement level by the source/suite evidence above.
114. **Unmatched pattern warns in config validate** — Context spec selection. Supported at requirement level by the source/suite evidence above.
115. **Unknown workspace qualifier warns at runtime** — Context spec selection. Supported at requirement level by the source/suite evidence above.
116. **Unknown workspace qualifier fails config validate** — Context spec selection. Supported at requirement level by the source/suite evidence above.
117. **Workspace becomes active from change metadata** — Context spec selection. Supported at requirement level by the source/suite evidence above.
118. **Workspace not active when absent from change metadata** — Context spec selection. Supported at requirement level by the source/suite evidence above.
119. **Invalid pattern syntax is a startup error** — Context spec selection. Supported at requirement level by the source/suite evidence above.
120. **contextMode summary is the default** — Context mode. Supported at requirement level by the source/suite evidence above.
121. **contextMode list is accepted** — Context mode. Supported at requirement level by the source/suite evidence above.
122. **contextMode summary is accepted** — Context mode. Supported at requirement level by the source/suite evidence above.
123. **contextMode full is accepted** — Context mode. Supported at requirement level by the source/suite evidence above.
124. **contextMode hybrid is accepted** — Context mode. Supported at requirement level by the source/suite evidence above.
125. **legacy lazy value is rejected** — Context mode. Supported at requirement level by the source/suite evidence above.
126. **contextMode inside workspace is rejected** — Context mode. Supported at requirement level by the source/suite evidence above.
127. **Valid minimal config passes validation** — Startup validation. Supported at requirement level by the source/suite evidence above.
128. **Invalid contextMode value rejected** — Startup validation. Supported at requirement level by the source/suite evidence above.
129. **Legacy lazy contextMode rejected** — Startup validation. Supported at requirement level by the source/suite evidence above.
130. **contextMode in workspace entry rejected with specific message** — Startup validation. Supported at requirement level by the source/suite evidence above.
131. **artifactRules rejected at startup** — Startup validation. Supported at requirement level by the source/suite evidence above.
132. **skills field rejected at startup** — Startup validation. Supported at requirement level by the source/suite evidence above.
133. **Invalid level string** — Startup validation. Supported at requirement level by the source/suite evidence above.
134. **remove without extends is rejected** — Startup validation. Supported at requirement level by the source/suite evidence above.
135. **Invalid extends value is rejected** — Startup validation. Supported at requirement level by the source/suite evidence above.
136. **Required root field cannot be removed** — Startup validation. Supported at requirement level by the source/suite evidence above.
137. **Unknown workspace removal target is rejected** — Startup validation. Supported at requirement level by the source/suite evidence above.
138. **Explicit extends outside the active chain is skipped** — Startup validation. Supported at requirement level by the source/suite evidence above.
139. **No VCS repo — containment check skipped** — Startup validation. Supported at requirement level by the source/suite evidence above.
140. **Legacy config format emits warnings** — Legacy configuration warnings. Supported at requirement level by the source/suite evidence above.
141. **Omitted storage defaults do not emit legacy configuration warnings** — Legacy configuration warnings. Supported at requirement level by the source/suite evidence above.
142. **Warning-bearing config remains non-fatal** — Legacy configuration warnings. Supported at requirement level by the source/suite evidence above.
143. **Hosts can consume warnings from resolved config** — Legacy configuration warnings. Supported at requirement level by the source/suite evidence above.
144. **Context entries injected before spec content** — Project context instructions. Supported at requirement level by the source/suite evidence above.
145. **File reference is read and injected verbatim** — Project context instructions. Supported at requirement level by the source/suite evidence above.
146. **Context entry id is accepted for inherited removal** — Project context instructions. Supported at requirement level by the source/suite evidence above.
147. **Missing file emits a warning** — Project context instructions. Supported at requirement level by the source/suite evidence above.
148. **context absent — no effect** — Project context instructions. Supported at requirement level by the source/suite evidence above.
149. **Mixed inline and file entries preserve declaration order** — Project context instructions. Supported at requirement level by the source/suite evidence above.
150. **File path resolved relative to specd.yaml directory** — Project context instructions. Supported at requirement level by the source/suite evidence above.
151. **Absolute file path accepted** — Project context instructions. Supported at requirement level by the source/suite evidence above.
152. **Section present with all fields** — Logging configuration. Supported at requirement level by the source/suite evidence above.
153. **Section absent — defaults applied** — Logging configuration. Supported at requirement level by the source/suite evidence above.
154. **Spec approval gate disabled by default** — Approvals. Supported at requirement level by the source/suite evidence above.
155. **Signoff gate disabled by default** — Approvals. Supported at requirement level by the source/suite evidence above.
156. **Spec approval gate enabled** — Approvals. Supported at requirement level by the source/suite evidence above.
157. **Signoff approval gate enabled** — Approvals. Supported at requirement level by the source/suite evidence above.
158. **ConfigWriter port defines initProject method** — Config writer port. Supported at requirement level by the source/suite evidence above.
159. **ConfigWriter port defines addPlugin method** — Config writer port. Supported at requirement level by the source/suite evidence above.
160. **ConfigWriter port defines removePlugin method** — Config writer port. Supported at requirement level by the source/suite evidence above.
161. **ConfigWriter port defines listPlugins method** — Config writer port. Supported at requirement level by the source/suite evidence above.
162. **Workspace name with one character rejected** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.
163. **Qualifier-less pattern keeps its contextual workspace** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.
164. **Unknown workspace in a pattern stays a warning** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.
165. **Programmatic malformed pattern fails loudly** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.
166. **Context compilation supplies the contextual default** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.
167. **Prefix segment violating the rule rejected** — Workspace names and context patterns use the shared rules. Supported at requirement level by the source/suite evidence above.

### core:get-persisted-spec-deps

Implementation evidence (under packages/core/src): application/use-cases/get-persisted-spec-deps.ts.

Test evidence (under packages/core/test): application/use-cases/get-persisted-spec-deps.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                            | Assessment                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                         | Supported by source/area suite; see scope limits |
| Spec ID validation                                                     | Supported by source/area suite; see scope limits |
| Reads persisted state through the repository port                      | Supported by source/area suite; see scope limits |
| Result contract for an initialized spec                                | Supported by source/area suite; see scope limits |
| Result contract for a spec with no persisted state                     | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                  | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveGetPersistedSpecDepsDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **specId is required** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **The query never reads spec-lock.json or metadata directly** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
3. **Unresolvable spec throws SpecNotFoundError** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
4. **Only readPersistedState reads persisted data** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
5. **Reading creates no state** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
6. **Factory derives deps from the resolver** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
7. **Stored order and duplicates are returned unchanged** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
8. **Stored order is preserved without reordering or deduplication** — Result contract for an initialized spec. Supported at requirement level by the source/suite evidence above.
9. **Uninitialized spec returns an empty list without creating state** — Result contract for a spec with no persisted state. Supported at requirement level by the source/suite evidence above.
10. **Unresolvable spec identity throws instead of returning an empty result** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
11. **Config-based factory resolves one repository per workspace via the shared helper** — Config-based factory delegates through resolveGetPersistedSpecDepsDeps. Supported at requirement level by the source/suite evidence above.
12. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
13. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
14. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
15. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
16. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:get-persisted-spec-implementation

Implementation evidence (under packages/core/src): application/use-cases/get-persisted-spec-implementation.ts.

Test evidence (under packages/core/test): application/use-cases/get-persisted-spec-implementation.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                                      | Assessment                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                                   | Supported by source/area suite; see scope limits |
| Spec ID validation                                                               | Supported by source/area suite; see scope limits |
| Reads persisted state through the repository port                                | Supported by source/area suite; see scope limits |
| Result contract for an initialized spec                                          | Supported by source/area suite; see scope limits |
| Result contract for a spec with no persisted state                               | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                            | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveGetPersistedSpecImplementationDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **specId is required** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **The query never reads spec-lock.json or materializes metadata** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
3. **Unresolvable spec throws SpecNotFoundError** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
4. **Only readPersistedState reads persisted data** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
5. **Reading creates no state** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
6. **Factory derives deps from the resolver** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
7. **File-level and symbol-level entries are distinguished and ordered** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
8. **File-level and symbol-level links are distinguished unchanged from storage** — Result contract for an initialized spec. Supported at requirement level by the source/suite evidence above.
9. **Uninitialized spec returns an empty list without creating state** — Result contract for a spec with no persisted state. Supported at requirement level by the source/suite evidence above.
10. **Unresolvable spec identity throws SpecNotFoundError** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
11. **Config-based factory resolves one repository per workspace via the shared helper** — Config-based factory delegates through resolveGetPersistedSpecImplementationDeps. Supported at requirement level by the source/suite evidence above.
12. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
13. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
14. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
15. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
16. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:get-persisted-spec-optimizations

Implementation evidence (under packages/core/src): application/use-cases/get-persisted-spec-optimizations.ts.

Test evidence (under packages/core/test): application/use-cases/get-persisted-spec-optimizations.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                                     | Assessment                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                                  | Supported by source/area suite; see scope limits |
| Spec ID validation                                                              | Supported by source/area suite; see scope limits |
| Reads persisted state through the repository port                               | Supported by source/area suite; see scope limits |
| Result contract for a spec with no persisted state                              | Supported by source/area suite; see scope limits |
| Result contract for an initialized spec with no optimizations                   | Supported by source/area suite; see scope limits |
| Per-field freshness computation                                                 | Supported by source/area suite; see scope limits |
| Field result shape                                                              | Supported by source/area suite; see scope limits |
| Aggregate freshness                                                             | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                           | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveGetPersistedSpecOptimizationsDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Field filter restricts the result to a single field** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **Omitting field returns every present optimization field** — Input contract. Supported at requirement level by the source/suite evidence above.
3. **Query never materializes or reads generated metadata** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
4. **Missing field has the explicit missing shape** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
5. **Filter with both fields present** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
6. **Multiple reasons are ordered** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
7. **Unknown spec throws SpecNotFoundError** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
8. **Generated metadata is never read** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
9. **Factory derives deps from the resolver** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
10. **Uninitialized spec returns initialized false without throwing** — Result contract for a spec with no persisted state. Supported at requirement level by the source/suite evidence above.
11. **Initialized spec with no optimizations block returns an empty result** — Result contract for an initialized spec with no optimizations. Supported at requirement level by the source/suite evidence above.
12. **Requested field absent from persisted optimizations is reported as missing** — Result contract for an initialized spec with no optimizations. Supported at requirement level by the source/suite evidence above.
13. **Artifact added since baseline marks the field stale** — Per-field freshness computation. Supported at requirement level by the source/suite evidence above.
14. **Artifact removed since baseline marks the field stale** — Per-field freshness computation. Supported at requirement level by the source/suite evidence above.
15. **Changed content hash marks the field stale** — Per-field freshness computation. Supported at requirement level by the source/suite evidence above.
16. **lastModified-only difference is diagnostic and does not affect freshness** — Per-field freshness computation. Supported at requirement level by the source/suite evidence above.
17. **Schema change marks the field stale even when every artifact hash matches** — Per-field freshness computation. Supported at requirement level by the source/suite evidence above.
18. **Stale field reports value, freshness, and an ordered reasons list** — Field result shape. Supported at requirement level by the source/suite evidence above.
19. **Fresh field has an empty reasons list** — Field result shape. Supported at requirement level by the source/suite evidence above.
20. **Aggregate is fresh only when every present field is fresh** — Aggregate freshness. Supported at requirement level by the source/suite evidence above.
21. **Aggregate reflects only the requested field when filtered** — Aggregate freshness. Supported at requirement level by the source/suite evidence above.
22. **No optimization fields present yields aggregate fresh false** — Aggregate freshness. Supported at requirement level by the source/suite evidence above.
23. **Unresolvable spec identity throws SpecNotFoundError** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
24. **createGetPersistedSpecOptimizations config form derives deps through the resolver** — Config-based factory delegates through resolveGetPersistedSpecOptimizationsDeps. Supported at requirement level by the source/suite evidence above.
25. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
26. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
27. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
28. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
29. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:get-persisted-spec-schema

Implementation evidence (under packages/core/src): application/use-cases/get-persisted-spec-schema.ts.

Test evidence (under packages/core/test): application/use-cases/get-persisted-spec-schema.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                              | Assessment                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| Input contract                                                           | Supported by source/area suite; see scope limits |
| Spec ID validation                                                       | Supported by source/area suite; see scope limits |
| Reads persisted state through the repository port                        | Supported by source/area suite; see scope limits |
| Requires an initialized spec                                             | Supported by source/area suite; see scope limits |
| Result contract                                                          | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                    | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveGetPersistedSpecSchemaDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **specId is the only input consulted** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **Query never reads spec-lock.json directly or materializes metadata** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
3. **Unresolvable spec throws SpecNotFoundError** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
4. **Only readPersistedState reads persisted data** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
5. **Reading creates no state** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
6. **Factory derives deps from the resolver** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
7. **Unknown spec fails before the initialization check** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
8. **Persisted schema identity is returned exactly** — Reads persisted state through the repository port. Supported at requirement level by the source/suite evidence above.
9. **Uninitialized spec throws SpecNotInitializedError** — Requires an initialized spec. Supported at requirement level by the source/suite evidence above.
10. **Result returns the exact persisted schema identity** — Result contract. Supported at requirement level by the source/suite evidence above.
11. **Unknown spec throws SpecNotFoundError before the initialization check** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
12. **createGetPersistedSpecSchema config form derives deps through the resolver** — Config-based factory delegates through resolveGetPersistedSpecSchemaDeps. Supported at requirement level by the source/suite evidence above.
13. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
14. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
15. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
16. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
17. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:update-persisted-spec-implementation

Implementation evidence (under packages/core/src): application/use-cases/update-persisted-spec-implementation.ts.

Test evidence (under packages/core/test): application/use-cases/update-persisted-spec-implementation.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                                         | Assessment                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                                      | Supported by source/area suite; see scope limits |
| Spec ID validation                                                                  | Supported by source/area suite; see scope limits |
| File must exist for add                                                             | Supported by source/area suite; see scope limits |
| Canonical file identity and workspace confinement                                   | Supported by source/area suite; see scope limits |
| Add creates or enriches a canonical link                                            | Supported by source/area suite; see scope limits |
| Remove removes canonical links                                                      | Supported by source/area suite; see scope limits |
| Add creates missing persisted state                                                 | Supported by source/area suite; see scope limits |
| Remove against missing state is a no-op                                             | Supported by source/area suite; see scope limits |
| Applying the mutation through the shared patch helper                               | Supported by source/area suite; see scope limits |
| Conflict handling                                                                   | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                               | Supported by source/area suite; see scope limits |
| Result contract                                                                     | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveUpdatePersistedSpecImplementationDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **action must be add or remove** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **Adding a link for a non-existent file fails without mutating state** — File must exist for add. Supported at requirement level by the source/suite evidence above.
3. **Path outside the workspace codeRoot fails instead of being coerced** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
4. **Nested path is normalized to a forward-slash canonical identity** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
5. **Absolute path outside the codeRoot rejected** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
6. **Parent traversal rejected** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
7. **Sibling directory sharing the codeRoot prefix rejected** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
8. **Qualified path leaving the codeRoot rejected** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
9. **Qualified path naming another workspace rejected** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
10. **Windows drive path is not a workspace qualifier** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
11. **Nested path is stored forward-slashed** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
12. **Add symbols to a file-level link keeps the file-level entry** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
13. **Add without symbols keeps symbol entries** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
14. **Remove symbols, last symbol, and whole entry** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
15. **Add against missing state creates it from the resolved base** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
16. **Remove against missing state is a no-op** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
17. **Expected revision and conflict** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
18. **Unknown spec and readOnly workspace** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
19. **Factory resolves collaborators** — Canonical file identity and workspace confinement. Supported at requirement level by the source/suite evidence above.
20. **Adding symbols to an existing file-level link preserves previously recorded symbols** — Add creates or enriches a canonical link. Supported at requirement level by the source/suite evidence above.
21. **Adding without symbols does not alter existing symbol-level entries** — Add creates or enriches a canonical link. Supported at requirement level by the source/suite evidence above.
22. **Removing specific symbols leaves other symbols intact** — Remove removes canonical links. Supported at requirement level by the source/suite evidence above.
23. **Removing the last symbol may remove the entry entirely when no separate file-level link exists** — Remove removes canonical links. Supported at requirement level by the source/suite evidence above.
24. **Removing without symbols removes the whole entry including symbol refinements** — Remove removes canonical links. Supported at requirement level by the source/suite evidence above.
25. **add against a lock-less spec derives an initial base with empty implementation** — Add creates missing persisted state. Supported at requirement level by the source/suite evidence above.
26. **remove against a lock-less spec does not create state** — Remove against missing state is a no-op. Supported at requirement level by the source/suite evidence above.
27. **Only the computed implementation array is patched** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
28. **Stale expectedRevision produces ArtifactConflictError without retry** — Conflict handling. Supported at requirement level by the source/suite evidence above.
29. **Unresolvable spec identity throws SpecNotFoundError** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
30. **created is true only when persisted state was newly created** — Result contract. Supported at requirement level by the source/suite evidence above.
31. **Config-based factory resolves the file reader, workspace lookup, and initializePersistedSpecState collaborator** — Config-based factory delegates through resolveUpdatePersistedSpecImplementationDeps. Supported at requirement level by the source/suite evidence above.
32. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
33. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
34. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
35. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
36. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:update-persisted-spec-optimizations

Implementation evidence (under packages/core/src): application/use-cases/update-persisted-spec-optimizations.ts.

Test evidence (under packages/core/test): application/use-cases/update-persisted-spec-optimizations.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                                        | Assessment                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                                     | Supported by source/area suite; see scope limits |
| Spec ID validation                                                                 | Supported by source/area suite; see scope limits |
| Mutual exclusivity and minimum operation                                           | Supported by source/area suite; see scope limits |
| Set captures a fresh baseline per changed field                                    | Supported by source/area suite; see scope limits |
| Set creates missing persisted state                                                | Supported by source/area suite; see scope limits |
| Clear removes selected fields                                                      | Supported by source/area suite; see scope limits |
| Clear against missing persisted state is a no-op                                   | Supported by source/area suite; see scope limits |
| Applying the mutation through the shared patch helper                              | Supported by source/area suite; see scope limits |
| Conflict handling                                                                  | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                              | Supported by source/area suite; see scope limits |
| Result contract                                                                    | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveUpdatePersistedSpecOptimizationsDeps | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Set with a single field updates only that field** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **Clear with multiple field names removes every listed field** — Input contract. Supported at requirement level by the source/suite evidence above.
3. **Strict input validation rejects malformed untyped set payloads before I/O** — Input contract. Supported at requirement level by the source/suite evidence above.
4. **Strict input validation rejects malformed untyped clear payloads before I/O** — Input contract. Supported at requirement level by the source/suite evidence above.
5. **Providing both set and clear throws InvalidInputError** — Mutual exclusivity and minimum operation. Supported at requirement level by the source/suite evidence above.
6. **Neither set nor clear throws InvalidInputError** — Mutual exclusivity and minimum operation. Supported at requirement level by the source/suite evidence above.
7. **Empty set object throws InvalidInputError** — Mutual exclusivity and minimum operation. Supported at requirement level by the source/suite evidence above.
8. **Empty clear array throws InvalidInputError** — Mutual exclusivity and minimum operation. Supported at requirement level by the source/suite evidence above.
9. **Changed field receives a freshly captured artifactState baseline** — Set captures a fresh baseline per changed field. Supported at requirement level by the source/suite evidence above.
10. **Unchanged field retains its previous value and baseline** — Set captures a fresh baseline per changed field. Supported at requirement level by the source/suite evidence above.
11. **Recorded schema uses the current persisted schema when state already exists** — Set captures a fresh baseline per changed field. Supported at requirement level by the source/suite evidence above.
12. **Recorded schema uses the effective project schema when creating state** — Set captures a fresh baseline per changed field. Supported at requirement level by the source/suite evidence above.
13. **First set call creates persisted state via resolveInitialPersistedDependsOn** — Set creates missing persisted state. Supported at requirement level by the source/suite evidence above.
14. **Clearing an existing field removes only that field from the written state** — Clear removes selected fields. Supported at requirement level by the source/suite evidence above.
15. **Clearing an already-absent field preserves the written state** — Clear removes selected fields. Supported at requirement level by the source/suite evidence above.
16. **Clearing the last remaining field omits the optimization block from the written state** — Clear removes selected fields. Supported at requirement level by the source/suite evidence above.
17. **Repository round trip preserves partial and final clear removals** — Clear removes selected fields. Supported at requirement level by the source/suite evidence above.
18. **Clear on an uninitialized spec never creates persisted state** — Clear against missing persisted state is a no-op. Supported at requirement level by the source/suite evidence above.
19. **Write uses the observed originalHash as expectedRevision** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
20. **Write uses a null expectedRevision when creating state** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
21. **Missing specId is an input-shape error** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
22. **Empty specId is a spec ID error, not an input-shape error** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
23. **Strict input matrix** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
24. **Set captures a fresh baseline per changed field** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
25. **Created state records the effective project schema** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
26. **Conflict, unknown spec, and readOnly** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
27. **Result flags and omitted block** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
28. **Real repository round trip** — Applying the mutation through the shared patch helper. Supported at requirement level by the source/suite evidence above.
29. **Revision mismatch at write time propagates ArtifactConflictError** — Conflict handling. Supported at requirement level by the source/suite evidence above.
30. **Unresolvable spec identity throws SpecNotFoundError** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
31. **Result reports created true only when state was newly created** — Result contract. Supported at requirement level by the source/suite evidence above.
32. **Result reports created false for an already-initialized spec** — Result contract. Supported at requirement level by the source/suite evidence above.
33. **Result omits optimizations when none remain after a clear** — Result contract. Supported at requirement level by the source/suite evidence above.
34. **Config factory derives exact dependencies through the resolver** — Config-based factory delegates through resolveUpdatePersistedSpecOptimizationsDeps. Supported at requirement level by the source/suite evidence above.
35. **Initial state creation remains behind the shared service** — Config-based factory delegates through resolveUpdatePersistedSpecOptimizationsDeps. Supported at requirement level by the source/suite evidence above.
36. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
37. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
38. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
39. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
40. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:update-persisted-spec-schema

Implementation evidence (under packages/core/src): application/use-cases/update-persisted-spec-schema.ts.

Test evidence (under packages/core/test): application/use-cases/update-persisted-spec-schema.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                                   | Assessment                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| Input contract                                                                | Supported by source/area suite; see scope limits |
| Spec ID validation                                                            | Supported by source/area suite; see scope limits |
| Requires an existing lock; never creates one                                  | Supported by source/area suite; see scope limits |
| Unknown spec fails with a typed error                                         | Supported by source/area suite; see scope limits |
| Resolving the target schema                                                   | Supported by source/area suite; see scope limits |
| Loading and parsing declared artifacts under the target schema                | Review CP8                                       |
| Selecting the already-persisted schema is a no-op                             | Supported by source/area suite; see scope limits |
| Dependency compatibility when the target schema does not extract dependencies | Supported by source/area suite; see scope limits |
| Dependency compatibility when the target schema extracts dependencies         | Supported by source/area suite; see scope limits |
| Implementation and optimization values are preserved verbatim                 | Supported by source/area suite; see scope limits |
| Constructing and writing the reassigned state                                 | Supported by source/area suite; see scope limits |
| Conflict handling                                                             | Supported by source/area suite; see scope limits |
| Result contract                                                               | Supported by source/area suite; see scope limits |
| Config-based factory delegates through resolveUpdatePersistedSpecSchemaDeps   | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **schemaRef is always explicit, unlike initialization** — Input contract. Supported at requirement level by the source/suite evidence above.
2. **Uninitialized spec throws SpecNotInitializedError** — Requires an existing lock; never creates one. Supported at requirement level by the source/suite evidence above.
3. **Never delegates to InitializePersistedSpecState or initial-base construction** — Requires an existing lock; never creates one. Supported at requirement level by the source/suite evidence above.
4. **Unknown spec throws SpecNotFoundError before the initialization check** — Unknown spec fails with a typed error. Supported at requirement level by the source/suite evidence above.
5. **Target schema is resolved in ref mode without project overrides** — Resolving the target schema. Supported at requirement level by the source/suite evidence above.
6. **Parse failure under the target schema aborts without mutation** — Loading and parsing declared artifacts under the target schema. Review CP8 for relevant branch; other branches supported.
7. **Target schema equals the currently persisted schema** — Selecting the already-persisted schema is a no-op. Supported at requirement level by the source/suite evidence above.
8. **Current dependsOn is preserved unchanged** — Dependency compatibility when the target schema does not extract dependencies. Supported at requirement level by the source/suite evidence above.
9. **Extracted dependencies equal to the current list allow reassignment to proceed** — Dependency compatibility when the target schema extracts dependencies. Supported at requirement level by the source/suite evidence above.
10. **Extracted dependencies differing from the current list throw a conflict error** — Dependency compatibility when the target schema extracts dependencies. Supported at requirement level by the source/suite evidence above.
11. **Implementation links and optimizations survive reassignment unchanged** — Implementation and optimization values are preserved verbatim. Supported at requirement level by the source/suite evidence above.
12. **A successful reassignment makes existing optimizations stale via freshness computation, not special-casing** — Implementation and optimization values are preserved verbatim. Supported at requirement level by the source/suite evidence above.
13. **Complete state is constructed directly, bypassing applyPersistedSpecStatePatch for the schema field** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
14. **Write uses the originalHash observed by the initial read as expectedRevision** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
15. **Reassignment succeeds and preserves other state** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
16. **Same schema is a no-op** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
17. **Target schema resolved in ref mode** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
18. **Parse failure aborts without mutation, even without dependency extraction** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
19. **Dependencies preserved when the target does not extract them** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
20. **Extracted dependencies equal the current ones** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
21. **Extracted dependencies differ** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
22. **Optimizations become stale after reassignment** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
23. **Revision, conflict, unknown spec, and readOnly** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
24. **Factory resolves collaborators** — Constructing and writing the reassigned state. Supported at requirement level by the source/suite evidence above.
25. **Revision mismatch at write time propagates ArtifactConflictError** — Conflict handling. Supported at requirement level by the source/suite evidence above.
26. **Successful reassignment reports changed true with the new schema and dependsOn** — Result contract. Supported at requirement level by the source/suite evidence above.
27. **createUpdatePersistedSpecSchema config form derives deps through the resolver** — Config-based factory delegates through resolveUpdatePersistedSpecSchemaDeps. Supported at requirement level by the source/suite evidence above.
28. **Empty spec ID rejected before any repository access** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
29. **Malformed spec ID rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
30. **Unknown workspace rejected** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
31. **Bare spec ID resolved to the default workspace** — Spec ID validation. Supported at requirement level by the source/suite evidence above.
32. **Qualified spec ID accepted unchanged** — Spec ID validation. Supported at requirement level by the source/suite evidence above.

### core:spec-metadata

Implementation evidence (under packages/core/src): domain/services/parse-metadata.ts; application/use-cases/generate-spec-metadata.ts; application/use-cases/materialize-spec-metadata.ts; application/use-cases/persist-spec-metadata.ts; infrastructure/fs/spec-repository.ts.

Test evidence (under packages/core/test): domain/services/parse-metadata.spec.ts; application/use-cases/generate-spec-metadata.spec.ts; application/use-cases/materialize-spec-metadata.spec.ts; application/use-cases/archive-change.spec.ts; infrastructure/fs/spec-repository.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                 | Assessment                                       |
| ------------------------------------------- | ------------------------------------------------ |
| File location and naming                    | Supported by source/area suite; see scope limits |
| Sidecar separation                          | Supported by source/area suite; see scope limits |
| Spec.generatedMetadataStamp is a stamp only | Supported by source/area suite; see scope limits |
| File format                                 | Supported by source/area suite; see scope limits |
| Source provenance                           | Review CP5                                       |
| Structural validation before persistence    | Supported by source/area suite; see scope limits |
| Deterministic generation at archive time    | Supported by source/area suite; see scope limits |
| Freshness assessment is application-owned   | Supported by source/area suite; see scope limits |
| Use by CompileContext                       | Supported by source/area suite; see scope limits |
| Version control                             | Supported by source/area suite; see scope limits |
| Implementation projection                   | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Metadata file present** — File location and naming. Supported at requirement level by the source/suite evidence above.
2. **Metadata file absent** — File location and naming. Supported at requirement level by the source/suite evidence above.
3. **Workspace without prefix stores metadata correctly** — File location and naming. Supported at requirement level by the source/suite evidence above.
4. **Workspace with prefix stores metadata correctly** — File location and naming. Supported at requirement level by the source/suite evidence above.
5. **Explicit metadataPath in workspace config** — File location and naming. Supported at requirement level by the source/suite evidence above.
6. **Auto-derived metadataPath from VCS root** — File location and naming. Supported at requirement level by the source/suite evidence above.
7. **NullVcsAdapter fallback for metadataPath** — File location and naming. Supported at requirement level by the source/suite evidence above.
8. **Valid metadata file with all fields** — File format. Supported at requirement level by the source/suite evidence above.
9. **Title absent — fallback to path** — File format. Supported at requirement level by the source/suite evidence above.
10. **Valid metadata file with only dependsOn** — File format. Supported at requirement level by the source/suite evidence above.
11. **Empty dependsOn** — File format. Supported at requirement level by the source/suite evidence above.
12. **Cross-workspace dependency** — File format. Supported at requirement level by the source/suite evidence above.
13. **Unqualified path resolves to same workspace** — File format. Supported at requirement level by the source/suite evidence above.
14. **Generated metadata includes provenance** — File format. Supported at requirement level by the source/suite evidence above.
15. **optimizedDescription is omitted when its lock baseline is stale** — File format. Supported at requirement level by the source/suite evidence above.
16. **generatedBy is always core for newly generated documents** — File format. Supported at requirement level by the source/suite evidence above.
17. **Provenance records per-artifact hash and diagnostic lastModified** — Source provenance. Review CP4 for relevant branch; other branches supported.
18. **Provenance records persistedStateHash or null when lock absent** — Source provenance. Review CP4 for relevant branch; other branches supported.
19. **Provenance records schema identity, projection version, and projection fingerprint** — Source provenance. Review CP4 for relevant branch; other branches supported.
20. **contentHashes remains derivable from provenance.artifacts** — Source provenance. Review CP4 for relevant branch; other branches supported.
21. **lastModified alone is diagnostic, not a freshness input** — Source provenance. Review CP4 for relevant branch; other branches supported.
22. **Valid metadata accepted** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
23. **Missing title rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
24. **Missing description rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
25. **Invalid keywords rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
26. **Invalid dependsOn format rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
27. **Invalid contentHashes format rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
28. **Invalid rules structure rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
29. **Invalid scenarios structure rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
30. **Unknown top-level keys allowed** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
31. **Empty content rejected** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
32. **Read path remains lenient** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
33. **Schema supports optimized fields and provenance** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
34. **Bare dependsOn entry rejected on persistence** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
35. **Empty dependsOn entry rejected on persistence** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
36. **Malformed dependsOn entry rejected and quoted** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
37. **Bare implementation symbol specId rejected on persistence** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
38. **Keywords, hashes, and scenarios follow the documented formats** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
39. **Existing metadata with a bare entry still reads** — Structural validation before persistence. Supported at requirement level by the source/suite evidence above.
40. **Metadata generated after archive** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
41. **Manifest dependsOn takes priority over extracted** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
42. **Pre-publication extraction checks final persisted dependsOn during full-batch preflight** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
43. **Metadata-related failure in one spec blocks publication of earlier specs** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
44. **Omitted extraction falls back to the final persisted dependency set** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
45. **Legacy spec may still derive metadata dependsOn from extraction** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
46. **Mismatched extracted dependsOn blocks archive before any batch publication starts** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
47. **Generation failure does not block archive** — Deterministic generation at archive time. Supported at requirement level by the source/suite evidence above.
48. **Metadata and sidecar live in different storage locations** — Sidecar separation. Supported at requirement level by the source/suite evidence above.
49. **Legacy spec may have metadata without sidecar** — Sidecar separation. Supported at requirement level by the source/suite evidence above.
50. **get stamp does not replace metadata()** — Spec.generatedMetadataStamp is a stamp only. Supported at requirement level by the source/suite evidence above.
51. **Stamp absence does not imply empty metadata document** — Spec.generatedMetadataStamp is a stamp only. Supported at requirement level by the source/suite evidence above.
52. **Metadata projects archived implementation links from spec-lock** — Implementation projection. Supported at requirement level by the source/suite evidence above.
53. **Content hash mismatch marks metadata stale** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
54. **persistedStateHash transition to or from absence marks metadata stale** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
55. **Schema identity change marks metadata stale** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
56. **Projection version or fingerprint change marks metadata stale** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
57. **lastModified alone does not cause staleness** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
58. **Repository never classifies freshness** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
59. **Freshness comparison is used only by MaterializeSpecMetadata** — Freshness assessment is application-owned. Supported at requirement level by the source/suite evidence above.
60. **dependsOn adds context beyond excludes** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
61. **Transitive traversal** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
62. **Canonical metadata dependency projection works without extraction** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
63. **Materialization returns a confirmed-fresh or just-regenerated value** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
64. **readMetadataSnapshot is not used by ordinary consumers for freshness decisions** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
65. **Missing spec in dependsOn skipped with warning** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
66. **Cycle in dependsOn broken with warning** — Use by CompileContext. Supported at requirement level by the source/suite evidence above.
67. **New project gitignores the metadata cache directory** — Version control. Supported at requirement level by the source/suite evidence above.
68. **Rooted ignore entry does not affect similarly named nested directories** — Version control. Supported at requirement level by the source/suite evidence above.
69. **Existing tracked metadata is not automatically untracked** — Version control. Supported at requirement level by the source/suite evidence above.
70. **Custom metadataPath is the operator's responsibility** — Version control. Supported at requirement level by the source/suite evidence above.
71. **Implementation files projected into metadata** — Version control. Supported at requirement level by the source/suite evidence above.
72. **Implementation symbols projected into metadata** — Version control. Supported at requirement level by the source/suite evidence above.
73. **Semantic repository source prioritized** — Version control. Supported at requirement level by the source/suite evidence above.

### core:config-loader

Implementation evidence (under packages/core/src): infrastructure/fs/config-loader.ts; infrastructure/fs/config-cascade.ts; application/ports/config-schema.ts.

Test evidence (under packages/core/test): infrastructure/fs/config-loader.spec.ts; application/ports/config-schema.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                    | Assessment                                       |
| -------------------------------------------------------------- | ------------------------------------------------ |
| Factory signature and return type                              | Supported by source/area suite; see scope limits |
| Path probe                                                     | Review CP7                                       |
| Discovery mode                                                 | Supported by source/area suite; see scope limits |
| Forced mode                                                    | Supported by source/area suite; see scope limits |
| Layer merge semantics                                          | Supported by source/area suite; see scope limits |
| Native environment file support                                | Supported by source/area suite; see scope limits |
| YAML parsing and structural validation                         | Supported by source/area suite; see scope limits |
| Default workspace is required                                  | Supported by source/area suite; see scope limits |
| Workspace names use the shared rule                            | Supported by source/area suite; see scope limits |
| Path resolution relative to config directory                   | Supported by source/area suite; see scope limits |
| Storage path containment                                       | Supported by source/area suite; see scope limits |
| isExternal inference for workspaces                            | Supported by source/area suite; see scope limits |
| Config file stays inside the repository root                   | Supported by source/area suite; see scope limits |
| Default values for workspace fields                            | Supported by source/area suite; see scope limits |
| Graph size limit fields                                        | Supported by source/area suite; see scope limits |
| contextIncludeSpecs and contextExcludeSpecs pattern validation | Supported by source/area suite; see scope limits |
| Schema plugins, schema overrides, and context entry mapping    | Supported by source/area suite; see scope limits |
| Approvals default to false                                     | Supported by source/area suite; see scope limits |
| All errors are ConfigValidationError                           | Review CP7                                       |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Factory returns a ConfigLoader** — Factory signature and return type. Supported at requirement level by the source/suite evidence above.
2. **startDir preserves discovery semantics for host-selected roots** — Factory signature and return type. Supported at requirement level by the source/suite evidence above.
3. **Discovery mode returns resolved chain root path** — Path probe. Review CP7 for relevant branch; other branches supported.
4. **Discovery mode returns null when no config found** — Path probe. Review CP7 for relevant branch; other branches supported.
5. **Discovery mode can return a shared root even when later local layers will attach** — Path probe. Review CP7 for relevant branch; other branches supported.
6. **Forced mode returns resolved absolute path without existence check** — Path probe. Review CP7 for relevant branch; other branches supported.
7. **resolvePath never throws** — Path probe. Review CP7 for relevant branch; other branches supported.
8. **Config found in startDir** — Discovery mode. Supported at requirement level by the source/suite evidence above.
9. **Config found in ancestor directory** — Discovery mode. Supported at requirement level by the source/suite evidence above.
10. **Explicit-base variant is skipped when base is inactive** — Discovery mode. Supported at requirement level by the source/suite evidence above.
11. **Standalone local file resets the chain** — Discovery mode. Supported at requirement level by the source/suite evidence above.
12. **Walk stops at VCS root** — Discovery mode. Supported at requirement level by the source/suite evidence above.
13. **No VCS repo — checks only startDir** — Discovery mode. Supported at requirement level by the source/suite evidence above.
14. **No config file found** — Discovery mode. Supported at requirement level by the source/suite evidence above.
15. **Forced path loads exact entrypoint chain** — Forced mode. Supported at requirement level by the source/suite evidence above.
16. **Forced path resolves relative path** — Forced mode. Supported at requirement level by the source/suite evidence above.
17. **Forced path file not found** — Forced mode. Supported at requirement level by the source/suite evidence above.
18. **Forced mode extends target not found** — Forced mode. Supported at requirement level by the source/suite evidence above.
19. **Forced mode extends true without base file** — Forced mode. Supported at requirement level by the source/suite evidence above.
20. **Later scalar overrides earlier scalar** — Layer merge semantics. Supported at requirement level by the source/suite evidence above.
21. **Object keys deep-merge by path** — Layer merge semantics. Supported at requirement level by the source/suite evidence above.
22. **Inherited arrays append by default** — Layer merge semantics. Supported at requirement level by the source/suite evidence above.
23. **Array removal deletes inherited context by id** — Layer merge semantics. Supported at requirement level by the source/suite evidence above.
24. **Standalone layer discards earlier inherited state** — Layer merge semantics. Supported at requirement level by the source/suite evidence above.
25. **.env.local takes precedence over .env** — Native environment file support. Supported at requirement level by the source/suite evidence above.
26. **Invalid YAML syntax** — YAML parsing and structural validation. Supported at requirement level by the source/suite evidence above.
27. **Missing required field** — YAML parsing and structural validation. Supported at requirement level by the source/suite evidence above.
28. **Invalid adapter value** — YAML parsing and structural validation. Supported at requirement level by the source/suite evidence above.
29. **Validation precedes path resolution** — YAML parsing and structural validation. Supported at requirement level by the source/suite evidence above.
30. **Missing default workspace** — Default workspace is required. Supported at requirement level by the source/suite evidence above.
31. **Relative spec path resolved from config directory** — Path resolution relative to config directory. Supported at requirement level by the source/suite evidence above.
32. **Storage paths resolved from config directory** — Path resolution relative to config directory. Supported at requirement level by the source/suite evidence above.
33. **Explicit metadataPath resolved from config directory** — Path resolution relative to config directory. Supported at requirement level by the source/suite evidence above.
34. **Absent metadataPath auto-derived from VCS root** — Path resolution relative to config directory. Supported at requirement level by the source/suite evidence above.
35. **Absent metadataPath with NullVcsAdapter fallback** — Path resolution relative to config directory. Supported at requirement level by the source/suite evidence above.
36. **Storage path outside VCS root** — Storage path containment. Supported at requirement level by the source/suite evidence above.
37. **Storage path at VCS root is valid** — Storage path containment. Supported at requirement level by the source/suite evidence above.
38. **No VCS repo — containment check skipped** — Storage path containment. Supported at requirement level by the source/suite evidence above.
39. **Drive-letter case does not push storage outside the root** — Storage path containment. Supported at requirement level by the source/suite evidence above.
40. **A longer prefix is still outside** — Storage path containment. Supported at requirement level by the source/suite evidence above.
41. **A non-fs storage binding skips the inside-root check** — Storage path containment. Supported at requirement level by the source/suite evidence above.
42. **Workspace specsPath inside VCS root** — isExternal inference for workspaces. Supported at requirement level by the source/suite evidence above.
43. **Workspace specsPath outside VCS root** — isExternal inference for workspaces. Supported at requirement level by the source/suite evidence above.
44. **No VCS repo — all workspaces are not external** — isExternal inference for workspaces. Supported at requirement level by the source/suite evidence above.
45. **Specs inside the root are not external** — isExternal inference for workspaces. Supported at requirement level by the source/suite evidence above.
46. **A non-fs specs adapter is not external** — isExternal inference for workspaces. Supported at requirement level by the source/suite evidence above.
47. **Default workspace ownership defaults to owned** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
48. **Non-default workspace ownership defaults to readOnly** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
49. **Default workspace codeRoot defaults to config directory** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
50. **Non-default workspace missing codeRoot** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
51. **Default workspace schemasPath defaults when omitted** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
52. **Non-default workspace schemasPath is null when omitted** — Default values for workspace fields. Supported at requirement level by the source/suite evidence above.
53. **Declared values are exposed exactly** — Graph size limit fields. Supported at requirement level by the source/suite evidence above.
54. **Undeclared values are not defaulted** — Graph size limit fields. Supported at requirement level by the source/suite evidence above.
55. **An invalid limit names the key and its location** — Graph size limit fields. Supported at requirement level by the source/suite evidence above.
56. **Layer merge applies unchanged** — Graph size limit fields. Supported at requirement level by the source/suite evidence above.
57. **Unknown keys remain rejected** — Graph size limit fields. Supported at requirement level by the source/suite evidence above.
58. **Valid bare wildcard** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
59. **Valid qualified wildcard** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
60. **Valid prefix wildcard** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
61. **Wildcard in disallowed position** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
62. **Invalid workspace qualifier** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
63. **Workspace-level patterns are also validated** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
64. **Pattern with an uppercase segment rejected** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
65. **Segment with a leading digit accepted** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
66. **One-character workspace qualifier rejected** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
67. **Loader keeps no private copy of the expressions** — contextIncludeSpecs and contextExcludeSpecs pattern validation. Supported at requirement level by the source/suite evidence above.
68. **Context entry with id is preserved** — Schema plugins, schema overrides, and context entry mapping. Supported at requirement level by the source/suite evidence above.
69. **Agent plugin identity is name** — Schema plugins, schema overrides, and context entry mapping. Supported at requirement level by the source/suite evidence above.
70. **Approvals section absent** — Approvals default to false. Supported at requirement level by the source/suite evidence above.
71. **Partial approvals section** — Approvals default to false. Supported at requirement level by the source/suite evidence above.
72. **All validation errors use ConfigValidationError** — All errors are ConfigValidationError. Review CP7 for relevant branch; other branches supported.
73. **Invalid cascade chain still uses ConfigValidationError** — All errors are ConfigValidationError. Review CP7 for relevant branch; other branches supported.
74. **Git-style separators do not reject an inside config** — Config file stays inside the repository root. Supported at requirement level by the source/suite evidence above.
75. **A config outside the root is rejected** — Config file stays inside the repository root. Supported at requirement level by the source/suite evidence above.
76. **Invalid workspace name rejected** — Workspace names use the shared rule. Supported at requirement level by the source/suite evidence above.
77. **Two-character workspace name accepted** — Workspace names use the shared rule. Supported at requirement level by the source/suite evidence above.
78. **Device name rejected** — Workspace names use the shared rule. Supported at requirement level by the source/suite evidence above.

### core:spec-repository-port

Implementation evidence (under packages/core/src): application/ports/spec-repository.ts; infrastructure/fs/spec-repository.ts.

Test evidence (under packages/core/test): infrastructure/fs/spec-repository.spec.ts; application/ports/spec-repository.spec.ts; domain/services/parse-spec-lock.spec.ts. Relevant matching composition factories delegate through resolver helpers.

| Requirement                                                       | Assessment                                       |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| Inheritance from Repository base                                  | Supported by source/area suite; see scope limits |
| Workspace scoping                                                 | Supported by source/area suite; see scope limits |
| get returns a Spec or null                                        | Supported by source/area suite; see scope limits |
| list returns spec metadata with optional prefix filter            | Supported by source/area suite; see scope limits |
| SpecListEntry port shape                                          | Supported by source/area suite; see scope limits |
| artifact loads a single artifact file                             | Supported by source/area suite; see scope limits |
| Spec artifact access is limited to expected artifact files        | Supported by source/area suite; see scope limits |
| Spec artifact path confinement                                    | Supported by source/area suite; see scope limits |
| Spec artifact resolution debug logging                            | Supported by source/area suite; see scope limits |
| save persists a single artifact with conflict detection           | Supported by source/area suite; see scope limits |
| delete removes the entire spec directory                          | Supported by source/area suite; see scope limits |
| resolveFromPath resolves storage paths to spec identity           | Supported by source/area suite; see scope limits |
| readMetadataSnapshot and writeMetadataSnapshot                    | Supported by source/area suite; see scope limits |
| Aggregate persisted state, Meta observations, and specFingerprint | Supported by source/area suite; see scope limits |
| readPersistedState lenient dependsOn option                       | Supported by source/area suite; see scope limits |
| search returns specs matching a text query                        | Supported by source/area suite; see scope limits |
| Abstract class with abstract methods                              | Supported by source/area suite; see scope limits |
| Spec counting                                                     | Supported by source/area suite; see scope limits |
| Spec list reindex                                                 | Supported by source/area suite; see scope limits |
| Filesystem-backed specs capability                                | Supported by source/area suite; see scope limits |

Scenario inventory (compiled scenario → governing requirement → assessment):

1. **Extends Repository with immutable accessors** — Inheritance from Repository base. Supported at requirement level by the source/suite evidence above.
2. **Count matches list meta.total from index source** — Spec counting. Supported at requirement level by the source/suite evidence above.
3. **reindex rebuilds workspace spec list cache** — Spec list reindex. Supported at requirement level by the source/suite evidence above.
4. **Port declares its full abstract storage method roster** — Abstract class with abstract methods. Supported at requirement level by the source/suite evidence above.
5. **Removed field-wise and hash-only methods are not part of the abstract roster** — Abstract class with abstract methods. Supported at requirement level by the source/suite evidence above.
6. **Operations are limited to the bound workspace** — Workspace scoping. Supported at requirement level by the source/suite evidence above.
7. **Spec exists** — get returns a Spec or null. Supported at requirement level by the source/suite evidence above.
8. **Spec does not exist** — get returns a Spec or null. Supported at requirement level by the source/suite evidence above.
9. **List all specs as SpecListEntry rows** — list returns spec metadata with optional prefix filter. Supported at requirement level by the source/suite evidence above.
10. **List with prefix filter** — list returns spec metadata with optional prefix filter. Supported at requirement level by the source/suite evidence above.
11. **Empty workspace** — list returns spec metadata with optional prefix filter. Supported at requirement level by the source/suite evidence above.
12. **Title falls back to path segment** — SpecListEntry port shape. Supported at requirement level by the source/suite evidence above.
13. **Summary and Meta respect include flags** — SpecListEntry port shape. Supported at requirement level by the source/suite evidence above.
14. **includeMeta omitted leaves Meta fields absent** — SpecListEntry port shape. Supported at requirement level by the source/suite evidence above.
15. **Resolution errors still return an entry with title fallback** — SpecListEntry port shape. Supported at requirement level by the source/suite evidence above.
16. **Artifact exists** — artifact loads a single artifact file. Supported at requirement level by the source/suite evidence above.
17. **Artifact does not exist** — artifact loads a single artifact file. Supported at requirement level by the source/suite evidence above.
18. **Expected spec artifact file can be read** — Spec artifact access is limited to expected artifact files. Supported at requirement level by the source/suite evidence above.
19. **Unexpected extra file is rejected** — Spec artifact access is limited to expected artifact files. Supported at requirement level by the source/suite evidence above.
20. **spec-lock is not exposed as a normal artifact** — Spec artifact access is limited to expected artifact files. Supported at requirement level by the source/suite evidence above.
21. **Read rejects escaping path** — Spec artifact path confinement. Supported at requirement level by the source/suite evidence above.
22. **Save rejects escaping path** — Spec artifact path confinement. Supported at requirement level by the source/suite evidence above.
23. **Debug logs cover expected-file resolution and rejection** — Spec artifact resolution debug logging. Supported at requirement level by the source/suite evidence above.
24. **ReadOnly workspace rejects save** — save persists a single artifact with conflict detection. Supported at requirement level by the source/suite evidence above.
25. **First write creates spec directory** — save persists a single artifact with conflict detection. Supported at requirement level by the source/suite evidence above.
26. **Conflict detected on save** — save persists a single artifact with conflict detection. Supported at requirement level by the source/suite evidence above.
27. **Force save bypasses conflict detection** — save persists a single artifact with conflict detection. Supported at requirement level by the source/suite evidence above.
28. **Spec directory is fully removed** — delete removes the entire spec directory. Supported at requirement level by the source/suite evidence above.
29. **Absolute path resolves within workspace** — resolveFromPath resolves storage paths to spec identity. Supported at requirement level by the source/suite evidence above.
30. **Relative path resolves within workspace** — resolveFromPath resolves storage paths to spec identity. Supported at requirement level by the source/suite evidence above.
31. **Relative path escapes workspace** — resolveFromPath resolves storage paths to spec identity. Supported at requirement level by the source/suite evidence above.
32. **Invalid spec link** — resolveFromPath resolves storage paths to spec identity. Supported at requirement level by the source/suite evidence above.
33. **Missing metadata reports kind missing** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
34. **Invalid persisted metadata reports kind invalid** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
35. **Present metadata reports kind present with revision** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
36. **writeMetadataSnapshot creates metadata when expectedRevision is null** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
37. **writeMetadataSnapshot replaces metadata when expectedRevision matches** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
38. **writeMetadataSnapshot rejects a stale expectedRevision** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
39. **writeMetadataSnapshot is not subject to the readOnly guard** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
40. **readMetadataSnapshot never reports freshness** — readMetadataSnapshot and writeMetadataSnapshot. Supported at requirement level by the source/suite evidence above.
41. **Matching specs returned with score** — search returns specs matching a text query. Supported at requirement level by the source/suite evidence above.
42. **No matching specs returns empty array** — search returns specs matching a text query. Supported at requirement level by the source/suite evidence above.
43. **Results sorted by score descending** — search returns specs matching a text query. Supported at requirement level by the source/suite evidence above.
44. **Limit option respected** — search returns specs matching a text query. Supported at requirement level by the source/suite evidence above.
45. **Search scoped to single workspace** — search returns specs matching a text query. Supported at requirement level by the source/suite evidence above.
46. **persistedStateMeta hash remains stable when state is unchanged** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
47. **persistedStateMeta hash changes when lock state is modified** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
48. **persistedStateMeta without includeHash omits hash** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
49. **persistedStateMeta returns null when sidecar is absent** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
50. **there is no persistedStateHash method on the port** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
51. **specFingerprint orders artifact hashes by filename** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
52. **readPersistedState returns the complete persisted snapshot** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
53. **readPersistedState returns null when no persisted state exists** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
54. **writePersistedState creates state when expectedRevision is null** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
55. **writePersistedState replaces state when expectedRevision matches** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
56. **writePersistedState rejects a stale expectedRevision** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
57. **artifactMeta returns lastModified without hash by default** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
58. **artifactMeta returns hash only when includeHash is true** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
59. **generatedMetadataMeta observes the metadata cache file** — Aggregate persisted state, Meta observations, and specFingerprint. Supported at requirement level by the source/suite evidence above.
60. **Filesystem-backed repository exposes canonical specsPath** — Filesystem-backed specs capability. Supported at requirement level by the source/suite evidence above.
61. **Non-filesystem repository does not require specsPath** — Filesystem-backed specs capability. Supported at requirement level by the source/suite evidence above.
62. **Strict read rejects an invalid dependsOn entry** — readPersistedState lenient dependsOn option. Supported at requirement level by the source/suite evidence above.
63. **Lenient read returns invalid dependsOn entries as stored** — readPersistedState lenient dependsOn option. Supported at requirement level by the source/suite evidence above.
64. **Lenient read still validates other fields** — readPersistedState lenient dependsOn option. Supported at requirement level by the source/suite evidence above.
65. **Revision check reads leniently** — readPersistedState lenient dependsOn option. Supported at requirement level by the source/suite evidence above.

## Dependency consistency and globals

Direct dependency union retrieved from status and read via canonical specs show commands: core:{spec-metadata,content-extraction,schema-format,spec-id-format,spec-repository-port,composition-resolver,spec-optimization,validate-artifacts,storage,workspace,validation-result-cache-port,spec-lock,get-spec-metadata,delta-format,artifact-parser-port,change-layout,file-reader-port,diff-generator,vcs-adapter-port,update-implementation-tracking,initialize-persisted-spec-state,get-active-schema,config,change,composition,schema-merge,vcs-adapter,repository-port,search-specs}, default:\_global/{architecture,logging}. In-change versions were taken from merged previews, not raw canonical text where the change overrides them. Global architecture/conventions/testing/cross-platform/error/logging constraints were included from project context and parent-provided raw globals.

- Domain ID rules remain pure and application use cases validate before spec repository work; expected failures use typed SpecdError subclasses.
- Persisted queries use semantic repository reads and never materialize metadata; persisted writes retain optimistic revision tokens, readOnly checks, and shared creation/patch paths.
- Config-based factories continue to delegate through their resolver helpers. CP6 records a literal dependency-shape drift.
- Windows path confinement uses node:path and qualified prefixes are distinguished from drive letters; portable separator tests and path-sensitive test assertions cover intended branches. No new portability issue confirmed.
- Strict metadata writes reject bare/invalid IDs while reads remain lenient. Strict/lenient persisted lock reads and lenient revision comparison match the new repair contract.
- CP3/CP4 identify a genuine contract decision between lock-less artifact-derived dependencies and validation against an empty canonical persisted baseline. CP7 identifies contradictory wording between neighboring specs; CP8 identifies a requirement/test discrepancy.

## Missing tests and validation interpretation

Tests are present for each assigned area's principal behavior, including invalid/empty/malformed/unknown-workspace IDs, bare-ID normalization, readOnly errors, revision conflicts, null-state no-ops, optimization field filtering/freshness, path escape rejection, target-schema parsing, config patterns/workspace grammar, cache hits, and lenient lock repair. Confirmed uncovered branches are CP1 optimization-staleness validation, CP2 warning propagation, CP3 lock-less mismatch validation, CP4 full generator result shape, and CP5 absence-to-presence snapshot consistency. Broader 1:1 coverage of every unchanged scenario has not been established independently; the inventory is a requirement-level static matrix, not a coverage instrument report.

## Summary counts

- Assigned specs: 14.
- Requirement headings: 185.
- Compiled scenarios inventoried: 679.
- Confirmed introduced implementation discrepancies: 0.
- Confirmed baseline discrepancy groups: 8 (CP1–CP8).
- Production/source/spec modifications by this auditor: 0.
- Required decision: reconcile or explicitly defer baseline findings; do not silently treat full-mode compliance as clean.

<!-- END _partial-core-persistence.md -->

<!-- BEGIN _partial-cli-skills.md -->

# Compliance partial — CLI, Skills, SDK delivery boundary

Change: `support-commas-in-names`. Audit date: 2026-11-08. Read-only audit: no implementation/spec edits or lifecycle transitions.

## Scope and method

Eight change specs, 70 requirements and 253 compiled scenarios were reviewed. Merged artifacts were obtained independently with `changes spec-preview support-commas-in-names <id> --format text`; the compiled scenario representations in `/tmp/commas-spec-*.txt` were used for the inventory below. Spec-preview content, not raw deltas, is the review basis. Requirement and scenario counts exclude constraints and dependency/global specs.

| Spec                       | Requirements | Scenarios |
| -------------------------- | -----------: | --------: |
| cli:change-implementation  |           11 |        31 |
| cli:change-edit            |            6 |        23 |
| cli:change-deps            |            5 |        32 |
| cli:spec-deps              |           10 |        35 |
| cli:graph-index            |           11 |        51 |
| cli:change-create          |            8 |        27 |
| cli:project-init           |            9 |        29 |
| skills:workflow-automation |           10 |        25 |
| Total                      |           70 |       253 |

Primary code navigation used `graph impact --file cli:src/commands/change/implementation.ts --direction dependencies`, then direct inspection of the resulting implementation/review helpers and the paths identified in design. The parent refreshed the graph; the fresh status recorded `state: current`, `contentFresh: true`. This batch also queried `graph search createProgram --symbols` before inspecting program-level behavior. SDK exports were checked directly at the declared public delivery boundary.

The parent executed fresh tests: Core 2,889; CLI 1,285; SDK 134; Skills 52; Guide 155 (4,515 total), fresh build, direct TypeScript checks, and lint on all 151 changed/new TypeScript files. This audit inspected test assertions rather than interpreting passing suite totals as proof of every acceptance criterion. CLI unit tests mock kernel behavior; application atomicity and validation are supported by the corresponding Core suites, not independently re-proven by CLI mocks. Baseline full test results outside these packages were cached and are not claimed as new runs here.

## Findings

### CLI-S1 — Two verification scenarios still require bare dependency output (spec drift; low)

**Explicit scenario mismatch.** In merged `cli:change-deps` verification, “Remove deps from a spec in the change” requires the exact substring `dependsOn: auth/shared`, and “Set (replace) deps for a spec” requires `dependsOn: auth/session`. The use case returns fully-qualified dependency IDs per merged `core:update-spec-deps` and `core:spec-id-format`; the delivery handler correctly prints those values at `packages/cli/src/commands/change/deps.ts:167`, so real execution produces `dependsOn: default:auth/shared` and `dependsOn: default:auth/session`.

The unit tests at `packages/cli/test/commands/change-deps.spec.ts:69` and `:92` pass because their mocked results contain bare `dependsOn` values. Those fixtures are incompatible with the new Core output contract and conceal the scenario contradiction. The earlier Add scenario also ends with “the output is:” without supplying an expected output block, so that clause offers no concrete assertion.

**Interpretations:** specs may be stale (most likely; canonical fully-qualified output is explicitly required globally), implementation could instead be expected to abbreviate displayed dependencies (would require changing that contract), or both could be revised to state an explicit presentation policy. Do not “fix” the handler by introducing adapter-owned ID normalization. Recommended route: update the two verification expectations and normalize the mocked dependency fixtures, then add one real Core-to-CLI output assertion. These expectations are baseline wording retained in the merged artifact, not a newly introduced comma regression.

### CLI-S2 — All-list delegation constraint contradicts the supported operation shape (spec drift; low)

**Broader constraint mismatch, not a failing listed user scenario.** `cli:change-deps` says “Listing and display modes use GetChangeSpecDeps to retrieve dependencies”. Single-spec display does use `kernel.changes.getSpecDeps` (`packages/cli/src/commands/change/deps.ts:97`), while all-spec listing intentionally uses `kernel.changes.status` (`:117`). The all-list path is explicitly tested at `packages/cli/test/commands/change-deps.spec.ts:247`; the single-display test verifies that status is not called (`:274` onward). `GetChangeSpecDeps` accepts a required `specId`, so it does not currently supply an all-list operation.

**Interpretations:** the constraint likely overstates the single-display refactor and should name status for whole-change listing; alternatively extend Core with an all-list query and route CLI through it. Both routes are possible, but changing only this handler to omit `specId` is not valid. The all-list implementation existed before this change; the contradiction is in the resulting specification wording.

### CLI-I1 — Explicit default-valued init flags still open the wizard on a TTY (baseline implementation gap; medium)

**Broader requirement failure.** `cli:project-init` Interactive mode permits the wizard only when no configuration flags were supplied. `packages/cli/src/commands/project/init.ts:77` decides `hasFlags` by comparing option values with defaults (`opts.workspace !== 'default'`, `opts.workspacePath !== 'specs/'`) instead of checking whether the user supplied them. Consequently both `init --workspace default` and `init --workspace-path specs/` enter the wizard when stdout is a TTY. This can unexpectedly block a terminal script and allows subsequent prompt answers to override explicit input.

Confirmed without writing project files: a standalone Commander parse with the command's declared defaults reports option source `cli` for each supplied flag, but the exact `hasFlags` expression returns `false`, and `interactiveIfTTY` returns `true`. The Git diff confirms this branch is unchanged by the current change; workspace validation is new, mode detection is baseline.

`packages/cli/test/commands/project-init.spec.ts:348` exercises TTY mode only without flags. Explicit default-valued flags are exercised only with the normal non-TTY test stream, so the gap survives.

**Interpretations:** implementation likely needs option-source/presence detection; if value-based wizard selection is intentional, the requirement should explicitly say so. Recommended implementation route: test TTY with explicit `--workspace default` and `--workspace-path specs/`, assert no prompt and exact ConfigWriter inputs. This is not evidence of failure of the new workspace-name validator; that validator and its no-write error behavior are covered and conformant.

### CLI-I2 — Structured output help is absent on several affected command leaves (baseline global requirement gap; low)

**Global/dependency requirement failure, not a comma scenario regression.** Direct dependency `cli:entrypoint`, Requirement “JSON/TOON output schema in help”, requires every structured-output command's help to include `JSON/TOON output schema:` and its result shape. The eight `changes implementation` leaves, five `specs deps` leaves, and init handler declare structured formats but no schema help. By inspection, `packages/cli/src/commands/change/implementation.ts:23`, `packages/cli/src/commands/spec/deps.ts:61`, and `packages/cli/src/commands/project/init.ts:43` register these leaves without `addHelpText`.

Confirmed built CLI read-only invocations: `changes implementation start --help`, `specs deps list --help`, and `init --help` list format options but no output schema. `changes create` has a schema block but omits its actual `changePath` property (`packages/cli/src/commands/change/create.ts:29`), although its local spec explicitly requires that output field.

**Interpretations:** add output shapes to the affected leaves/update create's block, or explicitly revise the global requirement to exempt these commands. The parent baseline and diff show this omission predates the current work. A command-tree help-schema assertion would protect the requirement; existing documentation coverage checks flag coverage and do not demonstrate this contract.

## Per-spec implementation and test evidence

### cli:change-implementation

Implementation: `packages/cli/src/commands/change/implementation.ts` registers all eight subcommands. Add/remove forward raw file/spec/symbol values; resolve/unresolve/ignore forward arrays in one Core mutation. Commander handles repeated/variadic values; the command introduces no comma parser. Text prints files/symbols on separate lines; JSON/TOON preserve arrays. Start renders name, tracking status, timestamp. `commands/change/_implementation-tracking.ts` calls SDK `buildImplementationReview` and adapts only health text; no matching fallback or stored-link rewrite is present. SDK reexports remain the only platform import path.

Tests: `packages/cli/test/commands/change-implementation.spec.ts` directly covers comma paths, repeated/variadic equivalence, whitespace preservation, raw IDs/symbols, missing-file error forwarding, JSON arrays, separate text lines, eight-subcommand reachability, start timestamp/structured confirmation, review rendering and second start invocation. Core `update-implementation-tracking.spec.ts` supplies actual state-machine, existence, symbols, preserved links and atomic batch evidence. SDK review tests cover resolution outcomes. CLI mocks do not themselves establish those underlying transitions. Missing global help schema is CLI-I2.

### cli:change-edit

Implementation: `commands/change/edit.ts` checks edit-option presence before resolving config, passes raw lists/policy/description to Core, prints returned workspace/spec arrays and state, maps typed errors via `handleError`, and retains only presentation-level overlap warnings. No CLI spec-ID parser or ownership lookup remains. Tests: `test/commands/change-edit.spec.ts` covers no-flags/config-error precedence, raw forwarded IDs/removals, comma-invalid input, policy errors, ownership errors, workspace/result projection and invalidation output. Actual atomic rejection, workspace derivation, ownership enforcement and lifecycle invalidation are established in Core's EditChange/Change suites. No new implementation mismatch found in the six local requirements or 23 compiled scenarios.

### cli:change-deps

Implementation: `commands/change/deps.ts`; raw repeatable add/remove/set values; clear/force fast-fail and confirmation; single-spec query through `getSpecDeps`; all-list through status; modification text/structured output consistently uses `result.specId`. Tests: `test/commands/change-deps.spec.ts` covers option conflicts, no spec, raw values, commas/blanks, normalized single-display in text/JSON/TOON, typed errors, help clear/force, confirm/decline/force/non-TTY paths, returned ID on mutation. Core validates and mutates actual dependencies. Scenario drift CLI-S1 and all-list constraint CLI-S2 remain. Tests using bare mocked dependency arrays should be updated even though the CLI correctly renders what it receives.

### cli:spec-deps

Implementation: `commands/spec/deps.ts`; five leaves reject excess args, pass raw IDs/arrays and make one kernel call; set without deps passes `[]`; clear asks and maps force; list/mutation output uses actual `initialized`; remove on an uninitialized spec prints a no-op. Only this group opts into the `handleError` lock-repair hint; hint is separate from structured `message`, scoped to `dependsOn`, and contains precisely the three allowed commands. `helpers/confirm.ts` handles TTY/force/cancellation and `handle-error.ts` handles typed fields/concurrency/readOnly messages.

Tests: `test/commands/spec-deps.spec.ts` directly covers raw forwarding, set, comma/blank values, missing target, uninitialized list/remove, JSON initialized, confirmation branches, clear wording, conflict/readOnly mapping. `test/handle-error.spec.ts` covers exact hint scope/content/structured separation; Core persisted-deps and repository tests cover strict versus lenient repair and concurrency semantics. Test “exits 1 when confirmOrExit rejects for a non-TTY shell” mocks an older `--clear` message; the later clear-wording test checks the actual passed nonInteractiveMessage. Recommend retaining the latter and cleaning that stale mock; no production wording failure was found. Missing help schema: CLI-I2.

### cli:graph-index

Implementation: `commands/graph/index-graph.ts`, `graph-index-task.ts`, SDK worker/index orchestration. Exclude-path uses one array collector and preserves brace commas. Parent creates serializable forced/discovered/bootstrap descriptors and calls `runIsolatedGraphIndex`; child replays discovery/config and calls SDK indexing once. Text-only callbacks, diagnostic/size/overlap sections, rebuild/coverage fields, error codes, and unchanged structured result are present. No raw lock, child-process, isolation bypass or direct code-graph package import exists in CLI.

Tests: `test/commands/graph-index.spec.ts` covers modes, no substitution, one SDK call, repeated/listed/brace patterns, result fields, progress/diagnostics, size caps/snippets, overlaps, no writes, failure diagnostics and JSON/TOON. `test/graph-index-task.spec.ts` covers child context and event contracts. Built integration suites and the parent's real successful graph refresh supply packaged-run evidence; this batch did not rerun all Code Graph infrastructure tests. `docs/cli/cli-reference.md` documents graph commands, flags and graph configuration; CLI documentation suite passed. No new discrepancy in these local requirements/scenarios found.

### cli:change-create

Implementation: `commands/change/create.ts` passes raw specs, no explicit schema identity, conditional includeOverlapCheck, inherited policy and typed errors; renders result path/state and delegated overlap warnings. Tests: `test/commands/change-create.spec.ts` covers empty specs, raw bare/comma/invalid IDs, ownership errors, returned path, overlap delegation and policy errors. Core tests establish actual normalization, ownership rejection, schema/event persistence and duplicate-name handling. Local output examples containing `.specd/changes/` are conventional default-layout examples; the repository's custom change storage path is not treated as a production failure. Help schema field omission is CLI-I2.

### cli:project-init

Implementation: `commands/project/init.ts`, shared registration in `program.ts`; shared `isValidWorkspaceName` validates option and wizard values without trim/lowercase; `createConfigWriter().initProject` owns all files, directories and ignores; result metadataCachePath is printed directly; selected plugins go through plugin installation. Root resolution uses VCS/CWD fallback and alias registers the same handler.

Tests: `test/commands/project-init.spec.ts` covers alias, plugin choices/output, metadata path, force, invalid one-character/uppercase/device/space values with no writes, valid two-character ID and wizard validation. Core ConfigWriter tests establish real file placement/directories/ignore idempotence. The specific validator requirement conforms. Baseline wizard mode selection fails the broader requirement with explicit default-valued options (CLI-I1). Help schema gap CLI-I2.

### skills:workflow-automation

Implementation: shared skill template and implement/archive skill templates define diagnostic text vs TOON extraction, show/context/metadata read surfaces, guide-first/graph-first, freshness/equivalence, canonical plural resource groups, next-action repair, inline-diff/merged-preview review, traceability, repeated/variadic whole file names and specialized optimizer delegation with inline fallback. Templates no longer teach comma-joined names.

Tests: `packages/skills/test/template-workflow.spec.ts` directly asserts shared read-surface guidance, optimizer gate/persistence flows, no comma-joined flags across templates and ignore/link behavior; broader rendering/catalog tests passed in the Skills suite. Runtime agent behavior is instruction-driven, so these tests prove instruction content/rendering, not compliance by every future agent. All 25 scenarios are consistent with the published instructions; no new discrepancy found.

## Dependency and global consistency

Read surfaces: merged in-change Core specs from the parent's compiled context; `specs show` for cli:entrypoint, cli:command-resource-naming, skills:agents, sdk:build-implementation-review, core:get-implementation-review, core:refresh-implementation-tracking, sdk:run-index-project-graph, sdk:host-context, code-graph:isolated-index-worker, cli:spec-context and cli:spec-metadata; project globals architecture/docs/testing/cross-platform/error-handling. Relevant direct deps already in this change use the merged view rather than canonical old content.

Architecture: handlers delegate validation, ownership, mutations and symbol resolution; platform imports are SDK-only; `packages/sdk/src/core-reexports.ts:61`, `:327`, `:489`, `:562`, `:568`, `:573` expose new getSpecDeps types/factory, errors, parser/pattern and shared rules. No business merge logic added to hosts. Dependency inconsistency limited to CLI-S1, CLI-S2 and global help requirement CLI-I2 identified above.

Cross-platform: raw option strings are unchanged; separator/case normalization belongs to Core, not CLI; init uses node:path; task modules use URLs; no shell-based filename parsing is introduced. Fresh tests ran on macOS only; no claim of running Windows/Linux CI. Test names/fixtures use platform mocks or Core-specific platform helpers.

Documentation: user docs use canonical plural groups; search of relevant changed CLI/guide/skills docs found no singular resource command examples. New repeated-file/clear/force/lock-repair/init workspace rules are represented in docs. Help discoverability has the gap above. Unrelated exploration files outside docs were not attributed to this change.

## Summary and limits

No new comma splitting/whitespace loss/adapter spec-ID normalization regression was found in this batch. Four findings: two artifact inconsistencies (CLI-S1 with two literal scenario failures; CLI-S2 broader constraint) and two baseline implementation/global-contract gaps (CLI-I1 wizard selection; CLI-I2 help schemas). These are not four new regressions. The scenario inventory below marks the two literal conflicting expectations distinctly. Remaining scenarios have supporting code and relevant direct or lower-layer tests; this is not a statement that each has an independent executable test.

## Complete requirement and scenario inventory

Supported means implementation inspection plus relevant suite evidence, including lower-layer tests where explicitly noted. It does not mean a one-to-one executable test. Requirement-only baseline/global findings are not incorrectly counted as failures of unrelated new scenarios.

### cli:change-implementation

Evidence: change-implementation.spec.ts + Core tracking/SDK review. See per-spec implementation discussion for scope and limits.

| Requirement                         | Assessment                                               |
| ----------------------------------- | -------------------------------------------------------- |
| Command signature                   | Supported by inspected implementation and suite evidence |
| List subcommand                     | Supported by inspected implementation and suite evidence |
| Add subcommand                      | Supported by inspected implementation and suite evidence |
| Resolve subcommand                  | Supported by inspected implementation and suite evidence |
| Unresolve subcommand                | Supported by inspected implementation and suite evidence |
| Ignore subcommand                   | Supported by inspected implementation and suite evidence |
| Remove subcommand                   | Supported by inspected implementation and suite evidence |
| Review subcommand                   | Supported by inspected implementation and suite evidence |
| Start subcommand                    | Supported by inspected implementation and suite evidence |
| Shared path semantics               | Supported by inspected implementation and suite evidence |
| Raw values and unambiguous listings | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                            | Requirement                         | Assessment                                  |
| --: | ------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------- |
|   1 | Subcommands are reachable                                           | Command signature                   | Supported; code and relevant suite evidence |
|   2 | Add creates tracked file when none existed                          | Add subcommand                      | Supported; code and relevant suite evidence |
|   3 | Add refines an existing spec-plus-file link with symbols            | Add subcommand                      | Supported; code and relevant suite evidence |
|   4 | Adding a link to a missing file fails                               | Add subcommand                      | Supported; code and relevant suite evidence |
|   5 | Resolve closes tracked-file review for multiple files               | Resolve subcommand                  | Supported; code and relevant suite evidence |
|   6 | Resolving a missing file fails                                      | Resolve subcommand                  | Supported; code and relevant suite evidence |
|   7 | Resolving an untracked file fails                                   | Resolve subcommand                  | Supported; code and relevant suite evidence |
|   8 | Resolving a removed file fails                                      | Resolve subcommand                  | Supported; code and relevant suite evidence |
|   9 | Resolve a file whose name contains a comma                          | Resolve subcommand                  | Supported; code and relevant suite evidence |
|  10 | One missing file aborts the whole resolve                           | Resolve subcommand                  | Supported; code and relevant suite evidence |
|  11 | Unresolving an existing file reopens review                         | Unresolve subcommand                | Supported; code and relevant suite evidence |
|  12 | Unresolving an untracked file fails                                 | Unresolve subcommand                | Supported; code and relevant suite evidence |
|  13 | Unresolving a removed file fails                                    | Unresolve subcommand                | Supported; code and relevant suite evidence |
|  14 | Unresolve accepts repeated names and names with commas              | Unresolve subcommand                | Supported; code and relevant suite evidence |
|  15 | Ignore marks multiple files as ignored                              | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  16 | Ignoring a new missing file fails                                   | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  17 | Ignoring a missing-but-tracked file succeeds                        | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  18 | Ignoring a linked tracked file preserves confirmed links            | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  19 | Ignore a file whose name contains a comma                           | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  20 | A comma-joined value is one name                                    | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  21 | Removing one symbol preserves the remaining refinements             | Remove subcommand                   | Supported; code and relevant suite evidence |
|  22 | Removing last symbol preserves explicit file-level link             | Remove subcommand                   | Supported; code and relevant suite evidence |
|  23 | Remove forwards spec and symbol raw, including a comma in a symbol  | Remove subcommand                   | Supported; code and relevant suite evidence |
|  24 | Manual add uses raw project-relative path instead of workspace:path | Shared path semantics               | Supported; code and relevant suite evidence |
|  25 | List renders SDK outcomes without fallback                          | List subcommand                     | Supported; code and relevant suite evidence |
|  26 | Review distinguishes missing from inconclusive absence              | Review subcommand                   | Supported; code and relevant suite evidence |
|  27 | Start explicitly activates implementation tracking                  | Start subcommand                    | Supported; code and relevant suite evidence |
|  28 | Spec ID is passed raw                                               | Raw values and unambiguous listings | Supported; code and relevant suite evidence |
|  29 | Values are never trimmed                                            | Raw values and unambiguous listings | Supported; code and relevant suite evidence |
|  30 | Text listing prints one name per line                               | Raw values and unambiguous listings | Supported; code and relevant suite evidence |
|  31 | Structured output keeps arrays                                      | Raw values and unambiguous listings | Supported; code and relevant suite evidence |

### cli:change-edit

Evidence: change-edit.spec.ts + Core edit/change. See per-spec implementation discussion for scope and limits.

| Requirement                  | Assessment                                               |
| ---------------------------- | -------------------------------------------------------- |
| Command signature            | Supported by inspected implementation and suite evidence |
| Workspace derivation         | Supported by inspected implementation and suite evidence |
| ReadOnly workspace rejection | Supported by inspected implementation and suite evidence |
| Approval invalidation        | Supported by inspected implementation and suite evidence |
| Output on success            | Supported by inspected implementation and suite evidence |
| Error cases                  | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                | Requirement                  | Assessment                                  |
| --: | ------------------------------------------------------- | ---------------------------- | ------------------------------------------- |
|   1 | No edit flags provided                                  | Command signature            | Supported; code and relevant suite evidence |
|   2 | Values are forwarded unchanged                          | Command signature            | Supported; code and relevant suite evidence |
|   3 | A value with a comma is one ID                          | Command signature            | Supported; code and relevant suite evidence |
|   4 | Usage error precedes configuration resolution           | Command signature            | Supported; code and relevant suite evidence |
|   5 | Remove values are forwarded unchanged                   | Command signature            | Supported; code and relevant suite evidence |
|   6 | Command resolves no workspace itself                    | Command signature            | Supported; code and relevant suite evidence |
|   7 | Workspace added when new spec requires it               | Workspace derivation         | Supported; code and relevant suite evidence |
|   8 | Workspace removed when no specs reference it            | Workspace derivation         | Supported; code and relevant suite evidence |
|   9 | Workspace unchanged when other specs still reference it | Workspace derivation         | Supported; code and relevant suite evidence |
|  10 | Adding spec from readOnly workspace rejected            | ReadOnly workspace rejection | Supported; code and relevant suite evidence |
|  11 | Removing spec not subject to ownership check            | ReadOnly workspace rejection | Supported; code and relevant suite evidence |
|  12 | No edits applied when readOnly check fails              | ReadOnly workspace rejection | Supported; code and relevant suite evidence |
|  13 | Spec change triggers invalidation                       | Approval invalidation        | Supported; code and relevant suite evidence |
|  14 | No active approval — no invalidation event              | Approval invalidation        | Supported; code and relevant suite evidence |
|  15 | Text output shows updated specs and workspaces          | Output on success            | Supported; code and relevant suite evidence |
|  16 | JSON output with invalidation                           | Output on success            | Supported; code and relevant suite evidence |
|  17 | Change not found                                        | Error cases                  | Supported; code and relevant suite evidence |
|  18 | Removing spec not in specIds                            | Error cases                  | Supported; code and relevant suite evidence |
|  19 | Unknown workspace prefix in --add-spec                  | Error cases                  | Supported; code and relevant suite evidence |
|  20 | ReadOnly workspace in --add-spec                        | Error cases                  | Supported; code and relevant suite evidence |
|  21 | Invalid spec ID                                         | Error cases                  | Supported; code and relevant suite evidence |
|  22 | Unknown workspace                                       | Error cases                  | Supported; code and relevant suite evidence |
|  23 | Invalid invalidation policy                             | Error cases                  | Supported; code and relevant suite evidence |

### cli:change-deps

Evidence: change-deps.spec.ts + Core update-spec-deps/get-change-spec-deps. See per-spec implementation discussion for scope and limits.

| Requirement                         | Assessment                                                |
| ----------------------------------- | --------------------------------------------------------- |
| Command signature                   | Supported, except legacy verification expectations CLI-S1 |
| Clear confirmation                  | Supported by inspected implementation and suite evidence  |
| Output                              | Supported by inspected implementation and suite evidence  |
| Output shows the normalized spec ID | Supported by inspected implementation and suite evidence  |
| Error cases                         | Supported by inspected implementation and suite evidence  |

|   # | Scenario                                              | Requirement                         | Assessment                                                             |
| --: | ----------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
|   1 | Add deps to a spec in the change                      | Command signature                   | Mutation supported; output-is clause has no expected block (CLI-S1)    |
|   2 | Remove deps from a spec in the change                 | Command signature                   | Literal expected output contradicts canonical IDs (CLI-S1; spec drift) |
|   3 | Set (replace) deps for a spec                         | Command signature                   | Literal expected output contradicts canonical IDs (CLI-S1; spec drift) |
|   4 | List all dependencies in the change                   | Command signature                   | Supported; code and relevant suite evidence                            |
|   5 | Display dependencies for a specific spec              | Command signature                   | Supported; code and relevant suite evidence                            |
|   6 | Help lists --clear and --force                        | Command signature                   | Supported; code and relevant suite evidence                            |
|   7 | set value with a comma is one ID                      | Command signature                   | Supported; code and relevant suite evidence                            |
|   8 | Values are passed unchanged                           | Command signature                   | Supported; code and relevant suite evidence                            |
|   9 | JSON output format                                    | Output                              | Supported; code and relevant suite evidence                            |
|  10 | No deps remaining shows none                          | Output                              | Supported; code and relevant suite evidence                            |
|  11 | Error when change not found                           | Error cases                         | Supported; code and relevant suite evidence                            |
|  12 | Error when specId not in change.specIds               | Error cases                         | Supported; code and relevant suite evidence                            |
|  13 | Error when --set used with --add                      | Error cases                         | Supported; code and relevant suite evidence                            |
|  14 | Error when removing non-existent dep                  | Error cases                         | Supported; code and relevant suite evidence                            |
|  15 | Error when modification flags provided without specId | Error cases                         | Supported; code and relevant suite evidence                            |
|  16 | --set with an empty value is rejected                 | Error cases                         | Supported; code and relevant suite evidence                            |
|  17 | --add with a blank value is rejected                  | Error cases                         | Supported; code and relevant suite evidence                            |
|  18 | Unknown workspace in a dependency                     | Error cases                         | Supported; code and relevant suite evidence                            |
|  19 | Dependency on a spec not created yet is accepted      | Error cases                         | Supported; code and relevant suite evidence                            |
|  20 | Display mode accepts a bare spec ID                   | Error cases                         | Supported; code and relevant suite evidence                            |
|  21 | Confirmed on a terminal                               | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  22 | Declined on a terminal                                | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  23 | --force skips the question                            | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  24 | No terminal and no force fails                        | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  25 | clear conflicts with add, remove, and set             | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  26 | clear requires a specId                               | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  27 | Display mode holds no spec ID parser                  | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |
|  28 | Help lists --clear and --force                        | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |
|  29 | Blank --add value                                     | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |
|  30 | Unknown workspace in a dependency                     | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |
|  31 | Raw forwarding of every modification flag             | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |
|  32 | Text output prints the normalized spec ID             | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |

### cli:spec-deps

Evidence: spec-deps.spec.ts + handle-error.spec.ts + Core persisted-deps/repository. See per-spec implementation discussion for scope and limits.

| Requirement                                         | Assessment                                               |
| --------------------------------------------------- | -------------------------------------------------------- |
| Command signature                                   | Supported by inspected implementation and suite evidence |
| List subcommand                                     | Supported by inspected implementation and suite evidence |
| Add subcommand                                      | Supported by inspected implementation and suite evidence |
| Remove subcommand                                   | Supported by inspected implementation and suite evidence |
| Set subcommand                                      | Supported by inspected implementation and suite evidence |
| Clear subcommand                                    | Supported by inspected implementation and suite evidence |
| Mutation output reflects the real initialized state | Supported by inspected implementation and suite evidence |
| No repeated CLI-owned mutation logic                | Supported by inspected implementation and suite evidence |
| Raw spec IDs                                        | Supported by inspected implementation and suite evidence |
| Error mapping                                       | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                                   | Requirement                                         | Assessment                                  |
| --: | -------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
|   1 | Every subcommand accepts --format                                          | Command signature                                   | Supported; code and relevant suite evidence |
|   2 | List prints the persisted dependsOn list                                   | List subcommand                                     | Supported; code and relevant suite evidence |
|   3 | List on an uninitialized spec reports not-yet-initialized distinctly       | List subcommand                                     | Supported; code and relevant suite evidence |
|   4 | Add appends every supplied dependency ID                                   | Add subcommand                                      | Supported; code and relevant suite evidence |
|   5 | Remove drops the given dependency                                          | Remove subcommand                                   | Supported; code and relevant suite evidence |
|   6 | Remove on an uninitialized spec reports a no-op, not an error              | Remove subcommand                                   | Supported; code and relevant suite evidence |
|   7 | Set replaces the entire dependsOn list                                     | Set subcommand                                      | Supported; code and relevant suite evidence |
|   8 | Set with no --dep flags clears the list                                    | Set subcommand                                      | Supported; code and relevant suite evidence |
|   9 | Clear empties the dependsOn list                                           | Clear subcommand                                    | Supported; code and relevant suite evidence |
|  10 | Clear confirmed on a terminal                                              | Clear subcommand                                    | Supported; code and relevant suite evidence |
|  11 | Clear declined                                                             | Clear subcommand                                    | Supported; code and relevant suite evidence |
|  12 | Clear with --force                                                         | Clear subcommand                                    | Supported; code and relevant suite evidence |
|  13 | No terminal and no force                                                   | Clear subcommand                                    | Supported; code and relevant suite evidence |
|  14 | Add, remove, and set map directly onto UpdatePersistedSpecDepsInput        | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  15 | Add, remove, and clear map onto the use case input                         | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  16 | Set without --dep sends an empty list                                      | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  17 | List on an uninitialized spec                                              | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  18 | Unknown spec on list                                                       | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  19 | Invalid and unknown-workspace IDs                                          | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  20 | Concurrent modification maps to a retry message                            | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  21 | Read-only workspace gives no configuration workaround                      | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  22 | Repair hint is exactly the three commands                                  | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  23 | No hint for other lock fields                                              | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  24 | Non-interactive clear message names no --clear option                      | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  25 | Unknown spec maps to exit code 1                                           | Error mapping                                       | Supported; code and relevant suite evidence |
|  26 | Concurrent modification maps to exit code 1 with retry guidance            | Error mapping                                       | Supported; code and relevant suite evidence |
|  27 | Read-only workspace maps to exit code 1 without a configuration workaround | Error mapping                                       | Supported; code and relevant suite evidence |
|  28 | Invalid lock maps to exit 1 with field path                                | Error mapping                                       | Supported; code and relevant suite evidence |
|  29 | Invalid and unknown workspace IDs map to exit 1                            | Error mapping                                       | Supported; code and relevant suite evidence |
|  30 | Bare spec ID passed unchanged                                              | Raw spec IDs                                        | Supported; code and relevant suite evidence |
|  31 | Dependency with a comma is one value                                       | Raw spec IDs                                        | Supported; code and relevant suite evidence |
|  32 | Empty dependency value rejected                                            | Raw spec IDs                                        | Supported; code and relevant suite evidence |
|  33 | Missing dependency target rejected                                         | Raw spec IDs                                        | Supported; code and relevant suite evidence |
|  34 | Remove on an uninitialized spec renders initialized false                  | Mutation output reflects the real initialized state | Supported; code and relevant suite evidence |
|  35 | Add, set, and clear render initialized true                                | Mutation output reflects the real initialized state | Supported; code and relevant suite evidence |

### cli:graph-index

Evidence: graph-index.spec.ts + graph-index-task.spec.ts + SDK/worker integration. See per-spec implementation discussion for scope and limits.

| Requirement                         | Assessment                                               |
| ----------------------------------- | -------------------------------------------------------- |
| Command signature                   | Supported by inspected implementation and suite evidence |
| Indexing behaviour                  | Supported by inspected implementation and suite evidence |
| Output format                       | Supported by inspected implementation and suite evidence |
| Size-skip summary and hint          | Supported by inspected implementation and suite evidence |
| Workspace overlap warning           | Supported by inspected implementation and suite evidence |
| Worker diagnostics presentation     | Supported by inspected implementation and suite evidence |
| Resolution diagnostics presentation | Supported by inspected implementation and suite evidence |
| Forced indexing result completeness | Supported by inspected implementation and suite evidence |
| Error cases                         | Supported by inspected implementation and suite evidence |
| CLI reference documentation         | Supported by inspected implementation and suite evidence |
| Visible incompatibility repair      | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                     | Requirement                         | Assessment                                  |
| --: | ------------------------------------------------------------ | ----------------------------------- | ------------------------------------------- |
|   1 | Minimal invocation with defaults                             | Command signature                   | Supported; code and relevant suite evidence |
|   2 | --exclude-path is project-relative and global                | Command signature                   | Supported; code and relevant suite evidence |
|   3 | --exclude-path value with a comma is one pattern             | Command signature                   | Supported; code and relevant suite evidence |
|   4 | Several patterns by repeating the option                     | Command signature                   | Supported; code and relevant suite evidence |
|   5 | Several patterns listed after one option                     | Command signature                   | Supported; code and relevant suite evidence |
|   6 | Text output shows summary including documents                | Output format                       | Supported; code and relevant suite evidence |
|   7 | Text output with errors                                      | Output format                       | Supported; code and relevant suite evidence |
|   8 | JSON output                                                  | Output format                       | Supported; code and relevant suite evidence |
|   9 | Text output lists the skipped files and the snippet          | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  10 | The list is capped at ten                                    | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  11 | Special characters are escaped in the snippet                | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  12 | Exempt files that were analysed are listed separately        | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  13 | Output is unchanged when nothing exceeded the limit          | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  14 | Structured modes carry data and no hint                      | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  15 | The command never edits the configuration                    | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  16 | Warning in text mode                                         | Workspace overlap warning           | Supported; code and relevant suite evidence |
|  17 | More than ten overlaps                                       | Workspace overlap warning           | Supported; code and relevant suite evidence |
|  18 | No overlap, no section                                       | Workspace overlap warning           | Supported; code and relevant suite evidence |
|  19 | Structured modes carry the diagnostics                       | Workspace overlap warning           | Supported; code and relevant suite evidence |
|  20 | A silent worker produces a warning on standard error         | Worker diagnostics presentation     | Supported; code and relevant suite evidence |
|  21 | Structured modes do not print warnings                       | Worker diagnostics presentation     | Supported; code and relevant suite evidence |
|  22 | A native crash prints its cause and context                  | Worker diagnostics presentation     | Supported; code and relevant suite evidence |
|  23 | Structured failure output carries the cause as data          | Worker diagnostics presentation     | Supported; code and relevant suite evidence |
|  24 | Events cross the worker boundary as JSON values              | Worker diagnostics presentation     | Supported; code and relevant suite evidence |
|  25 | Diagnostics are warnings and do not fail the run             | Resolution diagnostics presentation | Supported; code and relevant suite evidence |
|  26 | Forced structured output reports complete reconsideration    | Forced indexing result completeness | Supported; code and relevant suite evidence |
|  27 | Forced text output does not hide skipped inputs              | Forced indexing result completeness | Supported; code and relevant suite evidence |
|  28 | CLI preserves SDK reconstruction diagnostics                 | Forced indexing result completeness | Supported; code and relevant suite evidence |
|  29 | Mutually exclusive context flags fail fast                   | Error cases                         | Supported; code and relevant suite evidence |
|  30 | Infrastructure error exits with code 3                       | Error cases                         | Supported; code and relevant suite evidence |
|  31 | Lock acquisition failure exits with code 3                   | Error cases                         | Supported; code and relevant suite evidence |
|  32 | Per-file errors do not cause non-zero exit                   | Error cases                         | Supported; code and relevant suite evidence |
|  33 | graph section present in CLI reference                       | CLI reference documentation         | Supported; code and relevant suite evidence |
|  34 | graph index flags documented                                 | CLI reference documentation         | Supported; code and relevant suite evidence |
|  35 | Size limit configuration is documented                       | CLI reference documentation         | Supported; code and relevant suite evidence |
|  36 | Command delegates exactly once to the SDK isolated worker    | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  37 | CLI does not own lock or subprocess mechanics                | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  38 | Explicit config remains forced in the child                  | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  39 | Automatic discovery replays local cascade in the child       | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  40 | Discovery replay does not silently substitute bootstrap      | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  41 | Packaged task invokes SDK indexing once                      | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  42 | Bootstrap context remains explicit                           | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  43 | Index options cross the process boundary unchanged           | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  44 | Text progress is rendered by the parent                      | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  45 | Structured output remains progress-free                      | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  46 | Built structured child output contains only one final result | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  47 | Forced built index returns normally                          | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  48 | Force recovers only typed storage-open failures              | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  49 | Worker failures preserve CLI error semantics                 | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  50 | Production indexing is always process-isolated               | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  51 | CLI reports provider-owned repair                            | Visible incompatibility repair      | Supported; code and relevant suite evidence |

### cli:change-create

Evidence: change-create.spec.ts + Core create-change. See per-spec implementation discussion for scope and limits.

| Requirement                     | Assessment                                               |
| ------------------------------- | -------------------------------------------------------- |
| Command signature               | Supported by inspected implementation and suite evidence |
| Workspace resolution            | Supported by inspected implementation and suite evidence |
| ReadOnly workspace rejection    | Supported by inspected implementation and suite evidence |
| Schema name and version         | Supported by inspected implementation and suite evidence |
| Overlap warning delegation      | Supported by inspected implementation and suite evidence |
| Output on success               | Supported by inspected implementation and suite evidence |
| JSON output includes changePath | Supported by inspected implementation and suite evidence |
| Duplicate name error            | Supported by inspected implementation and suite evidence |

|   # | Scenario                                          | Requirement                     | Assessment                                  |
| --: | ------------------------------------------------- | ------------------------------- | ------------------------------------------- |
|   1 | Missing name argument                             | Command signature               | Supported; code and relevant suite evidence |
|   2 | No --spec flag creates change with empty specIds  | Command signature               | Supported; code and relevant suite evidence |
|   3 | Values are forwarded unchanged                    | Command signature               | Supported; code and relevant suite evidence |
|   4 | A value with a comma is one ID                    | Command signature               | Supported; code and relevant suite evidence |
|   5 | Invalid ID rejected                               | Command signature               | Supported; code and relevant suite evidence |
|   6 | Invalid change name rejected by the core          | Command signature               | Supported; code and relevant suite evidence |
|   7 | Workspace prefix omitted defaults to default      | Workspace resolution            | Supported; code and relevant suite evidence |
|   8 | Explicit workspace prefix used                    | Workspace resolution            | Supported; code and relevant suite evidence |
|   9 | Unknown workspace prefix                          | Workspace resolution            | Supported; code and relevant suite evidence |
|  10 | Workspace derived by the use case                 | Workspace resolution            | Supported; code and relevant suite evidence |
|  11 | Spec targeting readOnly workspace rejected        | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  12 | Multiple readOnly specs each produce an error     | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  13 | Mixed owned and readOnly specs rejected           | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  14 | Owned workspace specs accepted normally           | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  15 | Command checks no ownership itself                | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  16 | Mixed owned and readOnly specs                    | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  17 | Several readOnly specs each produce a line        | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  18 | Schema resolved inside CreateChange               | Schema name and version         | Supported; code and relevant suite evidence |
|  19 | Manifest still records effective schema identity  | Schema name and version         | Supported; code and relevant suite evidence |
|  20 | CLI passes includeOverlapCheck when specs present | Overlap warning delegation      | Supported; code and relevant suite evidence |
|  21 | Overlap warning emitted from result report        | Overlap warning delegation      | Supported; code and relevant suite evidence |
|  22 | CLI does not call detectOverlap directly          | Overlap warning delegation      | Supported; code and relevant suite evidence |
|  23 | No overlap check when specIds empty               | Overlap warning delegation      | Supported; code and relevant suite evidence |
|  24 | Successful creation                               | Output on success               | Supported; code and relevant suite evidence |
|  25 | JSON output contains changePath                   | JSON output includes changePath | Supported; code and relevant suite evidence |
|  26 | Name already exists                               | Duplicate name error            | Supported; code and relevant suite evidence |
|  27 | Invalid invalidation policy                       | Duplicate name error            | Supported; code and relevant suite evidence |

### cli:project-init

Evidence: project-init.spec.ts + Core config-writer. See per-spec implementation discussion for scope and limits.

| Requirement                    | Assessment                                               |
| ------------------------------ | -------------------------------------------------------- |
| Command signature              | Supported by inspected implementation and suite evidence |
| Workspace id validation        | Supported by inspected implementation and suite evidence |
| Interactive mode               | Baseline requirement gap CLI-I1                          |
| Known plugin options           | Supported by inspected implementation and suite evidence |
| Non-interactive mode           | Supported by inspected implementation and suite evidence |
| Config file placement          | Supported by inspected implementation and suite evidence |
| Delegation to ConfigWriter     | Supported by inspected implementation and suite evidence |
| Skills installation after init | Supported by inspected implementation and suite evidence |
| Already initialised            | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                                               | Requirement                    | Assessment                                                        |
| --: | -------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
|   1 | --plugin flag                                                                          | Command signature              | Supported; code and relevant suite evidence                       |
|   2 | specd init alias works identically to specd project init                               | Command signature              | Supported; code and relevant suite evidence                       |
|   3 | specd init --format json produces identical output to specd project init --format json | Command signature              | Supported; code and relevant suite evidence                       |
|   4 | Plugin selection wizard                                                                | Interactive mode               | Supported; code and relevant suite evidence                       |
|   5 | Wizard includes Open Code in known options                                             | Known plugin options           | Supported; code and relevant suite evidence                       |
|   6 | Wizard includes standard agent plugin                                                  | Known plugin options           | Supported; code and relevant suite evidence                       |
|   7 | Default values produce a valid minimal config                                          | Non-interactive mode           | Supported in non-TTY; explicit default flags on TTY expose CLI-I1 |
|   8 | JSON output contains plugins install results                                           | Non-interactive mode           | Supported; code and relevant suite evidence                       |
|   9 | Text output reports metadata cache path                                                | Non-interactive mode           | Supported; code and relevant suite evidence                       |
|  10 | JSON output includes metadataCachePath                                                 | Non-interactive mode           | Supported; code and relevant suite evidence                       |
|  11 | Config written to git root when inside a subdirectory                                  | Config file placement          | Supported; code and relevant suite evidence                       |
|  12 | Config written to CWD when not inside a git repository                                 | Config file placement          | Supported; code and relevant suite evidence                       |
|  13 | Standard directories are created                                                       | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  14 | .gitignore entry is added                                                              | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  15 | Init uses createConfigWriter not InitProject use case                                  | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  16 | tmp gitignore created idempotently                                                     | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  17 | tmp gitignore preserved on re-init with --force                                        | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  18 | Metadata cache directory created idempotently                                          | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  19 | Metadata cache entry appended to root .gitignore                                       | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  20 | CLI surfaces metadataCachePath from the InitProject result rather than re-deriving it  | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  21 | Plugins are installed for selected plugins after init                                  | Skills installation after init | Supported; code and relevant suite evidence                       |
|  22 | Non-interactive mode fails without --force                                             | Already initialised            | Supported; code and relevant suite evidence                       |
|  23 | --force overwrites existing config                                                     | Already initialised            | Supported; code and relevant suite evidence                       |
|  24 | One-character workspace id rejected                                                    | Workspace id validation        | Supported; code and relevant suite evidence                       |
|  25 | Windows device name rejected                                                           | Workspace id validation        | Supported; code and relevant suite evidence                       |
|  26 | Uppercase and underscore rejected                                                      | Workspace id validation        | Supported; code and relevant suite evidence                       |
|  27 | Two-character workspace id accepted                                                    | Workspace id validation        | Supported; code and relevant suite evidence                       |
|  28 | Interactive prompt asks again                                                          | Workspace id validation        | Supported; code and relevant suite evidence                       |
|  29 | No private expression                                                                  | Workspace id validation        | Supported; code and relevant suite evidence                       |

### skills:workflow-automation

Evidence: template-workflow.spec.ts + template rendering/catalog. See per-spec implementation discussion for scope and limits.

| Requirement                              | Assessment                                               |
| ---------------------------------------- | -------------------------------------------------------- |
| Diagnostic Priority                      | Supported by inspected implementation and suite evidence |
| Data Extraction                          | Supported by inspected implementation and suite evidence |
| Spec read surface selection              | Supported by inspected implementation and suite evidence |
| On-demand outline retrieval              | Supported by inspected implementation and suite evidence |
| Repair Strategy                          | Supported by inspected implementation and suite evidence |
| Canonical Command References             | Supported by inspected implementation and suite evidence |
| Command Necessity and Freshness          | Supported by inspected implementation and suite evidence |
| Structural Validation and Content Review | Supported by inspected implementation and suite evidence |
| Implementation traceability policy       | Supported by inspected implementation and suite evidence |
| Context optimization policy              | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                           | Requirement                              | Assessment                                  |
| --: | ------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------- |
|   1 | Agent uses canonical plural status diagnostics                     | Diagnostic Priority                      | Supported; code and relevant suite evidence |
|   2 | Agent chooses TOON for tool-call preparation                       | Data Extraction                          | Supported; code and relevant suite evidence |
|   3 | Agent uses JSON only for an explicit exception                     | Data Extraction                          | Supported; code and relevant suite evidence |
|   4 | Exact artifact authoring uses specs show                           | Spec read surface selection              | Supported; code and relevant suite evidence |
|   5 | Semantic working context uses specs context                        | Spec read surface selection              | Supported; code and relevant suite evidence |
|   6 | Materialization diagnostics use specs metadata                     | Spec read surface selection              | Supported; code and relevant suite evidence |
|   7 | Metadata is not a configuration or default context source          | Spec read surface selection              | Supported; code and relevant suite evidence |
|   8 | Agent fetches full outline using canonical command                 | On-demand outline retrieval              | Supported; code and relevant suite evidence |
|   9 | Agent avoids inline outline dependency                             | On-demand outline retrieval              | Supported; code and relevant suite evidence |
|  10 | Agent follows repair guide after transition failure                | Repair Strategy                          | Supported; code and relevant suite evidence |
|  11 | Agent uses plural canonical groups in instructions                 | Canonical Command References             | Supported; code and relevant suite evidence |
|  12 | Canonical outline command example                                  | Canonical Command References             | Supported; code and relevant suite evidence |
|  13 | Agent reuses equivalent data within the same execution step        | Command Necessity and Freshness          | Supported; code and relevant suite evidence |
|  14 | Agent does not assume continuity across skill sessions             | Command Necessity and Freshness          | Supported; code and relevant suite evidence |
|  15 | Non-deterministic equivalence forces explicit command              | Command Necessity and Freshness          | Supported; code and relevant suite evidence |
|  16 | Validate passes but semantic review is still required              | Structural Validation and Content Review | Supported; code and relevant suite evidence |
|  17 | Successful single-artifact spec validation uses inline diff review | Structural Validation and Content Review | Supported; code and relevant suite evidence |
|  18 | Inline diff unavailability falls back to diff preview command      | Structural Validation and Content Review | Supported; code and relevant suite evidence |
|  19 | Overlap or drift risk requires merged preview                      | Structural Validation and Content Review | Supported; code and relevant suite evidence |
|  20 | Single-artifact review uses preview filtering                      | Structural Validation and Content Review | Supported; code and relevant suite evidence |
|  21 | Agent resolves tracked files explicitly before archive             | Implementation traceability policy       | Supported; code and relevant suite evidence |
|  22 | Agent resolves several files with repeated options                 | Implementation traceability policy       | Supported; code and relevant suite evidence |
|  23 | Agent never joins file names with commas                           | Implementation traceability policy       | Supported; code and relevant suite evidence |
|  24 | Agent delegates to optimizer subagent                              | Context optimization policy              | Supported; code and relevant suite evidence |
|  25 | Inline optimization fallback                                       | Context optimization policy              | Supported; code and relevant suite evidence |

Inventory totals: 70 requirements; 253 scenarios. Two explicit literal-output scenario contradictions; no other explicit compiled scenario failure established in this batch. See four distinct findings above for broader constraints/global contracts.

<!-- END _partial-cli-skills.md -->
