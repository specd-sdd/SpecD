# Spec-compliance partial: core archive / approve / workflow / config

> **Verdicts:** evidence only. Compiled report `specs-compliance-change-workflow-transition-checks-20260826-152050.md` overrides “leftover / other change” framing. Hook auto-execute is this engine (W1/H1 = spec). `archive.publication` unbound = follow archive-change (use case), not an impl HIGH.

- **Mode:** change `workflow-transition-checks` (spec-preview)
- **Assigned specs:** `core:archive-change`, `core:change`, `core:hook-execution-model`, `core:approve-spec`, `core:approve-signoff`, `core:config`, `core:workflow-model`
- **Read-only:** no code or spec files modified
- **Graph:** `stale: false` at audit time (`lastIndexedAt` 2026-08-26T13:21:13Z)

---

## Spec dependency chain (depth 1, assigned set)

| Spec                        | Direct dependencies (from preview)                                                                                                                          | Notes for this change                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `core:archive-change`       | change, schema-format, storage, overlap, spec-metadata, template-variables, hook-execution-model, spec-lock, implementation-tracking, **transition-checks** | Archive is operation-scope; `approval.signoff` must not bind here |
| `core:change`               | change-manifest, spec-metadata, storage, template-variables, **transition-checks** (taskCompletion / gates)                                                 | In-place gates; drain parking states; skill hops                  |
| `core:hook-execution-model` | schema-format, template-variables, change                                                                                                                   | Effects selected by binding `phase`/`onFailure`, not check id     |
| `core:approve-spec`         | change, schema-format, composition, kernel, composition-resolver, **transition-checks**                                                                     | Consent in `boundFromStates('approval.spec')`                     |
| `core:approve-signoff`      | same pattern                                                                                                                                                | Consent in `boundFromStates('approval.signoff')`                  |
| `core:config`               | (project config) + transition-checks for in-place gates                                                                                                     | `approvals.spec` / `approvals.signoff`                            |
| `core:workflow-model`       | change, schema-format, build-schema, compile-context, get-status, transition-change, archive-change, hook-execution-model                                   | Progress axis + requires as checks                                |

Consistency with `core:transition-checks` (not assigned, but required by the change): assigned specs **intend** shared runners, in-place approval, archive operation scope, and hook **effects**. Several assigned specs still contain leftover wording from the pre-engine / auto-vs-manual hook split.

---

# core:archive-change

## Requirements summary

| Requirement           | Spec intent (preview)                                                                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ports and constructor | `ChangeRepository`, `ReadonlyMap<string, SpecRepository>`, `ArchiveRepository`, `RunStepHooks`, `ActorResolver`, parsers, extractor transforms, `SchemaProvider`, **`RegenerateSpecMetadata`**, workspace routes. No direct `HookRunner`. |
| Input                 | `name`, `skipHookPhases` (`pre`/`post`/`all`), `allowOverlap`                                                                                                                                                                             |
| Schema name guard     | `schema.nameMatch` on operation `archive` **before** archivable, hooks, writes                                                                                                                                                            |
| Archivable guard      | `archive.archivable` / `assertArchivable`; not a lifecycle `from→to`; **`approval.signoff` MUST NOT bind**                                                                                                                                |
| Deferred `archiving`  | After preflight + snapshots, `mutate` then `transition('archiving')`                                                                                                                                                                      |
| ReadOnly / overlap    | Same runners as enter-`ready` / archive-only overlap; before hooks                                                                                                                                                                        |
| Pre/post hooks        | Operation-`archive` **effects** by binding `phase` (`before-persist` / `after-persist`) and `onFailure`; **not** `check.id === 'hook.pre'/'hook.post'`                                                                                    |
| Shared runners        | Registry order: nameMatch, archivable, overlap, readOnly, deps.consistent, impl.filesResolved, impl.linksInScope; publication preflight remains in the use case                                                                           |
| Result                | `archivedChange`, `postHookFailures`, `staleMetadataSpecPaths`, `invalidatedChanges`                                                                                                                                                      |
| Metadata              | Forced regeneration after archive move; spec names `RegenerateSpecMetadata`                                                                                                                                                               |

## Implementation status

**Mostly implemented**, with constructor/result/metadata **naming and injection shape** drifted from the spec text.

Evidence:

- `ArchiveChange` lives at `packages/core/src/application/use-cases/archive-change.ts` (class ~L280).
- Archive predicates run via `executeMatchingPredicates(this._archiveBindings, …)` with `attempt.scope === 'archive'` (~L390–414).
- Application registry `createWorkflowCheckRegistry` archive table (`workflow-check-registry.ts` L172–182): `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent`, `impl.filesResolved`, `impl.linksInScope`, then `hook.pre` (before-persist/abort) and `hook.post` (after-persist/collect). **`approval.signoff` is not in `archiveBindings`.** Domain `ARCHIVE_BINDINGS` in `check-bindings.ts` L109–119 matches that set.
- Before-persist / after-persist effects use `matchingEffects(..., 'before-persist'|'after-persist')` (~L426, L641), not a private “always post on any exit” path.
- `skipHookPhases` implemented; tests in `archive-change.spec.ts` (all / pre / post).
- Deferred `archiving` inside `mutate` after snapshots (~L518–523).
- Hook execute for archive goes through `HookEffectCheck.execute` → `RunStepHooks` (`hook-effect.ts` L145–156) with step `'archiving'`.
- Archive context hard-codes `approvals: { spec: false, signoff: false }` on check execution (predicates and effects). Signoff is not an archive predicate.

Constructor **does not** match the spec TypeScript block:

- Injects `ListWorkspaces` instead of `ReadonlyMap<string, SpecRepository>`.
- Injects `MaterializeSpecMetadata` (`policy: 'force'`) instead of `RegenerateSpecMetadata`.
- Extra: `projectRoot`, `ArchiveBatchSnapshotPort`, optional `archiveBindings`.
- `skipHookPhases` and `allowOverlap` exist; extra input `allowOutOfScope` (implementation-tracking, related spec).
- Result includes **`archiveDirPath`**, not listed in the spec result shape.

Overlap work is done **twice in spirit**: `execute()` eagerly `list()`s peers and `detectSpecOverlap` (~L377–388) **before** predicates, then `spec.overlap` runs again via the registry (which also lists peers in `defaultArchiveBindings`).

## Discrepancies

### A1. Constructor / ports contract vs code (spec drift **or** implementation ahead of spec)

- **Spec:** Map of `SpecRepository` + `RegenerateSpecMetadata`; listed constructor arity.
- **Code:** `ListWorkspaces` + `MaterializeSpecMetadata` + batch snapshot + bindings.
- **Either:** update `core:archive-change` Ports requirement to the current composition (likely; tests and kernel already use this), **or** restore the documented constructor (would be a large regression).
- **Evidence:** spec preview “Ports and constructor” vs `ArchiveChange` constructor L312–326.

### A2. Result shape extra field

- **Spec:** required keys listed; no `archiveDirPath`.
- **Code:** `ArchiveChangeResult.archiveDirPath` (L199) and tests assert it.
- **Either:** spec incomplete (CLI needs the path), **or** extra field should be documented. Not a functional bug.

### A3. Predicate order vs eager I/O

- **Spec:** `schema.nameMatch` first after schema load; overlap **after** archivable; no file mods.
- **Code:** loads change, schema, **lists all active changes**, then runs all matching predicates in registry order.
- If `schema.nameMatch` fails, peer listing already ran. Spec does not forbid extra reads, but it does sequence overlap **after** archivable _evaluation_, not before the predicate loop.
- **Either:** treat eager `list()` as a performance/ordering smell (spec drift toward “all archive I/O after nameMatch”), **or** spec should allow prefetch.

### A4. Skip / filter still keys off `hook.pre` / `hook.post` ids

- **Spec:** select effects by binding `phase` / `onFailure`; do **not** branch on check id for timing, failure policy, or launching `RunStepHooks`.
- **Code:** `shouldExecuteHookEffect` (`execute-hook-effect.ts` L124–128) maps `skipPre`/`skipPost` to `binding.check.id === 'hook.pre'|'hook.post'`. Timing/failure **do** come from bindings (`phase`, `onFailure`). Launch is `binding.check.execute`, which is correct for the application check.
- If a future binding reused another effect id in the same slot, skip flags would mis-fire.
- **Either:** skip should key off `binding.phase` (and archive `pre`/`post` selectors), **or** the spec should allow id-based skip mapping because selectors are named pre/post.

### A5. Metadata use-case name

- **Spec:** `RegenerateSpecMetadata.execute({ specId })`.
- **Code:** `_materializeMetadata.execute({ specId, policy: 'force' })`.
- Behavior (forced, post-commit, failures → `staleMetadataSpecPaths`) matches; **name/type in spec is stale**.

## Test coverage

Covered: skipHookPhases all/pre/post; archivable guard; overlap; hooks fail-fast pre / collect post (existing archive-change specs); batch restore; `archiveDirPath`.

## Missing tests

- Explicit assertion that **`approval.signoff` is absent from `archiveBindings`** (registry unit test would lock the “MUST NOT bind” rule).
- No constructor-shape test against the **documented** `ReadonlyMap` + `RegenerateSpecMetadata` (would fail today — confirms A1 is spec drift).
- `schema.nameMatch` failure **without** having called `ChangeRepository.list()` (A3).

---

# core:change

## Requirements summary (change-relevant)

- Lifecycle graph: `drafting → designing → ready → implementing ⇄ verifying → done → archivable → archiving`.
- Parking states remain valid **ChangeState** for drain only.
- `VALID_TRANSITIONS['ready']` = `implementing`, `designing` only (no `pending-spec-approval`).
- `VALID_TRANSITIONS['done']` includes `archivable`, `designing`, `implementing`, `verifying` (no `pending-signoff`).
- Skill hops: `done|signed-off|archivable → implementing|verifying`; invalidate **signoff** not spec approval; not from `archiving`; no hop to `ready`.
- Spec gate: stay in `ready`; `ApproveSpec` records consent; `TransitionChange` must not enter `pending-spec-approval`.
- Signoff gate: stay in `done`; archive still requires `archivable`.
- History is source of state; `LifecycleEngine` owns schema-aware interpretation.
- Artifacts: file/aggregate **state** vocabulary in spec (`missing` … `drifted-pending-review`).

## Implementation status

**Lifecycle table matches the spec.**

`VALID_TRANSITIONS` (`change-state.ts` L30–43):

```
ready: implementing, designing
pending-spec-approval: spec-approved, designing
done: archivable, designing, implementing, verifying
pending-signoff: signed-off, designing
signed-off / archivable: include implementing, verifying
archiving: archivable, designing
```

`Change` does **not** import or run hooks (no matches in `change.ts`) — complies with hook-execution-model “entity does not execute hooks”.

`recordSpecApproval` / `recordSignoff` append events only (no implicit transition) — L877–898.

`invalidateSignoff` appends `signoff-invalidated` (L909+). `activeSpecApproval` clears only on `invalidated`, not on `signoff-invalidated` (L442–448) — matches “MUST NOT invalidate spec approval unless artifacts change”.

`TransitionChange` calls `invalidateSignoff` on skill-hop sources/targets (`transition-change.ts` L289–291).

## Discrepancies

### C1. History event table omits `signoff-invalidated`

- **Spec:** skill hops “MUST invalidate an active signoff”; history table lists `invalidated` causes but **not** `signoff-invalidated`.
- **Code:** dedicated event type, loader/manifest cases, `invalidateSignoff`.
- **Either:** spec should add the event (code is the designed behavior), **or** hops should reuse `invalidated` (would wrongly clear spec approval if `activeSpecApproval` treated all `invalidated` the same).
- **Verdict:** **spec gap**; implementation is consistent with the hop requirement.

### C2. Artifact field name `state` vs `status`

- **Spec (`core:change` Artifacts):** `ArtifactFile.state`.
- **Code:** `ArtifactFile.status` (`artifact-file.ts`). Approve specs already say `status`.
- Long-standing vocabulary split. Approve hashing uses `file.status`. Not introduced solely by this change, but the change’s approve specs and the change entity spec **disagree with each other**.

## Test coverage

`change-state.spec.ts` asserts ready/done/archivable/archiving tables including skill hops.

Approve stay-in-ready / stay-in-done covered in use-case tests (see below).

## Missing tests

- Entity-level test that `invalidateSignoff` does **not** clear `activeSpecApproval` (logic exists; may only be covered indirectly).
- No test that `Change.transition('pending-spec-approval')` from `ready` throws via `VALID_TRANSITIONS` (table test implies it).

---

# core:hook-execution-model

## Requirements summary

- Two types: `instruction:` (passive) vs `run:` (HookRunner) vs explicit `external`.
- Default: `TransitionChange` / `ArchiveChange` auto-execute matching **run effects** after predicates; slot from binding `phase`/`onFailure`.
- Use cases MUST NOT launch `RunStepHooks` by check id; `RunStepHooks` is a constructor dep of hook **checks**.
- `skipHookPhases`: transition `source.pre|source.post|target.pre|target.post|all`; archive `pre|post|all`; predicates still run.
- Pre: fail-fast / abort; archive post: collect / after-persist; transition source.post: abort / before-persist / `along=forward` only.
- Entity `Change` MUST NOT execute hooks.
- `{{change.workspace}}` unsupported.

## Implementation status

**Engine path is largely compliant; leftover verify scenarios and id-based skip are not.**

- Application `HookEffectCheck.execute` calls `RunStepHooks` (`hook-effect.ts`).
- Domain `hookPre` / `hookPost` (`domain/checks/hook-pre.ts`, `hook-post.ts`) **`execute` is a no-op `skip`**. Live use cases use the application registry, not these stubs, when composed via `createWorkflowCheckRegistry`.
- Transition bindings: `hook.post` forward / before-persist / abort; `hook.pre` any along except recovery / before-persist / abort (`check-bindings.ts` L95–103; mirrored in workflow-check-registry L161–169).
- Archive: hook.pre before-persist abort; hook.post after-persist collect.
- `matchingEffects` filters by `phase` + applicability.
- Dead helper `executeHookEffect` still takes `checkId` to choose pre/post (`execute-hook-effect.ts` L63–71) — **no remaining call sites** (grep only finds the definition).

`TransitionChange` **does** still filter:

```
if (checkId !== 'hook.pre' && checkId !== 'hook.post') continue
```

before `_executeEffect` (`transition-change.ts` ~L248–250). Combined with `matchingEffects`, this is redundant **and** is an explicit check-id branch for launching.

## Discrepancies

### H1. Spec-internal: verify “transition does not run hooks” vs default auto-execute

- **spec.md:** Default hook execution; TransitionChange executes matching `run:` effects.
- **verify.md** requirement “change transition does not execute hooks”:
  - Scenario: `specd change transition <name> implementing` → **no hooks executed**.
- Same verify file also has “TransitionChange executes pre-hooks before state change”.
- **Implementation** auto-runs hooks (transition-change.spec skip/execute tests).
- **Either:** delete/rewrite the “does not run them” scenario as **entity**-only (already covered by “Change entity MUST NOT execute hooks”), **or** implementation is wrong (it is not — it matches the newer default-execution requirement).

### H2. Check-id branching for skip and launch (see A4)

Transition skip maps `target.pre` → hook.pre and `source.post` → hook.post via ids. Spec forbids id branching for **launching** `RunStepHooks`. Launch actually goes through `binding.check.execute` after an id filter.

### H3. Dual Check objects for the same ids

- Domain exports reusable `hookPre`/`hookPost` whose `execute` never calls `RunStepHooks`.
- Spec: “Hook `execute` SHALL call `RunStepHooks`”.
- **Either:** domain stubs violate the letter (status `run()` is skip-by-design; `execute` should still be the real engine **or** spec should say application `WorkflowCheck` is the execute implementation), **or** this is an acceptable split (status vs execute) that the spec should name.

### H4. Contradiction with `core:workflow-model` “Two execution modes”

See W1. Hook-execution-model (auto on transition) **wins in code**. Workflow-model still describes agent-driven steps as **not** auto-executing.

## Test coverage

Strong on skipHookPhases, source.post skip on redesign (lifecycle-engine / transition-change), archive skip, fail-fast vs collect.

## Missing tests

- Binding-phase skip without consulting `check.id` (would fail today).
- Test that **domain** `hookPre.execute` is **not** used on the ArchiveChange/TransitionChange happy path (composition uses application checks).
- Verify scenario H1 has **no** passing test that matches “transition runs zero hooks” without `--skip-hooks` (correctly absent).

---

# core:approve-spec

## Requirements summary

- Gate first: `approvals.spec === false` → `ApprovalGateDisabledError`, no I/O.
- Load change; actor; schema; `SchemaMismatchError` if names differ.
- Hash artifacts: skip `missing`/`skipped`; skip null loads; cleanup map from schema.
- Record via `mutate`; **do not** transition if state is an `approval.spec` `from` (currently `ready`); drain `pending-spec-approval` → `spec-approved` allowed.
- Input: `name`, `reason` only; gates baked at construction.
- Factory: `resolveApproveSpecDeps` → `hasher: ContentHasher`.

## Implementation status

**Behavior matches the in-place gate model.** Purpose paragraph is stale.

`ApproveSpec.execute` (`approve-spec.ts`):

1. Gate (`L71–73`) before `get`.
2. Lookup, actor, schema, mismatch (`L75–84`).
3. Rejects unless `boundFromStates('approval.spec')` or `pending-spec-approval` (`L86–88`).
4. `mutate`: hashes, `recordSpecApproval`, drain transition only (`L91–99`).

`boundFromStates('approval.spec')` is `['ready']` (bindings + `transition-checks.spec.ts`).

Factory: `resolveApproveSpecDeps` uses `contentHasher` not `hasher` (`composition/use-cases/approve-spec.ts` L37–44). Functionally the ContentHasher port.

Hashes computed **inside** mutate on the fresh change (on-disk via `artifact()`), not before mutate. Still on-disk; slightly tighter than “hash then mutate”.

## Discrepancies

### S1. Purpose vs requirements (spec-internal)

- **Purpose:** “transitions it to the `spec-approved` state”.
- **Requirements:** stay in `ready`; drain only from `pending-spec-approval`.
- **Code:** stay in `ready`. **Fix the purpose** (and any docs still saying parking is the happy path).

### S2. Artifact hash “SchemaRegistry / empty cleanup if unresolved”

- **Spec steps 4–5:** resolve via SchemaRegistry; if unresolved, empty cleanup map; do not throw.
- **Gate:** `schemaProvider.get()` must succeed (throws `SchemaNotFoundError` / `SchemaValidationError`).
- **Code:** `_computeArtifactHashes` calls `schemaProvider.get()` again and `buildCleanupMap(schema)` — cannot reach empty-map-on-failure after a successful gate.
- **Either:** delete empty-map steps (dead after gate), **or** hashing should tolerate get() failure (would contradict gate).

### S3. Deps field name `hasher` vs `contentHasher`

Letter of factory requirement vs composition interface. Wiring is correct.

### S4. InvalidStateTransitionError target

When state is neither bound `from` nor drain, throws `InvalidStateTransitionError(change.state, consentFrom[0] ?? 'ready')` — second arg is **expected target `ready`**, not a list of allowed sources. Verify says drafting → `InvalidStateTransitionError`. Tests cover drafting via `makeChange`. Message shape is a UX/spec detail, not a functional miss.

## Test coverage

- Stay in `ready` + records consent (`approve-spec.spec.ts` L71–91).
- Drain to `spec-approved`.
- Gate disabled: no `get` / `mutate`.
- Missing change; schema mismatch before mutate.
- Drafting throws `InvalidStateTransitionError` (describe name still says “not in pending-spec-approval” — **stale test title**, assertion is still valid for drafting).

## Missing tests

- Persist-through-`mutate` for the **ready** path (mutate spy exists only on pending drain).
- Skip `missing`/`skipped` files in hash map.
- Cleanup-rule vs no-cleanup artifact types (verify scenarios).
- Factory `createApproveSpec(config)` → `resolveApproveSpecDeps` (composition test may exist elsewhere; not in approve-spec.spec.ts).

---

# core:approve-signoff

## Requirements summary

Symmetric to ApproveSpec: stay in `done`; drain `pending-signoff` → `signed-off`; gate `'signoff'`; `boundFromStates('approval.signoff')`.

## Implementation status

`approve-signoff.ts` is structurally the same as ApproveSpec with signoff names. `boundFromStates('approval.signoff')` → `['done']`.

## Discrepancies

### O1. Purpose vs requirements

Purpose still says “transitions it to the `signed-off` state”. Requirements/code stay in `done`. Same as S1.

### O2 / O3

Same SchemaRegistry/empty-cleanup (S2) and `hasher` vs `contentHasher` (S3) issues.

## Test coverage

Stay in `done`; drain to `signed-off`; gate; mismatch; missing change; drafting throws. Describe block still titled “not in pending-signoff” for the drafting case.

## Missing tests

Same gaps as ApproveSpec for the `done` happy path (mutate spy, hash skip, cleanup, factory).

---

# core:config

## Requirements summary (approvals + related)

- `approvals.spec` / `approvals.signoff`, both default `false`.
- When spec true: wait is `approval.spec` while staying in `ready`; **MUST NOT** document pending hop as required.
- When signoff true: stay in `done` until `ApproveSignoff`; free `done → archivable` when false.
- Zod schema includes optional `approvals` object (`config-schema.ts` L258–263).
- Loader defaults: `approvals: { spec: data.approvals?.spec ?? false, signoff: data.approvals?.signoff ?? false }` (`config-loader.ts` ~L616).

## Implementation status

**Aligned** with in-place gates. Config-loader tests include `approvals:` YAML fixtures.

## Discrepancies

### G1. Verify `ConfigWriter.initProject` signature mismatch (pre-existing, low relevance)

- spec.md: `initProject(configPath, options)`.
- verify.md: `initProject(options)` only.
- Not part of the transition-check delta; flagged because the assigned spec includes it.

### G2. “Spec gate on does not require pending-spec-approval in the graph”

This is a **documentation** scenario. No automated test that config **docs** omit pending hops. Runtime is enforced by `VALID_TRANSITIONS` + TransitionChange, not the config loader.

## Test coverage

Loader defaults and explicit true flags (config-loader.spec.ts around L964 / L1836+).

## Missing tests

- Dedicated assertion that loaded config does not encode a pending-state machine (N/A — config only has booleans). Runtime coverage lives in change-state / transition-change tests.

---

# core:workflow-model

## Requirements summary

- Step names = Change states; invalid names → `InvalidStateTransitionError`.
- `requires` → `workflow.requires` with `to = effective`; shared with GetStatus / TransitionChange.
- `requiresTaskCompletion` → `workflow.taskCompletion` via `CountTasks`, not engine file walks.
- `workflow[]` order is display **and** `along` progress axis; `to=designing` is `redesign`; `archiving→archivable` is `recovery`.
- Hooks at boundaries: `run:` are **effects** with along matchers; `instruction:` not in pipeline.
- **Two execution modes:** agent-driven (`implementing`) must **explicitly** `run-hooks`; deterministic `archiving` runs hooks inside `ArchiveChange`.

## Implementation status

Requires / taskCompletion / along classification are implemented in the engine (`TRANSITION_BINDINGS`, `createWorkflowTaskCompletion` + `CountTasks` in registry).

**Auto hook execution on `TransitionChange` contradicts “Two execution modes” and its verify scenario “hooks are NOT automatically executed by the transition”.**

Archive remaining deterministic (ArchiveChange runs archive effects) — that half still matches.

## Discrepancies

### W1. Spec-vs-spec and spec-vs-code: Two execution modes

- **workflow-model:** agent-driven transition does **not** auto-run hooks.
- **hook-execution-model:** TransitionChange **does** auto-run matching `run:` effects unless skipped.
- **Code:** auto-run (`transition-change.ts` matchingEffects loop); tests for skipHookPhases.
- **Verdict:** workflow-model (and its verify “Agent-driven step requires explicit hook invocation”) is **stale relative to this change**. Code + hook-execution-model are the intended design. **Spec should drop or rewrite Two execution modes** (e.g. “skills MAY skip and run hooks manually; the use case still auto-runs unless skipHookPhases”).

### W2. Internal hook sections already describe auto-execute

Requirement “Hook execution at step boundaries” (pre before persist, post after, post only `along=forward`) matches code and **conflicts with W1 in the same spec**.

### W3. Step availability formula vs `effectiveStatus`

- One clause: `artifact(id).state ∈ { complete, skipped }`.
- Requires section: effective status `complete` or `skipped`; pending-parent blocking is engine interpretation.
- **Code:** `workflow.requires` uses engine/effective status, not raw persisted `state` only.
- If this change’s intent is “status and execute share `workflow.requires`”, the simplified `state ∈` formula is **underspecified / stale**.

## Test coverage

Engine tests cover along, requires, taskCompletion, redesign skipping source.post.

No test asserts “transition to implementing runs zero hooks” (W1 would have required it).

## Missing tests

- After W1 is resolved, tests should document **one** story (auto-execute + skip), not agent-must-call-run-hooks as the default.

---

# Cross-cutting consistency (assigned specs vs each other)

| Topic                          | Winner in code                                        | Dissenting assigned spec text                                                       |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Auto `run:` on transition      | hook-execution-model + TransitionChange               | workflow-model Two execution modes; hook-execution-model verify “does not run them” |
| Approve stays in ready/done    | change + approve reqs + VALID_TRANSITIONS + use cases | Approve **Purpose** still says park in spec-approved / signed-off                   |
| Archive not a signoff edge     | archive-change + ARCHIVE_BINDINGS                     | (consistent)                                                                        |
| Hook launch by binding execute | HookEffectCheck                                       | Domain stub execute; TransitionChange id filter; shouldExecuteHookEffect ids        |
| Artifact status field          | ArtifactFile.status, approve specs                    | core:change `state`                                                                 |
| Signoff clear on skill hop     | `signoff-invalidated` in code                         | core:change history table omitted                                                   |

---

# Per-spec summary counts

| Spec                      | Reqs reviewed (approx) | Implemented as specified | Discrepancies | Spec-internal contradictions | Missing / weak tests |
| ------------------------- | ---------------------- | ------------------------ | ------------- | ---------------------------- | -------------------- |
| core:archive-change       | 28                     | 22                       | 5 (A1–A5)     | 0                            | 3                    |
| core:change               | 22                     | 20                       | 2 (C1–C2)     | 0                            | 2                    |
| core:hook-execution-model | 14                     | 10                       | 4 (H1–H4)     | 1 (H1)                       | 3                    |
| core:approve-spec         | 8                      | 6                        | 4 (S1–S4)     | 1 (S1)                       | 4                    |
| core:approve-signoff      | 8                      | 6                        | 3 (O1–O3)     | 1 (O1)                       | 4                    |
| core:config               | 6 (approvals-focused)  | 5                        | 2 (G1–G2)     | 1 (G1 writer verify)         | 1                    |
| core:workflow-model       | 12                     | 9                        | 3 (W1–W3)     | 1 (W1/W2)                    | 1                    |

**Batch totals (unique issues, not double-counting H4/W1):**

- **Discrepancies (code vs spec or spec vs spec): 18**
- **Of which spec-internal / spec-stale (fix specs): 10** (A1, A2, A5, C1, C2, H1, S1, O1, W1/W2, G1)
- **Of which possible implementation bugs / hardening: 4** (A3 ordering, A4/H2 id skip, H3 domain execute no-op, S2 unreachable hash fallback)
- **Missing tests: 14** (see tables; several are titles/docs not behavior)
- **Compliant highlights:** VALID_TRANSITIONS; in-place approve/signoff execute; archive bindings omit `approval.signoff`; archive effect phases abort/collect; factory gates baked at construction; config defaults `false`

**Highest priority for the change author:** finish the engine (no snapshot bag; see compiled report). Specs: rewrite `core:workflow-model` Two execution modes + hook-execution-model verify “no hooks on transition”; Approve Purpose; `signoff-invalidated`; ArchiveChange constructor names; **do not** add `archive.publication` to the registry unless that decision is reversed.
