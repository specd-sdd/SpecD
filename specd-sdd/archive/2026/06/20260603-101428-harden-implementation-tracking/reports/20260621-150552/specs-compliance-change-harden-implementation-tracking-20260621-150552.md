# Spec Compliance Audit

Change: `harden-implementation-tracking`
Mode: `--change`
Generated: `20260621-150552`

## Summary

- Scoped specs audited: 6
- Partial reports: 2
- Total findings: 9
- High severity: 3
- Medium severity: 5
- Low severity: 1
- Implementation mismatches: 6
- Spec contradictions: 3

## Detailed Findings

### Partial: Core Audit

# Partial Core Spec Compliance Audit

## Findings

### 1. `FsChangeRepository.saveArtifact()` does not reset artifact state after writing

- Verdict: noncompliant implementation
- Scope: `core:change-repository-port`
- Severity: high

Evidence:

- The scoped spec requires `saveArtifact()` to reset the corresponding change artifact status to `in-progress` after a successful write so the caller can later persist that downgrade with `save(change)`:
  - `specs/core/change-repository-port/spec.md:136-138`
- The implementation performs the drafted guard, conflict check, and file write, but does not mutate the in-memory `Change` or its artifact/file state at all:
  - `packages/core/src/infrastructure/fs/change-repository.ts:488-531`

Why this matters:

- A caller can load a previously validated change, update an artifact through `saveArtifact()`, and then persist the manifest later without the required downgrade ever being applied.
- That leaves stale `complete` or other accepted state attached to changed content, which weakens the repository contract that edited artifact content re-enters review.

Test coverage:

- Existing tests cover successful writes, conflict detection, forced overwrite, and missing change handling:
  - `packages/core/test/infrastructure/fs/change-repository.spec.ts:635-703`
- No test asserts the required state reset after a successful write.

### 2. `artifactExists()` swallows confinement and tracked-file violations instead of rejecting them

- Verdict: noncompliant implementation
- Scope: `core:change-repository-port`
- Severity: medium

Evidence:

- The scoped spec requires `artifact()`, `artifactExists()`, and related artifact lookups to reject path traversal and arbitrary untracked filenames:
  - `specs/core/change-repository-port/spec.md:189-193`
- `artifactExists()` calls `resolveConfinedPath(...)`, but then catches all errors and returns `false`, including confinement failures and untracked-filename rejections:
  - `packages/core/src/infrastructure/fs/change-repository.ts:540-553`
- `resolveConfinedPath(...)` explicitly throws on traversal and on filenames outside the allowed tracked set:
  - `packages/core/src/infrastructure/fs/path-confinement.ts:14-35`

Why this matters:

- Callers cannot distinguish "file absent" from "contract/security violation".
- That weakens the repository boundary the spec intentionally tightened for tracked artifact access.

Test coverage:

- Current tests only cover the true/false existence happy paths:
  - `packages/core/test/infrastructure/fs/change-repository.spec.ts:734-757`
- There is no coverage for traversal or untracked-filename rejection behavior.

### 3. `RepositoryConfig` is contradictory between the base dependency spec and the audited port behavior

- Verdict: spec contradiction
- Scope: `core:change-repository-port`, `core:archive-repository-port` vs dependency `core:repository-port`
- Severity: medium

Evidence:

- The dependency spec still defines `RepositoryConfig` with only `workspace`, `ownership`, and `isExternal`:
  - `specs/core/repository-port/spec.md:11-26`
- The actual base port now requires `configPath`, stores it, and exposes it via `configPath()`:
  - `packages/core/src/application/ports/repository.ts:4-29`
  - `packages/core/src/application/ports/repository.ts:83-90`
- The audited repository behavior already depends on that expanded contract. For example, the scoped change-repository spec relies on config-derived lock placement:
  - `specs/core/storage/spec.md:75-79`
  - `specs/core/storage/spec.md:116-121`

Why this matters:

- The changed repository-port behavior is internally consistent in code, but its direct dependency spec is stale.
- That leaves the spec graph self-contradictory: downstream repository specs now rely on a constructor field the base contract does not admit.

### 4. Refresh exclusion normalization uses a raw prefix check and can misclassify outside-root paths

- Verdict: noncompliant edge-case implementation
- Scope: `core:refresh-implementation-tracking`
- Severity: low

Evidence:

- The scoped spec requires internal repository paths to be normalized from absolute paths into project-relative portable paths before passing them to the detector:
  - in-change preview for `core:refresh-implementation-tracking`, Requirement: Internal directory filtering
- The implementation decides "inside project root" with a plain string-prefix test:
  - `packages/core/src/application/use-cases/refresh-implementation-tracking.ts:181-187`

Why this matters:

- A sibling path that merely shares the same string prefix as `projectRoot` is incorrectly treated as inside the project.
- Example: project root `/repo/app`, internal path `/repo/application/archive` produces the bogus relative exclusion `lication/archive` instead of being rejected as outside the root.
- If storage roots are configured outside the project tree but share a prefix, refresh can pass corrupted `excludePaths` into `ImplementationDetector`.

Test coverage:

- The refresh tests only assert that some exclusion paths are passed, not that the normalized set is correct or that outside-root paths are rejected:
  - `packages/core/test/application/use-cases/refresh-implementation-tracking.spec.ts:70-81`

## Checks With No Findings

- `RefreshImplementationTracking` correctly gates detection on historical `implementing` state, merges new candidates as `open`, preserves non-removed tracked states, removes links when files disappear, revives removed files, and projects through the shared implementation-tracking helper:
  - `packages/core/src/application/use-cases/refresh-implementation-tracking.ts:75-188`
  - `packages/core/test/application/use-cases/refresh-implementation-tracking.spec.ts:84-240`
- The detector port remains demand-driven and graph evidence shows only `RefreshImplementationTracking` depends on `ImplementationDetector`; `GetStatus`, `TransitionChange`, and `CompileContext` do not reference it directly:
  - `packages/core/src/application/ports/implementation-detector.ts:4-27`
  - `packages/core/src/infrastructure/vcs/vcs-implementation-detector.ts:37-76`
  - targeted search over `get-status.ts`, `transition-change.ts`, and `compile-context.ts` returned no `ImplementationDetector` / `detectModifiedFiles` references
- `ChangeRepository` and `ArchiveRepository` are both abstract classes extending the shared repository base, and both expose `internalPaths()` as required by the scoped change:
  - `packages/core/src/application/ports/change-repository.ts:28-254`
  - `packages/core/src/application/ports/archive-repository.ts:54-144`
- `FsArchiveRepository` implements staged archive movement, archive-root confinement, runtime ignore maintenance, reverse index lookup, and `reindex()` behavior consistent with the scoped archive port:
  - `packages/core/src/infrastructure/fs/archive-repository.ts:216-410`
  - `packages/core/src/infrastructure/fs/archive-repository.ts:710-760`
  - `packages/core/test/infrastructure/fs/archive-repository.spec.ts:128-579`

## Residual Risks And Coverage Gaps

- There is no focused test for `internalPaths()` return values on either repository implementation, even though the scoped change relies on those paths for exclusion assembly.
- Archive tests assert `meta.total`, but they do not directly verify `.specd-index-meta.json` persistence and refresh semantics as a first-class artifact.
- I did not find tests that assert debug logging on rejection paths for change/artifact confinement or archive confinement diagnostics; the specs only use `SHOULD` for some of that behavior, so I am treating this as residual risk rather than a hard finding.

## Verdict Summary

- Findings: 4
- High: 1
- Medium: 2
- Low: 1
- No-finding checks completed: 4

### Partial: CLI And Manifest Audit

# Partial Spec Compliance Audit

Change: `harden-implementation-tracking`  
Scope: `cli:change-implementation`, `core:change-manifest`  
Mode: change-scoped partial audit, read-only

## Findings

### 1. High: `resolve` can resolve files that are not currently resolvable under the spec

Affected implementation:

- [packages/core/src/application/use-cases/update-implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-implementation-tracking.ts:228)

Why this is a finding:

- The in-change `cli:change-implementation` spec says `resolve` marks tracked files as fully reviewed, must update tracked-file review state only, and files in `removed` state must not be resolved until refresh resurrects them.
- `_applyResolve()` only checks physical existence, then unconditionally calls `change.trackImplementationFile(file, 'resolved')`.
- That means:
  - an untracked existing file can be introduced directly as `resolved`
  - a tracked `removed` file that reappears on disk can be resolved directly without the required refresh-driven resurrection

Evidence:

- [packages/core/src/application/use-cases/update-implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-implementation-tracking.ts:232)
- Current tests only cover missing-file rejection and the normal tracked-open happy path, not `removed`-but-existing or untracked-existing inputs: [packages/core/test/application/use-cases/update-implementation-tracking.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-implementation-tracking.spec.ts:74)

Assessment:

- Implementation bug.
- Test coverage gap.

### 2. High: `ignore` rejects linked files even though the scoped spec defines it as a tracked-state change, not a link mutation

Affected implementation:

- [packages/core/src/application/use-cases/update-implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-implementation-tracking.ts:199)

Why this is a finding:

- The in-change `cli:change-implementation` spec defines `ignore` as moving tracked files into `ignored` review state while preserving tracked history.
- It does not require confirmed implementation links to be removed first.
- `_applyIgnore()` scans live links for the file and throws `ImplementationLinksExistError` when any exist, preventing the state change entirely.
- That behavior couples review-state management to link deletion, which conflicts with the scoped requirement that `ignore` operate on tracked-file state rather than rewriting implementation links.

Evidence:

- [packages/core/src/application/use-cases/update-implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-implementation-tracking.ts:210)
- The current tests encode the rejecting behavior rather than the scoped spec behavior: [packages/core/test/application/use-cases/update-implementation-tracking.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-implementation-tracking.spec.ts:176)

Assessment:

- Implementation bug relative to the in-change CLI spec.
- Test suite currently reinforces the non-compliant behavior.

### 3. Medium: composed-member stale-symbol fallback ignores symbol kind, so it can clear stale diagnostics on the wrong symbol

Affected implementation:

- [packages/cli/src/commands/change/\_implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/_implementation-tracking.ts:83)

Why this is a finding:

- The in-change `cli:change-implementation` spec says the fallback should retry stale resolution using the rightmost member segment plus the graph-reported symbol kind.
- The implementation retries by `name + filePath` only.
- If the exact symbol string is absent and the same file contains exactly one suffix match of the wrong kind, the CLI will clear the stale diagnostic anyway.
- That weakens the review signal and can incorrectly present a stale archived/confirmed symbol link as healthy.

Evidence:

- Fallback query omits kind filtering: [packages/cli/src/commands/change/\_implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/_implementation-tracking.ts:92)
- The current CLI test suite explicitly treats a unique `property` match as enough to clear stale for `Change.transition`, which demonstrates the missing kind check: [packages/cli/test/commands/change-implementation-tracking.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-implementation-tracking.spec.ts:85)
- This also conflicts with the dependency contract in `code-graph:symbol-model`, where relation staleness is tied to concrete symbol identity rather than best-guess same-name presence.

Assessment:

- Implementation bug.
- Test coverage gap for wrong-kind fallback cases.

### 4. Medium: the in-change `core:change-manifest` schema-name-mismatch rule contradicts both implementation and its `core:change` dependency

Affected implementation:

- [packages/core/src/infrastructure/fs/change-repository.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts:1047)

Why this is a finding:

- The merged `core:change-manifest` preview says schema name and version differences should emit warnings and leave the change usable.
- `FsChangeRepository` still throws `SchemaMismatchError` on schema-name mismatch and only warns on version mismatch.
- The existing `core:change` dependency also still says schema-name mismatch throws.
- This is a spec inconsistency inside the scoped change: the merged manifest spec, the dependency spec, and the implementation do not agree on the same behavior.

Evidence:

- Throw on name mismatch: [packages/core/src/infrastructure/fs/change-repository.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts:1048)
- Regression test locking in the throw behavior: [packages/core/test/infrastructure/fs/change-repository.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/change-repository.spec.ts:1914)

Assessment:

- Spec contradiction.
- Implementation currently matches the dependency spec, not the merged manifest spec.

### 5. Medium: `removed` tracking state is implemented and required by the scoped specs, but the direct dependency `core:change` still permits only three states

Affected implementation:

- [packages/core/src/domain/entities/change.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/domain/entities/change.ts:210)
- [packages/core/src/infrastructure/fs/manifest.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/manifest.ts:318)

Why this is a finding:

- The merged `cli:change-implementation` and `core:change-manifest` specs both rely on a fourth tracked-file state, `removed`.
- The implementation also already models and persists `removed`.
- But the direct dependency `core:change` still states that tracked implementation files carry only `open`, `resolved`, or `ignored`.
- That means the scoped change is not yet internally consistent with one of its declared dependencies.

Evidence:

- Domain model includes `removed`: [packages/core/src/domain/entities/change.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/domain/entities/change.ts:211)
- Manifest schema includes `removed`: [packages/core/src/infrastructure/fs/manifest.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/manifest.ts:320)
- Dependency spec still lists only three states: [specs/core/change/spec.md](/Users/monki/Documents/Proyectos/specd/specs/core/change/spec.md:96)
- The current permanent `core:change-manifest` spec file is likewise still on the old three-state wording, which further indicates the in-change delta has not yet been reconciled with related specs: [specs/core/change-manifest/spec.md](/Users/monki/Documents/Proyectos/specd/specs/core/change-manifest/spec.md:60)

Assessment:

- Spec contradiction.
- Code and in-change deltas are aligned with each other here; the dependency/global spec surface is lagging.

## Coverage Notes

- `cli:change-implementation`
  - Good coverage exists for basic add/remove/ignore/unresolve flows and for ambiguous same-file fallback cases.
  - Missing coverage remains for:
    - `resolve` on a `removed` file that now exists again
    - `resolve` on an untracked existing file
    - `unresolve` on an untracked existing file
    - stale fallback where the only same-file suffix match has the wrong symbol kind

- `core:change-manifest`
  - Persistence coverage is strong for round-tripping implementation tracking, atomic writes, and filename normalization.
  - The current repository tests intentionally preserve the old schema-name mismatch throw behavior, so they currently expose the spec contradiction rather than resolving it.

## Residual Risks

- Because `review` and `list` share the same enrichment path, the stale-symbol fallback defect affects both operator-facing inspection commands.
- Because `resolve` mutates state through `trackImplementationFile(...)`, an agent can create a superficially complete implementation-review state without ever passing through the intended refresh/open workflow.
- The dependency-spec inconsistencies around `removed` and schema-name mismatch increase the chance of future regressions even if code is updated, because different packages are currently justified by different spec texts.

## Verdict

- Findings: 5
- Implementation mismatches: 3
- Spec contradictions: 2
- Testing gaps called out: 4
