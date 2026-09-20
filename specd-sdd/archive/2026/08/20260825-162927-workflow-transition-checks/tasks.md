# Tasks: workflow-transition-checks

## 1. Domain types and graph

- [x] 1.1 Align `VALID_TRANSITIONS` with in-place gates and skill-aligned hops
      `packages/core/src/domain/value-objects/change-state.ts`: `VALID_TRANSITIONS` — `ready` is `implementing`+`designing` only (no `pending-spec-approval`); `done` is `archivable`+`designing`+`implementing`+`verifying` (no `pending-signoff`); add hops on `signed-off` and `archivable`; leave `archiving` as `archivable`+`designing` only; keep pending/\* drain edges for in-flight states
      Approach: exact arrays from design.md; do not add `archivable → done` or hops to `ready`
      (Req: Lifecycle, Skill-aligned backward hops)

- [x] 1.2 Update change-state unit tests for the new edges
      `packages/core/test/domain/value-objects/change-state.spec.ts`: `VALID_TRANSITIONS` describe — expect the new targets; assert `archivable` still cannot go to `done`; assert `archiving` cannot go to `implementing`
      Approach: replace the current `archivable: ['archiving', 'designing']` equality with the extended list
      (Req: Lifecycle)

- [x] 1.3 Add transition-check types and `classifyAlong`
      `packages/core/src/domain/services/transition-checks.ts`: export `CheckId`, `CheckKind`, `CheckResult`, `CheckApplicability`, `TransitionAlong`, `PredicateSnapshots`, `classifyAlong`
      Approach: implement the seven-step classification algorithm from design.md (recovery, redesign, re-enter any, then axis indices with gate-state delivery mapping)
      (Req: Applicability from, to, and along; Archive is an operation not an edge)

- [x] 1.4 Unit-test `classifyAlong`
      `packages/core/test/domain/services/transition-checks.spec.ts`: cases for `ready→designing` redesign, `verifying→implementing` backward, `archiving→archivable` recovery, `ready→implementing` forward, `done→implementing` backward, `designing→designing` any
      Approach: pass a schema-std-like `workflowSteps` array; do not treat recovery as backward
      (Req: Applicability from, to, and along)

- [x] 1.5 Export new types from domain index / public API
      `packages/core/src/domain/services/index.ts`, `packages/core/src/public.ts`: named exports only
      Approach: export `classifyAlong`, `CheckResult`, `CheckId`, `PredicateSnapshots`; no default export
      (Req: Engine purity)

## 2. Predicate runners and registry

- [x] 2.1 Implement `checkMatches` and registry-ordered `evaluateTransitionPredicates`
      `packages/core/src/domain/checks/` one file per CheckId; `packages/core/src/domain/services/transition-checks.ts`: matcher, registry, `evaluateTransitionPredicates` — protocol first, then requires, taskCompletion, deps, readOnly, impl.\*, approval.spec, approval.signoff
      Approach: matcher uses from/to/along wildcards; schema checks use `effective` for `to`; skip requires/taskCompletion on recovery; `allowed` is no blocking predicate fail (`skip` is not fail)
      (Req: Check identity and result, Evaluation of a transition attempt, Registry bindings, Predicate versus effect)

- [x] 2.2 Implement `evaluateArchivePredicates` for checks 1–7
      `packages/core/src/domain/services/transition-checks.ts`: archive scope only — schema.nameMatch, archive.archivable, spec.overlap, readOnly, deps, impl.filesResolved, impl.linksInScope
      Approach: no `along`; `approval.signoff` must not appear; publication stays in ArchiveChange
      (Req: Archive is an operation not an edge, Registry bindings)

- [x] 2.3 Implement shared pure runners for deps, readOnly, impl files, impl scope
      `packages/core/src/domain/services/transition-checks.ts`: `runDepsConsistent`, `runWorkspaceReadOnly`, `runImplFilesResolved`, `runImplLinksInScope`
      Approach: inspect `PredicateSnapshots` only; skippable impl scope when `allowOutOfScope`; same functions used later by archive
      (Req: Registry bindings)

- [x] 2.4 Implement workflow.requires and workflow.taskCompletion runners
      `packages/core/src/domain/services/transition-checks.ts`: use injected artifact effective statuses and `taskCounts`; missing capability → fail missing-task-capability; absent CountTasks entry after capability → skip
      Approach: do not read files inside the engine
      (Req: Requires-based gating, Task completion gating)

- [x] 2.5 Implement approval.spec and approval.signoff runners
      `packages/core/src/domain/services/transition-checks.ts`: skip when gate off; `along` must be forward; do not match `ready→designing`
      Approach: skip when gate off; fail APPROVAL_REQUIRED for requested `ready→implementing` / `done→archivable` until consent is recorded; do not treat pending as the wait
      (Req: Evaluation of a transition attempt)

- [x] 2.6 Unit-test matcher bindings
      `packages/core/test/domain/services/transition-checks.spec.ts`: impl._ does not match `ready→verifying`; impl._ matches `implementing→verifying`; deps matches `designing→ready`; approval.spec does not match redesign
      Approach: table-driven applicability fixtures
      (Req: Registry bindings)

## 3. LifecycleEngine

- [x] 3.1 Extend `LifecycleEngineOptions` with required `snapshots`
      `packages/core/src/domain/services/lifecycle-engine.ts`: `LifecycleEngineOptions.snapshots: PredicateSnapshots`
      Approach: no silent empty snapshot that skips task gating; fix every in-repo `evaluate` call site
      (Req: Engine purity, Gather check snapshots before lifecycle evaluate)

- [x] 3.2 Enumerate protocol-legal targets through predicate evaluation
      `packages/core/src/domain/services/lifecycle-engine.ts`: `evaluate` — for each `VALID_TRANSITIONS[change.state]`, run `evaluateTransitionPredicates` with `requestedTarget` that state; `availableTransitions` = targets with `allowed`; keep `validTransitions` as the protocol list
      Approach: replace the `isReady && isPermitted` filter that ignores taskCompletion
      (Req: Projections, Available steps and next action, Centralized validation logic)

- [x] 3.3 Add `checksByTarget` to `LifecycleVerdict`
      `packages/core/src/domain/services/lifecycle-engine.ts`: `LifecycleVerdict.checksByTarget`
      Approach: Partial Record of CheckResult arrays per target
      (Req: Check identity and result)

- [x] 3.4 Remove approval routing from `_resolveTarget`
      `packages/core/src/domain/services/lifecycle-engine.ts`: `_resolveTarget` — do not rewrite `implementing` → `pending-spec-approval` or `archivable` → `pending-signoff`
      Approach: requested target is the effective target; approval checks fail in place
      (Req: Evaluation of a transition attempt)

- [x] 3.5 Fix `_nextAction` for implementing
      `packages/core/src/domain/services/lifecycle-engine.ts`: `_nextAction` — if state is implementing and `availableTransitions` includes `verifying`, command `/specd-verify`; else `/specd-implement`
      Approach: do not always recommend implement
      (Req: Projections)

- [x] 3.6 Keep happy-path nextAction from done/archivable as archive/signoff
      `packages/core/src/domain/services/lifecycle-engine.ts`: `_nextAction` — even when implementing/verifying are available, do not make them default nextAction from done/signed-off/archivable; when `approval.spec` fails in ready recommend `changes approve spec`; when `approval.signoff` fails in done recommend `changes approve signoff`; otherwise archive
      Approach: review.required still wins with `/specd-design`; do not recommend a transition to pending
      (Req: Projections)

- [x] 3.7 Skip requires on archiving→archivable
      `packages/core/src/domain/services/lifecycle-engine.ts` + checks module: recovery hops remain available without workflow.requires
      Approach: classifyAlong recovery + skip requires/taskCompletion
      (Req: Archiving escape transitions in lifecycle verdict)

- [x] 3.8 Update lifecycle-engine tests
      `packages/core/test/domain/services/lifecycle-engine.spec.ts`: incomplete tasks hide verifying; complete tasks include verifying and nextAction `/specd-verify`; done lists hops without changing archive nextAction; recovery skips requires; evaluate uses snapshots only
      Approach: inject PredicateSnapshots; spy that no extra I/O occurs
      (Req: Available steps and next action)

## 4. Snapshot gathering

- [x] 4.1 Add `gatherPredicateSnapshots` application helper
      `packages/core/src/application/services/gather-predicate-snapshots.ts`: `gatherPredicateSnapshots`
      Approach: CountTasks always; extract dependsOn + ownership when `ready` is a valid transition; impl open files + linksInScope detector when state is implementing or evaluating exit-implementing; flags default false
      (Req: Gather check snapshots before lifecycle evaluate)

- [x] 4.2 Extract impl.linksInScope detection from ArchiveChange into a callable used by gather
      `packages/core/src/application/use-cases/archive-change.ts` + helper: same conditions as today’s out-of-scope sidecar guard
      Approach: GetStatus/TransitionChange call it without publishing; do not duplicate policy
      (Req: Registry bindings)

- [x] 4.3 Enter-ready deps compare extract vs `change.specDependsOn`
      `gatherPredicateSnapshots` / `runDepsConsistent`: fail when extract vs manifest would mismatch; skip spec when extract undefined
      Approach: archive keeps current sidecar `finalDependsOn` comparison
      (Req: Registry bindings)

## 5. GetStatus

- [x] 5.1 Call snapshots then evaluate
      `packages/core/src/application/use-cases/get-status.ts`: `_buildActiveResult` — CountTasks/gather before `this._lifecycle.evaluate`; paint `taskCompletion` from the same counts
      Approach: delete evaluate-then-CountTasks order
      (Req: Reports task completion counts, Gather check snapshots)

- [x] 5.2 Expose `checksByTarget` on `LifecycleContext`
      `packages/core/src/application/use-cases/get-status.ts`: `LifecycleContext`
      Approach: copy from verdict; effects not required for allowed
      (Req: Returns lifecycle context)

- [x] 5.3 Merge failed predicates into `blockers`
      `packages/core/src/application/use-cases/get-status.ts`: codes DEPS_INCONSISTENT, READ_ONLY_WORKSPACE, IMPLEMENTATION_STATE, INCOMPLETE_TASKS plus existing review codes
      Approach: skippable IMPLEMENTATION_STATE with bypassFlag `--allow-out-of-scope`
      (Req: Identifies blockers)

- [x] 5.4 Extend GetStatus constructor and `GetStatusDeps`
      `packages/core/src/application/use-cases/get-status.ts`, `packages/core/src/composition/use-cases/get-status.ts`: `resolveGetStatusDeps` — wire extract/ownership/impl detector ports
      Approach: no inline fs wiring; keep CountTasks via existing factory
      (Req: Constructor dependencies, Config-based factory delegates through resolveGetStatusDeps)

- [x] 5.5 GetStatus tests for order and projections
      `packages/core/test/application/use-cases/get-status.spec.ts`: spy CountTasks before evaluate; implementing incomplete tasks omit verifying; checksByTarget present; schema-fail path still empty availableTransitions
      Approach: keep existing designing VALID_TRANSITIONS equality only if predicates pass
      (Req: Gather check snapshots, Returns lifecycle context)

## 6. TransitionChange

- [x] 6.1 Evaluate predicates then throw mapped errors without a second requires/task walk
      `packages/core/src/application/use-cases/transition-change.ts`: `execute` — gather snapshots, evaluate with `requestedTarget: input.to`, throw first failure
      Approach: emit requires-check / task-completion-failed from CheckResult; do not CountTasks again after green evaluate
      (Req: Workflow requires enforcement, Task completion check during requires enforcement)

- [x] 6.2 Throw shared typed errors for deps/readOnly/impl
      `packages/core/src/application/use-cases/transition-change.ts`: `ReadOnlyWorkspaceError`, `ArchiveDependencyMismatchError`, `ArchiveImplementationStateError` from the same runners
      Approach: protocol/requires/tasks/approval stay InvalidStateTransitionError
      (Req: Registry bindings)

- [x] 6.3 Gate source.post on `along === 'forward'`
      `packages/core/src/application/use-cases/transition-change.ts`: post-hook block — classifyAlong(fromState, requestedTarget); skip post on backward/redesign/recovery
      Approach: implementing→designing does not run implementing.post; there is no ready→pending hop
      (Req: Post-hook execution, Default hook execution)

- [x] 6.4 Keep target.pre as onEnter along any
      `packages/core/src/application/use-cases/transition-change.ts`: pre-hooks on effectiveTarget including redesign into designing
      Approach: skipHookPhases still skips effects only
      (Req: Pre-hook execution, Manual hook control with skipHooks)

- [x] 6.5 Add `invalidateSignoff` without artifact mass-downgrade
      `packages/core/src/domain/entities/change.ts` (or existing approval APIs): new method if full `invalidate()` cannot skip spec+artifacts
      Approach: used only for done/signed-off/archivable → implementing|verifying
      (Req: Skill-aligned backward hop invalidation)

- [x] 6.6 Apply hop invalidation inside mutate
      `packages/core/src/application/use-cases/transition-change.ts`: persist path — signoff only for skill hops; existing redesign and verifying→implementing paths unchanged
      Approach: ChangeRepository.mutate; no source.post on those hops
      (Req: Skill-aligned backward hop invalidation, Persistence)

- [x] 6.7 Optional `allowOutOfScope` on TransitionChangeInput
      `packages/core/src/application/use-cases/transition-change.ts`: `allowOutOfScope?: boolean` default false passed into snapshots
      Approach: same skippable semantics as archive
      (Req: Registry bindings)

- [x] 6.8 Wire TransitionChange composition deps
      `packages/core/src/composition/use-cases/transition-change.ts`: same snapshot ports as GetStatus
      Approach: resolve\*Deps only
      (Req: Config-based factory / Dependencies)

- [x] 6.9 TransitionChange tests
      `packages/core/test/application/use-cases/transition-change.spec.ts`: no second CountTasks; skipHooks all still fails incomplete tasks; source.post skipped on redesign; source.post fail-fast no persist on implementing→verifying; done→implementing clears signoff keeps artifacts; designing→ready throws ReadOnlyWorkspaceError; recovery skips archiving.post and requires
      Approach: cover gates on/off for approval.spec/signoff
      (Req: Post-hook execution, Skill-aligned backward hop invalidation, Predicate versus effect)

## 7. ArchiveChange and hooks model

- [x] 7.1 Replace inlined archive guards with shared runners
      `packages/core/src/application/use-cases/archive-change.ts`: schema.nameMatch, archive.archivable, spec.overlap, readOnly, deps, impl.\* then existing publication
      Approach: allowOverlap still invalidates overlapping changes in the use case after skippable overlap predicate
      (Req: Schema name guard, Archivable guard, ReadOnly workspace guard, Overlap guard, Tracked implementation review guard, Out-of-scope sidecar update guard, Archive checks share runners)

- [x] 7.2 Keep archive.publication in the use case
      `packages/core/src/application/use-cases/archive-change.ts`: remaining ArchivePreflightError / ArchiveArtifactMissingError after named checks
      Approach: no new publication policy
      (Req: Archive checks share runners)

- [x] 7.3 Archive run: hooks remain operation archive
      `packages/core/src/application/use-cases/archive-change.ts`: pre/post via RunStepHooks step archiving; skipHookPhases skips effects only
      Approach: do not bind archive hooks to along
      (Req: Default hook execution, Pre-archive hooks)

- [x] 7.4 ArchiveChange tests still throw the same typed errors
      `packages/core/test/application/use-cases/archive-change.spec.ts`: SchemaMismatch, assertArchivable, ReadOnly, overlap, deps mismatch, open files, out-of-scope; assert imports of shared runners
      Approach: do not weaken existing cases
      (Req: Typed errors for archive failures)

## 8. CLI

- [x] 8.1 Status renders GetStatus projections only
      `packages/cli/src/commands/change/` status command: `availableTransitions` and `nextAction` from GetStatus
      Approach: do not union local VALID_TRANSITIONS
      (Req: Lifecycle projections come from GetStatus checks)

- [x] 8.2 Transition Repair Guide uses check-derived nextAction
      `packages/cli/src/commands/change/` transition command: on failure print GetStatus nextAction; catch ReadOnlyWorkspaceError, ArchiveDependencyMismatchError, ArchiveImplementationStateError with exit 1 + repair guide
      Approach: implementing+complete tasks → verify skill not `/specd-implement`
      (Req: Invalid transition error, Incomplete tasks error)

- [x] 8.3 CLI tests
      `packages/cli/test/commands/change/change-status.spec.ts` and transition tests: incomplete tasks omit verifying; repair guide verify command; skip-hooks still blocked by tasks
      Approach: mock GetStatus payloads rather than recomputing graph in CLI
      (Req: Lifecycle projections come from GetStatus checks)

- [x] 8.4 Approve commands record consent from ready/done
      `packages/cli/src/commands/change/` approve spec/signoff: valid from `ready`/`done`; drain pending still allowed
      Approach: success copy must not say the change moved to pending
      (Req: ApproveSpec / ApproveSignoff)

- [x] 8.5 Approve CLI tests
      `packages/cli/test/commands/change/` approve tests: from ready/done; do not require pending as the only source
      Approach: mock use cases
      (Req: ApproveSpec / ApproveSignoff)

## 9. Living documentation

- [x] 9.1 Rewrite the change lifecycle guide
      `docs/guide/workflow.md`: diagram, per-state transition-out, approval-gates section, transition table — stay in ready/done; approve records consent; hops from done/archivable; drain-only pending
      Approach: grep the file for pending-spec-approval after edit; leftover mentions only as drain
      (Req: Lifecycle)

- [x] 9.2 Rewrite getting-started lifecycle
      `docs/guide/_sections/getting-started/lifecycle.md`: approval gates are human approve in place, not a compliance-check push-back
      Approach: keep pause/discard/archive paragraphs unless they contradict
      (Req: Lifecycle)

- [x] 9.3 Update configuration guide approvals rows
      `docs/guide/configuration.md`: spec/signoff blocked until approve, not pending hops
      Approach: same wording as config-reference
      (Req: Lifecycle)

- [x] 9.4 Update config reference approvals table
      `docs/config/config-reference.md`: same in-place gate model
      Approach: enabled vs disabled columns
      (Req: Lifecycle)

- [x] 9.5 Rewrite approvals-and-workflow-hooks example
      `docs/config/examples/approvals-and-workflow-hooks.md`: replace pending pipeline with stay-in-ready + approve + ready→implementing
      Approach: keep hook examples if they still match along=forward post
      (Req: Lifecycle)

- [x] 9.6 Update CLI reference approve and transition
      `docs/cli/cli-reference.md`: approve from ready/done; no silent routing to pending
      Approach: also check status availableTransitions wording if present
      (Req: Lifecycle)

- [x] 9.7 Update core domain-model graph
      `docs/core/domain-model.md`: VALID_TRANSITIONS table and `VALID_TRANSITIONS['done']` example — hops; no pending from ready/done
      Approach: drain-only note for parking states
      (Req: Lifecycle)

- [x] 9.8 Update core use-cases
      `docs/core/use-cases.md`: availableTransitions is check-derived; TransitionChange does not redirect to pending; ApproveSpec/ApproveSignoff stay in ready/done
      Approach: fix error tables that say approve only from pending
      (Req: Projections)

- [x] 9.9 Update core errors examples
      `docs/core/errors.md`: do not present pending as the wait state for new work
      Approach: examples can mention drain if needed
      (Req: Lifecycle)

- [x] 9.10 Update core overview if it restates the graph
      `docs/core/overview.md`: VALID_TRANSITIONS blurb matches in-place gates
      Approach: skip if already a one-line index
      (Req: Lifecycle)

- [x] 9.11 Update schema-format workflow axis and taskCompletion
      `docs/schemas/schema-format.md`: workflow[] order is progress axis for along; taskCompletionCheck gates the target step (verifying), not implementing.requires
      Approach: consecutive steps still not mandatory
      (Req: Applicability from, to, and along)

- [x] 9.12 Update package and root README lifecycle copy
      `packages/specd/README.md`, `README.md`: approval checkpoints without pending hops; optional one sentence on skill-aligned hops
      Approach: keep verification vs approval distinction
      (Req: Lifecycle)

- [x] 9.13 Grep remaining living hits
      `docs/`, `README.md`, `packages/specd/README.md`: `pending-spec-approval`, `pending-signoff`, `silently routed`
      Approach: fix leftovers; do not rewrite `docs/adr/**`
      (Req: Lifecycle)

## 10. Remaining call sites and verification

- [x] 10.1 Fix every `LifecycleEngine.evaluate` call site for snapshots
      grep callers (`compile-context`, `validate-artifacts`, tests): pass gatherPredicateSnapshots or test fixtures
      Approach: no compile errors; domain still I/O-free
      (Req: Shared lifecycle interpretation for consumers)

- [x] 10.2 Update `build-schema` / hook instruction VALID_TRANSITIONS consumers if they snapshot exact target arrays
      `packages/core/src/domain/services/build-schema.ts` and related tests: state set still Object.keys; arrays of targets may need hop awareness
      Approach: only if tests fail
      (Req: Lifecycle)

- [x] 10.3 Manual E2E from design.md
      CLI against a fixture change: incomplete tasks hide verifying; complete tasks nextAction `/specd-verify`; open impl blocks implementing→verifying; readOnly blocks ready; done→implementing keeps artifacts; `--skip-hooks all` still fails tasks
      Approach: `node packages/cli/dist/index.js changes status|transition … --format text`
      (Req: Projections, Registry bindings, Predicate versus effect)

- [x] 10.4 JSDoc on all new public symbols
      new files and changed public methods: `@param` / `@returns` / `@throws` per docs spec
      Approach: no `any`; named ESM exports
      (Req: Engine purity / global docs)

## 11. Binding pipeline phase and failure policy

- [x] 11.0 Require `kind` on every check object
      `packages/core/src/domain/services/transition-checks.ts` `Check.kind` required; each `packages/core/src/domain/checks/*.ts` sets `kind: 'predicate'` or `'effect'`
      Approach: do not omit kind; do not infer from id; `isEffectCheck` is `kind === 'effect'`
      (Req: One implementation file per check)

- [x] 11.1 Add `phase` and `onFailure` on `CheckBinding`
      `packages/core/src/domain/services/transition-checks.ts`: `EffectPipelinePhase`, `EffectOnFailure`; optional fields on `CheckBinding`
      Approach: predicates omit fields; effects MUST set both
      (Req: Binding pipeline phase and failure policy)

- [x] 11.2 Set effect rows in `check-bindings.ts`
      `packages/core/src/domain/services/check-bindings.ts`: transition hook.post/pre `before-persist`+`abort`; archive hook.pre same; archive hook.post `after-persist`+`collect`
      Approach: extend `bind()` extra; do not put phase on the check module
      (Req: Registry bindings for this capability)

- [x] 11.3 `matchingEffects` helper
      application sibling to check registry: filter bindings by attempt, `isEffectCheck`, `phase`, then `check.execute(ctx)`
      Approach: apply `onFailure` abort vs collect; honour skip flags; do not call `RunStepHooks` here
      (Req: Predicate versus effect)

- [x] 11.4 ArchiveChange slots from the table
      `packages/core/src/application/use-cases/archive-change.ts`: remove `check.id !== 'hook.pre'` / `'hook.post'` filters; before-persist then commit then after-persist
      Approach: tests in `archive-change.spec.ts` still fail-fast pre and collect post
      (Req: Pre-archive hooks, Post-archive hooks)

- [x] 11.5 TransitionChange iterates `before-persist` effects
      `packages/core/src/application/use-cases/transition-change.ts`: registry-order matching effects; keep skip `source.post` / `target.pre`
      Approach: do not choose the slot by check id; along still filters post
      (Req: Post-hook execution, Pre-hook execution)

- [x] 11.6 Tests for table-driven slots
      `packages/core/test/domain/services/transition-checks.spec.ts` and archive/transition use-case specs: bindings declare phase/onFailure; use cases do not hardcode hook ids for timing
      Approach: given…when…then names
      (Req: Binding pipeline phase and failure policy)

## 12. Check ABI (`create*` + WorkflowCheck)

- [x] 12.1 Add `WorkflowCheck` and `CheckExecutionContext`
      `packages/core/src/application/checks/workflow-check.ts`: abstract class with `id`, `kind`, `execute`, `pass` / `fail` / `skip`; no snapshots, needs, or `RunStepHooks` on the base
      Approach: `Check` interface in domain or application; core checks `extend WorkflowCheck`
      (Req: Check ABI create and WorkflowCheck)

- [x] 12.2 Convert each check to `create*` returning WorkflowCheck
      one module per id: `createWorkflowTaskCompletion({ countTasks })`, `createHookPre({ runStepHooks })`, same pattern for protocol, requires, deps, readOnly, impl._, approval._, archive.\*, hook.post
      Approach: constructor deps = only that check’s ports; optional private `runRule` for unit tests
      (Req: One implementation file per check)

- [x] 12.3 Bind instances in composition
      `packages/core/src/composition/use-cases/get-status.ts`, `transition-change.ts`, `archive-change.ts`: construct checks once, `bind(check, applicability, phase?, onFailure?)`
      Approach: registry.predicates(attempt) / registry.effects(attempt, phase); no CheckId switch
      (Req: Evaluation of a transition attempt)

- [x] 12.4 Use cases call `execute` only
      GetStatus / TransitionChange / ArchiveChange: remove `gatherPredicateSnapshots`; remove launching hooks by id; LifecycleEngine projects from CheckResults
      Approach: delete snapshot type from public API
      (Req: No shared snapshot bag)

- [x] 12.5 Tests for factories and no bag
      factory + GetStatus/TransitionChange specs: execute takes context; CountTasks inside task-completion; TransitionChange does not launch RunStepHooks by id
      Approach: given…when…then names matching verify.md
      (Req: Check ABI create and WorkflowCheck, No shared snapshot bag)

## 13. Redesign must stay unblocked; compact status text

- [x] 13.1 Bind impl._ to `along = forward` only
      `packages/core/src/application/checks/workflow-check-registry.ts`, `packages/core/src/domain/services/check-bindings.ts`: `from = implementing`, `to = _`, `along = forward`    Approach: keep archive bindings unchanged; matcher tests assert`implementing → designing` does not match
      (Req: Registry bindings for this capability)

- [x] 13.2 Compact `IMPLEMENTATION_STATE` fail message
      `packages/core/src/domain/checks/impl-files-resolved.ts`: `details.files` stays complete; `message` is count + at most three paths; label `examples` when truncated
      Approach: do not compact `DEPS_INCONSISTENT` / `READ_ONLY_WORKSPACE`
      (Req: Registry bindings for this capability)

- [x] 13.3 Omit duplicated `review:` files from status text
      `packages/cli/src/commands/change/status.ts`: text skips `affectedArtifacts` and the `review:` header except overlap peers
      Approach: JSON/TOON still serialize full `review`; keep `artifacts (details):` as today
      (Req: Text status omits duplicated review file lists)

- [x] 13.4 Tests for redesign, compact message, and text review
      `packages/core/test/domain/services/transition-checks.spec.ts`, `packages/cli/test/commands/change.spec.ts` / `change-status.spec.ts`: redesign does not match impl.\*; many opens compact message; text has no `review:` file list for artifact-review-required; overlap peers still print
      Approach: given…when…then names matching verify.md
      (Req: Registry bindings for this capability, Text status omits duplicated review file lists)

## 14. Compliance: verify merge + IMPLEMENTATION_STATE bypassFlag

- [x] 14.1 Remove conflicting text `review:` verify scenarios
      `deltas/cli/change-status/verify.md.delta.yaml`: remove base “shows review section when review is required”; rewrite overlap scenario without `review:` header/reason
      Approach: keep JSON/TOON full `review`; text overlap peers only
      (Req: Text status omits duplicated review file lists)

- [x] 14.2 Scope `--allow-out-of-scope` to `impl.linksInScope` only
      `packages/core/src/domain/services/lifecycle-engine.ts`, `packages/core/src/application/use-cases/get-status.ts`: attach `bypassFlag` / skippable only when failing check id is `impl.linksInScope`
      Approach: do not key off `IMPLEMENTATION_STATE` code alone; open-file fails stay non-skippable
      (Req: Registry bindings for this capability, Identifies blockers)

- [x] 14.3 Tests for bypassFlag by check id + merged verify
      engine/get-status/CLI tests: open files → no `--allow-out-of-scope`; links-in-scope → flag present; text status has no legacy `review:` header for artifact-review/drift
      Approach: given…when…then names matching verify.md
      (Req: Registry bindings for this capability, Text status omits duplicated review file lists)

## 15. Generic check progress bus + gerund labels

- [x] 15.1 Add mandatory `label` to Check ABI and every built-in check
      `packages/core/src/domain/services/transition-checks.ts`, each `packages/core/src/domain/checks/*.ts` + application wrappers: gerund labels per transition-checks table
      Approach: include `label` on `CheckResult`; no `Executing:` prefix
      (Req: Check identity and result, Generic check progress bus)

- [x] 15.2 Wire `onCheckProgress` + start/done envelope in TransitionChange and ArchiveChange
      `transition-change.ts`, `archive-change.ts`: emit `check-start` / `check-done`; pass sink on ctx; map hook RunStepHooks into `check-progress`
      Approach: retire public hook-only progress as the CLI contract
      (Req: Generic check progress bus)

- [x] 15.3 CLI presenters for transition and archive
      `packages/cli/src/commands/change/transition.ts`, archive command + shared presenter: render `<label> (<id>)` then stream then ✓/✗
      Approach: structured formats emit the same event types
      (Req: Check progress rendering)

- [x] 15.4 Tests for labels and progress bus
      core + cli tests: every check has label; predicate start/done; hook maps to same bus; text has no `Executing:`
      Approach: given…when…then names matching verify.md
      (Req: Generic check progress bus, Check progress rendering)

- [x] 15.5 Status blockers carry check label
      `get-status.ts`, `lifecycle-engine.ts`, `packages/cli/src/commands/change/status.ts`: Blocker includes `label`/`checkId` from failed check; text `! CODE — label: message`
      Approach: review-only blockers omit label; JSON includes `blockers[].label`
      (Req: Identifies blockers, Text blockers include check labels)

- [x] 15.6 Actionable fail messages (deps diff and peers)
      `deps-consistent.ts` (+ overlap / readOnly if thin): message and `details` show extracted vs persisted (and peers / readOnly specs), not only failing ids
      Approach: empty arrays rendered explicitly; unit tests for [] vs non-empty mismatch; do **not** expand `impl.*` text beyond compact count+≤3 examples
      (Req: Actionable fail diagnostics)

## 16. nextAction target advances on skill-owned exit hops

- [x] 16.1 Advance designing → ready target
      `packages/core/src/domain/services/lifecycle-engine.ts`: `_nextAction` — if designing/drafting and `availableTransitions` includes `ready`, `targetStep: ready` with `/specd-design`; else stay designing
      Approach: reason when targeting ready e.g. design complete / transition to ready
      (Req: Available steps and next action)

- [x] 16.2 Advance verifying → done target
      same file: if verifying and `done` available → `targetStep: done`, `/specd-verify`; else stay verifying
      Approach: mirror implementing→verifying pattern
      (Req: Available steps and next action)

- [x] 16.3 Align done/archivable commands with skills
      same file: done/signed-off (signoff ok) → `target: archivable`, command `/specd-verify`; archivable → `target: archiving`, `/specd-archive`
      Approach: keep approve-signoff when gate blocks; do not default backward hops
      (Req: Available steps and next action)

- [x] 16.4 Tests for nextAction target matrix
      `packages/core/test/domain/services/lifecycle-engine.spec.ts`: designing+ready; verifying+done; done→verify skill; archivable→archive skill; incomplete designing stays designing
      Approach: given…when…then names matching verify scenarios
      (Req: Available steps and next action)

## 17. Finish the engine (no snapshot bag)

- [x] 17.1 Delete `PredicateSnapshots` / `emptyPredicateSnapshots` / `gatherPredicateSnapshots` and public exports
      `packages/core/src/domain/services/transition-checks.ts`, `gather-predicate-snapshots.ts`, `public.ts`: domain `run` takes that check’s facts only; application `execute` does I/O then calls `run`
      Approach: no bag reconstruction in `create*`; rewrite tests that inject `emptyPredicateSnapshots`
      (Req: No shared snapshot bag)

- [x] 17.2 Engine projects CheckResults only — no `check.run` snapshot fallback
      `packages/core/src/domain/services/lifecycle-engine.ts`: `evaluate` requires `checksByTarget`; drop `options.snapshots`
      Approach: unit tests supply executed checks; no default empty bag
      (Req: Centralized validation logic)

- [x] 17.3 One binding table
      Compose domain applicability once into `createWorkflowCheckRegistry`; delete the duplicated row list
      Approach: archive list has no `archive.publication`
      (Req: Registry bindings)

- [x] 17.4 GetStatus: no second CountTasks; blockers include requires/approval; schema-only degrade
      `get-status.ts`: paint `taskCompletion` from check details; constructor has no `countTasks`; merge all failed-predicate codes; catch only schema resolution
      Approach: rewrite tests that lock GetStatus-owned CountTasks
      (Req: Reports task completion, Identifies blockers, Constraints)

- [x] 17.5 Effects and skipHookPhases by `phase`, not hook ids
      `transition-change.ts`, `execute-hook-effect.ts`: iterate matching bindings for the slot; skip by phase/selector
      Approach: no `if (checkId !== 'hook.pre' && …) continue`
      (Req: Binding pipeline phase and failure policy)

- [x] 17.6 ValidateArtifacts and GetArtifactInstruction on DAG evaluate
      `validate-artifacts.ts`, `get-artifact-instruction.ts`: `evaluate(..., { checksByTarget: {} })`; MUST NOT run hop predicates
      Approach: DAG `projectArtifacts` / `nextArtifact` only
      (Req: Shared lifecycle interpretation)

- [x] 17.7 Domain checks have no snapshot-shaped `execute`
      `packages/core/src/domain/checks/*`: `run(facts)` only; I/O only in application `create*`
      Approach: delete `executeWithHostSnapshots` if unused
      (Req: Check ABI create and WorkflowCheck)

- [x] 17.8 Tests for absence of the bag and complete blockers
      core tests: no `PredicateSnapshots` symbol; GetStatus `CountTasks` call count 1; `blockers` include `APPROVAL_REQUIRED` / `INCOMPLETE_ARTIFACT`; archive registry has no publication check
      Approach: given…when…then matching verify.md
      (Req: No shared snapshot bag, Identifies blockers)

## 18. Post-verify compliance (remaining)

- [x] 18.1 Bind `approval.spec` as `from=ready`, `to=*`, `along=forward`
      `packages/core/src/domain/services/check-bindings.ts`
      Approach: one wildcard row; MUST NOT match `ready → designing`
      (Req: Registry bindings)

- [x] 18.2 Skip effects by binding `phase`, not `check.id`
      `packages/core/src/application/use-cases/transition-change.ts`, archive hook skip
      Approach: `skipHookPhases` matches slot/phase; no `id === 'hook.pre'|'hook.post'`
      (Req: Binding pipeline phase)

- [x] 18.3 Require application `transitionBindings` (no stub default)
      `packages/core/src/application/use-cases/transition-change.ts`
      Approach: omit default `TRANSITION_BINDINGS`; composition injects `create*`
      (Req: Config-based factory)

- [x] 18.4 Drop `archive.publication` from `CheckId` / `CHECK_LABELS`
      `packages/core/src/domain/services/transition-checks.ts`
      Approach: keep merge/publish inside ArchiveChange; do not register the id
      (Req: Check identity)

- [x] 18.5 GetStatus drafts DAG-project effective status
      `packages/core/src/application/use-cases/get-status.ts` `_buildDraftedResult`
      Approach: `projectArtifacts` / evaluate with empty `checksByTarget`
      (Req: Drafted change read-only status)

- [x] 18.6 Reject persist of `pending-parent-artifact-review` on files
      `packages/core/src/domain/entities/change-artifact.ts` (and load path)
      Approach: derived-only on engine verdict
      (Req: Artifacts)

- [x] 18.7 Engine `isReady` / hop blockers from CheckResults when present
      `packages/core/src/domain/services/lifecycle-engine.ts`
      Approach: do not independently re-walk `requires` to a different code
      (Req: Available steps and next action)

- [x] 18.8 Schema miss on TransitionChange throws
      `packages/core/src/application/use-cases/transition-change.ts`
      Approach: missing schema is not a silent skip of all checks
      (Req: Constraints)

- [x] 18.9 CLI: repair stderr; no `hook-progress`; HookFailedError exit 2; `--next` signed-off → archivable
      `packages/cli/src/commands/change/transition.ts` and tests
      Approach: match `cli:change-transition` deltas
      (Req: Invalid transition error, Progress output)

- [x] 18.10 Tests for wildcard approval, skip-by-phase, no stub default, draft DAG, parent-review persist reject
      matching verify scenarios in core/cli packages
      Approach: given/when/then
      (Req: Registry bindings, Drafted status, Artifacts)

## 19. Skill templates (in-place gates)

- [x] 19.1 Rewrite verify / implement / design / new skill templates
      `packages/skills/templates/skills/specd-verify/SKILL.md.tpl`, `specd-implement/SKILL.md.tpl`, `specd-design/SKILL.md.tpl`, `specd-new/SKILL.md.tpl`
      Approach: stay in `ready`/`done`; pending drain-only; no parking hop as happy path
      (Req: In-place approval gates in workflow templates)

- [x] 19.2 Rewrite shared workflow template
      `packages/skills/templates/shared/shared.md.tpl`
      Approach: stay-in-state wait; hook pass-through without pending intermediates; no source.post on backward/redesign/recovery
      (Req: In-place approval gates in workflow templates)

- [x] 19.3 Contract tests for parking copy
      `packages/skills/test/template-workflow.spec.ts`
      Approach: assert absence of “routes to pending-signoff” / “reaches pending-spec-approval” as happy path
      (Req: In-place approval gates in workflow templates)

- [x] 19.4 Install updated skills into the project
      after 19.1–19.3
      Approach: run `pnpm specd project update` so declared agents get the rewritten templates (installed copies under `.claude/skills`, not only `.tpl` sources)
      (Req: In-place approval gates in workflow templates)

- [x] 19.5 Shared implementation-tracking cookbook
      `packages/skills/templates/shared/shared.md.tpl`
      Approach: list/review/add/resolve/ignore; resolve vs ignore; open files block verifying
      (Req: Implementation tracking in verify and implement templates)

- [x] 19.6 Verify skill drains open files on the verifying hop
      `packages/skills/templates/skills/specd-verify/SKILL.md.tpl`
      Approach: IMPLEMENTATION_STATE → drain via shared.md, retry transition; do not redirect to implement solely for open files
      (Req: Implementation tracking in verify and implement templates)

- [x] 19.7 Implement skill gates verify recommendation on zero open files
      `packages/skills/templates/skills/specd-implement/SKILL.md.tpl`
      Approach: `implementation list` after last checkbox/post-hooks; no `/specd-verify` while `open` remains
      (Req: Implementation tracking in verify and implement templates)

- [x] 19.8 Contract tests for tracking ownership
      `packages/skills/test/template-workflow.spec.ts`
      Approach: assert shared cookbook + verify drain + implement pre-verify gate
      (Req: Implementation tracking in verify and implement templates)

- [x] 19.9 Archive skill skips only pre hooks
      `packages/skills/templates/skills/specd-archive/SKILL.md.tpl`
      Approach: `--skip-hooks pre` on `changes archive`; no `run-hooks archiving --phase post` after success; still `hook-instruction` post
      (Req: Archive skill skips only pre hooks)

## 20. Workflow[] is lookup not membership (copy recorte)

- [x] 20.1 Fix lifecycle guide intro: schema does not own the state machine
      `docs/guide/workflow.md`: opening “The workflow is the rules” — states and legal hops are `ChangeState` / `VALID_TRANSITIONS`; `workflow[]` attaches extras only
      Approach: do not implement omitted-step hop deletion
      (Req: Step names reference domain lifecycle states)

- [x] 20.2 Fix schemas guide opening
      `docs/guide/schemas.md`: schema does not invent or delete lifecycle states
      Approach: keep artifact DAG copy; only fix lifecycle-membership wording
      (Req: Workflow)

- [x] 20.3 Fix schema-format living docs lookup wording
      `docs/schemas/schema-format.md`: `workflow` is lookup + display/`along` axis with fallback; not “the sequence of steps a change follows”
      Approach: keep taskCompletion target-step note from 9.11
      (Req: Workflow; Applicability from, to, and along)

- [x] 20.4 Grep leftover membership lies
      `docs/`, `README.md`, `packages/specd/README.md`: `workflow-visible`, `selects which states`, `defines which states exist`, `sequence of steps a change follows`
      Approach: fix living hits; leave `docs/adr/**` and `specd-sdd/archive/**`
      (Req: Step names reference domain lifecycle states)

- [x] 20.5 Test classifyAlong when `implementing` is omitted from workflowSteps
      `packages/core/test/domain/services/transition-checks.spec.ts`: `ready → verifying` is `forward`; `implementing` still a protocol state
      Approach: pass a `workflowSteps` array without `implementing`; assert AXIS_FALLBACK splice
      (Req: Applicability from, to, and along)

## 21. Compliance fix pass (splice axis + leftover audit)

- [x] 21.1 Splice AXIS_FALLBACK; unknown steps off axis
      `packages/core/src/domain/services/transition-checks.ts` `buildAxis`
      Approach: insert missing fallbacks by canonical index; filter non-ChangeState strings
      (Req: Applicability from, to, and along)

- [x] 21.2 Tests: omitted implementing retry is backward; omitted ready stays forward; garbage step ignored
      `packages/core/test/domain/services/transition-checks.spec.ts`
      Approach: lock D1 interpretation B
      (Req: Applicability from, to, and along)

- [x] 21.3 Archive JSON complete stream; unused RunStepHooks field; CLI --next signed-off
      Approach: match transition complete record; drop unused instance field
      (Req: JSON output on success; Archive bindings not RunStepHooks)

- [x] 21.4 Skill templates specd / specd-archive / specd-design in-place gates
      Approach: contract tests
      (Req: In-place approval gates in workflow templates)

## 22. Post-verify audit closure

- [x] 22.1 Engine requestedTarget blockers project from workflow.requires only
      `packages/core/src/domain/services/lifecycle-engine.ts`
      Approach: skip `_artifactBlockers` re-walk when requires check results are present
      (Req: Available steps and next action)

- [x] 22.2 Unknown workflow step rejected at buildSchema; GetStatus availableSteps; dead hook helpers
      Approach: spec/verify alignment; InvalidInputError on applyBindingSpecs
      (Req: Step names reference domain lifecycle states)

- [x] 22.3 CLI docs, archive help, Repair Guide stderr, draft status JSON, empty checksByTarget spies
      Approach: living docs + tests
      (Req: JSON output on success; Invalid transition error)

## 23. Post-verify recorte (review header, schema-format, dead RunStepHooks)

- [x] 23.1 Restore text `review:` header without file lists
      `packages/cli/src/commands/change/status.ts`, `packages/cli/test/commands/change-status.spec.ts`
      Approach: print `required` / `route` / `reason`; keep files only under `artifacts (details):`; keep `overlap:`
      (Req: Text status omits duplicated review file lists)

- [x] 23.2 schema-format DAG copy
      `deltas/core/schema-format/spec.md.delta.yaml`, `verify.md.delta.yaml`
      Approach: `projectArtifacts` / `pending-parent-artifact-review`; no `Change.effectiveStatus()`
      (Req: Artifact definition)

- [x] 23.3 Drop RunStepHooks from ArchiveChange ctor
      `packages/core/src/application/use-cases/archive-change.ts`, `packages/core/src/composition/use-cases/archive-change.ts`, archive-change tests
      Approach: required `archiveBindings`; delete `defaultArchiveBindings` on the use case; `ArchiveChangeDeps` has no `runStepHooks`
      (Req: Archive bindings not RunStepHooks on the use case)

## 24. Spec/docs alignment (engine cascade, ports, review scope)

- [x] 24.1 Align archive-change Ports and constructor with archiveBindings
      `deltas/core/archive-change/spec.md.delta.yaml`
      Approach: modify Ports and constructor; no RunStepHooks; ListWorkspaces
      (Req: Ports and constructor)

- [x] 24.2 Split schema-format requires cascade (in-progress vs parent-review)
      `deltas/core/schema-format/spec.md.delta.yaml`, `verify.md.delta.yaml`
      Approach: incomplete parent → in-progress; pending-review parent → pending-parent-artifact-review
      (Req: Artifact definition)

- [x] 24.3 Design skill review scope without files under review:
      `packages/skills/templates/skills/specd-design/SKILL.md.tpl`
      Approach: artifacts (details) / affectedArtifacts
      (Req: Design skill review scope without review file lists)

- [x] 24.4 Archive numbered flow in hook-execution-model
      `deltas/core/hook-execution-model/spec.md.delta.yaml`
      Approach: hook.pre before-persist abort; hook.post after-persist collect
      (Req: Deterministic step (archiving) with hooks)

- [x] 24.5 Status examples without specs: list; help overlapDetail
      `deltas/cli/change-status/spec.md.delta.yaml`, `packages/cli/src/commands/change/status.ts`
      Approach: drop standalone specs:; add overlapDetail to JSON help schema
      (Req: Basic info; Text status omits duplicated review file lists)

## 25. Compliance leftover + storage cascade

- [x] 25.1 core:storage DAG cascade without Change.effectiveStatus()
      `deltas/core/storage/spec.md.delta.yaml`, `verify.md.delta.yaml`
      Approach: projectArtifacts; incomplete vs review cascade
      (Req: Artifact dependency cascade)

- [x] 25.2 Align leftover spec prose (overlap omit, schema artifactStatuses, check bus, archive metadata/index, --next adapter)
      deltas for lifecycle-engine, get-status, transition-change, archive-change, change-archive, change-transition, approve-\*, validate-artifacts
      Approach: spec-wrong vs locked code
      (Req: Machine-readable blockers; Reports effective status; Progress callback; Spec metadata generation)

- [x] 25.3 CLI tests for archive --skip-hooks pre and post singletons
      `packages/cli/test/commands/change-archive.spec.ts`
      Approach: assert skipHookPhases Set(['pre']) / Set(['post'])
      (Req: Hook execution)

## 26. Recorte 26

- [x] 26.1 Saneo wire pending-parent-artifact-review to in-progress
      `packages/core/src/infrastructure/fs/change-repository.ts`, `deltas/core/change`, `deltas/core/storage`
      Approach: load/save coerce; ArtifactFile still rejects; tests for coerce not throw
      (Req: Artifacts; Artifact dependency cascade)

- [x] 26.2 GetStatus archive predicates plus overlap split
      `packages/core/src/application/use-cases/get-status.ts`, `lifecycle-engine.ts`, composition
      Approach: inject archiveBindings; run archive predicates when state is archivable; \_reviewBlockers skip OVERLAP_CONFLICT for spec-overlap-conflict; review.message; nextAction /specd-design
      (Req: Execute matching predicates then project; Identifies blockers)

- [x] 26.3 CountTasks passMemo
      `packages/core/src/application/checks/workflow-task-completion.ts`, CheckExecutionContext
      Approach: memo on ctx per executeChecksByLegalTargets / TransitionChange pass; no instance cache
      (Req: Check ABI create and WorkflowCheck)

- [x] 26.4 Core to next happy-path
      `packages/core/src/domain/value-objects/change-state.ts` HAPPY_PATH_NEXT, TransitionChange, CLI transition.ts
      Approach: CLI passes to: 'next'; drop resolveNextTarget; typed reject from pending/archivable/archiving
      (Req: to next is the happy-path next state; Next-transition resolution)

- [x] 26.5 CLI tests mirror src plus skip-selector no-ops
      `packages/cli/test/commands/change/`, hook skip tests
      Approach: merge/delete flat change-\*.spec.ts duplicates; assert source.pre/target.post skip are no-ops
      (Req: default:\_global/testing layout; Manual hook control)

- [x] 26.7 Recorte 26 tests
      get-status.spec.ts, transition-change.spec.ts, artifact-file.spec.ts, change-repository tests, CLI transition.spec.ts
      Approach: overlap split; archive predicates on archivable; passMemo recount; to next; coerce; skip no-ops
      (Req: Execute matching predicates then project; to next is the happy-path next state)

- [x] 26.8 CLI/docs for next and allow-out-of-scope
      `docs/cli/cli-reference.md` (or current CLI docs)
      Approach: --next is Core to: 'next'; archive signature lists --allow-out-of-scope
      (Req: Next-transition resolution; Command signature)

## 27. Lifecycle verdict refactor

- [x] 27.1 Split domain verdict from application guidance
      `packages/core/src/domain/services/lifecycle-verdict.ts`, `application/services/lifecycle-guidance.ts`, `application/services/lifecycle-evaluation.ts`
      Approach: `evaluateLifecycleVerdict` + `nextHop` in domain; `resolveLifecycleCommand` + `evaluateLifecycle` in application; deprecated `LifecycleEngine` shim
      (Req: Stateless domain lifecycle verdict; Application lifecycle guidance)

- [x] 27.2 Wire use cases and composition without LifecycleEngine singleton
      `get-status.ts`, `transition-change.ts`, `validate-artifacts.ts`, `get-artifact-instruction.ts`, `composition-resolver.ts`
      Approach: drop `getLifecycleEngine()`; call `evaluateLifecycle` / `evaluateLifecycleVerdict` / `projectArtifacts` directly
      (Req: Shared lifecycle interpretation for consumers; Constructor dependencies)

- [x] 27.3 Global Logger exception specs
      `deltas/default/_global/architecture`, `deltas/default/_global/logging`, `deltas/core/lifecycle-engine`
      Approach: architecture/logging stay package-agnostic; lifecycle split stays in core spec only
      (Req: Ambient Logger; Domain layer is pure)

- [x] 27.4 Tests for lifecycle refactor
      `packages/core/test/domain/services/lifecycle-engine.spec.ts`, application use-case specs
      Approach: domain vs application command attachment; 227 tests green in lifecycle suite
      (Req: Application lifecycle guidance verify scenarios)
