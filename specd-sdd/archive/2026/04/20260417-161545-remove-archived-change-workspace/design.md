# Design: remove-archived-change-workspace

## Non-goals

- Modify Change entity (already correct — has getter, not stored field)
- Change archive index format beyond removing workspace field
- Update existing archived changes in archive (backwards compatible — workspace derived at runtime)

## Affected areas

### Domain Entity

- `packages/core/src/domain/entities/archived-change.ts`
  - **Change**: Remove `_workspace: SpecPath` field from `ArchivedChangeProps` and entity
  - **Add**: `workspaces` getter that derives from `specIds` (like `Change`)
  - Callers: None (entity is constructed by FsArchiveRepository, not called directly)

### Infrastructure

- `packages/core/src/infrastructure/fs/archive-repository.ts`
  - **Change**: Remove `workspace` field from `_buildArchivedChange()` and `_buildIndexEntry()`
  - **Remove**: `deriveFirstWorkspace()` function (no longer needed)
  - Callers: Used by ArchiveChange use case via port

### Use Cases (template variable consumers)

- `packages/core/src/application/use-cases/run-step-hooks.ts:139`
  - **Change**: Replace `archived.workspace.toString()` with derivation from `archived.specIds`
  - Before: `const workspace = archived.workspace.toString()`
  - After: `const workspace = archived.specIds[0]?.split(':')[0] ?? 'default'`

- `packages/core/src/application/use-cases/get-hook-instructions.ts:81`
  - **Change**: Same pattern — derive workspace from `specIds[0]`
  - Before: `workspace: archived.workspace.toString()`
  - After: Derive from `archived.specIds[0]`

### Archive Index

- Existing entries keep `workspace` field (not migration needed)
- New archive entries will NOT include `workspace` field
- Reader (línea 216) must derive from `specIds[0]` when `workspace` field missing:
  - Before: `workspace: SpecPath.parse(entry.workspace ?? 'default')`
  - After: `workspace: entry.workspace ? SpecPath.parse(entry.workspace) : SpecPath.parse(entry.specIds?.[0]?.split(':')[0] ?? 'default')`

## New Constructs

No new constructs. This is a refactoring change that removes a field and adds a computed getter.

## Approach

1. **Modify ArchivedChange entity** (`archived-change.ts`):
   - Remove `workspace: SpecPath` from `ArchivedChangeProps` interface
   - Remove `_workspace` private field
   - Add `workspaces` getter that parses `specIds` and returns unique workspace names

2. **Update archive repository** (`archive-repository.ts`):
   - Remove `workspace` from `_buildArchivedChange()` input
   - Remove `workspace` from index entry construction
   - Delete `deriveFirstWorkspace()` helper function

3. **Update template consumers** (`run-step-hooks.ts`, `get-hook-instructions.ts`):
   - Replace `archived.workspace` calls with runtime derivation from `specIds[0]`

## Spec Impact

- `core:core/archive-change` — modified (delta already written)
- No ripple effects — no other specs depend on the `workspace` field specifically

## Testing

### Automated Tests

Update existing tests in:

- `packages/core/test/infrastructure/fs/archive-repository.spec.ts`
  - Remove assertion for `archivedChange.workspace`
  - Add assertion for `archivedChange.workspaces` getter

- `packages/core/test/application/use-cases/run-step-hooks.spec.ts`
  - Update template variable test to derive from `specIds`

### Manual Verification

```bash
# Archive a change and verify:
# 1. archivedChange.workspaces returns correct array
# 2. Archive index entry has no workspace field
# 3. Hooks receive correct workspace from derived specIds[0]
```

## Open Questions

None — the implementation is straightforward.
