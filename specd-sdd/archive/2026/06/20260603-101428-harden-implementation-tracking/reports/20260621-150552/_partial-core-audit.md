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
