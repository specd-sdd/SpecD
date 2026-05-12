# Design: ownership-enforcement

## Approach

Four enforcement points across two independent flows. Each point checks `ownership === 'readOnly'` and throws `ReadOnlyWorkspaceError` before any side effects.

**Flow 1: Change lifecycle (CLI layer)**

- `change create` and `change edit` check ownership after `parseSpecId()` resolves the workspace, before invoking the use case.

**Flow 2: Direct spec writes (application/infrastructure layer)**

- `SpecRepository.save()` and `saveMetadata()` check `this.ownership()` as the first line of the method.
- `ArchiveChange.execute()` iterates `change.specIds`, looks up each workspace's `SpecRepository`, and checks `ownership()` after the archivable guard but before hooks.

## New constructs

### `ReadOnlyWorkspaceError`

- **File:** `packages/core/src/domain/errors/read-only-workspace-error.ts`
- Extends `SpecdError` (the project's base error class at `packages/core/src/domain/errors/specd-error.ts`)
- Code: `'READ_ONLY_WORKSPACE'`
- Constructor accepts a single `message: string` — callers format the message with context
- Exported from `packages/core/src/domain/errors/index.ts`
- Re-exported from `@specd/core` barrel export

```typescript
export class ReadOnlyWorkspaceError extends SpecdError {
  override get code(): string {
    return 'READ_ONLY_WORKSPACE'
  }

  constructor(message: string) {
    super(message)
  }
}
```

## Affected areas

### 1. `packages/core/src/domain/errors/read-only-workspace-error.ts` (NEW)

New error class as described above.

### 2. `packages/core/src/domain/errors/index.ts` (MODIFY)

Add export: `export { ReadOnlyWorkspaceError } from './read-only-workspace-error.js'`

### 3. `packages/core/src/application/ports/spec-repository.ts` (MODIFY)

Import `ReadOnlyWorkspaceError`. Add a non-abstract `protected` helper method `assertWritable(specId: string)` that checks `this.ownership() === 'readOnly'` and throws. The abstract `save` and `saveMetadata` methods remain abstract — the guard is added in the abstract class body as a concrete method that subclasses call, or better: override `save` and `saveMetadata` as concrete methods that check ownership first, then delegate to new abstract methods (`_doSave`, `_doSaveMetadata`). However, the simpler approach per the spec is to add the check directly in `FsSpecRepository`.

**Chosen approach:** Add the guard in `FsSpecRepository.save()` and `FsSpecRepository.saveMetadata()` as the first line, since the abstract class should not enforce behavior — it defines the contract. The spec says "MUST first check `this.ownership()`" — this is an implementation requirement on the concrete class.

### 4. `packages/core/src/infrastructure/fs/spec-repository.ts` (MODIFY)

In `FsSpecRepository.save()` (line ~165): add at the top:

```typescript
if (this.ownership() === 'readOnly') {
  throw new ReadOnlyWorkspaceError(
    `Cannot write to spec "${this.workspace()}:${spec.name}" — workspace "${this.workspace()}" is readOnly.`,
  )
}
```

Same pattern in `FsSpecRepository.saveMetadata()` (line ~259).

### 5. `packages/core/src/application/use-cases/archive-change.ts` (MODIFY)

After the archivable guard + transition to archiving (line ~134), before pre-archive hooks (line ~137):

```typescript
// --- ReadOnly workspace guard ---
const readOnlySpecs: Array<{ specId: string; workspace: string }> = []
for (const specId of change.specIds) {
  const { workspace } = parseSpecId(specId)
  const specRepo = this._specs.get(workspace)
  if (specRepo && specRepo.ownership() === 'readOnly') {
    readOnlySpecs.push({ specId, workspace })
  }
}
if (readOnlySpecs.length > 0) {
  const lines = readOnlySpecs.map(
    (s) => `  - ${s.specId}  →  workspace "${s.workspace}" (readOnly)`,
  )
  throw new ReadOnlyWorkspaceError(
    `Cannot archive change "${change.name}" — it contains specs from readOnly workspaces:\n\n${lines.join('\n')}\n\nArchiving would write deltas into protected specs.`,
  )
}
```

### 6. `packages/cli/src/commands/change/create.ts` (MODIFY)

After `parseSpecId` resolves all specs (line 30), before invoking the use case (line 34):

```typescript
const readOnlyErrors: string[] = []
for (const parsed of parsedSpecs) {
  const ws = config.workspaces.find((w) => w.name === parsed.workspace)
  if (ws && ws.ownership === 'readOnly') {
    readOnlyErrors.push(
      `Cannot add spec "${parsed.specId}" to change — workspace "${parsed.workspace}" is readOnly.\n\nReadOnly workspaces are protected: their specs and code cannot be modified by changes.`,
    )
  }
}
if (readOnlyErrors.length > 0) {
  for (const msg of readOnlyErrors) {
    process.stderr.write(`error: ${msg}\n`)
  }
  process.exit(1)
}
```

Need to refactor `parseSpecId` call to keep the parsed result (workspace + specId) accessible for the ownership check.

### 7. `packages/cli/src/commands/change/edit.ts` (MODIFY)

Same pattern as create, but only for `--add-spec` values. After `parseSpecId` resolves `addSpecIds` (line ~50), before invoking the use case (line ~58).

## Testing

### Unit tests

| Test file                                                                  | What it covers                                                                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/test/domain/errors/read-only-workspace-error.spec.ts` (NEW) | Error extends `SpecdError`, preserves message, has code `'READ_ONLY_WORKSPACE'`                                                                 |
| `packages/core/test/infrastructure/fs/spec-repository.spec.ts` (MODIFY)    | Add tests: `save()` throws `ReadOnlyWorkspaceError` when ownership is `readOnly`; `saveMetadata()` same; read operations still work on readOnly |
| `packages/core/test/application/use-cases/archive-change.spec.ts` (MODIFY) | Add test: archive throws `ReadOnlyWorkspaceError` when change has readOnly specs; archive proceeds when all specs are owned/shared              |

### Integration tests (CLI)

| Test file                                                          | What it covers                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `packages/cli/test/commands/change/create.spec.ts` (MODIFY or NEW) | `--spec` targeting readOnly workspace exits with code 1 and correct error message         |
| `packages/cli/test/commands/change/edit.spec.ts` (MODIFY or NEW)   | `--add-spec` targeting readOnly workspace exits with code 1; `--remove-spec` not affected |

## No documentation changes needed

This change adds error paths to existing commands. No new commands, no new public APIs, no new docs pages required. The error messages are self-documenting.
