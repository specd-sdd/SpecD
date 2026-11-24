# Partial Compliance Report — Archive & Hooks

- **Change:** `workflow-transition-checks`
- **Auditor scope:** `core:archive-change`, `core:hook-execution-model`, `core:workflow-model`, `core:change` (gate/drain slice only), `core:approve-spec`, `core:approve-signoff`
- **Mode:** read-only. No source or spec files were modified.
- **Spec source:** merged deltas via `changes spec-preview workflow-transition-checks <specId> --format text`

---

## 1. Requirements

### 1.1 `core:archive-change` (31 requirements)

Ports and constructor; Archive bindings not RunStepHooks on the use case; Input; Schema name guard; ArchivedChange construction; Archivable guard; Deferred transition to archiving; ReadOnly workspace guard; Overlap guard; Pre-archive hooks; Tracked artifact selection at archive time; Prepare archive plan before permanent writes; Staged archive commit and failed-attempt visibility; Batch canonical snapshot before publication; Batch canonical restore on commit failure; Orphan archive backup detection; Lifecycle rollback after failed commit; Archive debug logging; Delta merge and spec sync; Archive repository call; Archive index metadata maintenance; Post-archive hooks; Spec metadata generation; spec-lock sidecar persistence; Result shape; Typed errors for archive failures; Archive checks share runners and wrap remaining preflight; Tracked implementation review guard; Implementation materialization into spec-lock; Out-of-scope sidecar update guard; Config-based factory delegates through `resolveArchiveChangeDeps`.

Key normative statements for the assigned focus areas:

- **Input** — `allowOverlap` (default `false`) skips the overlap check; `allowOutOfScope` (default `false`) gives skippable `impl.linksInScope` semantics and **MUST NOT** bypass `impl.filesResolved`.
- **Archive checks share runners** — archive predicates in registry order: `schema.nameMatch`, `archive.archivable`, `spec.overlap`, then `workspace.readOnly` / `deps.consistent` (same runners as enter-`ready`), then `impl.filesResolved` / `impl.linksInScope` (same runners as forward exit from `implementing`). `archive.publication` **MUST NOT** be registered.
- **Pre/Post-archive hooks** — effect selection **MUST** use binding `phase` (`before-persist` / `after-persist`), **not** `check.id === 'hook.pre'`. `hook.pre` is `abort`/`before-persist`; `hook.post` is `collect`/`after-persist`. `skipHookPhases` accepts `'pre' | 'post' | 'all'`; `--skip-hooks` skips effects only, never predicates.
- **Deferred transition** — overlap guard, readOnly guard, pre-archive hooks and full-batch preflight all complete while the change is still in `archivable`; transition to `archiving` happens inside `ChangeRepository.mutate` immediately before the first canonical publish.
- **spec-lock sidecar persistence** — for a lock-less spec, the initial dependency set **MUST** be resolved through the shared `resolveInitialPersistedDependsOn()` service, and archive **MUST NOT** maintain a second artifact/metadata fallback algorithm.
- **Implementation materialization** — normalize to `workspace:path`, persist file- and symbol-level links, **ignore links under the target workspace `graph.excludePaths`**, discard unnormalizable links, and fail archive when a link escapes the workspace `codeRoot`.

### 1.2 `core:hook-execution-model` (12 requirements)

Two hook types; External hooks are explicit workflow entries; External hooks follow workflow phase semantics; `instruction` hooks are passive text; Default hook execution for transitions and archives; Two execution modes for run hooks; Change entity does not execute hooks; Manual hook control with `skipHooks`; Pre-hook failure semantics; Post-hook failure semantics; Hook ordering; Template variable expansion.

Focus statements: both `TransitionChange` and `ArchiveChange` **MUST NOT** branch on `hook.pre` / `hook.post` ids for timing, failure policy, skip mapping, or for launching `RunStepHooks`; `RunStepHooks` **SHALL** be a constructor dep of the hook _checks_. Transition selectors are `source.pre`, `source.post`, `target.pre`, `target.post`, `all`; archive selectors are `pre`, `post`, `all`. Because transition `hook.pre` and `hook.post` share `before-persist`, skip **MUST NOT** rely on `binding.phase` alone.

### 1.3 `core:workflow-model` (10 requirements)

Step names reference domain lifecycle states; Step semantics; Requires-based gating; Task completion gating; Step availability evaluation; Workflow array order is display order and progress axis; Step-to-state mapping; Hook execution at step boundaries; Two execution modes; Step requires reference artifact IDs.

Focus statement: the archiving step's archive `run:` hooks are executed by `ArchiveChange` as operation `archive`, not as a lifecycle `along` value. There is one pipeline — predicates then matching effects — and skills passing `skipHookPhases` must not become a second engine.

### 1.4 `core:change` — gate/drain slice (2 requirements audited)

Spec approval gate; Signoff gate. Both require that `pending-spec-approval` / `pending-signoff` remain **drain-only** parking states for in-flight changes: `VALID_TRANSITIONS['ready']` MUST be `implementing` and `designing` only; `VALID_TRANSITIONS['done']` MUST include `archivable`, `designing`, `implementing`, `verifying` and no `pending-signoff`. Drain hops `pending-spec-approval → {spec-approved, designing}` and `pending-signoff → {signed-off, designing}` remain legal.

### 1.5 `core:approve-spec` / `core:approve-signoff` (8 requirements each)

Gate guard; Change lookup; Artifact hash computation; Approval/Signoff recording and state transition; Persistence and return value; Input contract; Approval gate baked at construction; Config-based factory delegates through `resolveApproveSpecDeps` / `resolveApproveSignoffDeps`.

Focus statement: when the change is in a state bound as `from` for the gate check (`ready` / `done`), the use case **MUST NOT** transition into the pending or approved state; it records the history event and leaves the state alone. Drain from `pending-*` **MAY** still transition to `spec-approved` / `signed-off`.

---

## 2. Implementation

### 2.1 Binding table — compliant

`packages/core/src/domain/services/check-bindings.ts` defines `ARCHIVE_BINDING_SPECS` in exactly the spec's registry order (`schema.nameMatch`, `archive.archivable`, `spec.overlap`, `workspace.readOnly`, `deps.consistent`, `impl.filesResolved`, `impl.linksInScope`, `hook.pre` @ `before-persist`/`abort`, `hook.post` @ `after-persist`/`collect`). No `archive.publication` row exists. `TRANSITION_BINDING_SPECS` binds `impl.filesResolved` and `impl.linksInScope` to `from: 'implementing', to: '*', along: 'forward'`, so redesign (`implementing → designing`, classified `redesign`) does not match — as required.

Shared runners are genuinely shared: `createWorkflowCheckRegistry` (`packages/core/src/application/checks/workflow-check-registry.ts`) instantiates each `create*` check exactly once and `applyBindingSpecs` attaches the same instance to both `TRANSITION_BINDING_SPECS` and `ARCHIVE_BINDING_SPECS`. `workspace.readOnly`, `deps.consistent`, `impl.filesResolved` and `impl.linksInScope` are therefore object-identical across transition and archive tables.

`RunStepHooks` is a constructor dep of `createHookPre` / `createHookPost` only. It never reaches `ArchiveChange`.

### 2.2 `allowOverlap` / `allowOutOfScope` skip semantics — compliant

- `runSpecOverlap` (`packages/core/src/domain/checks/spec-overlap.ts:58`) returns `skip('spec.overlap')` when `facts.allowOverlap`.
- `runImplLinksInScope` (`packages/core/src/domain/checks/impl-links-in-scope.ts:24`) returns `skip('impl.linksInScope')` when `facts.allowOutOfScope`.
- `runImplFilesResolved` (`packages/core/src/domain/checks/impl-files-resolved.ts:37`) takes **only** `openTrackedImplementationFiles` — it has no access to `allowOutOfScope` and cannot be skipped by it. The application wrapper `impl-files-resolved.ts` likewise never reads `ctx.allowOutOfScope`. This is the strongest form of the requirement (structurally impossible rather than merely not-wired).
- `buildCheckExecutionContext` normalizes both flags to `false` when absent, matching the documented defaults.

### 2.3 `skipHookPhases` — compliant

`ArchiveChangeInput.skipHookPhases: ReadonlySet<'pre' | 'post' | 'all'>` (`archive-change.ts:63-91`). The selector set is forwarded into the check context (`archive-change.ts:333`, `:538`) and the _check_ performs the skip, not the use-case loop:

`HookEffectCheck.execute` (`packages/core/src/application/checks/hook-effect.ts:133-149`) checks `all` first, then branches on `ctx.attempt.scope === 'archive'` to honour `pre` / `post`, and otherwise honours transition selectors `target.pre` / `source.post`. This satisfies "skip MUST NOT rely on `binding.phase` alone" — transition `hook.pre` and `hook.post` share `before-persist` yet are skipped independently via distinct selectors. `source.pre` and `target.post` are correctly no-ops on this table.

CLI wiring is present and correct: `packages/cli/src/commands/change/archive.ts:57,87-101` maps `--skip-hooks pre,post,all` through `parseCommaSeparatedValues(..., VALID_ARCHIVE_HOOK_PHASES, ...)` and passes `allowOverlap` / `allowOutOfScope` only when the flags are set.

### 2.4 Effect selection by binding phase, not check id — compliant

`archive-change.ts:320` and `:526` iterate `matchingEffects(this._archiveBindings, archiveAttempt, 'before-persist' | 'after-persist')`. `matchingEffects` (`packages/core/src/application/services/execute-hook-effect.ts:23-35`) filters on `isEffectCheck(binding.check) && binding.phase === phase && bindingMatches(...)`. There is no `check.id === 'hook.pre'` comparison anywhere in `ArchiveChange`. Failure policy comes from `hookFailureMode(binding.onFailure)` (`abort → fail-fast`, `collect → fail-soft`), not from the check id.

`TransitionChange._executeEffect` (`transition-change.ts:304-326`) uses the identical shape — one `check.execute(ctx)` call plus `hookFailureMode(binding.onFailure)` — so both use cases share the pipeline.

### 2.5 Overlap detection wiring — compliant

`resolveWorkflowCheckRegistry(resolver, { includeOverlapDetection })` (`packages/core/src/composition/use-cases/workflow-check-registry.ts:20-68`) wires the peer detector only when requested; otherwise `createWorkflowCheckRegistry` substitutes `() => ({ blocked: false })`.

- `packages/core/src/composition/use-cases/archive-change.ts:132` → `{ includeOverlapDetection: true }` ✅ (spec: archive MUST include it)
- `packages/core/src/composition/use-cases/get-status.ts:45` → `{ includeOverlapDetection: true }` ✅
- `packages/core/src/composition/use-cases/transition-change.ts:45` → no option ✅ (overlap stays archive-only and MUST NOT run as an enter-`ready` predicate)

`GetStatus` additionally executes archive predicates only when `change.state === 'archivable'`, with `allowOverlap: false, allowOutOfScope: false` (`get-status.ts:463-478`), matching "GetStatus still only _executes_ archive predicates in `archivable`".

### 2.6 Archive ordering and deferred transition — compliant

`ArchiveChange.execute` order (`archive-change.ts:262-413`): load change → resolve schema → list workspaces → local overlap report → `executeMatchingPredicates(archiveBindings, ...)` → throw on first failing check in registry order via `throwMappedArchiveFailure` → invalidate overlapping peers when `allowOverlap` → resolve actor → `before-persist` effects → `_prepareArchivePlan` → `_prepareArchivePreflight` → `detectOrphans` + per-spec `snapshot` → `mutate` transition to `archiving` → staged publication → `archive.archive()` → `cleanup` → metadata materialization → `after-persist` effects.

`throwMappedArchiveFailure` (`archive-change.ts:1300-1372`) maps each check id back to the historical typed error: `SchemaMismatchError`, `InvalidStateTransitionError` (re-raised via `change.assertArchivable()`), `SpecOverlapError`, `ReadOnlyWorkspaceError` with the exact spec'd message format, `ArchiveDependencyMismatchError`, `ArchiveImplementationStateError`. `ArchivePreflightError` / `ArchiveArtifactMissingError` stay inside the use case after predicates allow the operation, as required.

### 2.7 Pending states drain-only — compliant

`packages/core/src/domain/value-objects/change-state.ts:30-43`:

```
ready:       ['implementing', 'designing']                           // no pending-spec-approval ✅
done:        ['archivable', 'designing', 'implementing', 'verifying'] // no pending-signoff ✅
archivable:  ['archiving', 'designing', 'implementing', 'verifying']  // no 'ready', no 'done' ✅
archiving:   ['archivable', 'designing']                              // recovery ✅
'pending-spec-approval': ['spec-approved', 'designing']               // drain ✅
'pending-signoff':       ['signed-off', 'designing']                  // drain ✅
```

No entry in `VALID_TRANSITIONS` targets `pending-spec-approval` or `pending-signoff`, so the pending states are structurally unreachable for new work. `HAPPY_PATH_NEXT` routes `ready → implementing` and `done → archivable`, never through a pending state.

### 2.8 No pending rewrite on approve — compliant

`ApproveSpec.execute` (`approve-spec.ts:70-102`) and `ApproveSignoff.execute` (`approve-signoff.ts:70-102`) are structurally identical:

1. gate flag from construction (`ApprovalGateDisabledError` before any repository access);
2. `changes.get(name)` → `ChangeNotFoundError`;
3. actor identity;
4. schema → `SchemaMismatchError`;
5. state guard derived from the engine, not hardcoded: `boundFromStates('approval.spec' | 'approval.signoff')` plus the drain state;
6. inside `mutate`: hash artifacts, `recordSpecApproval` / `recordSignoff`, and transition **only** `if (freshChange.state === 'pending-spec-approval' | 'pending-signoff')`.

There is no code path that writes `pending-*` and none that transitions a `ready` / `done` change to `spec-approved` / `signed-off`. Using `boundFromStates` rather than literal `'ready'` / `'done'` satisfies "`from` states for `approval.spec` come from engine bindings".

### 2.9 External hooks — compliant (indirect)

`RunStepHooks` (`packages/core/src/application/use-cases/run-step-hooks.ts:68-90, 211-214, 294-309`) collects `type: 'run' | 'external'` entries, dispatches `external` entries to `_externalHookRunners.get(hook.externalType)`, and throws `ExternalHookTypeNotRegisteredError` when no runner accepts the type. Because `HookEffectCheck` delegates wholesale to `RunStepHooks`, explicit external hooks inherit archive/transition phase semantics without a second dispatch path — satisfying "the difference is the dispatch backend, not the lifecycle semantics".

---

## 3. Discrepancies

### D1 — HIGH — `spec-lock` initial `dependsOn` bypasses `resolveInitialPersistedDependsOn()`

**Spec:** `core:archive-change` › _spec-lock sidecar persistence_ step 3 — "When no lock exists, resolves the initial dependency set through `resolveInitialPersistedDependsOn()` … It does not maintain a second artifact/metadata fallback algorithm for initial dependency resolution." Verify scenario: _No-lock spec resolves initial dependsOn through resolveInitialPersistedDependsOn_.

**Implementation:** `archive-change.ts` never imports `resolve-initial-persisted-depends-on.js`. `_resolvePersistedDependsOn` (`archive-change.ts:989-1008`) implements a private four-tier precedence chain — manifest deps → existing sidecar → cached `metadata.json` deps → freshly extracted deps — which is exactly the "second artifact/metadata fallback algorithm" the requirement forbids. Cross-check: `resolveInitialPersistedDependsOn` is consumed only by `initialize-persisted-spec-state.ts`, `update-persisted-spec-deps.ts` and `update-persisted-spec-implementation.ts`.

**Risk:** archive and `InitializePersistedSpecState` can seal different initial `dependsOn` for the same lock-less spec; the divergence is silent and lands in canonical `spec-lock.json`.

### D2 — MEDIUM — `graph.excludePaths` not applied during archive-time link materialization

**Spec:** `core:archive-change` › _Implementation materialization into spec-lock_ — "ignore links whose raw file path falls under the target workspace `graph.excludePaths`". Verify scenario: _Excluded path is ignored during sidecar materialization_.

**Implementation:** `_materializeImplementationLinks` (`archive-change.ts:1183-1233`) resolves the absolute path, converts to a `codeRoot`-relative portable path, and emits the entry. No exclusion filter exists. `excludePaths` is honoured only upstream at tracking time (`refresh-implementation-tracking.ts:86-88` → `vcs-implementation-detector.ts:70-73`), so an excluded path that was confirmed before a config change, or added out-of-band, is materialized into `spec-lock.json`.

**Aggravating factor:** the method body contains an abandoned deliberation left in the source (`archive-change.ts:1208-1216`), including lines such as `// Ah, I need to check if I added it.` and `// "está mal, si ves el proposal, graphConfig no entraba a ProjectWorkspace"`. This is a self-documented unfinished requirement and also violates the repo comment conventions.

### D3 — MEDIUM — `resolveArchiveChangeDeps` requirement text contradicts its own verify and the sibling requirement

**Spec (internal defect):** _Config-based factory delegates through resolveArchiveChangeDeps_ lists `runStepHooks: RunStepHooks` and `regenerateMetadata: RegenerateSpecMetadata` among the MUST-resolve deps. That directly contradicts (a) _Archive bindings not RunStepHooks on the use case_ — "`resolveArchiveChangeDeps` MUST include `archiveBindings` … and MUST NOT list `runStepHooks` on `ArchiveChangeDeps`" — and (b) its own verify scenario, which asserts `archiveBindings`, `materializeMetadata`, and "does not resolve `runStepHooks` onto the use case".

**Implementation:** `resolveArchiveChangeDeps` (`composition/use-cases/archive-change.ts:119-148`) resolves `archiveBindings` + `materializeMetadata` and no `runStepHooks` / `regenerateMetadata`. The code matches the verify file and the binding requirement; the spec.md dep list is stale prose. Fix the spec, not the code.

### D4 — LOW/MEDIUM — Overlap detection runs twice per archive

**Spec:** _Overlap guard_ prescribes one sequence (list → exclude self → `detectSpecOverlap` → filter) as the `spec.overlap` check.

**Implementation:** that sequence exists twice per archive. `ArchiveChange.execute:271-282` performs `changes.list()` plus one `changes.get()` per peer and computes `relevantOverlap` locally; the composed `spec.overlap` check re-runs the identical loop inside `workflow-check-registry.ts:38-59`. The local copy is needed for `SpecOverlapError` entries and peer invalidation, but the result is 2×(1 + N) repository reads and two sources of truth that can disagree under concurrency (a peer created between the two passes blocks the check while the error payload omits it).

### D5 — LOW — `spec.overlap` never receives `specOverlapPeers`, so `GetStatus` messages are non-actionable

**Spec:** `runSpecOverlap` supports `specOverlapPeers` and formats "Specs overlap with other active changes: `<name> (<specIds>)`".

**Implementation:** the composed detector (`workflow-check-registry.ts:53-58`) returns only `{ blocked, message: 'Specs overlap with other active changes' }` and never populates `specOverlapPeers`, so `formatOverlapMessage` always takes the `peers.length === 0` fallback. `ArchiveChange` is unaffected (it throws `SpecOverlapError` built from its local entries), but `GetStatus` blockers in `archivable` cannot name the conflicting change. The peer-formatting code in `spec-overlap.ts:34-49` is currently dead.

### D6 — LOW — Archive debug logging omits several mandated pre-commit entries

**Spec:** _Archive debug logging_ › Pre-commit requires, among others, "archivable guard pass — change name and current state" and "overlap and readOnly guard outcomes — spec IDs checked; overlap entries or readOnly workspaces when relevant".

**Implementation:** the predicate block emits a single aggregate `'ArchiveChange named archive predicates complete'` with `{ change, overlapCount, invalidatedChanges }` (`archive-change.ts:310-314`). There is no per-guard log for the archivable pass (with current state) and no readOnly outcome log with the spec IDs checked. Snapshot / restore / commit / post-commit logging is otherwise present and matches the requirement.

### D7 — LOW — `staleMetadataSpecPaths` returns spec IDs, not spec paths

**Spec:** _Result shape_ — "`staleMetadataSpecPaths` — array of **spec paths** where `metadata.json` generation failed".

**Implementation:** `archive-change.ts:518` pushes `specId` (`workspace:capability/path` form). The preflight already carries `specPath: SpecPath` for each publication, so the intended value is available. Either the field or the spec should be renamed; today the name misdescribes the payload for consumers.

### D8 — LOW — Unnormalizable link fails instead of being discarded

**Spec:** _Implementation materialization into spec-lock_ — "discard links that cannot be normalized into a valid `workspace:path`" _and_ "fail archive when a confirmed link points outside the `codeRoot`".

**Implementation:** an unknown workspace throws `ArchiveImplementationStateError` (`archive-change.ts:1192-1197`). An unknown-workspace link cannot be normalized, so by the letter of the requirement it should be discarded, not fatal. The `codeRoot` escape case (`:1201-1206`) correctly fails. The two bullets are genuinely ambiguous about which one owns "unknown workspace"; recommend disambiguating the spec.

### D9 — INFO — `deps.consistent` evaluated twice with different fact sources

`deps.consistent` runs as an archive predicate through the shared runner (registry order position 5), and again inside preflight via `_assertArchiveDepsConsistent` (`archive-change.ts:1145-1173`), which calls `runDepsConsistent` with `finalDependsOn` rather than the enter-`ready` facts. The second pass is arguably necessary — only preflight knows the sealed sidecar value — but the spec describes `deps.consistent` as a single shared runner, so the double evaluation is undocumented. Not a violation; worth a spec note.

### D10 — INFO — Dead gate branch in `_assertDrainAndGateTargets`

`transition-change.ts:343-363` guards `requestedTarget === 'pending-spec-approval'` / `'pending-signoff'`. Since D-2.7 confirms no `VALID_TRANSITIONS` entry targets those states, `protocol.edge` rejects the hop first and these branches are unreachable. Harmless defensive code; noted only so a future reader does not mistake it for a live pending-entry path.

---

## 4. Tests

### 4.1 `packages/core/test/application/use-cases/archive-change.spec.ts` (2948 lines, ~64 cases)

Directly covering the focus areas:

| Focus                                  | Test                                                                                                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `RunStepHooks` on use case          | `constructor › does not store RunStepHooks on the instance` (:168)                                                                                                                                                                            |
| `skipHookPhases all`                   | `given archive hook phases are skipped › does not execute hooks` (:1521), plus merge/metadata/`postHookFailures` still-correct cases (:1386, :1430, :1474)                                                                                    |
| `skipHookPhases pre`                   | `skips only pre hooks when skipHookPhases contains pre` (:1548)                                                                                                                                                                               |
| `skipHookPhases post`                  | `skips only post hooks when skipHookPhases contains post` (:1579)                                                                                                                                                                             |
| `allowOverlap` false                   | `overlap guard › throws SpecOverlapError when other changes target the same specs` (:2609)                                                                                                                                                    |
| `allowOverlap` true                    | `proceeds when allowOverlap is true despite overlap` (:2644); `invalidates multiple overlapping changes` (:2688); `returns empty invalidatedChanges when allowOverlap is true but no overlap exists` (:2742)                                  |
| Overlap excludes self                  | `proceeds without flag when no overlap exists` (:2763)                                                                                                                                                                                        |
| `impl.filesResolved` not skippable     | `still fails open tracked files when allowOutOfScope is true` (:2841) — the load-bearing negative test                                                                                                                                        |
| `impl.filesResolved` default           | `fails when tracked implementation files remain open` (:2820)                                                                                                                                                                                 |
| `impl.linksInScope` default / override | `fails when implementation links target specs outside scope without allowOutOfScope` (:2861); `publishes out-of-scope implementation sidecars when allowOutOfScope is true` (:2904)                                                           |
| Deferred transition                    | `keeps change archivable during pre-hooks` (:2551); `transitions to archiving via mutate after preflight and before publication` (:2579)                                                                                                      |
| Pre-hook abort                         | `throws HookFailedError and does not return a result` (:1168); `does not call archive repository when pre-hook fails` (:2493)                                                                                                                 |
| Post-hook collect                      | `collects hook failure without rolling back the archive` (:2319); `collects all failed hook commands` (:2428)                                                                                                                                 |
| `instruction` not executed             | `given an instruction-type pre hook entry is configured › does not invoke the hook runner` (:1365)                                                                                                                                            |
| Hook ordering                          | `runs project-level pre hooks after schema pre hooks` (:1216); `runs project-level post hooks after schema post hooks` (:1243)                                                                                                                |
| `RunStepHooks` params                  | `passes name, step:"archiving", phase:"pre"` (:2378) and `phase:"post"` (:2402)                                                                                                                                                               |
| readOnly guard                         | `throws ReadOnlyWorkspaceError when change contains readOnly specs` (:2786)                                                                                                                                                                   |
| Preflight atomicity                    | `blocks earlier spec publication when a later spec fails preflight` (:603); `completes batch preflight before the first publish starts` (:712)                                                                                                |
| Typed errors / deps                    | `fails archive when extracted dependsOn mismatches final persisted deps` (:511)                                                                                                                                                               |
| Sidecar                                | `writes spec-lock.json on first archive using final persisted dependsOn` (:392); `preserves existing sidecar schema and refreshes dependsOn on re-archive` (:449); `falls back to spec-lock dependsOn when extraction omits dependsOn` (:833) |

### 4.2 `packages/cli/test/commands/change/archive.spec.ts` (19 cases)

`--skip-hooks all` (:230), `pre` (:254), `post` (:277), `pre,post` (:300), default empty set (:331); `--allow-overlap` (:354); `--allow-out-of-scope` (:377); both flags omitted (:400); post-hook exit code 2 (:64); invalidated-change reporting in text (:147) and JSON (:172); check-progress streaming (:112, :425).

### 4.3 `packages/core/test/domain/services/transition-checks.spec.ts`

Archive rows all carry `scope: 'archive'` (:207-209); **shared-runner identity** asserted by object identity — `TRANSITION_BINDINGS.find(deps.consistent).check` `toBe` `ARCHIVE_BINDINGS.find(deps.consistent).check` (:213-216); archive `hook.pre` = `before-persist`/`abort` and `hook.post` = `after-persist`/`collect` (:267-270); `archive.publication` absent from archive bindings (:390-391).

### 4.4 `packages/core/test/application/use-cases/get-status.spec.ts`

`given archivable live overlap, when GetStatus runs archive predicates, then …` asserts blocker code `OVERLAP_CONFLICT` with `checkId === 'spec.overlap'` (:1022-1046); `does not run archive overlap I/O or emit OVERLAP_CONFLICT when not archivable` (:1049-1061) pins the archivable-only gating.

### 4.5 Approve use cases

`approve-spec.spec.ts` (17 cases) and `approve-signoff.spec.ts` (17 cases) are symmetric and cover the drain-only contract precisely: `records consent and stays in ready` / `stays in done` (:72), drain `transitions the change to spec-approved` / `signed-off` (:116), gate-disabled short-circuit before load (:202/:201), `ApprovalGateDisabledError` code (:224/:223), non-wait-state `InvalidStateTransitionError` (:244/:243), `SchemaMismatchError` before `mutate` (:266/:265), `ChangeNotFoundError` (:289/:288), hashing (:136), persistence through `mutate` (:178/:177).

### 4.6 Other

`packages/core/test/application/checks/workflow-check-factories.spec.ts` verifies `createHookPre` uses `RunStepHooks` from the constructor and `createHookPost.kind === 'effect'`. `packages/core/test/application/use-cases/transition-change.spec.ts:2534-2547` substitutes a failing `workspace.readOnly` binding, exercising the shared runner on the transition side.

---

## 5. Missing Tests

| #   | Gap                                                                                                                                                                                                                                                                                                                               | Tied to                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| M1  | No test asserts a lock-less spec resolves initial `dependsOn` via `resolveInitialPersistedDependsOn()`. Verify scenario _No-lock spec resolves initial dependsOn through resolveInitialPersistedDependsOn_ is unrepresented — which is why D1 shipped undetected.                                                                 | D1                         |
| M2  | No test for _Excluded path is ignored during sidecar materialization_. A confirmed link under `graph.excludePaths` is never fed to `_materializeImplementationLinks` in any case.                                                                                                                                                 | D2                         |
| M3  | No composition test asserts `resolveArchiveChangeDeps` returns `archiveBindings` and omits `runStepHooks` (grep for `resolveArchiveChangeDeps` in `packages/core/test` and `packages/cli/test` returns nothing). Both verify scenarios under _Config-based factory delegates through resolveArchiveChangeDeps_ are unrepresented. | D3                         |
| M4  | No test asserts `resolveWorkflowCheckRegistry` passes `includeOverlapDetection: true` for archive and _omits_ it for `TransitionChange`. The "overlap MUST NOT run as an enter-`ready` predicate" invariant is currently protected only by reading the composition source.                                                        | §2.5                       |
| M5  | Verify scenario _before-persist slot does not hardcode hook.pre_ has no direct test. Existing tests exercise the default `hook.pre` binding; none registers a second `before-persist` effect with a different id and asserts it also runs. A regression to `check.id === 'hook.pre'` would stay green.                            | §2.4                       |
| M6  | No test for archive `skipHookPhases` receiving an unknown/irrelevant selector (e.g. `target.pre` on an archive attempt) staying a no-op — the mirror of the transition `source.pre` / `target.post` no-op scenarios.                                                                                                              | §2.3                       |
| M7  | Verify scenario _Missing tracked file fails even if an alternate path exists_ has no matching case; the positive twin (_Tracked direct artifact wins over stray delta file_) is covered by :2156.                                                                                                                                 | Tracked artifact selection |
| M8  | No test asserts `spec.overlap` failure messages name the conflicting peers. Adding one would surface D5 immediately.                                                                                                                                                                                                              | D5                         |
| M9  | No test for the _Archive debug logging_ pre-commit entries (archivable guard pass with current state; readOnly/overlap guard outcomes with spec IDs).                                                                                                                                                                             | D6                         |
| M10 | No test pins `staleMetadataSpecPaths` payload shape (spec path vs spec ID).                                                                                                                                                                                                                                                       | D7                         |
| M11 | No test asserts `VALID_TRANSITIONS` has **no** entry targeting `pending-spec-approval` / `pending-signoff`. The drain-only invariant is currently correct but unguarded — a future re-add of `ready → pending-spec-approval` would not fail any test in this slice.                                                               | §2.7                       |
| M12 | No test asserts `ApproveSpec` / `ApproveSignoff` derive their `from` guard from `boundFromStates(...)` rather than literals — i.e. that rebinding `approval.spec` to a different `from` state moves the guard with it.                                                                                                            | §2.8                       |

---

## 6. Counts

| Metric                                 | Count                                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specs audited                          | 6                                                                                                                                                                                                           |
| Requirements reviewed                  | 71 (archive-change 31, hook-execution-model 12, workflow-model 10, approve-spec 8, approve-signoff 8, change gate/drain slice 2)                                                                            |
| Requirements assessed compliant        | 61                                                                                                                                                                                                          |
| Requirements with discrepancies        | 8 (D1, D2, D3, D4, D5, D6, D7, D8)                                                                                                                                                                          |
| Informational observations             | 2 (D9, D10)                                                                                                                                                                                                 |
| Discrepancies by severity              | HIGH 1, MEDIUM 2, LOW/MEDIUM 1, LOW 4                                                                                                                                                                       |
| Spec-side defects (fix spec, not code) | 2 (D3 stale dep list, D8 ambiguous bullets)                                                                                                                                                                 |
| Existing tests inspected               | ~120 cases across 7 files                                                                                                                                                                                   |
| Missing-test gaps identified           | 12                                                                                                                                                                                                          |
| Focus areas fully compliant            | 5 of 6 — shared runners, `skipHookPhases` pre/post/all, `impl.filesResolved` not skipped by `allowOutOfScope`, pending drain-only / no pending rewrite on approve, archive `includeOverlapDetection` wiring |
| Focus areas with findings              | 1 — `allowOverlap` / `allowOutOfScope` path (D4 duplicate detection, D5 non-actionable peer message)                                                                                                        |

### Files inspected

- `packages/core/src/application/use-cases/archive-change.ts`
- `packages/core/src/application/use-cases/approve-spec.ts`, `approve-signoff.ts`
- `packages/core/src/application/use-cases/transition-change.ts` (effect + drain slices)
- `packages/core/src/application/use-cases/run-step-hooks.ts` (external-hook slice)
- `packages/core/src/application/checks/workflow-check-registry.ts`, `hook-effect.ts`, `impl-links-in-scope.ts`
- `packages/core/src/application/services/execute-matching-predicates.ts`, `execute-hook-effect.ts`
- `packages/core/src/domain/services/check-bindings.ts`
- `packages/core/src/domain/checks/impl-files-resolved.ts`, `impl-links-in-scope.ts`, `spec-overlap.ts`
- `packages/core/src/domain/value-objects/change-state.ts`
- `packages/core/src/composition/use-cases/archive-change.ts`, `workflow-check-registry.ts`, `get-status.ts`, `transition-change.ts`
- `packages/core/src/application/use-cases/get-status.ts` (archive-predicate slice)
- `packages/core/src/application/ports/change-repository.ts` (`mutate` contract)
- `packages/cli/src/commands/change/archive.ts`
