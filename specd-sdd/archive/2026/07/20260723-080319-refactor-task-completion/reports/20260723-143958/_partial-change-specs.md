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
