# Design: remove-spec-cleanup

## Non-goals

- Adding an `--force` flag to override non-empty directories — all directories (empty or with files) are removed
- Removing only the `specs/` or `deltas/` subtree — both are always removed together for a given specId

## Affected areas

| File                                                             | Change                                 |
| ---------------------------------------------------------------- | -------------------------------------- |
| `packages/core/src/application/ports/change-repository.ts`       | Add `unscaffold` abstract method       |
| `packages/core/src/infrastructure/fs/change-repository.ts`       | Implement `unscaffold`                 |
| `packages/core/src/application/use-cases/edit-change.ts`         | Call `unscaffold` after spec removal   |
| `packages/core/test/application/use-cases/edit-change.spec.ts`   | Add tests for unscaffold behavior      |
| `packages/core/test/infrastructure/fs/change-repository.spec.ts` | Add integration tests for `unscaffold` |

## New constructs

### `ChangeRepository.unscaffold` (port method)

**Location:** `packages/core/src/application/ports/change-repository.ts`

**Shape:**

```typescript
abstract unscaffold(change: Change, specIds: readonly string[]): Promise<void>
```

**Responsibility:** Removes the `specs/<ws>/<capPath>/` and `deltas/<ws>/<capPath>/` directories for each specId from the change directory. Idempotent — non-existent directories are silently skipped.

**Relationships:** Called by `EditChange.execute` after spec removal. Implemented by `FsChangeRepository`.

### `FsChangeRepository.unscaffold` (implementation)

**Location:** `packages/core/src/infrastructure/fs/change-repository.ts`

**Shape:**

```typescript
override async unscaffold(change: Change, specIds: readonly string[]): Promise<void>
```

**Responsibility:** Iterates over each specId, parses the workspace and capPath, and removes both `specs/<ws>/<capPath>/` and `deltas/<ws>/<capPath>/` directories using `fs.rm` with `recursive: true`.

**Relationships:** Implements `ChangeRepository.unscaffold`. Uses `parseSpecId` from `domain/services/`.

## Approach

1. **Add `unscaffold` to port interface** — declare the abstract method on `ChangeRepository`
2. **Implement `unscaffold` in `FsChangeRepository`** — use `fs.rm` with `recursive: true`, catching `ENOENT` to ensure idempotency
3. **Call `unscaffold` in `EditChange.execute`** — after `save`, call `unscaffold(change, removedSpecIds)` when removals occurred
4. **Add tests** — unit tests in `edit-change.spec.ts`, integration tests in `change-repository.spec.ts`

### Implementation details

The `unscaffold` implementation in `FsChangeRepository.unscaffold`:

```typescript
override async unscaffold(change: Change, specIds: readonly string[]): Promise<void> {
  const dir = await this._resolveDir(change.name)
  if (dir === null) return

  for (const specId of specIds) {
    const { workspace, capPath } = parseSpecId(specId)

    // Remove specs/<ws>/<capPath>/ directory
    const specsDir = capPath.length > 0
      ? path.join(dir, 'specs', workspace, capPath)
      : path.join(dir, 'specs', workspace)
    await this._rmrf(specsDir)

    // Remove deltas/<ws>/<capPath>/ directory
    const deltasDir = capPath.length > 0
      ? path.join(dir, 'deltas', workspace, capPath)
      : path.join(dir, 'deltas', workspace)
    await this._rmrf(deltasDir)
  }
}

private async _rmrf(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true })
  } catch (err) {
    if (!isEnoent(err)) throw err
  }
}
```

The `EditChange.execute` modification (after `await this._changes.save(change)`):

```typescript
if (input.removeSpecIds !== undefined && input.removeSpecIds.length > 0) {
  await this._changes.unscaffold(change, input.removeSpecIds)
}
```

## Key decisions

**Decision →** Call `unscaffold` after `save` but before returning.
**Rationale →** The manifest is updated first to ensure consistency. If `unscaffold` fails, the operation can still be retried without data loss.
**Alternatives rejected →** Calling `unscaffold` before `save` — partial failure would leave inconsistent state.

**Decision →** Idempotent behavior (no error on non-existent directories).
**Rationale →** Aligns with the principle that removing something already absent is a no-op, not an error. This simplifies error handling and retry logic.

## Trade-offs

**[Risk]** Race condition with concurrent change modifications
**[Mitigation]** Low risk — specId changes are typically sequential operations. The manifest is the source of truth; directories are ephemeral.

**[Risk]** User has written files to scaffolded directories before removing
**[Mitigation]** This change always removes files. Users should be aware that `remove-spec` is destructive for artifact directories. This matches the issue's expected behavior.

## Testing

### Automated tests

**`edit-change.spec.ts`** — add describe block:

- `removing spec IDs calls unscaffold on the repository`
- `removing multiple specs calls unscaffold with all removed specIds`
- `adding specs does not call unscaffold`

**`change-repository.spec.ts`** — add integration tests:

- `unscaffold removes specs/ and deltas/ directories for a spec`
- `unscaffold is idempotent when directory does not exist`
- `unscaffold removes directories containing files`

### Manual / E2E verification

```bash
# Create a change with a spec
node packages/cli/dist/index.js change create test-remove --spec "core:core/edit-change"

# Verify scaffolded directories exist
ls -la .specd/changes/*-test-remove/specs/core/core/edit-change/
ls -la .specd/changes/*-test-remove/deltas/core/core/edit-change/

# Remove the spec
node packages/cli/dist/index.js change edit test-remove --remove-spec "core:core/edit-change"

# Verify directories are gone
ls .specd/changes/*-test-remove/specs/core/core/edit-change/  # should fail
ls .specd/changes/*-test-remove/deltas/core/core/edit-change/  # should fail
```

## Open questions

_none_
