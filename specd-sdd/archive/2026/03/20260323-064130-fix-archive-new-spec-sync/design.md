# Design: fix-archive-new-spec-sync

## Affected areas

- **`packages/core/src/application/use-cases/archive-change.ts`** — `execute()` method, delta merge loop (line 186). Add fallback when delta file is not found.
- **`packages/core/test/application/use-cases/archive-change.spec.ts`** — Add test cases for the two new verify scenarios.

## Approach

Extract the shared "copy primary file" logic into a private method `_copyPrimaryFile` that both the delta fallback and the non-delta branch call. Then restructure the delta branch to use it when no `.delta.yaml` is found.

### Private method

```typescript
private async _copyPrimaryFile(
  change: Change,
  specFile: ArtifactFile,
  spec: Spec,
  outputBasename: string,
  specRepo: SpecRepository,
): Promise<boolean> {
  const artifactFile = await this._changes.artifact(change, specFile.filename)
  if (artifactFile === null) return false
  await specRepo.save(spec, new SpecArtifact(outputBasename, artifactFile.content), { force: true })
  return true
}
```

### Restructured loop

Current code (simplified):

```typescript
if (artifactType.delta) {
  const deltaFile = await this._changes.artifact(change, deltaFilename)
  if (deltaFile === null) continue // BUG: skips new specs
  // ... merge delta ...
} else {
  const artifactFile = await this._changes.artifact(change, specFile.filename)
  // ... copy directly (duplicated logic) ...
}
```

Fixed code:

```typescript
if (artifactType.delta) {
  const deltaFile = await this._changes.artifact(change, deltaFilename)
  if (deltaFile !== null) {
    // ... merge delta (existing logic) ...
  } else {
    // Fallback: no delta file — new spec, copy primary
    if (await this._copyPrimaryFile(change, specFile, spec, outputBasename, specRepo)) {
      synced = true
    }
  }
} else {
  if (await this._copyPrimaryFile(change, specFile, spec, outputBasename, specRepo)) {
    synced = true
  }
}
```

## Key decisions

**Extract to private method.** Both the delta fallback and the non-delta branch use identical logic to load and copy a primary file. Extracting to `_copyPrimaryFile` eliminates duplication and prevents future drift between the two code paths.

**No new dependencies.** The fix uses only existing APIs (`_changes.artifact`, `specRepo.save`, `SpecArtifact`).

## Testing

### Automated tests

In `packages/core/test/application/use-cases/archive-change.spec.ts`, add two tests:

1. **`copies new spec file when delta:true but no delta file exists`** — Set up a change with a specId whose spec doesn't exist in the project, with a primary file in `specs/` of the change dir but no delta file. Call `execute()`. Assert that `SpecRepository.save` was called with the primary file content.

2. **`delta file takes precedence over primary file for existing specs`** — Set up a change with a specId whose spec exists in the project, with both a delta file and a primary file. Call `execute()`. Assert that the delta was merged (not the primary copied).

### Manual verification

```bash
pnpm --filter @specd/core test -- --grep "archive"
```
