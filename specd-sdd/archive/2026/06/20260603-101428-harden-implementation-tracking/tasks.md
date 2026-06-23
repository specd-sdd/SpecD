# Tasks: harden-implementation-tracking

## 1. Domain and manifest state

- [x] 1.1 Add `removed` to tracked implementation state
      `packages/core/src/domain/entities/change.ts`: `TrackedImplementationFileState` — extend the union so `removed` is a first-class persisted review state.
      Approach: add `'removed'` to the literal union without changing the existing `trackImplementationFile(...)` call shape.
      (Req: Manifest structure)

- [x] 1.2 Persist `removed` in manifest type definitions
      `packages/core/src/infrastructure/fs/manifest.ts`: `ManifestTrackedImplementationFileState` and related manifest interfaces — accept `removed` during parse and write.
      Approach: update the manifest-side string union only; keep field names and structure unchanged for additive compatibility.
      (Req: Manifest structure)

- [x] 1.3 Round-trip `removed` through repository serialization
      `packages/core/src/infrastructure/fs/change-repository.ts`: manifest rehydration and `changeToManifest(...)` — load and save tracked files with `removed` state intact.
      Approach: preserve state exactly during load/save; do not reinterpret `removed` as missing or ignored.
      (Req: Manifest structure)

## 2. Port contracts

- [x] 2.1 Extend the detector port with options
      `packages/core/src/application/ports/implementation-detector.ts`: `ImplementationDetector` and new `ImplementationDetectorOptions` — allow refresh to pass exclusion prefixes.
      Approach: change the signature to `detectModifiedFiles(change, options?)` and add `excludePaths?: readonly string[]`.
      (Req: Detector interface, Internal directory filtering)

- [x] 2.2 Add change-storage internal path discovery
      `packages/core/src/application/ports/change-repository.ts`: `ChangeRepository.internalPaths()` — expose absolute `changes/`, `drafts/`, and `discarded/` roots.
      Approach: add a new abstract method returning `readonly string[]`; keep the rest of the port unchanged.
      (Req: internalPaths returns absolute storage paths)

- [x] 2.3 Add archive-storage internal path discovery
      `packages/core/src/application/ports/archive-repository.ts`: `ArchiveRepository.internalPaths()` — expose the absolute archive root.
      Approach: add a new abstract method returning `readonly string[]`.
      (Req: internalPaths returns absolute storage paths)

## 3. Filesystem adapter implementations

- [x] 3.1 Implement `internalPaths()` in `FsChangeRepository`
      `packages/core/src/infrastructure/fs/change-repository.ts`: `FsChangeRepository` — return the configured active, draft, and discarded roots.
      Approach: expose the already-stored absolute constructor paths as a readonly array in stable order.
      (Req: internalPaths returns absolute storage paths)

- [x] 3.2 Implement `internalPaths()` in `FsArchiveRepository`
      `packages/core/src/infrastructure/fs/archive-repository.ts`: `FsArchiveRepository` — return the configured archive root.
      Approach: expose the existing absolute archive path as a single-element readonly array.
      (Req: internalPaths returns absolute storage paths)

- [x] 3.3 Filter detector results using exclusion prefixes
      `packages/core/src/infrastructure/vcs/vcs-implementation-detector.ts`: `detectModifiedFiles(...)` — honor `options.excludePaths`.
      Approach: normalize repo-relative paths first, then drop any candidate equal to an excluded prefix or under `prefix + '/'`; keep filtering deterministic and portable-path-based.
      (Req: Detector interface, Internal directory filtering)

## 4. Refresh implementation tracking

- [x] 4.1 Expand refresh constructor dependencies
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: `RefreshImplementationTracking` constructor — inject `ArchiveRepository`, `FileReader`, and `projectRoot`.
      Approach: keep the use case in the application layer by routing existence checks through `FileReader` and path roots through injected configuration, not raw `fs`.
      (Req: Constructor dependencies)

- [x] 4.2 Normalize internal exclusion roots for refresh
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: `execute()` and private helpers — convert repo-owned absolute paths into portable project-relative prefixes.
      Approach: derive exclusions from `changes.internalPaths()` and `archives.internalPaths()`, drop paths outside `projectRoot`, then de-duplicate and sort.
      (Req: Internal directory filtering)

- [x] 4.3 Pass exclusions into candidate detection
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: `execute()` — call the detector with options.
      Approach: change the detector invocation to `detectModifiedFiles(change, { excludePaths })` after the historical implementing guard succeeds.
      (Req: Detection merge semantics, Internal directory filtering)

- [x] 4.4 Merge newly detected files without regressing valid states
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: candidate merge branch — add unseen files as `open` and revive detected `removed` files to `open`.
      Approach: keep existing `resolved` and `ignored` states unchanged during the detection merge pass; only `removed` is auto-reopened.
      (Req: Detection merge semantics, Resurrections and re-appearances)

- [x] 4.5 Sweep tracked files for physical removal
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: existence pass over tracked files — detect missing files on disk.
      Approach: iterate every tracked file except `ignored`, resolve the absolute path under `projectRoot`, and use `FileReader.read(...) === null` as the missing-file signal.
      (Req: Deletion and removal semantics)

- [x] 4.6 Remove live links when a file becomes `removed`
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: link cleanup helper — clear file-level and symbol-level links for missing files.
      Approach: gather all `implementationLinks` for the file and call `change.removeImplementationLink(specId, file)` for each unique spec/file pair in the same serialized mutation.
      (Req: Deletion and removal semantics)

- [x] 4.7 Reopen resurrected files during existence sweep
      `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`: existence pass — promote `removed` files back to `open` when they exist again.
      Approach: if a tracked file is currently `removed` and `FileReader.read(...)` returns content, call `trackImplementationFile(file, 'open')`.
      (Req: Resurrections and re-appearances)

## 5. Manual mutation validation and CLI behavior

- [x] 5.1 Move `add` validation into the core mutation use case
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: constructor and `_applyAdd(...)` — require on-disk existence before adding links for a new file.
      Approach: inject `FileReader` and `projectRoot`, resolve the absolute path, and throw `ImplementationFileNotFoundError` from core when the file is missing.
      (Req: Add subcommand)

- [x] 5.2 Tighten `resolve` and `unresolve` tracked-file invariants in the core mutation use case
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: `resolve` and `unresolve` branches — reject untracked files and keep `removed` files non-reopenable outside refresh.
      Approach: add an explicit tracked-membership guard before state mutation, keep the existing existence check, and refuse manual reopening of `removed` files so only refresh-driven resurrection can return them to `open`.
      (Req: Resolve subcommand, Unresolve subcommand)

- [x] 5.3 Support tracked-missing ignore without deleting confirmed links
      `packages/core/src/application/use-cases/update-implementation-tracking.ts`: `_applyIgnore(...)` — allow missing files only when they are already tracked and preserve confirmed implementation links for tracked files.
      Approach: if the file is tracked, skip existence validation and update only tracked-file review state; if untracked, require `FileReader.read(...) !== null` before adding the ignored entry; remove the rejection path that throws solely because links still exist.
      (Req: Ignore subcommand)

- [x] 5.4 Add `unresolve` to the CLI and remove CLI-side `stat(...)` preflight
      `packages/cli/src/commands/change/implementation.ts`: command registration and `mutateImplementationTracking(...)` — expose the new reopen command and stop checking existence in the delivery layer.
      Approach: add `unresolve <name> --file <paths...>` wired to the new core action, delete the `stat` import and the preflight loop, and delegate all validation to `UpdateImplementationTracking`.
      (Req: Add subcommand, Resolve subcommand, Unresolve subcommand, Ignore subcommand)

- [x] 5.5 Render the `removed` group in text output
      `packages/cli/src/commands/change/implementation.ts`: `renderImplementationState(...)` — show `removed` alongside `open`, `resolved`, and `ignored`.
      Approach: extend the explicit state-order array and leave link rendering unchanged.
      (Req: List subcommand)

- [x] 5.6 Preserve `removed` in enriched CLI review output
      `packages/cli/src/commands/change/_implementation-tracking.ts`: `EnrichedImplementationTracking` projection consumers — ensure no filtering assumes only three states.
      Approach: keep the raw tracked-file list intact and let the command renderer group states.
      (Req: List subcommand, Review subcommand)

- [x] 5.7 Make stale-symbol fallback kind-aware
      `packages/cli/src/commands/change/_implementation-tracking.ts`: same-file composed-member fallback in stale-symbol enrichment — accept fallback matches only when the graph-reported symbol kind matches the stored link's expected kind.
      Approach: keep the rightmost-member fallback logic, but filter same-file candidates by both normalized member name and symbol kind before deciding whether the fallback is unique.
      (Req: List subcommand, Review subcommand)

## 6. Composition wiring

- [x] 6.1 Wire refresh dependencies through the kernel
      `packages/core/src/composition/kernel.ts` and related composition helpers — build `RefreshImplementationTracking` with `changeRepo`, `archiveRepo`, `files`, and `config.projectRoot`.
      Approach: reuse the existing `FsFileReader` wiring already present in kernel internals instead of introducing a new adapter.
      (Req: Constructor dependencies)

- [x] 6.2 Wire mutation-validation dependencies through the kernel
      `packages/core/src/composition/kernel.ts` and related composition helpers — build `UpdateImplementationTracking` with `files` and `config.projectRoot`.
      Approach: keep constructor expansion localized to composition and shared test fixtures.
      (Req: Add subcommand, Resolve subcommand, Ignore subcommand)

- [x] 6.3 Update kernel and helper test fixtures for new constructors
      `packages/core/test/composition/*` and `packages/core/test/application/use-cases/helpers.ts` — provide the extra injected collaborators required by refresh and update use cases.
      Approach: add reusable stub helpers for `FileReader.read(...)` and repository `internalPaths()` so constructor churn is centralized.
      (Req: Constructor dependencies)

## 7. Artifact persistence invariants

- [x] 7.1 Reset rewritten artifacts to `in-progress`
      `packages/core/src/infrastructure/fs/change-repository.ts`: `saveArtifact(...)` — reopen the saved artifact file and recompute aggregate state after every write.
      Approach: after the filesystem write succeeds, mark the affected artifact file as `in-progress` in the persisted change model so later validation is required again.
      (Req: Manifest structure, Artifacts)

- [x] 7.2 Propagate repository guard failures from `artifactExists(...)`
      `packages/core/src/infrastructure/fs/change-repository.ts`: `artifactExists(...)` — distinguish absent tracked files from invalid or forbidden artifact lookups.
      Approach: return `false` only for genuinely missing tracked files, but rethrow confinement errors, spec-not-tracked errors, and other repository contract violations instead of collapsing them to a negative existence result.
      (Req: ChangeRepository Port, Manifest structure)

- [x] 7.3 Extend filesystem repository tests for reopened-state and guard propagation
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: artifact write / existence cases — prove rewritten artifacts become `in-progress` and invalid artifact lookups fail loudly.
      Approach: add targeted repo integration tests around `saveArtifact(...)` and `artifactExists(...)` using real temp directories and tracked spec-scoped artifacts.
      (Req: Manifest structure, global testing and conventions)

## 8. Specs and docs

- [x] 7.1 Add detector-port spec delta
      `specd-sdd/changes/20260603-101428-harden-implementation-tracking/deltas/core/implementation-detector-port/spec.md.delta.yaml`: document `ImplementationDetectorOptions` and `detectModifiedFiles(change, options?)`.
      Approach: update the detector interface requirement and constraints so the refresh spec’s new call shape is explicitly supported.
      (Req: Detector interface)

- [x] 7.2 Add detector-port verify delta
      `specd-sdd/changes/20260603-101428-harden-implementation-tracking/deltas/core/implementation-detector-port/verify.md.delta.yaml`: cover exclusion-path behavior.
      Approach: add scenarios for exclusion filtering and for refresh passing exclusions into the detector call.
      (Req: Detector interface, Targeted lifecycle use)

- [x] 7.3 Update CLI reference docs
      `docs/cli/cli-reference.md`: `change implementation` reference — document `removed`, tracked-missing `ignore`, `unresolve`, and core-owned validation behavior.
      Approach: update the state list and command descriptions to match the post-change CLI behavior exactly.
      (Req: List subcommand, Ignore subcommand, Unresolve subcommand)

- [x] 7.4 Update core port docs
      `docs/core/ports.md`: `ChangeRepository`, `ArchiveRepository`, and `ImplementationDetector` sections — document `internalPaths()` and detector options.
      Approach: keep signatures and behavioral notes aligned with the code-level public contracts.
      (Req: internalPaths returns absolute storage paths, Detector interface)

- [x] 7.5 Update core use-case docs
      `docs/core/use-cases.md`: refresh and update-implementation-tracking sections — describe constructor changes, removal semantics, resurrection, and delegated validation.
      Approach: record the new collaborators and lifecycle behavior in the same public constructor format used throughout the doc.
      (Req: Constructor dependencies, Deletion and removal semantics)

## 9. Test execution and end-to-end verification

- [x] 9.1 Extend update-implementation-tracking use-case tests for tracked-only resolve semantics
      `packages/core/test/application/use-cases/update-implementation-tracking.spec.ts`: cover resolve/unresolve rejection for untracked files and ignore preserving confirmed links.
      Approach: add focused unit tests for tracked-membership validation, removed-file rejection, and linked tracked-file ignore transitions without link deletion.
      (Req: Resolve subcommand, Unresolve subcommand, Ignore subcommand)

- [x] 9.2 Extend CLI stale-symbol tests for kind-aware fallback
      `packages/cli/test/commands/change/implementation.spec.ts`: verify same-file fallback stays stale when only wrong-kind symbols match and succeeds when a unique same-kind match exists.
      Approach: drive the review/list rendering through graph fixtures that expose multiple same-name candidates with differing kinds.
      (Req: List subcommand, Review subcommand)

- [x] 9.3 Extend refresh use-case tests
      `packages/core/test/application/use-cases/refresh-implementation-tracking.spec.ts`: cover exclusions, deletion, resurrection, ignored-file stability, and link cleanup.
      Approach: use fixture stubs for detector output, file-reader reads, and pre-seeded links so each behavior is isolated and deterministic.
      (Req: Detection merge semantics, Deletion and removal semantics, Resurrections and re-appearances)

- [x] 9.4 Extend detector infrastructure tests
      `packages/core/test/infrastructure/vcs/vcs-implementation-detector.spec.ts`: verify exclusion-prefix filtering after normalization.
      Approach: assert that excluded internal roots are dropped while unrelated normalized files remain in the result.
      (Req: Detector interface)

- [x] 9.5 Extend CLI command tests
      `packages/cli/test/commands/change/implementation.spec.ts`: verify `removed` output, tracked-missing ignore flow, and `unresolve` reopening rules.
      Approach: drive the command through kernel mocks that throw or return updated projections instead of depending on filesystem preflight.
      (Req: List subcommand, Ignore subcommand, Unresolve subcommand)

- [x] 9.6 Run package validation commands
      `packages/core` and `packages/cli`: test + lint — confirm constructor wiring, docs references, and state handling compile cleanly.
      Approach: rerun the package test and lint commands after the audit follow-up fixes and resolve any fixture breakage caused by the corrected mutation and repository behavior.
      (Req: global testing and conventions)

- [x] 9.7 Perform manual resurrection / removal verification
      Active change workflow: end-to-end refresh and CLI review — prove delete, ignore, and recreate flows work in a real repo.
      Approach: add a linked file, delete it, refresh to `removed`, ignore it while missing, recreate it, refresh again, and confirm it returns to `open` with links cleared when absent; also verify that resolve/unresolve reject untracked files and that kind-mismatched stale-symbol fallback remains stale.
      (Req: Deletion and removal semantics, Resurrections and re-appearances, Ignore subcommand)
