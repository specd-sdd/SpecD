# Design: cleanup-orphaned-spec-depends-on

## Affected areas

- **`packages/core/src/domain/entities/change.ts`** — `updateSpecIds()` method (line 529). Add cleanup loop after `_specIds` assignment.
- **`packages/core/test/domain/entities/change.spec.ts`** — `specDependsOn` describe block (line 869). Add test cases for the three verify scenarios.

## Approach

In `Change.updateSpecIds()`, after setting `this._specIds`, iterate over `this._specDependsOn` keys and delete any key not present in the new `_specIds` set. The cleanup happens **before** `this.invalidate()` so the orphaned entries are already gone when the invalidation event is appended.

This is a two-line addition:

```typescript
const newIds = new Set(this._specIds)
for (const key of this._specDependsOn.keys()) {
  if (!newIds.has(key)) this._specDependsOn.delete(key)
}
```

Note: `this._specIds` is already deduplicated via `new Set(specIds)` on the line above, so we can build the lookup set from it directly.

This satisfies the spec requirement: "When `specIds` is updated via `updateSpecIds()`, any `specDependsOn` entry whose key is not present in the new set of spec IDs SHALL be removed."

## Key decisions

**Cleanup before invalidation** — The cleanup is a side-effect of updating specIds, not an independent operation. Placing it before `invalidate()` ensures the entity is consistent before any events are appended. **Alternative rejected:** cleaning up after invalidation — no functional difference, but conceptually the cleanup is part of the specIds update, not a reaction to invalidation.

**No event for cleanup** — `specDependsOn` changes do not trigger invalidation per the existing spec. The orphan cleanup is a consequence of the specIds change (which already triggers invalidation), so no additional event is needed. **Alternative rejected:** adding a dedicated event — over-engineering for an invariant-maintenance operation.

## Testing

### Automated tests

In `packages/core/test/domain/entities/change.spec.ts`, inside the existing `specDependsOn` describe block, add three tests:

1. **`updateSpecIds removes orphaned specDependsOn entries`** — Create change with two specIds and specDependsOn for both. Call `updateSpecIds` with only one. Assert the removed spec's entry is gone, the surviving spec's entry remains.

2. **`updateSpecIds clears all specDependsOn when all specs with deps are removed`** — Create change with one specId that has specDependsOn. Call `updateSpecIds` with a different specId. Assert specDependsOn is empty.

3. **`updateSpecIds preserves specDependsOn when no orphans`** — Create change with two specIds and specDependsOn for one. Call `updateSpecIds` with both. Assert specDependsOn is unchanged.

### Manual verification

```bash
pnpm --filter @specd/core test -- --grep "specDependsOn"
```

All existing and new specDependsOn tests should pass.
