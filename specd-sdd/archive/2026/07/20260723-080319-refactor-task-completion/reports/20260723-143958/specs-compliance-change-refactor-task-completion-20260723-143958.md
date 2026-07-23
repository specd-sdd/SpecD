# Specs Compliance Report — refactor-task-completion

- Mode: Specific Change
- Date: 2026-07-23 14:39:58 Europe/Madrid
- Scope: change specs, direct dependencies (depth 1), and applicable global constraints.
- Verification hooks: `pnpm test`, `pnpm lint`, and `pnpm typecheck` all passed.

## Summary

The implementation is build- and suite-clean, but the audit found unresolved contract, composition, and coverage issues. The change is not ready to transition.

- High: 5 distinct findings
- Medium: 3 distinct findings
- Low: 1 finding

## Detailed Findings

The following partial reports are included verbatim for traceability.

# Compliance partial — changed core specs

Scope: merged previews for `core:count-tasks`, `core:get-status`, `core:transition-change`, and `core:kernel`; their changed implementation and relevant tests. Graph freshness was confirmed (`stale: false`). The graph did not yet include uncommitted `CountTasks`, so source inspection was used after graph search returned no result.

## Requirements summary

- `CountTasks` is a read-only query with per-artifact and aggregate counts, publicly wired through the kernel.
- `GetStatus` delegates task counts to `CountTasks`.
- `TransitionChange` queries shared counts for completion-gated steps.
- `Kernel` exposes `changes.countTasks`.

## Findings

### HIGH — required task-completion capability is silently accepted

**Spec:** The merged `core:transition-change` requirement “Task completion check during requires enforcement” requires both `hasTasks: true` and `taskCompletionCheck`; otherwise it must throw `InvalidStateTransitionError` with `missing-task-capability`.

**Code:** [`transition-change.ts`](../../../../../../packages/core/src/application/use-cases/transition-change.ts:258) rejects only a missing type or `hasTasks: false`; [`transition-change.ts`](../../../../../../packages/core/src/application/use-cases/transition-change.ts:265) then continues if `taskCompletionCheck` is missing.

**Impact:** an artifact listed in `requiresTaskCompletion` can proceed without a completion check. The likely correction is code; alternatively revise the spec to define missing check as disabling the gate.

**Coverage:** no test combines `requiresTaskCompletion` with `hasTasks: true` and missing `taskCompletionCheck`.

### HIGH — CountTasks drops qualifying non-empty artifacts when both patterns are unsafe

**Spec:** The merged `core:count-tasks` result requirement requires an entry for each qualifying artifact with existing, non-empty content. Unsafe patterns must not throw and contribute no matches.

**Code:** patterns are compiled at [`count-tasks.ts`](../../../../../../packages/core/src/application/use-cases/count-tasks.ts:34); when both are rejected, [`count-tasks.ts`](../../../../../../packages/core/src/application/use-cases/count-tasks.ts:36) omits the artifact instead of returning `{ complete: 0, incomplete: 0, total: 0 }`.

**Impact:** callers cannot distinguish no qualifying content from content with unusable patterns. Retain the zero-valued entry or narrow the non-empty-entry rule.

**Coverage:** no dedicated CountTasks test covers two unsafe expressions and a zero-valued entry.

### HIGH — CountTasks’ omitted-pattern rule contradicts its total rule

**Spec:** `core:count-tasks` says an omitted pattern uses the standard default, but also says total equals only `incomplete` when only `incompletePattern` is declared. If `completePattern` is omitted, the first rule activates the default complete pattern, so complete checkboxes must both count and not count toward total.

**Code:** [`count-tasks.ts`](../../../../../../packages/core/src/application/use-cases/count-tasks.ts:34) and [`count-tasks.ts`](../../../../../../packages/core/src/application/use-cases/count-tasks.ts:35) default either missing pattern; total always sums both at [`count-tasks.ts`](../../../../../../packages/core/src/application/use-cases/count-tasks.ts:48).

**Assessment:** specification contradiction, not an unambiguous code defect. Decide whether omission means use defaults (total includes both) or disable that status. The same contradiction is repeated in changed GetStatus task-count wording.

### HIGH — GetStatus task-count requirement contradicts its no-content-I/O constraint

**Spec:** `core:get-status` requires counts from `CountTasks`, but Constraints still says “Artifact content is not loaded; only status metadata is returned.” CountTasks explicitly reads files.

**Code:** [`get-status.ts`](../../../../../../packages/core/src/application/use-cases/get-status.ts:339) invokes the query; it reads artifact content at [`count-tasks.ts`](../../../../../../packages/core/src/application/use-cases/count-tasks.ts:41).

**Assessment:** implementation follows the new behavior; the stale constraint should be revised because status reads now perform per-task-file I/O.

### MEDIUM — CountTasks injection is optional despite the declared dependency contract

**Spec:** changed GetStatus and TransitionChange constructor/dependency requirements list `countTasks: CountTasks` as the shared query.

**Code:** both application constructors create a fallback query at [`get-status.ts`](../../../../../../packages/core/src/application/use-cases/get-status.ts:233) and [`transition-change.ts`](../../../../../../packages/core/src/application/use-cases/transition-change.ts:122). Their composition dependency interfaces make it optional at [`composition/use-cases/get-status.ts`](../../../../../../packages/core/src/composition/use-cases/get-status.ts:29) and [`composition/use-cases/transition-change.ts`](../../../../../../packages/core/src/composition/use-cases/transition-change.ts:31).

**Impact:** direct construction does not require the declared dependency; kernel status, transition, and `changes.countTasks` are separate instances. Require injection or document optional fallback construction.

### MEDIUM — CountTasks verification scenarios lack direct coverage

Changed verification specifies multi-file aggregation, unsafe patterns, omitted defaults, aggregate totals, empty content, factory wiring, and kernel exposure. No dedicated `count-tasks.spec.ts` exists. Indirect coverage is one GetStatus task test ([`get-status.spec.ts`](../../../../../../packages/core/test/application/use-cases/get-status.spec.ts:273)) and legacy transition tests ([`transition-change.spec.ts`](../../../../../../packages/core/test/application/use-cases/transition-change.spec.ts:423)). The barrel test only checks export mapping ([`barrel-kernel-coverage.spec.ts`](../../../../../../packages/core/test/barrel-kernel-coverage.spec.ts:16)).

## Conformant portions observed

- CountTasks resolves schema, filters task-capable artifacts, reads each attached file, uses `safeRegex(..., 'gm')`, and aggregates totals.
- GetStatus maps `byArtifact` entries to optional status fields ([`get-status.ts`](../../../../../../packages/core/src/application/use-cases/get-status.ts:339)).
- TransitionChange performs one count query for a gated transition ([`transition-change.ts`](../../../../../../packages/core/src/application/use-cases/transition-change.ts:253)).
- Kernel declares and returns `changes.countTasks` ([`kernel.ts`](../../../../../../packages/core/src/composition/kernel.ts:172), [`kernel.ts`](../../../../../../packages/core/src/composition/kernel.ts:349)).

## Summary counts

| Severity | Count |
| -------- | ----: |
| Critical |     0 |
| High     |     4 |
| Medium   |     2 |
| Low      |     0 |

No code or specification files were modified; only this partial report was added.

# Compliance partial: global constraints and coverage

## Scope

- Project-wide architecture, conventions, testing, documentation and ESLint constraints.
- Direct dependencies relevant to the new `CountTasks` use case.

## Findings

### HIGH — New query has no focused unit tests

`CountTasks` is a new application-layer use case (`packages/core/src/application/use-cases/count-tasks.ts:14-54`) with six change scenarios: multi-file aggregation, unsafe patterns, default patterns, change aggregate, empty content, and absent content. `rg --files packages/core/test` finds no `count-tasks` test file, and `rg CountTasks packages/core/test` only finds the barrel/kernel coverage mapping. Existing `GetStatus` and `TransitionChange` tests predate the injected query behavior and do not demonstrate these scenarios.

Both the change verify artifact and the global testing convention require scenario-level application behavior to be tested. Passing suite-wide hooks establish regression safety but do not cover this feature contract.

### MEDIUM — Count total contract is internally contradictory for omitted completePattern

The merged CountTasks spec says any omitted pattern uses a markdown-checkbox default, including `completePattern`; it also says `total` equals `incomplete` when only `incompletePattern` is declared. The implementation defaults `completePattern` unconditionally (`count-tasks.ts:34`) and always calculates `total = complete + incomplete` (`:47-53`). Thus content containing completed checkboxes contributes to `total` even when the original declaration provided only `incompletePattern`.

The desired interpretation needs a spec decision: either an omitted complete pattern means use the default (current code), or an explicitly incomplete-only check suppresses complete counting (the total rule / inherited GetStatus scenario).

### LOW — Documentation impact is not demonstrated

The public `@specd/core` surface now exports `CountTasks`, its types, and `createCountTasks` (`packages/core/src/public.ts:121-123, 280-281`). The change design says documentation is not needed, but no rationale or documentation test was found for the newly public composition API. This is a documentation-review item rather than a functional blocker.

## Conformance observations

- The application query remains read-only and depends on ports (`ChangeRepository`, `SchemaProvider`), satisfying the architectural direction.
- `safeRegex` is used with `gm`, and missing/empty artifact content is omitted, matching the central CountTasks behavior.
- Full repository hooks passed: `pnpm test`, `pnpm lint`, and `pnpm typecheck`.

## Summary

- High: 1
- Medium: 1
- Low: 1

# Dependency compliance review — CountTasks

## Scope and evidence

Read-only review of the direct dependencies requested for change
`refactor-task-completion`: `core:composition-resolver`, `core:schema-format`,
`core:change`, and global architecture, testing, and documentation conventions.

Evidence inspected:

- `packages/core/src/application/use-cases/count-tasks.ts`
- `packages/core/src/application/use-cases/get-status.ts`
- `packages/core/src/application/use-cases/transition-change.ts`
- `packages/core/src/composition/use-cases/{count-tasks,get-status,transition-change}.ts`
- `packages/core/src/composition/kernel.ts` and public/barrel exports
- targeted specs and verification scenarios above; graph was fresh at
  `2026-07-23T10:33:20.886Z` before inspection.

## Findings

### HIGH — `createCountTasks` bypasses the required shared factory-argument contract

`createCountTasks` determines its input with property checks and immediately
constructs `CountTasks` (`composition/use-cases/count-tasks.ts:29-30`). It does
not use `normalizeCompositionFactoryArgs`, unlike the neighbouring factories.
Consequently `createCountTasks(explicitDeps, options)` silently accepts/ignores
the options instead of throwing `InvalidCompositionFactoryArgumentsError` that
identifies the factory.

This violates `core:composition-resolver` “Invalid public argument combinations
use one shared error”, and its config-factory requirement is explicitly defined
as normalizing the two supported public forms before delegating to canonical
`createX(deps)`. It also breaks the global architecture requirement that all
kernel-equivalent public factories have one consistent composition contract.

**Required remediation:** model the CountTasks factory on GetStatus/
TransitionChange: use `normalizeCompositionFactoryArgs('createCountTasks', ...)`,
provide a typed deps guard, and delegate both forms through one normalized helper.
Add unit coverage for invalid deps-plus-options and invalid first argument.

### HIGH — default completed-checkbox matching is not case-insensitive

`CountTasks.execute` compiles the default `completePattern` using flags `gm`
only (`application/use-cases/count-tasks.ts:37`). `core:schema-format` specifies
the default completed checkbox pattern as case-insensitive. A default-schema task
written as `- [X] done` is therefore not counted as complete.

This affects both the aggregate query and GetStatus/TransitionChange, which now
delegate task counting to this query.

**Required remediation:** preserve the schema contract’s case-insensitive
semantics for the default pattern (without changing the behaviour of a supplied
custom regex unless the schema contract defines flags for it), and add a unit
scenario for `- [X]`.

### HIGH — no unit tests cover the new application use case

There is no `packages/core/test/application/use-cases/count-tasks.spec.ts`, nor
any CountTasks test found under `packages/core/test`. The only change-side test
update is the kernel/public-barrel coverage mapping.

`default:_global/testing` requires every application use case to have at least
one unit test with mocked ports. The change needs behavioural coverage for:
per-artifact + aggregate totals, multiple files, missing/empty files,
non-task artifacts, defaults (including `[X]`), invalid patterns, and the
TransitionChange incomplete-task progress/error path after delegation.

### MEDIUM — public composition API changed without documentation update

CountTasks is exported from `@specd/core`, has both public factory forms, and is
mounted as `kernel.changes.countTasks`; no matching `docs/` reference contains
`CountTasks` or `createCountTasks`.

`default:_global/docs` requires docs updates whenever the public composition
surface changes, including canonical `createX(deps)`, convenience config form,
and the standalone/kernel/resolver relationship. Update the appropriate
`docs/core/` and SDK-facing composition/use-case reference(s), consistent with
the project’s core-only vs host import guidance.

### MEDIUM — GetStatus and TransitionChange duplicate CountTasks construction

Their resolver dependency helpers construct `new CountTasks(...)` directly
instead of delegating through `createCountTasks(resolveCountTasksDeps(resolver))`.
The current construction happens to use normalized resolver ports, so this is
not an I/O-layer violation; however it creates a second wiring path for a
kernel-mounted capability and can drift from factory validation/wiring semantics.
It is inconsistent with the global architecture requirement that the kernel is
a convenience layer over the same reusable factory logic.

**Recommended remediation:** use the CountTasks composition factory in those
helpers (or centralize one resolver-fed assembly helper), and inject the same
instance from kernel construction if shared identity is intended.

## Confirmed compliant points

- `CountTasks` lives in the application layer and accesses content/schema only
  through `ChangeRepository` and `SchemaProvider` ports; no infrastructure import
  or module singleton was found.
- The kernel exposes the capability and public barrel exports the use case,
  result types, and factory, satisfying the kernel-equivalent visibility rule.
- `CountTasksResult.total` correctly aggregates the per-artifact completed and
  incomplete counts.
- `TransitionChange` still performs the schema `hasTasks` invariant check before
  applying the delegated count.

## No finding from `core:change`

The reviewed code reads artifacts through `Change.getArtifact()` and their
tracked files; it does not mutate Change state or bypass Change lifecycle
invariants. No direct conflict with the Change entity contract was identified.
