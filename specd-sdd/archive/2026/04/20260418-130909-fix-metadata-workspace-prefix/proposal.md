# Proposal: fix-metadata-workspace-prefix

## Motivation

Metadata files for specs in workspaces without a `prefix` configured (like `plugin-manager`, `skills`, `plugin-agent-*`) are being saved to the wrong directory. Instead of `.specd/metadata/<workspace>/<spec>`, they go to `.specd/metadata/<spec>`, causing metadata to be mixed across workspaces and making it impossible to locate.

## Current behaviour

The `FsSpecRepository` class constructs the metadata file path in `_metadataFilePath()`:

```typescript
return path.join(this._metadataPath, name.toFsPath(path.sep), 'metadata.json')
```

Where `name` includes the prefix segments but NOT the workspace. This means:

- For workspaces WITH `prefix` (like `core`, `cli`): `.specd/metadata/core/config/metadata.json` ✓
- For workspaces WITHOUT `prefix`: `.specd/metadata/agent-plugin-type/metadata.json` ✗ (should include workspace)

The repository has access to `this.workspace()` (from base `Repository` class) but doesn't use it when constructing the metadata path.

## Proposed solution

Modify `FsSpecRepository._metadataFilePath()` to prepend the workspace name:

```typescript
return path.join(
  this._metadataPath,
  this.workspace().name,
  name.toFsPath(path.sep),
  'metadata.json',
)
```

This ensures each workspace has its own metadata subdirectory:

- `.specd/metadata/core/`
- `.specd/metadata/plugin-manager/`
- `.specd/metadata/skills/`
- etc.

The fix is purely in the repository layer — no kernel changes needed since workspace is already available.

## Specs affected

### New specs

_none_

### Modified specs

- `core:core/spec-metadata`: Update the "File location and naming" requirement to clarify that metadata path includes workspace name: `.specd/metadata/<workspace>/<prefix>/<spec>/metadata.json`
  - Depends on (added): none

## Impact

- **Package:** `@specd/core`
- **Files:**
  - `packages/core/src/infrastructure/fs/spec-repository.ts` — modify `_metadataFilePath()` to include workspace name via `this.workspace().name`
- **Existing metadata files:** Will need migration or regeneration after the fix

## Technical context

The `Repository` base class already exposes `workspace()` which returns the workspace entity with `.name`. The `FsSpecRepository` just needs to use it when building the metadata file path, the same way it uses the prefix.

## Open questions

_none_
