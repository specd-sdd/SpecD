# Tasks: fix-transition-post-hooks

## 1. Core use case

- [x] 1.1 Add HookPhaseSelector type and replace skipHooks with skipHookPhases in TransitionChangeInput
      `packages/core/src/application/use-cases/transition-change.ts`

- [x] 1.2 Restructure hook execution: source.post (fail-fast) → target.pre (fail-fast) → transition
      `packages/core/src/application/use-cases/transition-change.ts`: remove `_executePostHooks`, use `_executeHooks` for both phases, remove `postHookFailures` from result

- [x] 1.3 Update all callers of TransitionChange that pass skipHooks
      Find and update all call sites to use skipHookPhases instead, remove postHookFailures handling

## 2. CLI command

- [x] 2.1 Replace --no-hooks with --skip-hooks option
      `packages/cli/src/commands/change/transition.ts`: use `parseCommaSeparatedValues` from `helpers/parse-comma-values.ts` to parse and validate phases, map to Set<HookPhaseSelector>, remove postHookFailures warning logic

## 3. Tests

- [x] 3.1 Test post hooks run for source state (implementing.post on implementing → verifying)
- [x] 3.2 Test post hooks do not run for target state (implementing.post NOT on ready → implementing)
- [x] 3.3 Test post hooks skipped when source has no workflow step (drafting → designing)
- [x] 3.4 Test source.post runs before target.pre (ordering)
- [x] 3.5 Test post hook failure aborts transition (fail-fast)
- [x] 3.6 Test skipHookPhases all skips everything
- [x] 3.7 Test skipHookPhases target.pre skips only pre
- [x] 3.8 Test skipHookPhases source.post skips only post
