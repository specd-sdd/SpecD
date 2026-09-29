# Spec compliance — windows-platform-compatibility

Mode: change (re-check of the four discrepancies from 20260925-154912)
Date: 2026-09-25 17:38

## Totals

| Item                           | Result |
| ------------------------------ | ------ |
| Prior discrepancies re-checked | 4      |
| Still open                     | 0      |
| New discrepancies              | 0      |

## Closed

1. **Bare `C:` is not workspace `C`.** `resolve-impact-file-selectors.ts` uses `/^[A-Za-z]:(?:[/\\]|$)/` and `splitWorkspaceIdentity('C:')` is null. `matches-exclude.ts` `extractWorkspace` uses the same match, so `matchesExclude('C:', …, ['C'])` is false. Tests cover both.
2. **Nested-path variables.** The merged scenario no longer supplies `change.workspace`. `hook-runner.spec.ts` no longer passes that key.
3. **Delegation.** The merged scenario says `RunStepHooks` collects, records the schema command, and executes, and that `HookRunner` expands. `run-step-hooks.ts` passes `hook.command` through and stores that string.
4. **Non-fs containment.** The spec limits the inside-root check to `fs` bindings. A git storage binding whose legacy path sits outside the VCS root still loads. A git specs adapter has `isExternal` false.

Previously accepted coverage notes (realpath spy, byte-equality success, private empty-string return, `EPERM` sharing the `EBUSY` lock set) stay out of scope.
