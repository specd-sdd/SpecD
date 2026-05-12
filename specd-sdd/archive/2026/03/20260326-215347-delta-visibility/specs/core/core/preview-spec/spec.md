# PreviewSpec

## Purpose

During an active change, agents and humans need to see what a spec will look like after its deltas are applied — but the canonical spec remains untouched until archive. `PreviewSpec` fills this gap by applying a change's delta artifacts to the base spec content and returning the merged result per artifact file, without mutating anything. It is the single source of delta-merge logic for read-only preview, consumed both by `CompileContext` (for materialized views) and by the CLI preview command (for human review).

## Requirements

### Requirement: Ports and constructor

`PreviewSpec` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `SchemaProvider`, and `ArtifactParserRegistry`.

```typescript
class PreviewSpec {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    parsers: ArtifactParserRegistry,
  )
}
```

All are injected at kernel composition time, not passed per invocation.

### Requirement: Input

`PreviewSpec.execute` receives:

- `name` — the change name
- `specId` — the fully-qualified spec ID to preview (e.g. `core:core/compile-context`); MUST be one of the change's `specIds`

### Requirement: Spec ID validation

`PreviewSpec` MUST verify that `specId` is present in `change.specIds`. If it is not, it MUST throw a `SpecNotInChangeError` (or equivalent) — previewing a spec that the change does not target is not valid.

### Requirement: File discovery via change artifacts

`PreviewSpec` MUST discover which files to preview by inspecting `change.artifacts`. For each artifact type with `scope: spec`, retrieve the `ArtifactFile` keyed by the target `specId`. The `ArtifactFile.filename` property contains the resolved relative path within the change directory (e.g. `deltas/core/core/compile-context/spec.md.delta.yaml` or `specs/core/core/preview-spec/spec.md`).

This avoids manually deriving filenames from the schema — the change entity already has the resolved paths.

### Requirement: Delta application

For each discovered file:

1. If `filename` ends with `.delta.yaml`, it is a delta file:
   a. Load the delta content from `ChangeRepository.artifact(change, filename)`
   b. Parse the delta using `ArtifactParserRegistry.get('yaml').parseDelta(deltaContent)`
   c. If all parsed entries are `no-op`, skip this file — no changes to apply
   d. Derive the output basename by stripping the `.delta.yaml` suffix and the `deltas/<workspace>/<capability-path>/` prefix
   e. Load the base artifact from `SpecRepository.artifact(spec, outputBasename)`
   f. Determine the format: `artifactType.format ?? inferFormat(outputBasename) ?? 'plaintext'`
   g. Parse the base content: `parser.parse(baseContent)`
   h. Apply the delta: `parser.apply(baseAst, deltaEntries)`
   i. Serialize the result: `parser.serialize(mergedAst)`

2. If `filename` does not end with `.delta.yaml`, it is a new spec artifact:
   a. Load the content directly from `ChangeRepository.artifact(change, filename)`
   b. The base content is `null` (this is a new file)

### Requirement: Artifact file ordering

The result MUST order artifact files as: the file named `spec.md` first (if present), then all remaining files in alphabetical order. This ordering applies to both merged content and diff output.

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
}

interface PreviewSpecResult {
  /** The spec ID that was previewed. */
  readonly specId: string
  /** The change name. */
  readonly changeName: string
  /** Per-file preview entries, ordered per the artifact file ordering requirement. */
  readonly files: readonly PreviewSpecFileEntry[]
  /** Warnings encountered during preview (e.g. parser errors, missing base). */
  readonly warnings: readonly string[]
}
```

### Requirement: Error handling

If delta application fails for an artifact file (e.g. selector resolution failure, parser error), `PreviewSpec` MUST NOT throw. Instead, it MUST:

1. Add a warning describing the failure and the affected filename
2. Skip that file in the result (do not include a partial or broken entry)

The preview MUST always succeed — partial results are acceptable, total failure is not.

### Requirement: Schema name guard

After obtaining the schema from `SchemaProvider`, `PreviewSpec` MUST compare `schema.name()` with `change.schemaName`. If they differ, it MUST throw `SchemaMismatchError`.

## Constraints

- `PreviewSpec` is read-only — it MUST NOT mutate any canonical spec content, change state, or artifact status
- Only `scope: spec` artifact types with `delta: true` are candidates for preview
- Diff generation is NOT part of `PreviewSpec` — it is the CLI adapter's responsibility. `PreviewSpec` returns `base` and `merged` only.
- `PreviewSpec` does not validate deltas — validation is `ValidateArtifacts`' concern
- `PreviewSpec` does not check whether deltas are validated (complete status) — it applies whatever delta files exist; callers like `CompileContext` may choose to skip unvalidated deltas

## Spec Dependencies

- `core:core/delta-format` — delta file format, `parseDelta`, and `apply` semantics
- `core:core/artifact-parser-port` — `ArtifactParser` interface for parse/apply/serialize
- `core:core/change-layout` — directory layout for locating delta and new-spec files
- `core:core/file-reader-port` — not directly used; `ChangeRepository` and `SpecRepository` handle file access
