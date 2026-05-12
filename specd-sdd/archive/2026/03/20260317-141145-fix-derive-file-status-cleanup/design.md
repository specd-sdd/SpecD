# Design: Fix \_deriveFileStatus to apply preHashCleanup

## Affected areas

### `FsChangeRepository._deriveFileStatus`

**`packages/core/src/infrastructure/fs/change-repository.ts` (line 706)**

Current signature:

```typescript
private async _deriveFileStatus(
  file: ManifestArtifactFile,
  dir: string,
  optional: boolean,
): Promise<ArtifactStatus>
```

Add a 4th parameter for cleanup rules:

```typescript
private async _deriveFileStatus(
  file: ManifestArtifactFile,
  dir: string,
  optional: boolean,
  preHashCleanup: readonly PreHashCleanup[],
): Promise<ArtifactStatus>
```

At line 725, change:

```typescript
const currentHash = sha256(content)
```

to:

```typescript
const cleaned = applyPreHashCleanup(content, preHashCleanup)
const currentHash = sha256(cleaned)
```

The `applyPreHashCleanup` helper already exists in the domain as `safeRegex` + replace loop (used in `ValidateArtifacts._applyCleanup`). Rather than importing a use-case private method, extract a small pure function or inline the loop directly — it's 5 lines.

### `FsChangeRepository._manifestToChange`

**`packages/core/src/infrastructure/fs/change-repository.ts` (line 528)**

This method already resolves `artType` from `artifactTypeMap` (line 534). Pass `artType?.preHashCleanup ?? []` to every `_deriveFileStatus` call:

- Line 537: primary file derivation
- Line 548: delta file fallback derivation
- Line 614: syncArtifacts new-file derivation
- Line 628: syncArtifacts delta fallback derivation

### `PreHashCleanup` import

**`packages/core/src/domain/value-objects/validation-rule.ts`** — already exports `PreHashCleanup` type. Import it in `change-repository.ts`.

### `safeRegex`

**`packages/core/src/domain/services/safe-regex.ts`** — already exported. Import it in `change-repository.ts` for the cleanup loop.

### Tests

**`packages/core/test/infrastructure/fs/change-repository.spec.ts`** — add integration tests verifying that:

1. An artifact with preHashCleanup whose file changes in a cleanup-normalized way stays `complete`.
2. A non-normalized change correctly becomes `in-progress`.
3. An artifact with no preHashCleanup rules uses raw hash (existing behaviour preserved).

## Approach

1. Add `PreHashCleanup` and `safeRegex` imports to `change-repository.ts`.
2. Add the `preHashCleanup` parameter to `_deriveFileStatus` and apply cleanup before hashing.
3. Thread `artType?.preHashCleanup ?? []` through all 4 call sites in `_manifestToChange`.
4. Add tests.

## Key decisions

- **Inline the cleanup loop in `_deriveFileStatus`** rather than extracting a shared helper. The loop is 5 lines and used in only two places (here and `ValidateArtifacts`). A shared helper would add indirection for minimal reuse.
- **Default to empty array** when `artType` is undefined (manifest references an artifact type not in the current schema). This preserves backward compatibility — raw hashing, same as today.

## Trade-offs

None significant — this is a small, targeted bug fix.

## Open questions

None.
