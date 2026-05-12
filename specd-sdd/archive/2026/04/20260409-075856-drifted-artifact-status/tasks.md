# Tasks: drifted-artifact-status

## 1. Domain artifact state model

- [x] 1.1 Extend the shared artifact state enum and file transitions
      `packages/core/src/domain/value-objects/artifact-status.ts`, `packages/core/src/domain/value-objects/artifact-file.ts`: `ArtifactStatus`, `ArtifactFile` — add `pending-review` and `drifted-pending-review` as first-class states and expose explicit transition methods for them.
      Approach: keep `validatedHash` as the last validated cleaned hash, add dedicated mutation methods instead of overloading `resetValidation()`, and default missing persisted state to `missing` only at repository load time.
      (Req: Artifacts, Manifest structure)

- [x] 1.2 Materialize aggregate artifact state from file states
      `packages/core/src/domain/entities/change-artifact.ts`: `ChangeArtifact` — store and recompute aggregate artifact state from `files[].state` with precedence `drifted-pending-review > pending-review > skipped > complete > missing > in-progress`.
      Approach: add an internal recomputation path invoked by `setFile()`, `removeFile()`, validation completion, skip, and review/drift downgrade methods so the persisted aggregate always matches the file-level source of truth.
      (Req: Artifacts)

- [x] 1.3 Redesign change invalidation around structured affected-file payloads
      `packages/core/src/domain/entities/change.ts`: `InvalidatedEvent`, `invalidate()`, `updateSpecIds()`, `effectiveStatus()` — record `cause`, `message`, and `affectedArtifacts`, downgrade files to `pending-review` or `drifted-pending-review`, preserve existing drift, and keep dependency satisfaction separate from own state.
      Approach: replace the current artifact-ID-only invalidation with `InvalidatedArtifactEntry[]`, mark drifted files first, then downgrade downstream closure files to `pending-review`, and keep `effectiveStatus()` only as a compatibility helper for lifecycle gating while public read models expose persisted `state`.
      (Req: Lifecycle, Implementation and verification loop, Artifacts, History and event sourcing, Step semantics, Requires-based gating)

## 2. Manifest persistence and eager drift detection

- [x] 2.1 Extend the manifest schema for persisted file and artifact states
      `packages/core/src/infrastructure/fs/manifest.ts`: `ManifestArtifactFile`, `ManifestArtifact`, `RawInvalidatedEvent`, zod schemas — persist `state` on artifact/file entries and structured `invalidated` payloads with `message` and `affectedArtifacts`.
      Approach: make `state` optional on read for defensive fallback, but always emit it on save; add a dedicated manifest shape for `affectedArtifacts` instead of storing prose-only history.
      (Req: Manifest structure, History and event sourcing)

- [x] 2.2 Rehydrate and serialize the new state model in the fs repository
      `packages/core/src/infrastructure/fs/change-repository.ts`: `_manifestToChange()`, `_deriveFileStatus()`, `changeToManifest()`, `serializeArtifact()` — load persisted state when present, materialize fallback state only for old entries without `state`, and serialize aggregate/file states back to the manifest.
      Approach: stop using `validatedHash` as the steady-state source of truth, keep the old hash-comparison logic only as a fallback materializer, and persist the rewritten manifest after sync/load when a legacy missing-state entry is encountered.
      (Req: get returns a Change or null, Manifest structure)

- [x] 2.3 Collect full drift sets before eager invalidation on load
      `packages/core/src/infrastructure/fs/change-repository.ts`: auto-invalidation block in `_manifestToChange()` — scan all artifact files, collect every drifted file key per artifact, then persist one structured `artifact-drift` invalidation with the full set before returning the change.
      Approach: replace the current `Set<string>` artifact-ID collector with a `Map<string, Set<string>>`, only invalidate after the scan completes, and preserve `drifted-pending-review` when the change was already in `designing`.
      (Req: Auto-invalidation on get when artifact files drift, Lifecycle, History and event sourcing)

- [x] 2.4 Update validation-time drift handling and selective completion
      `packages/core/src/application/use-cases/validate-artifacts.ts`: `execute()` — detect approval/signoff drift at file granularity, invalidate with structured affected files, and keep successful validations marking only the targeted file `complete`.
      Approach: collect all drifted file keys before mutating, call the redesigned `invalidate('artifact-drift', ...)`, then mark completed validations and `specDependsOn` updates in the same repository mutation without clearing unrelated files.
      (Req: Approval invalidation on content change, Hash computation and markComplete, Auto-invalidation on get when artifact files drift)

## 3. Lifecycle routing and status projection

- [x] 3.1 Remove implicit artifact reset from `verifying → implementing`
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange.execute()` — stop clearing artifact validations on the `verifying → implementing` path and only downgrade artifacts when the transition actually returns to `designing`.
      Approach: delete the `clearArtifactValidations(implementingStep.requires)` branch, route all redesign cases through the redesigned invalidation API, and leave implementation-only failures as pure lifecycle transitions.
      (Req: Artifact validation clearing on verifying to implementing, Transition to designing from any state, Implementation and verification loop, Step semantics)

- [x] 3.2 Expose persisted artifact/file state plus review summary in `GetStatus`
      `packages/core/src/application/use-cases/get-status.ts`: `ArtifactFileStatus`, `ArtifactStatusEntry`, `GetStatusResult`, `execute()` — add aggregate `state`, keep lifecycle blockers separate, project each file's persisted `validatedHash`, and return a stable `review` block derived from current file states and the latest invalidation context.
      Approach: project artifact state from `ChangeArtifact.status`, keep `validatedHash` in each file DTO for downstream serializers, derive `review.required` from any file in `pending-review` or `drifted-pending-review`, prefer `artifact-drift` over `artifact-review-required` when both are possible, and compute transition blockers from persisted dependency-satisfying states (`complete`/`skipped`) rather than from hash-derived status.
      (Req: Returns the change and its artifact statuses, Returns lifecycle context, Requires-based gating, Step availability evaluation)

## 4. CLI and documentation surfaces

- [x] 4.1 Redesign `change status` output for artifact/file state and review routing
      `packages/cli/src/commands/change/status.ts`: `registerChangeStatus()` — show aggregate artifact state, nested file states, lifecycle blockers, and a `review` section in text plus a stable `review` object in JSON/TOON.
      Approach: stop serializing only `effectiveStatus`, use the new `GetStatus` DTO directly, keep text output compact with indentation under each artifact, and only render the review section when `review.required` is true.
      (Req: Output format, Returns the change and its artifact statuses, Returns lifecycle context)

- [x] 4.2 Redesign `change artifacts` output around per-file state
      `packages/cli/src/commands/change/artifacts.ts`: `registerChangeArtifacts()` — list one row per file entry with its individual state, include the parent artifact aggregate state, emit the absolute path for each file row plus `changeDir` in structured output, and keep delta rows explicit instead of faking them as the artifact’s only status.
      Approach: flatten `artifactStatuses[].files` into file rows, add the artifact aggregate state and absolute file path as first-class columns/fields, expose the absolute change directory once at the top-level JSON/TOON payload, and keep schema-derived delta metadata as supplemental rows instead of replacing the persisted state model.
      (Req: Output format, Returns the change and its artifact statuses)

- [x] 4.3 Update CLI reference documentation for the new state model
      `docs/cli/cli-reference.md`: `change status`, `change artifacts` sections — document the new states, the `review` block, the per-file `validatedHash` in structured status output, and the text-mode/structured per-file rendering for artifact listings so operators and skills have one canonical description.
      Approach: update examples to show `pending-review` and `drifted-pending-review`, explain that agents consume `change status`/`change context` rather than the manifest, include `changeDir`/absolute file paths where the command returns them, and keep the docs aligned with the final JSON field names from the CLI commands.
      (Req: Output format)

## 5. Automated and manual verification

- [x] 5.1 Add domain regression coverage for file/aggregate state and invalidation
      `packages/core/test/domain/entities/change.spec.ts`, `packages/core/test/domain/entities/change-artifact.spec.ts`, `packages/core/test/domain/value-objects/artifact-file.spec.ts` — cover aggregate precedence, drift preservation, `pending-review` downgrade, and structured invalidation payloads.
      Approach: pin the state machine first with small focused unit tests so later repository and CLI work can rely on stable domain semantics.
      (Req: Lifecycle, Artifacts, History and event sourcing, Artifact validation clearing on verifying to implementing)

- [x] 5.2 Add application and repository regression coverage for persistence and routing
      `packages/core/test/application/use-cases/get-status.spec.ts`, `packages/core/test/application/use-cases/validate-artifacts.spec.ts`, `packages/core/test/application/use-cases/transition-change.spec.ts`, `packages/core/test/infrastructure/fs/change-repository.spec.ts` — cover persisted-state round-trips, full drift collection, review summary derivation, and verification-to-implementation/designing routing.
      Approach: assert the exact structured payloads (`review`, `affectedArtifacts`, `message`) and the absence of unintended artifact resets on `verifying → implementing`.
      (Req: get returns a Change or null, Auto-invalidation on get when artifact files drift, Approval invalidation on content change, Hash computation and markComplete, Returns lifecycle context, Transition to designing from any state, Step availability evaluation)

- [x] 5.3 Add CLI command regression coverage for the new public output shapes
      `packages/cli/test/commands/change.spec.ts`, `packages/cli/test/commands/change-artifacts.spec.ts` — update text and JSON expectations for aggregate artifact state, per-file state, and the `review` section.
      Approach: keep existing happy-path fixtures and extend them with `pending-review` / `drifted-pending-review` rows so text and structured output stay aligned.
      (Req: Output format)

- [x] 5.4 Run the manual verification flow and update artifacts/docs if output diverges
      `node packages/cli/dist/index.js change status drifted-artifact-status --format text|json`, `node packages/cli/dist/index.js change artifacts drifted-artifact-status --format text|json`, targeted `pnpm --filter @specd/core test -- ...`, targeted `pnpm --filter @specd/cli test -- ...` — confirm implementation-only verify failures preserve artifact state, artifact edits trigger `drifted-pending-review`, and docs examples match the real CLI output.
      Approach: follow the end-to-end sequence from `design.md` exactly, using one implementation-only rollback and one artifact-drift rollback, then reconcile any final wording mismatches in `docs/cli/cli-reference.md`.
      (Req: Lifecycle, Implementation and verification loop, Output format)

## 6. Follow-up regressions after manual review

- [x] 6.1 Lock the “drift once, revalidate to complete” semantics
      `packages/core/src/infrastructure/fs/change-repository.ts`, `packages/core/test/infrastructure/fs/change-repository.spec.ts`: eager drift detection on load and repository reload regression — ensure the first detected drift invalidates the change, but later explicit revalidation of that file can restore `complete` without causing repeated invalidations on every subsequent `get()`.
      Approach: keep eager drift detection limited to files currently persisted as `complete`, then add an integration-style repository test that simulates drift, reload invalidation, explicit revalidation via `markComplete()`, and a clean reload with no second invalidation.
      (Req: Lifecycle, Auto-invalidation on get when artifact files drift, Hash computation and markComplete).

- [x] 6.2 Preserve backward compatibility for historical invalidation causes
      `packages/core/src/infrastructure/fs/manifest.ts`, `packages/core/src/infrastructure/fs/change-repository.ts`, focused manifest/repository regressions, and `core:core/kernel` deltas: accept older manifests whose `invalidated.cause` is `artifact-change`, map them to the new artifact-drift semantics on load, keep global readers such as dashboard/list/history working across archived and discarded changes, and update the kernel-level eager-load contract to match the new cause and payload.
      Approach: widen the raw manifest reader to accept the legacy persisted value, normalize it at deserialization time in the fs read path, keep the domain/event model canonical on `artifact-drift`, and add regression coverage using a real historical-style manifest fixture rather than only unit-level synthetic events.
      (Req: Manifest structure, History and event sourcing)

- [x] 6.3 Reproject review summaries around filename and absolute path
      `packages/core/src/application/use-cases/get-status.ts`, `packages/cli/src/commands/change/status.ts`, `packages/core/test/application/use-cases/get-status.spec.ts`, `packages/cli/test/commands/change.spec.ts`, CLI docs if examples move: make `review.affectedArtifacts[].files[]` surface concrete `{ filename, path }` data and render text-mode review output with files/paths instead of raw file keys.
      Approach: resolve invalidated file keys against the current artifact file entries inside `GetStatus`, keep `key` only as supplemental context where useful, and update text/JSON expectations so `tasks` reads as `tasks.md` (or its absolute path) rather than `tasks`.
      (Req: Returns the change and its artifact statuses, Output format)
