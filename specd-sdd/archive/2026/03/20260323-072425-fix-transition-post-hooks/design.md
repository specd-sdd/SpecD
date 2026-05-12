# Design: fix-transition-post-hooks

## Affected areas

- **`packages/core/src/application/use-cases/transition-change.ts`** — Replace `skipHooks: boolean` with `skipHookPhases: ReadonlySet<HookPhaseSelector>`. Fix post hooks to use `fromState`. Add `HookPhaseSelector` type.
- **`packages/core/test/application/use-cases/transition-change.spec.ts`** — Add tests for post-hook source state, granular skip phases.
- **`packages/cli/src/commands/change/transition.ts`** — Replace `--no-hooks` with `--skip-hooks <phases>`. Map to `skipHookPhases` set.
- **Callers of `TransitionChange`** — Update all call sites that pass `skipHooks: true` to use `skipHookPhases: new Set(['all'])`.

## Approach

### 1. New type

```typescript
export type HookPhaseSelector = 'source.pre' | 'source.post' | 'target.pre' | 'target.post' | 'all'
```

### 2. Input change

Replace `skipHooks?: boolean` with `skipHookPhases?: ReadonlySet<HookPhaseSelector>` in `TransitionChangeInput`. Default to empty set.

### 3. Hook execution logic

```typescript
const skip = input.skipHookPhases ?? new Set()
const skipAll = skip.has('all')

// 1. Source post-hooks (fail-fast) — finishing the previous step
const fromWorkflowStep = schema?.workflowStep(fromState) ?? null
if (!skipAll && !skip.has('source.post') && fromWorkflowStep !== null) {
  await this._executeHooks(input.name, fromState, 'post', onProgress)
}

// 2. Target pre-hooks (fail-fast) — preparing the new step
if (!skipAll && !skip.has('target.pre') && targetWorkflowStep !== null) {
  await this._executeHooks(input.name, effectiveTarget, 'pre', onProgress)
}

// 3. State transition
change.transition(effectiveTarget, actor)
await this._changes.save(change)
```

### 4. CLI option

Replace `--no-hooks` with:

```typescript
.option('--skip-hooks <phases>', 'skip specific hook phases (source.pre,source.post,target.pre,target.post,all)')
```

Use the existing `parseCommaSeparatedValues` helper from `packages/cli/src/helpers/parse-comma-values.ts` to parse and validate the comma-separated input against the allowed phase selectors.

### 5. Callers

Find all callers of `TransitionChange.execute` that pass `skipHooks: true` and update to `skipHookPhases: new Set(['all'])`. Key callers:

- `ArchiveChange` — passes `skipHooks` from its own input
- CLI `change transition` command
- Composition use cases

## Key decisions

**Remove `skipHooks` entirely.** Single boolean replaced by the phases set. `all` in the set is equivalent to the old `skipHooks: true`. Cleaner than keeping both fields.

**Both phases are fail-fast.** Both `source.post` and `target.pre` throw `HookFailedError` on failure — no state transition occurs. The previous `_executePostHooks` (fail-soft, collecting failures) is removed. Both phases use `_executeHooks` (fail-fast). `postHookFailures` is removed from the result type.

**Execution order: source.post → target.pre → transition.** Post hooks of the source step run first (finishing the previous step), then pre hooks of the target step (preparing the new step), then the state change.

**`source.pre` and `target.post` are no-ops.** In the current model, only `target.pre` and `source.post` execute. The other two selectors exist for completeness and forward compatibility.

## Testing

### Automated tests (core)

1. Post hooks run for source state (`implementing.post` on `implementing → verifying`)
2. Post hooks do not run for target state (`implementing.post` NOT on `ready → implementing`)
3. Post hooks skipped when source has no workflow step (`drafting → designing`)
4. `skipHookPhases: new Set(['all'])` skips all hooks
5. `skipHookPhases: new Set(['target.pre'])` skips only pre hooks
6. `skipHookPhases: new Set(['source.post'])` skips only post hooks

### Manual verification

```bash
pnpm --filter @specd/core test -- --grep "transition"
pnpm --filter @specd/cli test -- --grep "transition"
```
