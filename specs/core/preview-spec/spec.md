# PreviewSpec

## Purpose

During an active change, agents and humans need to see what a spec will look like after its deltas are applied — and some delivery mechanisms also need a reusable unified diff view of those changes — but the canonical spec remains untouched until archive. `PreviewSpec` fills this gap by applying a change's delta artifacts to the base spec content and returning the merged result per artifact file, with optional unified diff output when explicitly requested. It is the single source of delta-merge logic for read-only preview, consumed both by `CompileContext` (for materialized views) and by preview-oriented delivery mechanisms.

## Requirements

### Requirement: Ports and constructor

`PreviewSpec` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `SchemaProvider`, `ArtifactParserRegistry`, and `DiffGenerator`.

```typescript
class PreviewSpec {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
    diffGenerator: DiffGenerator,
  )
}
```

All are injected at kernel composition time, not passed per invocation.

### Requirement: Input

`PreviewSpec.execute` receives:

- `name` — the change name
- `specId` — the fully-qualified spec ID to preview (e.g. `core:compile-context`); MUST be one of the change's `specIds`
- `includeDiff` — optional boolean flag; when `true`, `PreviewSpec` SHALL generate unified diff output for preview entries whose status is `merged`. When omitted or `false`, `PreviewSpec` SHALL NOT generate diff output.

### Requirement: Spec ID validation

`PreviewSpec` MUST verify that `specId` is present in `change.specIds`. If it is not, it MUST throw a `SpecNotInChangeError` (or equivalent) — previewing a spec that the change does not target is not valid.

### Requirement: File discovery via change artifacts

`PreviewSpec` MUST discover which files to preview by inspecting `change.artifacts`. For each artifact type with `scope: spec`, retrieve the `ArtifactFile` keyed by the target `specId`. The `ArtifactFile.filename` property contains the resolved relative path within the change directory (e.g. `deltas/core/core/compile-context/spec.md.delta.yaml` or `specs/core/core/preview-spec/spec.md`).

This avoids manually deriving filenames from the schema — the change entity already has the resolved paths.

### Requirement: Delta application

`PreviewSpec` MUST process all artifact types defined in the active schema with `scope: spec`. For each artifact:

1. If `filename` ends with `.delta.yaml`, it is a delta file:
   a. Load the delta content from `ChangeRepository.artifact(change, filename)`.
   b. If content is missing, record status as `missing`.
   c. Load the base artifact from `SpecRepository.artifact(spec, outputBasename)`.
   d. If base artifact is missing, record status as `missing`.
   e. Parse the delta and apply it to the base.
   f. If all parsed entries are `no-op`, record status as `no-op`.
   g. If application fails, record status as `missing` and add a warning.
   h. Otherwise, record status as `merged`.
   i. The `merged` field contains the result of application (or original content for `no-op`/`missing`).
2. If `filename` does not end with `.delta.yaml`, it is a new spec artifact:
   a. Load the content from `ChangeRepository.artifact(change, filename)`.
   b. If content is missing, record status as `missing`.
   c. Otherwise, record status as `merged`.
   d. The base content is `null`.

`PreviewSpec` MUST return an entry for every `scope: spec` artifact type, even if the status is `missing` or `no-op`.

### Requirement: Artifact file ordering

The result MUST order artifact files as: the file named `spec.md` first (if present), then all remaining files in alphabetical order. This ordering applies to both merged content and diff output.

### Requirement: Diff generation

When `includeDiff` is `true`, `PreviewSpec` MUST generate a plain unified diff for each preview entry whose status is `merged`.

Diff generation MUST use the injected `DiffGenerator` capability and the same file entry's preview content:

- `filename` — the artifact filename being previewed
- `base` — the original content before delta application; when `base` is `null`, the diff generator MUST receive an empty string as the base side
- `merged` — the merged content after delta application

When `includeDiff` is `false` or omitted, `PreviewSpec` SHALL NOT invoke `DiffGenerator`.

Preview entries with status `no-op` or `missing` MUST NOT include generated diff output.

If `DiffGenerator` raises the dedicated `DiffGenerationError` for one file, `PreviewSpec` MUST:

- add a warning describing the diff-generation failure
- continue returning the preview entry's `base`, `merged`, and `status`
- omit the `diff` field for that entry

Handling `DiffGenerationError` SHALL NOT downgrade a successfully merged preview entry to `missing`.

### Requirement: Result shape

`PreviewSpec.execute` MUST return a `PreviewSpecResult`:

```typescript
interface PreviewSpecFileEntry {
  /** The artifact filename (e.g. `spec.md`, `verify.md`). */
  readonly filename: string
  /** The original base content (before delta application). `null` for new specs. */
  readonly base: string | null
  /** The merged content (after delta application). */
  readonly merged: string
  /**
   * Optional unified diff generated from `base` and `merged`.
   * Present only when `includeDiff` is true and the file status is `merged`.
   */
  readonly diff?: string
  /**
   * The preview status of this file.
   * - 'merged': delta applied successfully with changes, or new spec file
   * - 'no-op': delta applied but resulted in no changes to base content
   * - 'missing': delta file or base artifact not found, or delta application failed
   */
  readonly status: 'merged' | 'no-op' | 'missing'
}

interface PreviewSpecResult {
  /** The spec ID that was previewed. */
  readonly specId: string
  /** The change name. */
  readonly changeName: string
  /** Per-file preview entries, ordered per the artifact file ordering requirement. */
  readonly files: readonly PreviewSpecFileEntry[]
  /** Warnings encountered during preview (e.g. parser errors, missing base, diff-generation failures). */
  readonly warnings: readonly string[]
}
```

### Requirement: Error handling

If delta application fails for an artifact file (e.g. selector resolution failure, parser error), `PreviewSpec` MUST NOT throw. Instead, it MUST:

1. Add a warning describing the failure and the affected filename
2. Include the file in the result with status `missing`

If diff generation fails through the dedicated `DiffGenerationError`, `PreviewSpec` MUST also avoid throwing. It treats that case as a warning-producing partial result rather than as a failed preview.

The preview MUST always succeed — partial results are acceptable, total failure is not.

### Requirement: Schema name guard

After obtaining the schema from `SchemaProvider`, `PreviewSpec` MUST compare `schema.name()` with `change.schemaName`. If they differ, it MUST throw `SchemaMismatchError`.

### Requirement: Config-based factory delegates through resolvePreviewSpecDeps

The config-based `createPreviewSpec(config, options?)` form MUST derive `PreviewSpecDeps` through `resolvePreviewSpecDeps(resolver)` and then delegate to canonical `createPreviewSpec(deps)`.

`resolvePreviewSpecDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `specs: ReadonlyMap<string, SpecRepository>`
- `schemaProvider: SchemaProvider`
- `parsers: ArtifactParserRegistry`
- `diffGenerator: DiffGenerator`

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- `PreviewSpec` is read-only — it MUST NOT mutate any canonical spec content, change state, or artifact status
- Diff generation is part of `PreviewSpec` only when `includeDiff` is explicitly requested; callers that do not request it MUST keep the existing preview path without generated diff output
- `PreviewSpec` returns plain data only — it MUST NOT apply ANSI colorization or host-specific presentation formatting to diff output
- `PreviewSpec` does not validate deltas — validation is `ValidateArtifacts`' concern
- `PreviewSpec` does not check whether deltas are validated (complete status) — it applies whatever delta files exist; callers like `CompileContext` may choose to skip unvalidated deltas

## Spec Dependencies

- [`core:delta-format`](../delta-format/spec.md) — delta files define how preview merges are applied
- [`core:artifact-parser-port`](../artifact-parser-port/spec.md) — preview merges parse, apply, and serialize artifact content through this port
- [`core:change-layout`](../change-layout/spec.md) — preview resolves artifact filenames from change layout conventions
- [`core:file-reader-port`](../file-reader-port/spec.md) — preview-oriented workflows consume preview content as read-only text
- [`core:composition-resolver`](../composition-resolver/spec.md) — config-based factory wiring resolves `PreviewSpec` dependencies through shared composition
- [`core:diff-generator`](../diff-generator/spec.md) — unified diff generation is delegated to this internal capability
