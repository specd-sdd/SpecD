# Partial Compliance Report — Archive & Hooks

**Change:** `workflow-transition-checks`  
**Mode:** assigned-spec batch (read-only)  
**Spec source:** `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks <specId> --format text`  
**Graph:** `graph search "resolveSealedArchiveDependsOn"` succeeded (index usable for this symbol); no `index --force` in this pass.  
**Previous HIGH D1 (re-verify):** Archive sealed `dependsOn` allegedly used a private fallback (manifest → lock → `metadata.json` → extract) instead of `resolveInitialPersistedDependsOn` for lock-less on-disk specs.

---

## 1. Requirements

### 1.1 `core:archive-change` — spec-lock sealed `dependsOn` (FOCUS)

Merged spec (Purpose + spec-lock requirement) requires this **sealed** precedence for one archive attempt, matching the auditor’s intended list:

1. If `change.specDependsOn` has an entry for the spec → that publication-plan snapshot is the sealed set. **Do not** call `resolveInitialPersistedDependsOn()`. `explicitDependsOn` MUST NOT be used as a passthrough for the plan.
2. Else if a lock exists → sealed set is the lock’s `dependsOn` (re-archive with no snapshot keeps the sidecar).
3. Else if `SpecRepository.get` finds the spec on disk → call `resolveInitialPersistedDependsOn()` **without** `explicitDependsOn` (legacy / never-initialized canonical spec). ContentHasher is injected so this call can run.
4. Else (new spec, `get` returns null) → merge-extract `dependsOn` from artifacts being published, or `[]` when extract yields nothing. **Do not** call `resolveInitialPersistedDependsOn()`.

Further constraints:

- Merge-extract is the `deps.consistent` **guard** against the sealed set. It MUST NOT replace a lock or an on-disk `resolveInitialPersistedDependsOn()` result.
- Cached `metadata.json` MUST NOT be a fallback source for the sealed set.
- When no lock exists, base is `{ kind: 'initial', schema: <effective identity>, dependsOn: <sealed set> }`.
- Patch via shared `applyPersistedSpecStatePatch`; persist via `SpecRepository.publish({ persistedState, ... })` only — no separate `writePersistedState()` from the use case.
- Archive `deps.consistent` persisted facts MUST be this **sealed** set, not enter-ready manifest-only (`change.specDependsOn`). Enter-ready remains extract vs `change.specDependsOn`.
- Same runner: `runDepsConsistent`.
- MUST NOT register `archive.publication` on the binding table; remaining merge/publish preflight stays inside `ArchiveChange`.
- Extracted vs sealed mismatch → `ArchiveDependencyMismatchError` via `deps.consistent`.
- `ContentHasher` injected; hexagonal: no `NodeContentHasher` in the application use case.
- Verify scenarios (spec-lock): first archive with plan; re-archive refreshes `dependsOn` from plan; **No-lock → resolveInitial without explicitDependsOn / no metadata.json / no merge-extract as sealed**; publication plan skips resolveInitial; new spec extracted; new spec empty `[]`.

### 1.2 `core:archive-change` — related archive operation (assigned look-ats)

- `allowOverlap` / `allowOutOfScope` on input; overlap skippable; impl.linksInScope skippable.
- `skipHookPhases`: `'pre' | 'post' | 'all'`.
- Effects selected by binding **phase** (`before-persist` / `after-persist`), not by `check.id`.
- Default bindings: `hook.pre` abort / before-persist; `hook.post` collect / after-persist.
- Shared runners with enter-ready / implementing for overlap, readOnly, deps, impl files/links.

### 1.3 `core:hook-execution-model`

- `instruction:` never executed; `run:` via `RunStepHooks` as constructor dep of hook checks.
- `ArchiveChange` MUST NOT branch on `hook.pre` / `hook.post` ids for timing, failure policy, skip mapping, or launching `RunStepHooks`.
- `skipHookPhases` selects by binding phase **plus** archive selectors `pre`/`post`/`all`.
- Pre fail-fast (no file mods); post `collect` continues; `onFailure` from binding.

### 1.4 `core:workflow-model` (archive slice)

- Archiving is deterministic `ArchiveChange`, not agent-interactive.
- Archive `run:` hooks are operation `archive`, not a lifecycle `along`.
- Auto-execute operation-archive effects according to binding `phase` / `onFailure`.

### 1.5 `core:change` (gate/drain slice only)

- `pending-spec-approval` / `pending-signoff` remain drain states.
- New transitions MUST NOT enter `pending-spec-approval` from `ready` or `pending-signoff` from `done`.
- `VALID_TRANSITIONS['ready']` = `implementing`, `designing` only.
- `VALID_TRANSITIONS['done']` includes `archivable`, `designing`, `implementing`, `verifying` (no `pending-signoff`).
- Drain: `pending-spec-approval` → `spec-approved` | `designing`; `pending-signoff` → `signed-off` | `designing`.

### 1.6 `core:approve-spec` / `core:approve-signoff`

- Gate baked at construction; first step, no I/O if disabled.
- Happy path: record event, stay in `ready` / `done`; do not transition into pending or `spec-approved` / `signed-off`.
- Drain: `pending-spec-approval` → `spec-approved`; `pending-signoff` → `signed-off`.
- Config factory via `resolveApprove*Deps` including `contentHasher`.

---

## 2. Implementation

### 2.1 Sealed resolver (previous HIGH D1)

`packages/core/src/application/services/resolve-sealed-archive-depends-on.ts` (`resolveSealedArchiveDependsOn`, lines 43–78):

```
manifest = change.specDependsOn.get(specId)
  if defined → return copy; no resolveInitial
if persistedDependsOn !== null → return lock dependsOn
onDisk = specRepo.get(capPath)
  if null → extractedDependsOn copy or []
  if hasher undefined → throw (lock-less on-disk requires ContentHasher)
  else resolveInitialPersistedDependsOn(..., no explicitDependsOn)
```

This matches the intended sealed list. Merge-extract is **only** the last branch. `metadata.json` is not read. `explicitDependsOn` is never passed (archive-change.spec asserts `explicitDependsOn === undefined` on the no-lock spy).

`resolveInitialPersistedDependsOn` (`packages/core/src/application/use-cases/resolve-initial-persisted-depends-on.ts`) reads **canonical spec-scoped artifacts** via `specRepo.artifact` (schema `scope === 'spec'`), then `extractMetadataFromSpecArtifacts`. It does not read `metadata.json`. If `get` is null it throws `SpecNotFoundError` — which is why new specs must not call it (sealed helper avoids that).

### 2.2 Archive publication preflight

`ArchiveChange._prepareSpecPublicationPreflight` (`archive-change.ts` ~837–853) calls `resolveSealedArchiveDependsOn` with:

- `persistedDependsOn` from `specRepo.readPersistedState` (`spec-lock.json`, not metadata)
- `extractedDependsOn` from merge-extract of **prepared** artifacts (`_buildFinalSpecArtifactsForExtraction`)

`readPersistedState` in fs adapter (`spec-repository.ts:518–521`) uses `_readSpecLock` only.

Use case never calls `writePersistedState`; it calls `publish(..., { persistedState })` when sidecar is active (`archive-change.ts:438–444`).

### 2.3 Archive `deps.consistent` facts

`createDepsConsistent` (`deps-consistent.ts:59–68`):

- Always loads `loadReadyPredicateFacts` for **extracted** maps (change-dir / canonical fallback via `extractDependsOnForSpec`).
- If `ctx.attempt.scope === 'archive'`, **replaces** persisted map with `loadArchiveSealedDependsOnBySpecId`.
- Else uses enter-ready manifest-only `facts.persistedDependsOnBySpecId` (`ready-predicate-facts.ts:73–76`).
- Invokes `run` from `domain/checks/deps-consistent.js`, which is `runDepsConsistent`.

`loadArchiveSealedDependsOnBySpecId` (`ready-predicate-facts.ts:109–158`) uses the **same** `resolveSealedArchiveDependsOn` (plan → lock → resolveInitial / extract). Hasher comes from `ReadyPredicateFactsDeps.hasher`.

Second evaluation: `_assertArchiveDepsConsistent` (`archive-change.ts:1126–1154`) builds maps from preflight `finalDependsOn` + extract when `sidecarActive`, then `runDepsConsistent` re-exported from `evaluate-transition-predicates.ts` (same domain function: `export { runDepsConsistent } from '../checks/deps-consistent.js'`).

Named-check failure maps to `ArchiveDependencyMismatchError` in `throwMappedArchiveFailure` (`archive-change.ts:1311–1329`).

### 2.4 Hasher / hexagonal wiring

- Application `ArchiveChange` takes `ContentHasher | undefined`; composition `resolveArchiveChangeDeps` sets `contentHasher: resolver.getContentHasher()` and passes it as the last ctor arg (`composition/use-cases/archive-change.ts:149, 204`).
- `resolveWorkflowCheckRegistry` sets `readyFacts.hasher: resolver.getContentHasher()` (`workflow-check-registry.ts:29–35`) so archive `deps.consistent` can call resolveInitial.
- `NodeContentHasher` is constructed in `composition-resolver.ts` (~640), not in `application/use-cases/archive-change.ts`.
- Test helper `newArchiveChange` always passes `makeContentHasher()` (`helpers.ts:981`). Test `makeArchiveBindings` also sets `readyFacts.hasher`.

### 2.5 Bindings, overlap, hooks, publication check

`ARCHIVE_BINDING_SPECS` (`check-bindings.ts:84–94`): `schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent`, `impl.filesResolved`, `impl.linksInScope`, `hook.pre` (before-persist, abort), `hook.post` (after-persist, collect). **No** `archive.publication`. Domain test asserts absence (`transition-checks.spec.ts:390–391`).

`ArchiveChange.execute`:

- Passes `allowOverlap` / `allowOutOfScope` into `buildCheckExecutionContext`.
- Predicates via `executeMatchingPredicates`.
- Effects via `matchingEffects(..., 'before-persist' | 'after-persist')` — selection by **binding.phase**, not `check.id` (ids only appear in debug logs).
- `skipHookPhases` copied onto effect context; skip implemented in `HookEffectCheck.execute` (`hook-effect.ts:133–149`) using archive selectors `all` / `pre` / `post` mapped to the check’s RunStepHooks phase (`pre`/`post`), not by branching in the use case on `hook.pre`/`hook.post`.
- `onFailure` via `hookFailureMode(binding.onFailure)` (`execute-hook-effect.ts`).
- `RunStepHooks` is a ctor dep of `createHookPre` / `createHookPost`, not launched from `ArchiveChange` by check id.

### 2.6 Gate/drain

`VALID_TRANSITIONS` (`change-state.ts:30–43`) matches the change-spec slice.

`ApproveSpec` / `ApproveSignoff`: gate first; record on `ready`/`done` without transitioning; drain pending → approved/signed-off; factories `resolveApproveSpecDeps` / `resolveApproveSignoffDeps` include `contentHasher`.

---

## 3. Discrepancies (D1… numbered)

### D1 — previous HIGH (private fallback / metadata.json) — **RESOLVED (INFO residual)**

- **Severity:** INFO (re-verify of former HIGH)
- **Evidence:** `resolve-sealed-archive-depends-on.ts:46–77`; `resolve-initial-persisted-depends-on.ts:71–86`; `ready-predicate-facts.ts:139–153`; `archive-change.ts:825–853`; fs `readPersistedState` → spec-lock only.
- **Spec:** plan → lock → on-disk resolveInitial → new-spec extract/`[]`; no `metadata.json`.
- **Code:** implements that list. Manifest is only step 1 (`specDependsOn`). Lock is `persistedDependsOn !== null`. Extract is last. No metadata sidecar in this path.
- **Verdict:** **Code matches merged spec.** Former “manifest → lock → metadata.json → extract” private fallback is **gone**.

### D2 — Verify.md duplicate empty heading for No-lock scenario

- **Severity:** INFO
- **File:** merged `core:archive-change` verify (preview ~1082–1084): two consecutive `#### Scenario: No-lock spec resolves initial dependsOn through resolveInitialPersistedDependsOn` headings, first empty.
- **Spec-wrong vs code-wrong:** **spec-wrong** (hygiene). Code/tests implement the second, filled scenario.
- **Fix:** delete the empty duplicate heading in the change delta.

### D3 — Lock-without-plan keep-lock has requirement text but no verify scenario

- **Severity:** MEDIUM (spec completeness + tests; see §4)
- **Spec:** “Else if a lock exists, the sealed set is the lock's `dependsOn` (re-archive with no snapshot keeps the sidecar).”
- **Verify.md:** has re-archive **with** `specDependsOn` refresh; **no** scenario “lock exists, no `specDependsOn` entry, extract differs, lock wins / resolveInitial not called / extract not sealed.”
- **Code:** `resolve-sealed-archive-depends-on.ts:50–52` implements keep-lock.
- **Spec-wrong vs code-wrong:** **spec incomplete** (requirement without scenario). Code is aligned with the requirement paragraph.
- **Fix:** add verify scenario + test (see §4). Not an implementation bug.

### D4 — Dual extract pipelines for `deps.consistent` vs sidecar preflight

- **Severity:** INFO
- **Files:** `deps-consistent.ts:60–68` + `ready-predicate-facts.ts:173–224` vs `archive-change.ts:_buildFinalSpecArtifactsForExtraction` + `_assertArchiveDepsConsistent`.
- **Spec:** named archive `deps.consistent` persisted facts = sealed set; extract vs sealed; remaining sidecar consistency also compares extract of prepared merged artifacts to sealed set **inside** `ArchiveChange`.
- **Code:** both use `runDepsConsistent` and sealed persisted. **Extract sources differ:** named check uses `extractDependsOnForSpec` (change tracked files + delta merge + canonical fallback); preflight uses staged publication writes. Safer if they disagree (preflight can still fail). Risk: named check could fail first on change-dir extract while sealed/preflight extract would agree, or the reverse.
- **Spec-wrong vs code-wrong:** **neither clearly wrong** — spec allows both the named check and in-use-case preflight. Worth documenting that extract must be the same merge-extract of artifacts being published if operators expect one comparison.
- **Fix (optional):** feed named-check extract from the same prepared artifact set, or drop `_assertArchiveDepsConsistent` if the named check is defined to be that comparison (would require running predicates after plan prepare — larger sequencing change).

### D5 — `ArchiveChange` hasher is optional on the application constructor

- **Severity:** INFO
- **File:** `archive-change.ts:202, 234` (`hasher?: ContentHasher`); throw at `resolve-sealed-archive-depends-on.ts:58–59` if missing on lock-less on-disk.
- **Spec:** “ContentHasher is injected”.
- **Code:** composition **does** inject (`archive-change.ts` composition + tests). Application type still allows omitting it.
- **Spec-wrong vs code-wrong:** **mild code looseness**. Not a production wiring bug.
- **Fix:** make hasher required on `ArchiveChange` ctor to match `ArchiveChangeDeps.contentHasher`.

### D6 — `graph.excludePaths` not applied when materializing implementation links

- **Severity:** MEDIUM (out of spec-lock FOCUS but in assigned `archive-change`)
- **File:** `archive-change.ts:_materializeImplementationLinks` ~1189–1204 (comments: skip exclusion check).
- **Spec:** “Excluded path is ignored during sidecar materialization” — confirmed link under `graph.excludePaths` is skipped without failing archive.
- **Code:** no `excludePaths` filter; links are always materialized if inside `codeRoot`.
- **Spec-wrong vs code-wrong:** **code-wrong** if the merged spec is intended; alternatively spec-wrong if this iteration deferred graphConfig on `ProjectWorkspace` (comments argue that).
- **Fix:** either implement skip using project graph config, or amend spec/verify to “not in this iteration.”

### D7 — Weak “same runner” assertion in mismatch test

- **Severity:** INFO (tests, not runtime)
- **File:** `archive-change.spec.ts:889–906` — spies `transitionPredicates.runDepsConsistent` then `expect(typeof runDepsConsistent).toBe('function')` without `toHaveBeenCalled()`.
- **Spec:** “the same runner is `runDepsConsistent`.”
- **Code:** both paths call it; test does not prove the spy.
- **Spec-wrong vs code-wrong:** **test-wrong** (coverage), implementation OK.

### Compliant (no discrepancy)

| Area                                                                                      | Status              |
| ----------------------------------------------------------------------------------------- | ------------------- |
| Sealed precedence vs merged spec                                                          | Match (D1 resolved) |
| `explicitDependsOn` unused for plan                                                       | Match               |
| `metadata.json` not a sealed fallback                                                     | Match               |
| Merge-extract does not replace lock / resolveInitial                                      | Match               |
| Archive `deps.consistent` persisted = sealed (`loadArchiveSealedDependsOnBySpecId`)       | Match               |
| Enter-ready persisted = `specDependsOn` only                                              | Match               |
| Shared `runDepsConsistent` identity (domain `deps-consistent.ts`; re-export; `run` alias) | Match               |
| `archive.publication` absent                                                              | Match               |
| `allowOverlap` / `allowOutOfScope` on attempt context                                     | Match               |
| Effect timing by `matchingEffects(..., phase)`                                            | Match               |
| `skipHookPhases` pre/post/all in hook check                                               | Match               |
| `NodeContentHasher` not imported by archive use case                                      | Match               |
| Registry hasher for archive deps                                                          | Match               |
| `VALID_TRANSITIONS` ready/done/drain                                                      | Match               |
| ApproveSpec/Signoff stay in ready/done; drain pending                                     | Match               |

---

## 4. Test coverage / missing tests

### 4.1 Sealed dependsOn (FOCUS) — present

| Scenario                                                                  | Test                                     | Notes                                                                        |
| ------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| No-lock on-disk → resolveInitial, no `explicitDependsOn`                  | `archive-change.spec.ts:450–548`         | Spy + lock `dependsOn` equals extract from disk content                      |
| Publication plan skips resolveInitial                                     | `:550–610`                               | `setSpecDependsOn` → lock is plan list; spy not called                       |
| New spec extracted                                                        | `:612–704`                               | empty repo; spy not called; lock = extract                                   |
| New spec empty `[]`                                                       | `:706–758`                               | no metadataExtraction; spy not called; `dependsOn: []`                       |
| Re-archive with plan refreshes dependsOn, keeps schema                    | `:760–820`                               |                                                                              |
| Extract vs sealed mismatch → `ArchiveDependencyMismatchError`, no publish | `:822–912`                               | uses **plan vs extract**; does not prove lock/resolveInitial sealed mismatch |
| Batch later-spec preflight blocks earlier publish                         | `:914+`                                  |                                                                              |
| `archive.publication` absent                                              | `transition-checks.spec.ts:390–391`      |                                                                              |
| `createArchiveChange` resolves `contentHasher`                            | `composition/.../archive-change.spec.ts` |                                                                              |

### 4.2 Missing / weak (FOCUS)

1. **Lock exists, no `specDependsOn` entry:** lock `dependsOn` kept; `resolveInitial` **not** called; merge-extract **not** written even if artifacts disagree (then `deps.consistent` should fail comparing extract to **lock**, not to extract). **No test.** Highest remaining gap for D1 regression.
2. **Lock exists, extract agrees with lock, no plan:** archive succeeds; lock unchanged except implementation/schema rules. **No dedicated test.**
3. **`metadata.json` present with different `dependsOn`:** sealed must ignore it (spec AND “does not read cached metadata.json”). **No test** that plants `metadata.json` and asserts lock/resolveInitial win.
4. **Named archive `deps.consistent` uses sealed facts vs enter-ready manifest:** unit test of `createDepsConsistent` with `scope: 'archive'` vs `to: 'ready'` not found in this batch (logic is in `deps-consistent.ts` + `loadArchiveSealedDependsOnBySpecId`). **Missing check-level test.**
5. **Same `runDepsConsistent` identity:** spy `toHaveBeenCalled()` not asserted (D7).
6. **Hasher required:** no test that lock-less on-disk throws if hasher omitted (ctor still optional).
7. **No isolated `resolve-sealed-archive-depends-on` spec file** under `packages/core/test` (Glob `**/*sealed*` empty) — coverage is only via `ArchiveChange` integration tests.

### 4.3 Hooks / flags (assigned look-ats) — present

- `skipHookPhases` all / pre / post: `archive-change.spec.ts` ~1735–1910.
- `allowOverlap` proceed + invalidate: ~2955–3070.
- `allowOutOfScope` publish vs fail: ~3152–3250.
- `matchingEffects` archive before/after persist: `matching-effects.spec.ts`.

### 4.4 Gate/drain — present

- `change-state.spec.ts`: `VALID_TRANSITIONS['ready']`, no `ready → pending-spec-approval`.
- `approve-spec.spec.ts` / `approve-signoff.spec.ts`: stay in ready/done; drain pending.
- `transition-change.spec.ts`: reject targeting pending; drain hops.

### 4.5 Hook-execution / workflow-model archive slice

Covered by archive hook tests + matchingEffects. Transition skip selectors (`source.pre` no-op) live in `transition-change.spec.ts` (out of this file’s FOCUS but related).

---

## 5. Summary counts

| Spec                                                      | Requirements sampled | Match |                                        Discrepancies |                                  Missing/weak tests |
| --------------------------------------------------------- | -------------------: | ----: | ---------------------------------------------------: | --------------------------------------------------: |
| `core:archive-change` (spec-lock + deps.consistent FOCUS) | 12 sealed/deps rules |    11 | D2 INFO, D3 MEDIUM (spec), D4 INFO, D5 INFO, D7 INFO |                                       6 gaps (§4.2) |
| `core:archive-change` (hooks/flags/impl extras)           |                    8 |     7 |                           D6 MEDIUM (`excludePaths`) | excludePaths scenario untested (code skips feature) |
| `core:hook-execution-model` (archive)                     |                    8 |     8 |                                                    0 |                     adequate for archive skip/phase |
| `core:workflow-model` (archive slice)                     |                    3 |     3 |                                                    0 |                                                   — |
| `core:change` (gate/drain / VALID_TRANSITIONS)            |                    5 |     5 |                                                    0 |                                             covered |
| `core:approve-spec`                                       |                    8 |     8 |                                                    0 |                                             covered |
| `core:approve-signoff`                                    |                    8 |     8 |                                                    0 |                                             covered |

**Severity totals (this batch):** HIGH **0** · MEDIUM **2** (D3 spec/test gap; D6 excludePaths) · INFO **4** (D1 resolved residual, D2, D4, D5, D7 — D1 counted as INFO residual)

**Critical re-verify:** former HIGH D1 **does not reproduce**. Sealed precedence in `resolveSealedArchiveDependsOn` matches the merged spec and the intended 1–4 list. `metadata.json` is not a fallback. Archive `deps.consistent` persisted facts go through `loadArchiveSealedDependsOnBySpecId` → same helper. `runDepsConsistent` is shared. Hasher is injected at composition; `NodeContentHasher` stays out of the application use case.

**Highest leftover risk:** no test that a **lock without a publication-plan snapshot** is kept (and that extract/`metadata.json` cannot replace it) — regression of D1 could land again without that case.
