# Design: Directional artifact invalidation

## Affected areas

### 1. `packages/core/src/domain/entities/change.ts` — `invalidate()` method (line 406)

Add optional `driftedArtifactIds?: ReadonlySet<string>` parameter. When provided, compute the downstream closure and only reset those artifacts. When not provided, reset all (backward compat).

### 2. `packages/core/src/infrastructure/fs/change-repository.ts` — auto-invalidation (lines 672–699)

Collect the artifact type IDs of drifted files before calling `invalidate()`. Pass them as `driftedArtifactIds`.

### 3. `packages/core/src/application/use-cases/validate-artifacts.ts` — approval invalidation (lines 184–221)

Collect the artifact type IDs with hash mismatches before calling `invalidate()`. Pass them as `driftedArtifactIds`.

## Approach

**Step 1 — Modify `Change.invalidate()`.** Add optional third parameter `driftedArtifactIds?: ReadonlySet<string>`. When provided:

1. Compute downstream closure: start with `driftedArtifactIds`, then for each artifact in `_artifacts`, if its `requires` includes any ID in the closure, add it to the closure. Repeat until stable.
2. Only call `resetValidation()` on artifacts in the closure.

When `driftedArtifactIds` is not provided, fall back to resetting all artifacts (existing behavior).

The history events (invalidated + transitioned) and approval revocation remain global — they always happen regardless of scope.

```typescript
invalidate(
  cause: InvalidatedEvent['cause'],
  actor: ActorIdentity,
  driftedArtifactIds?: ReadonlySet<string>,
): void {
  const from = this.state
  const now = new Date()
  this._history.push({ type: 'invalidated', cause, at: now, by: actor })
  if (from !== 'designing') {
    this._history.push({ type: 'transitioned', from, to: 'designing', at: now, by: actor })
  }

  if (driftedArtifactIds === undefined) {
    for (const artifact of this._artifacts.values()) {
      artifact.resetValidation()
    }
  } else {
    const toReset = this._downstreamClosure(driftedArtifactIds)
    for (const [typeId, artifact] of this._artifacts) {
      if (toReset.has(typeId)) {
        artifact.resetValidation()
      }
    }
  }
}

private _downstreamClosure(seeds: ReadonlySet<string>): Set<string> {
  const closure = new Set(seeds)
  let changed = true
  while (changed) {
    changed = false
    for (const [typeId, artifact] of this._artifacts) {
      if (closure.has(typeId)) continue
      for (const req of artifact.requires) {
        if (closure.has(req)) {
          closure.add(typeId)
          changed = true
          break
        }
      }
    }
  }
  return closure
}
```

**Step 2 — Modify `FsChangeRepository`.** In the auto-invalidation block (lines 672–699), instead of just checking `drifted = true/false`, collect the drifted artifact type IDs:

```typescript
const driftedIds = new Set<string>()
for (const [typeId, artifact] of change.artifacts) {
  for (const [, file] of artifact.files) {
    if (
      file.validatedHash !== undefined &&
      (file.status === 'in-progress' || file.status === 'missing')
    ) {
      driftedIds.add(typeId)
      break
    }
  }
}
if (driftedIds.size > 0) {
  change.invalidate('artifact-change', SYSTEM_ACTOR, driftedIds)
  // ...persist
}
```

**Step 3 — Modify `ValidateArtifacts`.** In the approval invalidation block (lines 184–221), collect artifact type IDs with hash mismatches instead of immediately calling `invalidate()`:

```typescript
const driftedIds = new Set<string>()
// ...for each artifact with hash mismatch:
driftedIds.add(artifactType.id)
// ...after loop:
if (driftedIds.size > 0) {
  change.invalidate('artifact-change', actor, driftedIds)
}
```

## Key decisions

**Decision: `driftedArtifactIds` is optional (backward compat).**
→ Existing callers that pass no third argument get the old behavior. New callers opt in.

**Decision: Downstream closure uses `requires` from `ChangeArtifact`, not from schema.**
→ The artifact map already has `requires` populated from the schema at sync time. No need to pass the schema into `invalidate()`.

## Testing

### Automated tests

**File:** `packages/core/test/domain/entities/change.spec.ts`

- Test: `invalidate()` with `driftedArtifactIds` only resets specified + downstream
- Test: `invalidate()` with `driftedArtifactIds` leaves upstream intact
- Test: `invalidate()` without `driftedArtifactIds` resets all (backward compat)

**File:** `packages/core/test/infrastructure/fs/change-repository.spec.ts`

- Test: auto-invalidation passes drifted IDs and only resets those + downstream

**File:** `packages/core/test/application/use-cases/validate-artifacts.spec.ts`

- Test: approval invalidation passes drifted IDs

### Manual verification

Create a change, validate all artifacts, modify `tasks.md`, reload — only `tasks` should be reset, not upstream artifacts.

## Open questions

None.
