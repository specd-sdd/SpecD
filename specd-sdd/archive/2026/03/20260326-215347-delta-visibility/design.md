# Design: delta-visibility

## Overview

This change adds two capabilities: (1) a `PreviewSpec` use case that merges delta artifacts into base spec content, and (2) integration of `PreviewSpec` into `CompileContext` for automatic materialized views. The CLI gets a new `change spec-preview` command. A new npm dependency (`diff`) is added to `@specd/core`.

## Affected areas

### `@specd/core` — application layer

**New file:** `packages/core/src/application/use-cases/preview-spec.ts`

```typescript
export interface PreviewSpecInput {
  readonly name: string
  readonly specId: string
  readonly diff?: boolean
}

export interface PreviewSpecFileEntry {
  readonly filename: string
  readonly base: string | null
  readonly merged: string
  readonly diff?: string
}

export interface PreviewSpecResult {
  readonly specId: string
  readonly changeName: string
  readonly files: readonly PreviewSpecFileEntry[]
  readonly warnings: readonly string[]
}

export class PreviewSpec {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
  )

  async execute(input: PreviewSpecInput): Promise<PreviewSpecResult>
}
```

**Algorithm:**

1. Load change via `ChangeRepository.get(name)` — throw `ChangeNotFoundError` if null
2. Schema name guard — compare `schema.name()` with `change.schemaName`
3. Validate `specId` is in `change.specIds` — throw `SpecNotInChangeError` if not
4. Parse specId → `{ workspace, capPath }` via `parseSpecId()`
5. Get `SpecRepository` for workspace; get base spec via `repo.get(SpecPath.parse(capPath))`
6. Iterate `schema.artifacts()` filtering `scope === 'spec'`:
   - For each artifact type, get the `ArtifactFile` from `change.artifact(artifactType.id)?.getFile(specId)`
   - If no file or status is `missing`, skip
   - Read file content via `ChangeRepository.artifact(change, file.filename)`
   - **If filename ends with `.delta.yaml`** (delta path):
     a. Parse delta via `parsers.get('yaml')!.parseDelta(content)`
     b. If all entries are `no-op`, skip
     c. Derive output basename from filename (strip `deltas/<ws>/<capPath>/` prefix and `.delta.yaml` suffix)
     d. Load base from `SpecRepository.artifact(spec, basename)`
     e. Determine format: `artifactType.format ?? inferFormat(basename) ?? 'plaintext'`
     f. Parse base → apply delta → serialize merged
     g. If `input.diff`, generate unified diff via `createTwoFilesPatch()`
   - **If filename does not end with `.delta.yaml`** (new spec):
     a. Content is the merged result; `base` is `null`
     b. If `input.diff`, generate diff showing all lines as additions
   - Wrap in `try/catch` per file — on failure, add warning, skip file
7. Sort result: `spec.md` first, then alphabetical
8. Return `PreviewSpecResult`

**New error:** `packages/core/src/application/errors/spec-not-in-change-error.ts`

```typescript
export class SpecNotInChangeError extends Error {
  constructor(specId: string, changeName: string)
}
```

**Modified file:** `packages/core/src/application/use-cases/compile-context.ts`

- Add `PreviewSpec` as a constructor parameter (after `hasher`)
- In the full-mode content rendering loop (around line 440-487), for specs in `change.specIds`:
  1. Call `this._previewSpec.execute({ name: input.name, specId, diff: false })`
  2. If result has files, find the entry with `filename === 'spec.md'` (or first file)
  3. Use its `merged` content as `ContextSpecEntry.content`
  4. If preview throws or returns empty, fall back to existing metadata/extraction logic
  5. Add any preview warnings to the context warnings array

### `@specd/core` — composition layer

**New file:** `packages/core/src/composition/use-cases/preview-spec.ts`

```typescript
export function createPreviewSpec(config: SpecdConfig): PreviewSpec
```

Follows the same pattern as `createCompileContext`: builds `ChangeRepository`, `SpecRepository` map, `SchemaProvider`, and `ArtifactParserRegistry` from config.

**Modified file:** `packages/core/src/composition/kernel.ts`

- Import `PreviewSpec`
- Add `preview: PreviewSpec` to the `changes` section of the `Kernel` interface
- In `createKernel()`:
  1. Create `PreviewSpec` instance: `new PreviewSpec(i.changes, i.specs, schemaProvider, i.parsers)`
  2. Pass it to `CompileContext` constructor: `new CompileContext(i.changes, i.specs, schemaProvider, i.files, i.parsers, i.hasher, previewSpec)`
  3. Expose as `changes.preview: previewSpec`

**Modified file:** `packages/core/src/composition/use-cases/compile-context.ts`

- Update `createCompileContext` to also create a `PreviewSpec` instance and pass it to `CompileContext`

### `@specd/core` — public exports

**Modified file:** `packages/core/src/index.ts`

- Export `PreviewSpec`, `PreviewSpecInput`, `PreviewSpecResult`, `PreviewSpecFileEntry`
- Export `SpecNotInChangeError`

### `@specd/core` — new dependency

**Modified file:** `packages/core/package.json`

- Add `"diff": "^7.0.0"` to `dependencies`

The `diff` package provides `createTwoFilesPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options)`. Use with `{ context: 3 }` for 3 lines of context.

### `@specd/cli` — new command

**New file:** `packages/cli/src/commands/change/spec-preview.ts`

```typescript
export function registerChangeSpecPreview(parent: Command): void
```

Pattern follows existing commands (e.g. `validate.ts`):

1. Register as `.command('spec-preview <name> <specId>')`
2. Add `.option('--diff', 'show unified diff instead of merged content')`
3. Add `.option('--format <fmt>', 'output format: text|json|toon', 'text')`
4. In action handler:
   - Resolve CLI context via `resolveCliContext()`
   - Call `kernel.changes.preview.execute({ name, specId, diff })`
   - Text format without `--diff`: concatenate files with `--- filename ---` separators
   - Text format with `--diff`: colorize each file's diff using `chalk`:
     - `chalk.green()` for `+` lines
     - `chalk.red()` for `-` lines
     - `chalk.cyan()` for `@@` lines
     - `chalk.dim()` for context lines
   - JSON/TOON: output the `PreviewSpecResult` directly
   - Warnings → `console.error()` (stderr)
5. Error handling: `handleError(err, opts.format)` as in other commands

**Modified file:** `packages/cli/src/index.ts`

- Import `registerChangeSpecPreview`
- Call `registerChangeSpecPreview(changeCmd)`

## New constructs

| Construct                            | File                                                      | Layer       |
| ------------------------------------ | --------------------------------------------------------- | ----------- |
| `PreviewSpec` class                  | `core/src/application/use-cases/preview-spec.ts`          | Application |
| `PreviewSpecInput` interface         | same file                                                 | Application |
| `PreviewSpecResult` interface        | same file                                                 | Application |
| `PreviewSpecFileEntry` interface     | same file                                                 | Application |
| `SpecNotInChangeError` class         | `core/src/application/errors/spec-not-in-change-error.ts` | Application |
| `createPreviewSpec` function         | `core/src/composition/use-cases/preview-spec.ts`          | Composition |
| `registerChangeSpecPreview` function | `cli/src/commands/change/spec-preview.ts`                 | CLI adapter |

## Testing

### `@specd/core` unit tests

**New file:** `packages/core/test/application/use-cases/preview-spec.spec.ts`

Tests against the verify scenarios for `core:core/preview-spec`:

- Mock `ChangeRepository`, `SpecRepository`, `SchemaProvider`, `ArtifactParserRegistry`
- Test delta merge: mock parser `parse → apply → serialize` chain
- Test no-op skip: delta with only no-op entries returns no files
- Test new spec: file without `.delta.yaml` returns `base: null`
- Test file ordering: `spec.md` first, rest alphabetical
- Test diff generation: when `diff: true`, entries have `diff` field
- Test error handling: parser.apply throws → warning, file skipped
- Test specId validation: specId not in change → throws
- Test schema mismatch: different schema names → throws

**Modified file:** `packages/core/test/application/use-cases/compile-context.spec.ts`

Add tests for materialized delta view:

- Spec with preview result → content uses merged
- Spec without deltas → falls back to metadata
- Preview failure → falls back, adds warning
- Summary-mode specs → not previewed

### `@specd/cli` integration tests

**New file:** `packages/cli/test/commands/change/spec-preview.spec.ts`

Tests against the verify scenarios for `cli:cli/change-spec-preview`:

- Command invocation with/without `--diff`
- Text output format (separator lines, ordering)
- JSON output format
- Error cases (missing change, spec not in change)

## Impact analysis

Graph reports `CompileContext`, `createCompileContext`, and `Kernel` as **CRITICAL** risk (250–287 transitive files each) because they are central symbols. The actual blast radius of this change is much smaller:

| Change                                                  | Files touched | Real risk | Why                                                                                                                   |
| ------------------------------------------------------- | ------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| New `PreviewSpec` constructor param on `CompileContext` | 3             | **LOW**   | Only direct callers: `kernel.ts` (line 210), `createCompileContext` composition (line 155), `compile-context.spec.ts` |
| New `preview` property on `Kernel` interface            | 1             | **NONE**  | Additive — no existing consumer breaks                                                                                |
| `createCompileContext` composition update               | 1 + tests     | **LOW**   | Creates `PreviewSpec` internally, passes to constructor                                                               |
| New `PreviewSpec` use case + composition                | All new files | **NONE**  | No existing code touched                                                                                              |
| New CLI `spec-preview` command                          | All new files | **NONE**  | New registration in `index.ts` only                                                                                   |
| `compile-context.spec.ts` test updates                  | 1             | **LOW**   | Existing tests need updated constructor call with new param                                                           |

**`GetProjectContext` is NOT affected** — it has its own pipeline and does not instantiate `CompileContext`.

**Callers of `CompileContext` constructor (exhaustive):**

1. `packages/core/src/composition/kernel.ts:210` — `createKernel()`
2. `packages/core/src/composition/use-cases/compile-context.ts:155` — `createCompileContext()`
3. `packages/core/test/application/use-cases/compile-context.spec.ts` — test instantiation

No other file constructs `CompileContext` directly.

## Architecture compliance

- `PreviewSpec` lives in application layer — uses ports only (`ChangeRepository`, `SpecRepository`, `ArtifactParserRegistry`), no direct I/O
- `diff` npm package is used in application layer — it's a pure function library (string in, string out), no I/O; acceptable per architecture spec
- CLI is a thin adapter — all logic in the use case
- No default exports, ESM only, strict TypeScript
- Tests in `test/<mirror>/` structure, not co-located

## Open questions

None.
