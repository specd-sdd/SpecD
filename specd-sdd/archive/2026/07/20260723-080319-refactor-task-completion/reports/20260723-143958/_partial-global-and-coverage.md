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
