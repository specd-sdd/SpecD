# Design: archive-post-phase

## Affected areas

### 1. `ArchiveRepository` port — `packages/core/src/application/ports/archive-repository.ts`

Add `archivePath(archivedChange: ArchivedChange): string` abstract method after line 87. Mirrors `ChangeRepository.changePath()` (line 143 of change-repository.ts).

### 2. `FsArchiveRepository` — `packages/core/src/infrastructure/fs/archive-repository.ts`

Implement `archivePath()`. The base archive path is stored in `this._archivePath` (line 104). The relative path for a specific archived change is stored in `IndexEntry.path`. Implementation: look up the index entry for the archived change's `archivedName` and join with `_archivePath`.

Since `archivePath` takes an `ArchivedChange` (which has `archivedName`), and the archive directory is always `path.join(this._archivePath, ...entry.path.split('/'))` (as seen in `get()` at line 256), the implementation can reconstruct the path from the `archivedName` by scanning the index or using a direct path resolution from the archive pattern.

Simplest approach: the `FsArchiveRepository` already stores `_expandPattern()` (lines 332-350) which computes paths from change metadata. For `archivePath`, we can use `_expandPattern()` with the `ArchivedChange`'s properties to reconstruct the path deterministically.

### 3. `RunStepHooks` — `packages/core/src/application/use-cases/run-step-hooks.ts`

- **Constructor** (line 67-71): Add `archive: ArchiveRepository` parameter, store as `this._archive`
- **Change lookup** (line 84): After `ChangeRepository.get()` returns null, check if `step === 'archiving' && phase === 'post'` — only then fall back to `this._archive.get(name)`. For all other step/phase combinations, throw `ChangeNotFoundError` immediately.
- **Template variables** (lines 128-131): When using `ArchivedChange`, use `archivedChange.name`, `archivedChange.workspace` (singular string, not array), and `this._archive.archivePath(archivedChange)`.

### 4. `GetHookInstructions` — `packages/core/src/application/use-cases/get-hook-instructions.ts`

- **Constructor** (lines 45-53): Add `archive: ArchiveRepository` parameter, store as `this._archive`
- **Change lookup** (line 62): Same conditional fallback — only for `step === 'archiving' && phase === 'post'`
- **Template variables** (lines 103-106): Same pattern — use `ArchivedChange` properties when from archive

### 5. Kernel composition — `packages/core/src/composition/kernel.ts`

- Line 171: `RunStepHooks` instantiation — add `i.archive` parameter
- Line 215: `GetHookInstructions` instantiation — add `i.archive` parameter

### 6. Composition factories

- `packages/core/src/composition/use-cases/transition-change.ts` line 130: `RunStepHooks` instantiation — needs `archive` parameter
- `packages/core/src/composition/use-cases/archive-change.ts` line 190: `RunStepHooks` instantiation — needs `archive` parameter

## New constructs

No new files. One new abstract method on `ArchiveRepository`:

- **Location**: `packages/core/src/application/ports/archive-repository.ts`
- **Shape**: `abstract archivePath(archivedChange: ArchivedChange): string`
- **Responsibility**: Returns absolute filesystem path for an archived change's directory
- **Relationships**: Called by `RunStepHooks` and `GetHookInstructions` when building `change.path` for archived changes

## Approach

### Order of operations

1. **`ArchiveRepository.archivePath()`** — add abstract method to port, implement in `FsArchiveRepository`
2. **`RunStepHooks` constructor + fallback** — add `ArchiveRepository`, implement fallback lookup, adapt template variables
3. **`GetHookInstructions` constructor + fallback** — same pattern
4. **Kernel composition** — inject `i.archive` into both use cases at all instantiation points
5. **Tests** — add test cases for fallback behavior in both use cases, and for `archivePath` in archive repository

### Schema name guard handling

Both use cases compare `schema.name()` with `change.schemaName`. `ArchivedChange` has `schemaName` (confirmed in entity definition), so this check works without changes.

### Template variable adaptation

The key difference: `Change` has `workspaces` (array, derived from specIds), while `ArchivedChange` has `workspace` (singular string). Both use cases only use `workspaces[0]`. The fallback code maps `archivedChange.workspace` directly to the `change.workspace` template variable.

## Key decisions

**Decision**: Fallback in use cases, not in repositories.
→ The `ChangeRepository` and `ArchiveRepository` are separate ports with different semantics. Adding cross-lookup would violate their contracts. The fallback belongs in the use case layer where the intent is clear.

**Decision**: `archivePath` as an abstract method on `ArchiveRepository`, not a standalone function.
→ The path depends on the archive pattern and root directory, which are infrastructure concerns. The repository already has this configuration. A standalone function would need to duplicate it.

**Decision**: No changes to `ArchiveChange` use case.
→ The fix is entirely in `RunStepHooks` (which `ArchiveChange` delegates to). After the fix, `ArchiveChange`'s post-hook call works naturally because `RunStepHooks` finds the change in the archive.

## Testing

### Automated tests

**`packages/core/test/infrastructure/fs/archive-repository.spec.ts`**:

- `archivePath` returns correct absolute path for an archived change
- `archivePath` is consistent with the path returned by `archive()`

**`packages/core/test/application/use-cases/run-step-hooks.spec.ts`**:

- Change not in ChangeRepository, found in archive → hooks execute using archived change properties
- Change not in either repository → throws `ChangeNotFoundError`
- Active change takes precedence over archived → `ArchiveRepository.get()` not called

**`packages/core/test/application/use-cases/get-hook-instructions.spec.ts`**:

- Change not in ChangeRepository, found in archive → instructions returned using archived change properties
- Change not in either repository → throws `ChangeNotFoundError`
- Active change takes precedence over archived → `ArchiveRepository.get()` not called

### Manual / E2E verification

1. Create a change, progress through lifecycle, archive it
2. Run `specd change hook-instruction <name> archiving --phase post` → should return instructions (not error)
3. Run `specd change run-hooks <name> archiving --phase post` → should execute hooks (not error)
4. Verify `change archive` no longer errors when post-hooks are configured
