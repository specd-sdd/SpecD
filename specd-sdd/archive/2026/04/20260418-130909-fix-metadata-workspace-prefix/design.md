# Design: fix-metadata-workspace-prefix

## Non-goals

- Migrating existing metadata files to the new path structure (deferred to a separate cleanup task)
- Changing the metadataPath computation in kernel-internals.ts (this is already correct — it's the repository that needs to use the workspace name)

## Affected areas

- `packages/core/src/infrastructure/fs/spec-repository.ts`
  - **Change**: Modify `_metadataFilePath()` method (line 433-435) to include workspace name in the path
  - Current: `return path.join(this._metadataPath, name.toFsPath(path.sep), 'metadata.json')`
  - Fixed: `return path.join(this._metadataPath, this.workspace().name, name.toFsPath(path.sep), 'metadata.json')`
  - Risk: LOW — single method change, no external callers of this private method

The `this.workspace()` is already available from the base `Repository` class (imported via `SpecRepository` which extends `Repository`). The workspace entity has a `.name` property.

## New constructs

_none_ (the fix adds a property to an existing path construction)

## Approach

1. Modify `FsSpecRepository._metadataFilePath()` to prepend `this.workspace().name` to the metadata path
2. Verify that existing tests pass after the change
3. Existing metadata files will need to be regenerated or migrated (out of scope for this change)

The change is minimal: adding `this.workspace().name` to the path join at line 434.

## Key decisions

- **Fix location**: Repository layer, not kernel — the workspace is already available in the repository via `this.workspace()`, so no config changes are needed
- **Backward compatibility**: Existing metadata files will not be automatically migrated; they will be treated as missing and regenerated on next metadata generation

## Trade-offs

- [Risk] Existing metadata files in wrong locations become orphaned
  - [Mitigation] A follow-up cleanup task will handle migration; the fix enables correct behavior going forward

## Spec impact

The spec `core:core/spec-metadata` is modified to clarify the path structure includes the workspace name. No other specs are affected.

## Dependency map

```mermaid
graph LR
  FsSpecRepository -- uses --> Repository
  Repository -- provides --> workspace()
  _metadataFilePath -- uses --> workspace().name
```

```
┌─────────────────────┐
│ FsSpecRepository   │
│ _metadataFilePath  │
└──────────┬──────────┘
           │ uses
           ▼
┌─────────────────────┐
│ this.workspace()   │
│ (from Repository)  │
└──────────┬──────────┘
           │ provides
           ▼
┌─────────────────────┐
│ workspace.name     │
│ = "plugin-manager" │
│ = "skills"         │
│ = "core"           │
└─────────────────────┘
```

## Migration / Rollback

- **Rollback**: Revert the single line change in `_metadataFilePath()` — metadata will be written to the old (incorrect) path
- **Forward**: After deploying, regenerate metadata or let it regenerate naturally on next archive

## Testing

**Automated tests:**

- Unit test in `packages/core/test/infrastructure/fs/spec-repository.spec.ts` — add test case that verifies metadata path includes workspace name for both workspaces with and without prefix
- Verify the `_metadataFilePath()` method produces correct paths:
  - Workspace `core` (with prefix `core`): `.specd/metadata/core/core/config/metadata.json`
  - Workspace `skills` (no prefix): `.specd/metadata/skills/get-skill/metadata.json`

**Manual / E2E verification:**

1. Run `specd spec generate-metadata --all --write --force`
2. Verify metadata files are in correct locations:
   - `.specd/metadata/skills/get-skill/metadata.json` exists (was `.specd/metadata/get-skill/metadata.json`)
   - `.specd/metadata/plugin-manager/agent-plugin-type/metadata.json` exists (was `.specd/metadata/agent-plugin-type/metadata.json`)

## Open questions

_none_
