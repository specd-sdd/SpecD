# Proposal: fix-transition-post-hooks

## Motivation

`TransitionChange` executes post hooks for the **target** step (`effectiveTarget`) instead of the **source** step (`fromState`). This means hooks configured as `implementing.post` (intended to run when finishing implementation) actually run when entering implementing — immediately after the transition from ready.

For example, with `implementing.post: [run-tests, run-lint]`:

- **Expected:** tests/lint run when transitioning `implementing → verifying` (after finishing implementation)
- **Actual:** tests/lint run when transitioning `ready → implementing` (before implementation starts)

Both the spec and the code have this bug — the spec says `step: effectiveTarget` for post hooks.

## Current behaviour

In `TransitionChange.execute()` (lines 224-228), post hooks use `effectiveTarget`:

```
this._executePostHooks(input.name, effectiveTarget, onProgress)
```

When transitioning `ready → implementing`, this runs `implementing.post` hooks immediately after entering implementing — which is semantically wrong.

## Proposed solution

Change post hooks to use `fromState` instead of `effectiveTarget`. The correct semantics:

- **Pre hooks** → step being entered (`effectiveTarget`): "before starting this step"
- **Post hooks** → step being left (`fromState`): "after finishing this step"

Also needs a workflow step lookup for `fromState` (currently only `effectiveTarget` is looked up).

## Specs affected

### New specs

_(none)_

### Modified specs

- `core:core/transition-change`: Fix post-hook execution requirement to use source state instead of target state.

## Impact

- `TransitionChange` use case (`packages/core/src/application/use-cases/transition-change.ts`)
- Tests in `packages/core/test/application/use-cases/transition-change.spec.ts`
- CLI `change transition` command output labels (cosmetic)

## Open questions

_(none)_
