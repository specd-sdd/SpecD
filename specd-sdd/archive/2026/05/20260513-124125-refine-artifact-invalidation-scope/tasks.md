# Tasks: refine-artifact-invalidation-scope

## 1. Domain invalidation model

- [x] 1.1 Add the shared invalidation-policy value object
      `packages/core/src/domain/value-objects/invalidation-policy.ts`: `InvalidationPolicy`, `DEFAULT_INVALIDATION_POLICY`, `isInvalidationPolicy` — create the canonical policy type used by config, manifest, use cases, and CLI parsing.
      Approach: add a small domain value-object module exporting the four-string union and a narrow type guard so the same type is reused everywhere instead of duplicating string literals.
      (Req: Invalidation policy configuration, Effective policy resolution)
- [x] 1.2 Add drift-aware file state helpers
      `packages/core/src/domain/value-objects/artifact-file.ts`: `ArtifactFile` — persist `hasDrift`, add `markDrifted()`, `clearDrift()`, and `displayStatus()` so `complete-with-drift` is derived centrally.
      Approach: keep canonical `status` separate from display state; `displayStatus()` returns `complete-with-drift` only for `status === 'complete' && hasDrift === true`, and `markComplete()` clears drift after successful validation.
      (Req: Per-file drift tracking, Drift-aware display status)
- [x] 1.3 Make `Change.invalidate()` policy-aware
      `packages/core/src/domain/entities/change.ts`: `Change.invalidate()` and private helpers — resolve the effective invalidation policy, expand the affected set over the artifact DAG, append invalidation history, and reopen files according to `none`/`surgical`/`downstream`/`global`.
      Approach: preserve the existing call shape as far as possible by adding an optional `invalidationPolicyOverride`, return the final deduplicated affected set, and keep `artifact-drift`-specific `hasDrift` materialization inside the entity while leaving detection outside it.
      (Req: Policy-aware invalidation, Policy-aware artifact effects, Change-level invalidation is unconditional)
- [x] 1.4 Preserve canonical `missing` while still tracking drift
      `packages/core/src/domain/entities/change.ts` and `packages/core/src/domain/value-objects/artifact-file.ts`: missing-state handling — ensure absent files remain canonically `missing` even when they no longer match the validated baseline.
      Approach: let `hasDrift` coexist with `missing`, but never surface `complete-with-drift` for missing files and never let drift-only helpers override canonical absence.
      (Req: Structural integrity vs. content drift, Missing beats drift state)

## 2. Manifest, repository, and config plumbing

- [x] 2.1 Extend manifest types and schema
      `packages/core/src/infrastructure/fs/manifest.ts`: `ManifestArtifactFile`, `ManifestArtifact`, `ChangeManifest`, and Zod schemas — add change-level `invalidationPolicy` and file-level `hasDrift`.
      Approach: make the new fields loader-tolerant for old manifests, defaulting missing policy to `downstream` and missing `hasDrift` to `false` during hydration while always writing the new fields on save.
      (Req: Manifest structure, Invalidation policy configuration)
- [x] 2.2 Rework repository hydration/serialization for drift-aware state
      `packages/core/src/infrastructure/fs/change-repository.ts`: `_manifestToChange()`, `_deriveFileStatus()`, `changeToManifest()`, and `serializeArtifact()` — hydrate `hasDrift`, preserve state-before-hash semantics, keep load-time drift detection, and stop rewriting `missing + validatedHash` into persisted `complete`.
      Approach: continue comparing disk vs. `validatedHash` on load, but always delegate consequences to `Change.invalidate('artifact-drift', ...)`; during serialization, persist canonical state plus `hasDrift` verbatim instead of inferring state from hash presence.
      (Req: Policy-aware drift materialization, Manifest structure, Repository role)
- [x] 2.3 Add `invalidationPolicy` to resolved config
      `packages/core/src/application/specd-config.ts` and `packages/core/src/infrastructure/fs/config-loader.ts`: `SpecdConfig` and config parsing — expose a validated root-level `invalidationPolicy` with default `downstream`.
      Approach: thread the new field through the resolved config shape and strict YAML validation so kernel builders and CLI bootstrap receive one canonical project default.
      (Req: Invalidation policy configuration)
- [x] 2.4 Seed and edit persisted invalidation policy on changes
      `packages/core/src/application/use-cases/create-change.ts`, `packages/core/src/application/use-cases/edit-change.ts`, `packages/core/src/composition/use-cases/create-change.ts`, and `packages/core/src/composition/use-cases/edit-change.ts`: use-case inputs and wiring — persist the project default at creation and allow later edits without inventing drift.
      Approach: extend `CreateChangeInput` and `EditChangeInput` with invalidation-policy fields, pass `config.invalidationPolicy` from composition, and update only persisted policy unless spec scope changes require normal invalidation.
      (Req: Initial invalidation policy, Invalidation policy edits)

## 3. Manual invalidation flow

- [x] 3.1 Implement the new core use case
      `packages/core/src/application/use-cases/invalidate-change.ts`: `InvalidateChange` — add the manual invalidation use case with policy resolution, target normalization, approval/signoff `force` guard, and final affected-set reporting.
      Approach: validate command shape against the effective policy before any mutation, accumulate all target errors, normalize repeated targets into concrete artifact/file entries, and call `freshChange.invalidate('artifact-review-required', ...)` inside repository mutation.
      (Req: Input contract, Policy-dependent target rules, Target normalization and validation, Approval guard, Output contract)
- [x] 3.2 Expose the use case through the kernel
      `packages/core/src/composition/kernel.ts` and any required exports/index files — register `kernel.changes.invalidate` and wire the dependencies needed by `InvalidateChange`.
      Approach: keep composition aligned with existing use-case registration patterns so CLI and any future delivery surface consume the same core contract.
      (Req: Dependencies, Effective policy resolution)
- [x] 3.3 Add the CLI command surface
      `packages/cli/src/commands/change/invalidate.ts` and `packages/cli/src/index.ts`: `registerChangeInvalidate()` — add `changes invalidate <name> --reason <text> [--policy <policy>] [--target <target> ...] [--force]`.
      Approach: make `--target` the only targeting surface, parse `<artifactId>` and `<artifactId>@<specId>` into normalized target inputs, reject targets for effective `none`/`global`, and report the final deduplicated affected set grouped by artifact in DAG-forest order.
      (Req: Command signature, Target syntax, Policy-dependent target requirements, Reporting, Error handling)
- [x] 3.4 Align existing invalidation callers with the new entity semantics
      `packages/core/src/application/use-cases/validate-artifacts.ts`, `packages/core/src/application/use-cases/transition-change.ts`, and any overlap/archive callers of `Change.invalidate()` — update call sites to pass focused payloads and rely on the entity for policy execution.
      Approach: keep drift detection and semantic review triggers where they already live, but stop reproducing reopening rules outside the entity; manual invalidation must never set `hasDrift`.
      (Req: Drift authority, Manual invalidation cause, Manual invalidation does not invent drift)

## 4. Status surfaces, docs, and operator output

- [x] 4.1 Extend the status read model with drift-aware display fields
      `packages/core/src/application/use-cases/get-status.ts`: `ArtifactFileStatus`, `ArtifactStatusEntry`, and aggregation logic — add `hasDrift` and `displayStatus` at file and artifact level.
      Approach: derive artifact display state from file display states using the precedence fixed in the spec, while leaving `state` and `effectiveStatus` canonical for lifecycle decisions.
      (Req: Drift-aware display status, Display aggregation)
- [x] 4.2 Render display state in `change status`
      `packages/cli/src/commands/change/status.ts`: text and JSON/toon output — show `displayStatus` to humans while still exposing canonical state fields in structured output.
      Approach: swap the text-mode state column to display semantics, enrich the JSON schema with `displayStatus` and `hasDrift`, and keep review/blocker sections unchanged except where they read the richer status payload.
      (Req: Display-state rendering)
- [x] 4.3 Render display state in `change artifacts`
      `packages/cli/src/commands/change/artifacts.ts`: artifact row building and JSON schema — expose `displayStatus` and `hasDrift` and keep artifact summaries derived from file-level display states.
      Approach: reuse `kernel.changes.status.execute(...)` as the single source of display-state truth, replacing hand-rolled file-state output with the new read-model fields.
      (Req: Drift-aware artifact listing)
- [x] 4.4 Update operator-facing documentation and CLI help
      `docs/` plus affected command help text in `packages/cli/src/commands/change/edit.ts`, `packages/cli/src/commands/change/status.ts`, `packages/cli/src/commands/change/artifacts.ts`, and new `packages/cli/src/commands/change/invalidate.ts` — document `invalidationPolicy`, `complete-with-drift`, and approval invalidation with `--force`.
      Approach: keep docs focused on runtime/operator behavior, not implementation internals; add short help snippets where the new fields or flags appear so users do not have to infer semantics from status output.
      (Req: Invalidation policy configuration, `none` semantics, Reporting)

## 5. Automated and manual verification

- [x] 5.1 Add entity and repository coverage for policy-aware invalidation
      `packages/core/test/domain/entities/change.spec.ts`, `packages/core/test/domain/value-objects/artifact-file.spec.ts`, and `packages/core/test/infrastructure/fs/change-repository.spec.ts` — cover policy expansion, `hasDrift`, `displayStatus()`, manifest round-trip, and load-time drift handling.
      Approach: test `none`/`surgical`/`downstream`/`global` explicitly, assert that only focused drift payloads set `hasDrift`, and pin the canonical `missing + hasDrift=true` behavior so repository serialization cannot regress.
      (Req: Policy-aware invalidation, Per-file drift tracking, Manifest structure)
- [x] 5.2 Add use-case coverage for validate/create/edit/invalidate
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`, `packages/core/test/application/use-cases/create-change.spec.ts`, `packages/core/test/application/use-cases/edit-change.spec.ts`, and new `packages/core/test/application/use-cases/invalidate-change.spec.ts` — verify policy resolution, drift materialization, create/edit persistence, target validation, and `--force`-equivalent guard behavior.
      Approach: mirror the verify scenarios directly in use-case tests, using focused changes with multi-file artifacts so deduplication and downstream expansion are asserted on real payload shapes.
      (Req: Policy-aware drift materialization, Initial invalidation policy, Invalidation policy edits, Approval guard)
- [x] 5.3 Add CLI coverage for status/artifacts/invalidate
      `packages/cli/test/commands/change/status.spec.ts`, `packages/cli/test/commands/change/artifacts.spec.ts`, and new `packages/cli/test/commands/change/invalidate.spec.ts` — verify human and structured output for display-state rendering and manual invalidation reporting.
      Approach: assert exact text for `complete-with-drift`, approval warnings, prohibited/missing target combinations, and grouped final affected-set output rather than only exit codes.
      (Req: Display-state rendering, Drift-aware artifact listing, Reporting, Error handling)
- [x] 5.4 Run end-to-end checks and capture manual verification steps
      `pnpm build`, targeted core/CLI tests, and scratch-change CLI exercises — confirm the implemented flow matches the manual verification plan from `design.md`.
      Approach: execute the documented commands for `changes validate`, `changes status`, `changes artifacts`, and `changes invalidate` across at least one `none` case and one `downstream` case, then update docs/help text if the real operator experience exposes ambiguities.
      (Req: `none` semantics, Reporting, Testing)

## 6. Follow-up after compliance audit

- [x] 6.1 Restore the `change artifacts` text contract
      `packages/cli/src/commands/change/artifacts.ts`: text-mode row serializer — emit `<id>  <artifact-state>  <file-state>  <exists>  <absolute-path>` again while keeping `displayStatus` as the human-facing file-state projection.
      Approach: keep `artifactRows` as the single assembled read model, but render `artifactState`, `displayStatus`, `exists`, and `path` in text mode instead of the current reduced three-column output; preserve `hasDrift` and `displayStatus` in structured output.
      (Req: Drift-aware artifact listing, Reporting)

- [x] 6.2 Make manual invalidation failures typed and explicit
      `packages/core/src/application/use-cases/invalidate-change.ts` plus new `packages/core/src/application/errors/invalid-invalidate-target-error.ts` and `packages/core/src/application/errors/invalidate-requires-force-error.ts`: invalidation error handling — replace generic `Error` throws for invalid targets and missing `--force` with `SpecdError` subclasses, preserving the current human-readable wording.
      Approach: accumulate target messages as today, then wrap them in a typed `SpecdError`; use a dedicated typed error for the approval/signoff guard so CLI JSON/toon output becomes structured through `handleError()`.
      (Req: Target normalization and validation, Approval guard, Error handling)

- [x] 6.3 Fix `change invalidate` reporting order and force-warning text
      `packages/core/src/application/use-cases/invalidate-change.ts` and `packages/cli/src/commands/change/invalidate.ts`: affected-set reporting — ensure downstream/global expansion is emitted in linear DAG-forest traversal order and that the missing-force warning explicitly says the active approval/signoff will be invalidated.
      Approach: replace the current discovery-order descendant walk with a deterministic branch-exhausting traversal that produces the final affected set in report order, then keep the CLI as a thin formatter over that order; update the force-guard message without changing the decision that transitioning back to `designing` reopens the whole change.
      (Req: Reporting, Approval guard, Change-level invalidation is unconditional)

- [x] 6.4 Add regression coverage for the audit follow-up
      `packages/core/test/application/use-cases/invalidate-change.spec.ts`, `packages/cli/test/commands/change/change-invalidate.spec.ts`, `packages/cli/test/commands/change/change-artifacts.spec.ts`, and any impacted `handle-error` tests — cover typed invalidation errors, explicit approval/signoff invalidation warning text, deterministic affected-set order, and full text-mode artifact rows with absolute paths.
      Approach: assert exact output and error codes rather than just exit codes; include one test that confirms `changes transition <name> designing` still reopens the full artifact set intentionally so this behavior is not "fixed" by accident.
      (Req: Error handling, Reporting, Drift-aware artifact listing, Testing)
