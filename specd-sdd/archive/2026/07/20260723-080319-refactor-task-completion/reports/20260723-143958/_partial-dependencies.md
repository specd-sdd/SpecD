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
