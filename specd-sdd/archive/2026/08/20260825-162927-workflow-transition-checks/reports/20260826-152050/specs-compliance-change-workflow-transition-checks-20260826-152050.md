# Specs compliance — change `workflow-transition-checks`

**Mode:** `--change workflow-transition-checks` (full verify + compliance)  
**State at audit:** `verifying`  
**Evidence collected:** 20260826-152050  
**This recategorization:** 20260826-153500 (same evidence; wrong “leftover / other change” framing removed)  
**Graph at collection:** `stale: false`

**Correction:** This branch **is** the new engine (self-sufficient checks → `CheckResult` → projection). The gather-then-evaluate engine lives on `main`. `PredicateSnapshots` / `gatherPredicateSnapshots` / engine `check.run` fallback are **unfinished work of this change**, not debt to document and ship.

Partials under this directory keep the original evidence tables. Verdicts below override their “or rewrite the spec / private bag is fine” interpretations.

---

## Executive summary

Scenario checks for the **UX contract** (nextAction matrix, bypassFlag split, gerund labels, progress bus, actionable deps, compact `impl.*`, repair-guide labels) **pass** against code and tests.

The **engine contract** of this change does **not** pass. GetStatus / TransitionChange already `execute` matching checks, then several paths still rebuild a global snapshot bag, re-walk `requires`, re-run `CountTasks`, and under-report `blockers`. That is the evaluate model from `main`, still present here.

**This change is not spec-complete until the bag is gone** and status / transition / archive / validate / instruction share one projection.

CLI focus surfaces (text omit review, blocker labels, repair guide, no `Executing:`, archive text progress, approve from ready/done, skills no-op) **pass**. Leftover CLI/verify wording is spec work, not a reason to keep snapshots.

---

## Verdict key

| Verdict                   | Meaning                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| **Implement**             | Spec/design of this change wins. Code (and tests that lock the bag/gatherer) must change. |
| **Spec**                  | Code is the new engine. Spec/verify/purpose text is stale or internally contradictory.    |
| **Decide then spec**      | Two specs in this change disagree. Pick one; do not “present both” as equal leftovers.    |
| **Keep helper / wording** | Not the snapshot bag. Spec should name the real API or mapping rule.                      |
| **Out of engine**         | Pre-existing or CLI JSON tension; do not treat as closing the evaluate story.             |

---

## Highest-signal findings (corrected)

| ID                 | Sev              | Verdict              | Issue                                                                                                                                                                                                                                                        |
| ------------------ | ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-1 / LE-1 / LE-5 | high             | **Implement**        | `PredicateSnapshots` + `gatherPredicateSnapshots` + engine `run` fallback; ValidateArtifacts / GetArtifactInstruction still gather. Domain `run` must take **that check’s facts**, not a global bag. Exporting _or_ keeping the bag privately is both wrong. |
| GS-1               | high             | **Implement**        | Second `CountTasks` after `evaluate`; GetStatus constructor still a gatherer; tests lock it.                                                                                                                                                                 |
| LE-2               | high             | **Implement**        | Engine re-walks `requires`; `MISSING_ARTIFACT` vs check `INCOMPLETE_ARTIFACT` can disagree.                                                                                                                                                                  |
| GS-2               | high             | **Implement**        | Public `blockers` drop `APPROVAL_REQUIRED` / `INCOMPLETE_ARTIFACT`. Same evaluate as `availableTransitions`.                                                                                                                                                 |
| TC-3 / A4 / H2     | high             | **Implement**        | Effects/skip still branch on `hook.pre` / `hook.post`. Pipeline is `phase` / `onFailure`. Spec does not over-claim.                                                                                                                                          |
| TC-5               | med              | **Implement**        | Duplicated binding tables (domain vs application registry).                                                                                                                                                                                                  |
| TC-6 / H3          | med              | **Implement**        | Domain `execute` stubs / snapshot-shaped `execute`. I/O only in application `create*`.                                                                                                                                                                       |
| GS-3               | med              | **Implement**        | Catch-all around check I/O; degrade only schema resolution failure.                                                                                                                                                                                          |
| TC-2               | high in original | **Decide then spec** | `transition-checks` wants `archive.publication` bound; `archive-change` keeps publication in the use case (merge/publish, not “may I archive”). Default: **do not bind**; delta transition-checks. Not an implementation HIGH.                               |
| TR-1               | high             | **Spec**             | Constructor still lists `RunStepHooks`; code uses bindings + hook checks.                                                                                                                                                                                    |
| H1 / W1 / W2       | med              | **Spec**             | Auto `run:` on TransitionChange is the new engine; workflow-model “two execution modes” and verify “transition does not run hooks” are stale.                                                                                                                |
| D1–D4              | med              | **Spec**             | Leftover `hook-progress` / shared presenter / pending hops / stdout repair guide. Code follows the check bus.                                                                                                                                                |
| LE-3               | med              | **Keep helper**      | Public `projectArtifacts` is a pure DAG helper for check ctx, not `PredicateSnapshots`. Spec must allow it (or fold into engine as a named pure function).                                                                                                   |
| TR-2               | med              | **Keep helper**      | `switch` on `CheckId` maps errors. Forbidden is switch for gather/launch, not error typing.                                                                                                                                                                  |
| TC-4               | med              | **Spec**             | Closed `CheckId` union = v1 built-ins. Not plugins in this change.                                                                                                                                                                                           |
| D5                 | med              | **Out of engine**    | Archive JSON vs NDJSON progress. Needs a CLI contract; does not block removing the bag.                                                                                                                                                                      |

---

## Scenario verification (§14–16 UX)

| Scenario                                                             | Result                                       |
| -------------------------------------------------------------------- | -------------------------------------------- |
| designing + ready available → `target: ready` `/specd-design`        | Pass (`lifecycle-engine.spec.ts`)            |
| verifying + done available → `target: done` `/specd-verify`          | Pass                                         |
| done + archivable available → `/specd-verify`; blocked → stay `done` | Pass                                         |
| archivable → `/specd-archive`                                        | Pass                                         |
| `--allow-out-of-scope` only `impl.linksInScope`                      | Pass (engine + GetStatus tests)              |
| Compact impl messages (`examples:`)                                  | Pass                                         |
| deps extracted vs persisted (`[]`)                                   | Pass (`deps-consistent.ts`)                  |
| Text blockers / repair guide `! CODE — label: message`               | Pass                                         |
| Progress bus gerund, no `Executing:`                                 | Pass (transition + archive CLI tests)        |
| `check-done` on throw                                                | Pass (`execute-check-with-progress.spec.ts`) |

UX scenarios passing **does not** close the engine. Tests still drive domain evaluation through snapshots in places.

---

## Implement (engine unfinished)

Evidence in `_partial-core-lifecycle.md` unless noted.

**TC-1 / LE-1 / LE-5 — snapshot bag**  
`PredicateSnapshots` is exported (`transition-checks.ts`, `public.ts`). Application checks refill `emptyPredicateSnapshots` then call domain `run`. `gatherPredicateSnapshots` still feeds ValidateArtifacts and GetArtifactInstruction. `LifecycleEngine.evaluate` falls back to `evaluateTransitionPredicates` + snapshots when `checksByTarget` is missing. Tests inject `emptyPredicateSnapshots()`.

Required: no bag type; per-check facts into that check’s `run`; no gatherer use case; engine projects `CheckResult`s only; those consumers call the same execute-then-project path.

**GS-1 — second CountTasks**  
GetStatus calls `_countTasks.execute` after evaluate and takes `countTasks` in the constructor. Registry `workflow.taskCompletion` already ran CountTasks. Tests named for the gather model must change.

**LE-2 — second requires walk**  
`availableSteps` / `_requestedTargetBlockers` still walk DAG `requires` beside `workflow.requires` results.

**GS-2 — blockers**  
`_mergeBlockers` whitelist omits approval/requires codes; `evaluate` without `requestedTarget` yields review-only engine blockers. Agents see hops missing and `blockers` empty.

**TC-3 / A4 / H2 — hook id allowlist**  
`TransitionChange` skips non-`hook.pre`/`hook.post` effects. `shouldExecuteHookEffect` keys skip off those ids. Iterate matching bindings by `phase`; skip by phase/selector, not check id.

**TC-5 — two binding tables**  
`check-bindings.ts` and `createWorkflowCheckRegistry` copy the same rows.

**TC-6 / H3 — domain execute**  
Domain modules still expose snapshot `execute` / hook no-ops. Application registry is the live path.

**GS-3 — swallow check failures**  
Try/catch around schema + predicate I/O + CountTasks + evaluate.

---

## Spec (code is the new engine; text lags)

| ID         | Action                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TR-1       | `core:transition-change` constructor/factory: bindings, not `RunStepHooks` on the use case. Hooks live in `createHookPre` / `createHookPost`. |
| TR-3       | Document `allowOutOfScope` on `TransitionChangeInput`.                                                                                        |
| LE-6       | Align `isPermitted` spec with verify (protocol.edge; code already matches verify).                                                            |
| GS-5       | One cardinality rule: schema-driven artifact list (code + verify).                                                                            |
| H1, W1, W2 | Drop “transition does not auto-run hooks” / Two execution modes. Auto `run:` + `skipHookPhases` is the engine.                                |
| S1, O1     | Approve Purpose: stay in `ready` / `done`; drain pending only.                                                                                |
| C1         | Add `signoff-invalidated` to change history.                                                                                                  |
| A1, A2, A5 | Archive constructor/result/`MaterializeSpecMetadata` to match composition.                                                                    |
| D1–D4      | CLI: check bus stream names; split presenters; no pending rewrite in verify; repair guide on stderr.                                          |
| TC-4       | Built-in `CheckId` union for v1; ids are strings, plugins out of scope.                                                                       |

---

## Decide then spec

**TC-2 — `archive.publication`**  
`core:transition-checks`: bind it on operation `archive`.  
`core:archive-change` + proposal: publication is merge/publish **after** archivable, remains in the use case.  
**Decision for this change:** keep publication in `ArchiveChange`; remove the binding SHALL from transition-checks. Domain file `archive-publication.ts` without registry is consistent with that, not a missing HIGH impl.

---

## Keep helper / wording (not the bag)

**LE-3:** `projectArtifacts` before `execute` so `workflow.requires` sees DAG statuses. Spec must allow this pure helper (name it; it is not `computeEffectiveStatus` I/O).

**TR-2:** Map failed check id → existing error types. Tighten “MUST NOT switch on CheckId” to gather/launch/hooks.

**LE-4:** nextAction approval/archiving branches still read entity/constructor flags. Usually equivalent to `approval.*` rows. Stricter projection is optional polish, not the bag.

**GS-4:** Draft path MAY skip full engine; parent-review on drafts is incomplete, not the active-change evaluate.

---

## Out of engine / pre-existing

| ID           | Note                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| D5           | Archive json/toon: NDJSON check events + trailing result object vs “one JSON document”. Specify CLI stdout; add tests. |
| C2           | `ArtifactFile.status` vs `core:change` `state`. Long-standing.                                                         |
| G1           | ConfigWriter `initProject` arity. Unrelated.                                                                           |
| A3           | Eager `ChangeRepository.list()` before archive predicates. Smell, not evaluate.                                        |
| Architecture | `LifecycleEngine` as class vs global “plain functions”. Pre-existing pattern.                                          |

---

## CLI / skills (unchanged from audit)

Focus checklist **pass:** text review omit, blocker labels, repair-guide labels, progress bus without `Executing:`, archive text progress, approve from ready/done, skills no-op.

D1–D4: **Spec.** D5: **Out of engine** (CLI contract).

---

## What “done” for this change means

1. **Implement** the engine list above (bag gone, one binding table, one CountTasks, blockers from checks, effects by phase, validate/instruction on the same path).
2. **Spec** the stale constructor/purpose/hook/CLI/verify text, including **TC-2** (publication stays in ArchiveChange) and **LE-3** (`projectArtifacts` allowed).
3. UX scenarios stay green; tests that inject `emptyPredicateSnapshots` or assert GetStatus-owned CountTasks painting **must be rewritten**, not kept as coverage of the forbidden model.

Do not treat this report as “UX pass → proceed / leftover ABI”.

---

## Detailed evidence

Do not delete:

- `_partial-core-lifecycle.md`
- `_partial-core-archive-approve.md`
- `_partial-cli-skills.md`

Those files are evidence. **Verdicts in this compiled report override** interpretations that called the bag a defensible private helper, offered “spec or code” for hook-id launch, or framed the work as a later migration.
