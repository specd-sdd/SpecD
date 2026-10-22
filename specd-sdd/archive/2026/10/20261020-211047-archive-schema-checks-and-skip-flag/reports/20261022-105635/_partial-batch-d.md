# Partial audit batch D: core:change, core:kernel, core:lifecycle-engine, skills:skill-templates-source

Change: `archive-schema-checks-and-skip-flag` (working tree = implementation). Read-only audit. Graph index known stale; used file reads.
Note: spec-preview IDs are `core:change`, `core:kernel`, `core:lifecycle-engine`, `skills:skill-templates-source` (the `core/` path prefix is not part of the id).

---

## 1. core:change

### Requirements Summary

Delta modifies only "History and event sourcing" prose and the "Overlap conflict invalidation" scenario (from a prior-audit baseline: wording `spec.overlap` bypassed instead of `allowOverlap`). Notably the `spec-overlap-conflict` cause now reads "archived with `spec.overlap` bypassed". Verify delta is a no-op.

### Implementation Status

| Facet                                                                                                                     | Status                                                    | Evidence                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalidated.cause = spec-overlap-conflict` recorded for overlapping peers when archive runs with `spec.overlap` bypassed | Conformant                                                | `packages/core/src/application/use-cases/archive-change.ts` L338-340 (`overlapBypassed`), L377-382, `_invalidateOverlappingChanges` L1219-1252 builds one reconcile intent per peer; message names the archived change and overlapping spec IDs |
| One focused event naming archiving change `alpha` + overlap spec IDs                                                      | Conformant                                                | message `Invalidated because change '<archived>' was archived with overlapping specs: <ids>` (L1240)                                                                                                                                            |
| Artifact reopening follows the peer's policy / lifecycle recovery follows workflow policy                                 | Conformant (delegated)                                    | via `ReconcileChangeValidity` intent `spec-overlap-conflict` (`reconcile-change-validity.ts` L415, 470-471, 655, 706-723)                                                                                                                       |
| No duplicate events on repeated observation                                                                               | Conformant by design, not tested for this cause           | reconcile dedupes generally (test `reopens drifted artifacts once and repeats without a second event` covers drift only)                                                                                                                        |
| Event table incl. `artifact-skipped`                                                                                      | Not audited here (pre-existing; unchanged by this change) | -                                                                                                                                                                                                                                               |

### Discrepancies

| #   | Sev  | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Spec wrong | Code wrong |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| C-1 | Info | The spec prose says "A broad later event MUST NOT make unrelated evidence disappear" and "active scope reconciliation SHALL record ... `approval-invalidated`", while the table still lists the legacy `invalidated` cause `spec-overlap-conflict`. The code reconciles overlap through `spec-overlap-conflict` intent (`reconcile-change-validity.ts` L470 `pushStaleGate(... 'spec-overlap-conflict')`) and in the tested path asserts `invalidated` cause via `change.spec`. Consistent; no contradiction found. | n/a        | n/a        |
| C-2 | Low  | In `archive-change.spec.ts` L4079-4160 the "reconciles overlapping peers with a spec-overlap-conflict intent" test mocks `ReconcileChangeValidity` and asserts only the intent shape (and that `mutate` is not called). The scenario's "one focused event", "artifact reopening follows policy", "repeated observation does not append duplicates" are not asserted end-to-end for the overlap cause. L3395-3420 asserts only `cause === 'spec-overlap-conflict'` and `state === 'drafting'`.                       | -          | Weak test  |

### Test Coverage

- `test/application/use-cases/archive-change.spec.ts` L3395-3420 (cause recorded), L4079-4160 (intent shape).
- `test/domain/entities/change.spec.ts` L597-613 (entity accepts `spec-overlap-conflict`).
- `test/application/use-cases/reconcile-change-validity.spec.ts` L190 (idempotence for drift only).

### Missing Tests

- Scenario "Overlap conflict invalidation" last bullet: repeated archive-observation for the same overlap produces no second `invalidated`/recovery event (reconcile spec has no overlap-specific idempotence case).
- No assertion that the event message names the archived change and all overlap spec IDs through the real reconcile path (only intent reason string).

### Spec Dependency Chain

`core:change` -> `core:change-manifest`, `core:lifecycle-engine`, `core:archive-change` (producer of the intent), `core:spec-overlap`. The archive-change delta consistently uses `spec.overlap` bypass wording. Project specs (`_global/architecture`, `error-handling-conventions`, `testing`): no conflict; the application layer drives the domain through a use case port, no domain->infra import.

### Summary counts

Requirements/facets: 4 changed. Conformant 4. Discrepancies: 0 High/Med, 1 Low (weak test), 1 Info. Scenarios: 1 in delta, partially covered. Missing tests 2.

---

## 2. core:kernel

### Requirements Summary

"Allowed runtime override inputs" table: `TransitionChange` = `skipHookPhases`, `skipChecks`, `refreshImplementationTrackingBefore`; `ArchiveChange` = `skipHookPhases`, `skipChecks`. New scenarios "CompileContext permits documented override fields only" and "Archive and transition accept uniform check bypasses only" (no `allowOverlap`/`allowOutOfScope`).

### Implementation Status

| Requirement / table row                                                                                                                                                                           | Status     | Evidence                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArchiveChangeInput`: `name`, `skipHookPhases`, `skipChecks` only                                                                                                                                 | Conformant | `use-cases/archive-change.ts` (`ArchiveChangeInput`: `name`, `skipHookPhases?`, `skipChecks?: readonly string[]`)                                                                                                |
| `TransitionChangeInput`: `skipHookPhases`, `skipChecks`, `refreshImplementationTrackingBefore`                                                                                                    | Conformant | `use-cases/transition-change.ts` L53-81 (+ `name`, `to`)                                                                                                                                                         |
| No `allowOverlap`/`allowOutOfScope` on either input                                                                                                                                               | Conformant | no hits in `packages/core/src/application`; `transition-change.ts` L288 comment: "Core accepts only the uniform skipChecks contract. Legacy flags are adapter concerns."                                         |
| `CompileContextInput` fields                                                                                                                                                                      | Conformant | `name`, `step`, `contextMode`, `llmOptimizedContext`, `includeChangeSpecs`, `followDeps`, `depth`, `sections`, `fingerprint`; no `config`                                                                        |
| `GetProjectContextInput`, `GetSpecContextInput`, `RunStepHooks(only)`, `GetStatus(refreshImplementationTracking)`, `CreateChange(includeOverlapCheck)`, `ValidateArtifacts(specPath, artifactId)` | Conformant | confirmed by reading each `*Input` interface (`GetSpecContextInput` also has required `workspace`, `specPath`; `GetStatusInput` has extra `ifModifiedSince`; `RunStepHooksInput` has required `name/step/phase`) |

### Discrepancies

| #   | Sev | Detail                                                                                                                                                                                                                                                                                                                             | Spec wrong       | Code wrong                 |
| --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------- |
| K-1 | Low | `GetStatusInput.ifModifiedSince` is not in the kernel override table (table lists only `refreshImplementationTracking` for `GetStatus`). It is a conditional-read optimization, not config re-read, but the spec says "Fields not listed remain subject to the construction-time rule". Pre-existing, outside this change's delta. | Table incomplete | Possible extra input field |
| K-2 | Low | The "table" is also silent on `GetSpecContext.workspace/specPath` required identifiers (the CompileContext scenario explicitly notes required per-call identifiers; no equivalent for other use cases). Pre-existing doc gap.                                                                                                      | Wording gap      | -                          |

### Test Coverage

- New: `test/application/use-cases/archive-change-input.spec.ts` (untracked file) uses `expectTypeOf(...).toHaveProperty/not.toHaveProperty` for `skipChecks`, `skipHookPhases`, `allowOverlap`, `allowOutOfScope` on both inputs. Enforced by `tsc --noEmit` because `packages/core/tsconfig.json` includes `test`; vitest runs only add `expect(true)` placeholders (vitest typecheck is NOT enabled, so enforcement is via `pnpm typecheck`, not `pnpm test`).
- `test/application/use-cases/kernel-input-boundary.spec.ts` guards "no `config` key" for CompileContext/GetProjectContext only.

### Missing Tests

- Scenario "CompileContext permits documented override fields only" has no test asserting the optional field set equals the documented set (only absence of `config`). Weak/partial.
- `archive-change-input.spec.ts` is untracked: must be added to the commit, otherwise the scenario has zero coverage.
- No dedicated runtime check of the other table rows (GetStatus, CreateChange, ValidateArtifacts, RunStepHooks).

### Spec Dependency Chain

`core:kernel` -> `core:archive-change`, `core:transition-checks` (skipChecks contract), `default:_global/architecture` (application ports; inputs carry no config re-read). Consistent: archive-change delta defines `skipChecks`, kernel lists it. Error handling: `UnknownCheckError`/`CheckNotSkippableError` documented on both use cases (`@throws`), consistent with `error-handling-conventions`.

### Summary counts

Facets: 9 table rows + 2 scenarios. Conformant 11/11. Discrepancies: 0 High/Med, 2 Low (pre-existing spec gaps). Missing/weak tests: 3.

---

## 3. core:lifecycle-engine

### Requirements Summary

Spec delta is a no-op (CLI aliases accepted, projected bypass flags canonical `--skip-checks <id>`). Verify delta modifies requirement "Available steps and domain next hop" with ~17 scenarios (skip bypass, overlap review hop, incomplete/complete tasks, step-skip shortcut scenarios, disabled verifying, hop matrix, availableSteps ordering). Only the first scenario ("Skip bypass allows transition despite blocker") relates directly to this change; the rest are step-skip/hop-matrix scenarios from the earlier optional-step work and are restated in the same section.

### Implementation Status

| Requirement                                                                                                             | Status                         | Evidence                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bypassed skippable `OVERLAP_CONFLICT` is omitted from `blockers`, no warnings channel                                   | Conformant                     | `lifecycle-verdict.ts` `blockersFromFailedChecks` L843-868 returns `[]` when `isBypassFlagActive` (L19-40 accepts `--skip-checks spec.overlap`, bare id `spec.overlap`, and legacy `allow-overlap`/`--allow-overlap`); no `warnings` field                                                                                     |
| `isPermitted` true for target after bypass                                                                              | Conformant (indirect)          | blockers drive `isPermitted`; not directly asserted                                                                                                                                                                                                                                                                            |
| `review.reason spec-overlap-conflict` -> `nextHop.targetStep designing`, `command /specd-design`, no `OVERLAP_CONFLICT` | Conformant                     | test `lifecycle-verdict.spec.ts` L469-510; `get-status.spec.ts` L1368-1383                                                                                                                                                                                                                                                     |
| `isSkippable` / `bypassFlag` "SHALL come from the resolved binding of the failing check"                                | Discrepancy                    | see L-1                                                                                                                                                                                                                                                                                                                        |
| Projected bypass flags canonical form                                                                                   | Conformant                     | `lifecycle-verdict.ts` L860-861 emits `--skip-checks spec.overlap` / `--skip-checks impl.linksInScope`                                                                                                                                                                                                                         |
| Step-skip / shortcut / hop-matrix scenarios                                                                             | Conformant (pre-existing code) | tests `lifecycle-engine.spec.ts` L65-99 (shortcut, fallback, empty set, furthest), `lifecycle-verdict.spec.ts` L703-823 (tasks, designing->ready, verifying->done, archivable), L898 (done backward hops), L1160 (checksByTarget evidence), L1193 (explicit alternative), `lifecycle-engine.spec.ts` L310 (noncanonical order) |

### Discrepancies

| #   | Sev                                                            | Detail                                                                                                                                                                                                                                                                     | Spec wrong  | Code wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ----------------------------------------- |
| L-1 | Low (Medium if a schema can mark `spec.overlap` non-skippable) | `blockersFromFailedChecks` still hardcodes `skippable = code === 'OVERLAP_CONFLICT'                                                                                                                                                                                        |             | impl.linksInScope`and fixed`bypassFlag` strings (L853-861) instead of the resolved binding, contradicting spec "`isSkippable`and`bypassFlag`SHALL come from the resolved binding of the failing check". Because schemas can now configure`spec.overlap`skippability (check-bindings L179 default true), a non-skippable schema binding would still be reported skippable at the verdict level (GetStatus overrides the public`Blocker`, per prior audit D-GS-2). Unchanged since baseline. | Spec arguably right | Code incomplete (verdict ignores binding) |
| L-2 | Low                                                            | `isBypassFlagActive` retains legacy `allow-overlap`/`allow-out-of-scope` tokens (L25-38) and the doc comment at L77, although Core inputs no longer carry them. Harmless leniency; spec says aliases are accepted inputs at the adapter level. Dead surface in the domain. | Spec silent | Could be dropped                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| L-3 | Low                                                            | Test names stale: `lifecycle-verdict.spec.ts` L870 "bypassFlag is --allow-out-of-scope" asserts `--skip-checks impl.linksInScope`; L512 "bypassFlags include allow-overlap" keeps the legacy token.                                                                        | -           | Misleading test titles                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| L-4 | Info                                                           | Verify delta for lifecycle-engine rewrites the whole "Available steps" scenario block while the spec delta is a no-op, so the change's real effect on this spec is one scenario wording. The extra ~16 scenarios inflate the audit surface; consider limiting the delta.   | Process     | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Test Coverage

- Scenario "Skip bypass allows transition despite blocker": `lifecycle-verdict.spec.ts` L512 (legacy token) and new L544 (canonical `spec.overlap`) assert only `blockers` has no `OVERLAP_CONFLICT`. Neither asserts the "no warning object" clause nor `isPermitted === true` for the target.
- "Overlap review hop is designing": covered L469.
- Others: covered as listed above.

### Missing Tests

- Direct assertion of `isPermitted === true` after the overlap bypass (scenario THEN clause) and absence of any warning object.
- Test that a non-skippable `spec.overlap` binding yields `isSkippable: false` at verdict level (would expose L-1).
- Bypass with the exact `--skip-checks spec.overlap` string form (the test uses the bare id only).

### Spec Dependency Chain

`core:lifecycle-engine` -> `core:transition-checks` (shared candidate evaluator, `checksByTarget`), `core:workflow-model` (pipeline, `step-skip`), `core:check-registry`/`core:schema-format` (binding skippability). The "resolved binding" sentence ties directly to `core:check-registry`; implementation lags (L-1). Architecture: verdict is pure domain, no I/O, consistent with `_global/architecture`.

### Summary counts

Scenarios in delta: 17. Conformant 17 (1 only indirectly asserted). Discrepancies: 0 High, 0 Medium (1 latent), 3 Low, 1 Info. Missing tests 3.

---

## 4. skills:skill-templates-source

### Requirements Summary

Revised "Overlap invalidation vs live archive overlap in templates": `OVERLAP_CONFLICT` is live archive blocker (`spec.overlap`, skippable with `--skip-checks spec.overlap`); design/implement/verify/new templates must not list it as a typical blocker and must not teach `--skip-checks spec.overlap`/`--allow-overlap` as response to `spec-overlap-conflict` review; `specd-archive` may list it and must say the status-shown `--skip-checks <id>` bypass applies only to live blockers; no bypass offered where status shows none. Four scenarios (2 reworded, 2 new: canonical bypass, no-flag blocker).

### Implementation Status

| Requirement                                                                                                                                                                              | Status     | Evidence                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| design/implement/verify/new: no `OVERLAP_CONFLICT` as typical blocker; review overlap routes to `/specd-design`, "never bypassed with `--skip-checks spec.overlap` or `--allow-overlap`" | Conformant | `specd-design/SKILL.md.tpl` L44-47, `specd-implement` L24-26, `specd-verify` L25-27, `specd-new` L135-138 |
| Archive may list `OVERLAP_CONFLICT`; bypass only for live overlap, `spec-overlap-conflict` -> `/specd-design`, never bypass                                                              | Conformant | `specd-archive/SKILL.md.tpl` L25-31                                                                       |
| Archive teaches `--skip-checks <checkId>` canonical, id from status                                                                                                                      | Conformant | L216-224                                                                                                  |
| Aliases `--allow-overlap`/`--allow-out-of-scope` only as aliases                                                                                                                         | Conformant | L229-231                                                                                                  |
| Blocker with no bypass flag cannot be skipped; names `workspace.readOnly`, `impl.filesResolved`, `deps.consistent` never bypassable                                                      | Conformant | L28-29 and L225-229                                                                                       |

### Discrepancies

| #   | Sev  | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Spec wrong         | Code wrong                                                 |
| --- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| S-1 | Low  | `specd-design/SKILL.md.tpl` L44-45 names `--skip-checks spec.overlap` positively ("bypassed with ...") for live archive overlap inside the design skill; spec forbids listing `OVERLAP_CONFLICT` as a typical blocker and teaching the flag for review. Mention is an exclusion note, scenario wording allows it, but it is the one template that positively names the bypass outside archive.                                                                                                     | Scenario ambiguous | Could drop positive mention (implement/verify/new omit it) |
| S-2 | Info | Archive template adds `verification.current`, schema, archivable and task-completion checks to the "never bypassable on archive" list, beyond the spec's three. Core: archive locked set is `schema.nameMatch`, `archive.archivable`, `workspace.readOnly`, `deps.consistent`, `impl.filesResolved` (`check-bindings.ts` L150-200) plus `verification.current` (skippable false); "task-completion" is a transition predicate, not an archive row. Slightly over-specific but not wrong in effect. | Spec incomplete    | Minor over-claim                                           |
| S-3 | Low  | Skill text advises "Ask the user whether to proceed" then re-run with bypass shown by status, while `SpecOverlapError` no longer carries a bypass hint in the message (core change); the skill depends on `specd changes status` to name the bypass. Consistent with the spec, but CLI adapter must suppress the hint when `skippable` is false (verify in cli batch).                                                                                                                             | -                  | Cross-batch dependency                                     |

### Test Coverage (`packages/skills/test/template-workflow.spec.ts`, modified)

- L220-237: hop skills do not list `OVERLAP_CONFLICT` in the first `(e.g. ...)`, contain `spec-overlap-conflict`, `/specd-design`, and the "never bypassed with ..." phrase; archive lists `OVERLAP_CONFLICT`, `--skip-checks spec.overlap`, `spec-overlap-conflict`, "never bypass it".
- L239-248: canonical `--skip-checks <checkId>`, `--skip-checks impl.linksInScope`, aliases sentence, no "with `--allow-overlap`" on archive.
- L250-257: names three never-bypassable checks and `shows no \`bypass:\` flag`.
  All four scenarios covered; assertions are substring-based (wording-sensitive) but adequate.

### Missing Tests

- No negative assertion that design/implement/verify/new do not teach `--skip-checks spec.overlap` as the review response beyond the phrase presence check (substring "never bypassed with" proves intent only).
- Rendered/installed skill output (plugin-agent-\* frontmatter packaging) not tested for the new text; templates only.

### Spec Dependency Chain

`skills:skill-templates-source` -> `core:lifecycle-engine` (review reason routing, projected bypass flag), `core:archive-change` (skipChecks, locked checks), `cli:change-archive`/`cli:change-status` (flags and `bypass:` line in status output). Consistent with those deltas. `_global/testing`: tests are colocated and deterministic; fine.

### Summary counts

Scenarios: 4 (2 reworded, 2 new). Conformant 4/4. Discrepancies: 0 High/Med, 2 Low, 1 Info. Missing tests: 2 minor.

---

## Overall batch D

- Specs: 4. Facets conformant: all behavior-affecting facets. No High, no confirmed Medium.
- Notable: L-1 (verdict `isSkippable`/`bypassFlag` hardcoded rather than from resolved binding; latent Medium), untracked new test `archive-change-input.spec.ts` (must be committed), weak overlap-conflict scenario assertions (C-2, lifecycle skip-bypass `isPermitted`/no-warning clauses), stale test titles (L-3).
- Spec-wrong vs code-wrong: L-1 could alternatively be resolved by weakening the spec sentence to "default bypass" if the verdict deliberately stays schema-agnostic; K-1 resolved by listing `ifModifiedSince` in the kernel table.
