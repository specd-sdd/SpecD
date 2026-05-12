# Design: fix-delta-apply-bugs

## Overview

Fix two bugs in the delta application engine (`applyDelta` function in `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`).

## Affected Areas

- **File:** `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`
- **Functions:** `applyDelta`
- **Lines:** 580-587 (Bug #1), 567-574 (Bug #2), 591 (Bug #3 optional)

## New Constructs

### Bug #1 Fix: Multi-section content in added operations

**Current code (lines 580-587):**

```typescript
const parsed = parseContent(entry.content)
const firstChild = parsed.root.children?.[0] // BUG: only first child
if (firstChild !== undefined) {
  newNode = firstChild
} else {
  newNode = parsed.root
}
```

**Fix:** Use ALL children instead of just the first:

```typescript
const parsed = parseContent(entry.content)
const contentChildren = parsed.root.children ?? []
// Use all children - create a fragment node if multiple children
if (contentChildren.length > 0) {
  newNode =
    contentChildren.length === 1
      ? contentChildren[0]!
      : { type: 'fragment', children: contentChildren }
} else {
  newNode = parsed.root
}
```

### Bug #2 Fix: Ambiguous position.parent rejection

**Current code (lines 567-574):**

```typescript
if (entry.position?.parent !== undefined) {
  const paths = getPathsMatchingSelector(newRoot, entry.position.parent)
  if (paths.length === 0) {
    throw new DeltaApplicationError(...)
  }
  scopePath = paths[0]!  // BUG: silently takes first if multiple
}
```

**Fix:** Add validation for ambiguous match:

```typescript
if (entry.position?.parent !== undefined) {
  const paths = getPathsMatchingSelector(newRoot, entry.position.parent)
  if (paths.length === 0) {
    throw new DeltaApplicationError(...)
  }
  if (paths.length > 1) {
    throw new DeltaApplicationError(
      `position.parent selector is ambiguous — matched ${paths.length} nodes`,
    )
  }
  scopePath = paths[0]!
}
```

### Bug #3 (Optional): nodeType inference

**Current code (line 591):**

```typescript
newNode = valueToNode(entry.value, {
  nodeType: 'unknown', // May break some adapters
  parentType: scopeNode.type,
})
```

**Fix:** Infer nodeType from content structure or parent scope:

```typescript
newNode = valueToNode(entry.value, {
  nodeType: entry.value && Array.isArray(entry.value) ? 'sequence' : 'pair',
  parentType: scopeNode.type,
})
```

## Testing

Update `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`:

1. Add test for multi-section content in `added` operation
2. Add test for ambiguous `position.parent` rejecting

## Approach

1. Fix Bug #1 (multi-section content) — change from first-child-only to all-children
2. Fix Bug #2 (ambiguous position.parent) — add explicit validation
3. Investigate Bug #3 (nodeType: 'unknown') — determine if fix is needed
