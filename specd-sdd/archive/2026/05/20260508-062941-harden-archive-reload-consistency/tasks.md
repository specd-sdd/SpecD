# Tasks: harden-archive-reload-consistency

## 1. Domain and manifest semantics

- [x] 1.1 Add `archive-failed` to the domain event model
      `packages/core/src/domain/entities/change.ts`: `ArchiveFailureStep`, `ArchiveFailedEvent`, `ChangeEvent` — add the new failure event shape so active changes can record failed archive attempts without inventing a success event
      Approach: introduce a narrow `ArchiveFailureStep` union plus `recordArchiveFailure(step, message, actor, commitStarted)`; keep success traceability on archived manifests only
      (Req: Archive outcome history, Archive outcome history events)

- [x] 1.2 Serialize and deserialize `archive-failed` in manifests
      `packages/core/src/infrastructure/fs/manifest.ts`: raw event schema and event conversion helpers — persist `step`, `message`, and `commitStarted` in `manifest.json`
      Approach: extend the manifest event union additively so older manifests remain readable and archived success still relies on `archivedAt` / `archivedBy`
      (Req: Manifest structure, Archive outcome history events)

- [x] 1.3 Preserve tracked filenames during artifact sync and reload
      `packages/core/src/domain/entities/change.ts`: `syncArtifacts()` and `packages/core/src/infrastructure/fs/change-repository.ts`: `_manifestToChange()` — stop silently flipping direct tracked files into delta paths based only on current `specExists`
      Approach: continue using `expectedArtifactFilename()` for first-time file creation, but preserve an existing tracked filename unless the representation class is proven equivalent
      (Req: Tracked artifact filename is authoritative, Filename normalization preserves tracked intent, Artifact filenames use expected paths)

## 2. Repository hardening and confinement

- [x] 2.1 Add a shared fs path-confinement helper
      `packages/core/src/infrastructure/fs/path-confinement.ts`: new helper — centralize relative-path normalization, root confinement, and optional allowed-set checking
      Approach: resolve candidate paths against a root, reject traversal/escape forms, and optionally require membership in a tracked/expected relative-path set so all fs repositories enforce one rule
      (Req: Change artifact path confinement, Spec artifact path confinement, Archive path confinement, Repository path confinement)

- [x] 2.2 Restrict change artifact reads to tracked files only
      `packages/core/src/infrastructure/fs/change-repository.ts`: `artifact()`, `artifactExists()` — reject any filename not present in the change's tracked artifact files and emit debug diagnostics
      Approach: compute the allowed relative-path set from `change.artifacts`, route all reads/existence checks through the confinement helper, and log success/rejection via `Logger.debug(...)`
      (Req: artifact only loads tracked change artifact files, Change artifact path confinement, Change artifact resolution debug logging)

- [x] 2.3 Restrict spec artifact reads and writes to expected files only
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `artifact()`, `save()` — prevent arbitrary extra filenames from being treated as normal artifact IO
      Approach: allow only adapter-expected artifact basenames for the normal artifact API, confine resolved paths to the spec root, and emit debug logs for accept/reject decisions
      (Req: Spec artifact access is limited to expected artifact files, Spec artifact path confinement, Spec artifact resolution debug logging)

- [x] 2.4 Harden archive path derivation and staged archive visibility
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `archive()`, `archivePath()`, fallback/index helpers — reject archive-root escapes and make commit phases observable in debug logs
      Approach: validate pattern-derived and recovered relative paths through the confinement helper, keep archive manifest/index visibility behind a staged sequence, and log start/completion/failure boundaries
      (Req: archive persists through a staged commit, Archive path confinement, Archive repository debug logging, Staged archive persistence, Storage debug logging)

## 3. Validation and archive orchestration

- [x] 3.1 Validate tracked files instead of recomputed alternate paths
      `packages/core/src/application/use-cases/validate-artifacts.ts`: `execute()` — consume the tracked `ArtifactFile.filename` when a file already exists on the change and fail if the tracked file is missing
      Approach: use the tracked file as the authoritative read target, keep `expectedArtifactFilename()` only for first-time expectations/reporting, and ensure `result.files` always reports the tracked/effective filename
      (Req: Tracked artifact selection at archive time, Result shape, artifact only loads tracked change artifact files)

- [x] 3.2 Enforce artifact-level delta base existence and reject invalid mixed new-spec shapes
      `packages/core/src/application/use-cases/validate-artifacts.ts`: delta-application branch — fail early when a tracked delta requires a missing base artifact, even if another artifact for the same spec exists
      Approach: check the exact output artifact base (`verify.md`, `spec.md`, etc.) in `SpecRepository` before delta apply, and treat direct/new + delta/missing-base mixes as validation failures before archive
      (Req: Delta eligibility uses artifact-level base existence, Invalid mixed representation for new specs, Per-file validation)

- [x] 3.3 Refactor `ArchiveChange` into prepare and commit phases
      `packages/core/src/application/use-cases/archive-change.ts`: `execute()` and new internal plan helpers — build merged output in memory before the first permanent spec save
      Approach: introduce `PreparedArchiveWrite` / `PreparedArchivePlan`, load tracked files only, merge delta-backed artifacts against exact bases in memory, then run a commit loop only after plan preparation succeeds
      (Req: Tracked artifact selection at archive time, Prepare archive plan before permanent writes, Staged archive commit and failed-attempt visibility)

- [x] 3.4 Record archive failures and add debug diagnostics in use cases
      `packages/core/src/application/use-cases/archive-change.ts`: failure handling and `packages/core/src/application/use-cases/validate-artifacts.ts`: debug sites — surface the failure phase and keep external lifecycle semantics as “archive still pending”
      Approach: wrap prepare/commit/archive/metadata phases, mutate the active change with `recordArchiveFailure(...)` on failure, set `commitStarted` accurately, and log tracked selection plus phase transitions with `Logger.debug(...)`
      (Req: Archive outcome history, Archive outcome history events, Archive debug logging, Storage debug logging)

## 4. Regression coverage and follow-up

- [x] 4.1 Extend archive and validation regression suites
      `packages/core/test/application/use-cases/archive-change.spec.ts` and `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: new describe blocks — cover the original new-spec `verify` delta bug, tracked-file precedence, prepare-before-write, and `archive-failed` semantics
      Approach: model a new spec with direct `spec.md` plus stray/invalid `verify` delta, assert validation fails pre-archive, and assert archive prepare failures leave permanent specs untouched
      (Req: Tracked artifact selection at archive time, Prepare archive plan before permanent writes, Delta eligibility uses artifact-level base existence, Invalid mixed representation for new specs, Archive outcome history events)

- [x] 4.2 Extend repository and domain hardening tests
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`, `packages/core/test/infrastructure/fs/spec-repository.spec.ts`, `packages/core/test/infrastructure/fs/archive-repository.spec.ts`, `packages/core/test/domain/entities/change.spec.ts`, `packages/core/test/domain/services/artifact-filename.spec.ts` — prove confinement, tracked-only access, archive-root safety, and new failure-event behavior
      Approach: add direct untracked-read, traversal, path-escape, reload-after-partial-materialization, and `recordArchiveFailure(...)` cases; keep `expectedArtifactFilename()` tests focused on initial resolution only
      (Req: Change artifact path confinement, Spec artifact path confinement, Archive path confinement, Filename normalization preserves tracked intent, Archive outcome history)

- [x] 4.3 Run focused test, lint, and manual recovery checks
      `packages/core/test/*` and CLI validation/archive commands — verify the end-to-end behavior before leaving `implementing`
      Approach: run the focused core suites from `design.md`, lint `@specd/core`, then manually reproduce the original “new spec + stray verify delta” case through `changes validate` and archive-related commands to confirm no partial writes or representation flips remain
      (Req: Archive debug logging, Result shape, Storage debug logging)

- [x] 4.4 Update docs only if the implementation changes operator-facing recovery guidance
      `docs/core/*`, `docs/adr/0007-archive-organization.md`, `docs/adr/0009-artifact-status-derivation.md` — capture any new recovery/debug workflow that becomes visible to users or maintainers
      Approach: keep this task conditional; perform it only if implementation introduces user-facing archive failure handling, documented debug-log usage, or archive-recovery guidance beyond internal code comments/JSDoc
      (Req: Storage, ArchiveRepository Port, default:\_global/docs)
