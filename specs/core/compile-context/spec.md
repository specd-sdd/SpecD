# CompileContext

## Purpose

AI agents entering a lifecycle step need relevant spec content and project context to understand the codebase they're working with — assembling this from scattered sources manually would be error-prone and inconsistent. `CompileContext` automates this assembly: it collects context specs according to the project's include/exclude configuration, reads structured metadata via `SpecRepository.metadata()`, evaluates step availability, and combines project context entries, spec content, and available steps into a single structured output. Artifact instructions and step hooks are separate concerns retrieved via `GetArtifactInstruction` and `GetHookInstructions` respectively.

## Requirements

### Requirement: Ports and constructor

`CompileContext` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `SchemaProvider`, `FileReader`, and `ArtifactParserRegistry`.

```typescript
class CompileContext {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    files: FileReader,
    parsers: ArtifactParserRegistry,
  )
}
```

`SchemaProvider` is a lazy, caching port that returns the fully-resolved schema (with plugins and overrides applied). It replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple. All are injected at kernel composition time, not passed per invocation.

### Requirement: Input

`CompileContext.execute` receives:

- `name` — the change name to compile context for
- `step` — the lifecycle step name being entered (e.g. `'designing'`, `'implementing'`, `'verifying'`, `'archiving'`)
- `config` — the resolved project configuration containing `context`, `contextIncludeSpecs`, `contextExcludeSpecs`, and per-workspace `contextIncludeSpecs` / `contextExcludeSpecs`
- `followDeps` (optional, default `false`) — when `true`, performs the `dependsOn` transitive traversal (step 5 of context spec collection) to discover additional specs. When `false` or absent, traversal is skipped and only specs collected in steps 1–4 are included.
- `depth` (optional) — only valid when `followDeps` is `true`; limits `dependsOn` traversal to N levels deep (1 = direct dependencies only, 2 = deps of deps, etc.). When absent and `followDeps` is `true`, traversal is unlimited.
- `sections` (optional) — when present, restricts the metadata content rendered for each spec in the output to the listed sections (`'rules'`, `'constraints'`, `'scenarios'`). When absent, all available sections are rendered (description + rules + constraints + scenarios). `sections` applies only to spec content — it does not affect project context entries or available steps.

### Requirement: Schema name guard

After resolving the schema from config, `CompileContext` must compare `schema.name()` with `change.schemaName`. If they differ, it must throw `SchemaMismatchError`. This must happen before any context collection or instruction assembly.

### Requirement: Workspace resolution for spec IDs

Every spec ID handled by `CompileContext` carries an explicit or implicit workspace qualifier:

- **Explicit qualifier** (e.g. `billing:auth/login`) — the workspace name before `:` is used to look up the corresponding `SpecRepository` in the map.
- **No qualifier** (e.g. `auth/login`) — the workspace is inferred from context:
  - In include/exclude patterns at project level, an unqualified path resolves to `default`.
  - In include/exclude patterns at workspace level, an unqualified path resolves to that workspace.
  - In `dependsOn` entries from metadata, an unqualified path resolves to the same workspace as the spec that declared it.

If a pattern or `dependsOn` entry references a workspace name that has no entry in the `specs` map, `CompileContext` must emit a warning and skip that path. It must not throw.

### Requirement: Context spec collection

`CompileContext` must collect the set of specs to include in the context by applying the five-step resolution defined in [`specs/core/config/spec.md` — Requirement: Context spec selection](../config/spec.md). The steps are:

1. **Project-level include patterns** — always applied, regardless of which workspaces are active.
2. **Project-level exclude patterns** — always applied; removes specs matched by any project-level exclude pattern from the accumulated set.
3. **Workspace-level include patterns** — applied only for workspaces active in the current change (a workspace is active if any of its spec IDs appears in `change.specIds`).
4. **Workspace-level exclude patterns** — applied only for active workspaces; removes further specs from the set.
5. **`dependsOn` traversal** — only performed when `followDeps: true` is passed. Starting from `change.specIds`, `CompileContext` resolves each spec's metadata `dependsOn` entries via `SpecRepository.metadata()`, then follows links transitively until no new specs are discovered or the `depth` limit is reached. Specs added in this step are **not** subject to the exclude rules from steps 2 or 4. When `followDeps` is `false` or absent, this step is skipped entirely. This works in all change states (designing, ready, implementing, etc.) — it is not gated on reaching `ready`.

When a spec in the traversal has no metadata, `CompileContext` emits a `missing-metadata` warning identifying the spec and suggesting metadata generation. Traversal continues with any `dependsOn` information available from the change manifest's `specDependsOn` or from content extraction via the schema's `metadataExtraction` declarations.

A spec matched by multiple include patterns appears exactly once, at the position of the first matching include pattern. Specs added via `dependsOn` traversal that were already included in steps 1–4 also appear once (at their earlier position).

### Requirement: dependsOn resolution order

For each spec in Step 5, `dependsOn` is resolved using a three-tier fallback:

1. `change.specDependsOn[specId]` — per-spec dependencies declared in the change manifest (highest priority)
2. Metadata `dependsOn` field — the persisted metadata loaded via `SpecRepository.metadata()`
3. Schema `metadataExtraction` engine — extracts `dependsOn` from spec content when metadata is absent

The first tier that returns a non-empty result is used. If all tiers return empty, the spec is treated as having no dependencies.

### Requirement: Cycle detection during dependsOn traversal

During step 5, if `CompileContext` detects a cycle in the `dependsOn` graph (spec A depends on spec B which depends back on spec A), it must break the cycle and emit a warning. It must not enter an infinite loop. All specs that can be reached without traversing the cycle are still included.

### Requirement: Staleness detection and content fallback

For every spec in the collected context set, `CompileContext` must check whether the spec's metadata exists (via `SpecRepository.metadata()`) and whether its `contentHashes` are fresh (all required artifact file hashes match the recorded values).

- **Fresh metadata** — use the structured content from metadata (`rules`, `constraints`, `scenarios`, `description`).
- **Stale or absent metadata** — fall back to the full raw content of the spec's artifact files. Emit a warning identifying the spec path so the caller knows metadata should be regenerated.

Staleness is advisory — it never blocks context compilation. The fallback ensures the context is always assembled, even for specs whose metadata has not yet been generated.

### Requirement: Step availability

`CompileContext` must evaluate whether the requested step is available for the current change. A step is available if all artifact IDs in the matching `workflow` entry's `requires` list (the entry whose `step` field equals the requested step name) have effective status `complete` or `skipped` via `change.effectiveStatus(type)`. A skipped optional artifact satisfies the requirement in the same way a completed artifact does.

If the step is not available (one or more required artifacts are neither `complete` nor `skipped`), `CompileContext` must include the availability status and the list of blocking artifacts in the result. It must not throw — unavailability is surfaced to the caller, not treated as an error.

### Requirement: Assembled context block

`CompileContext` must assemble the context block by combining the following components in order:

1. **Project context entries** — for each entry in `config.context` (in declaration order): resolve `instruction` values verbatim; resolve `file` values by reading the file at the given path relative to the `specd.yaml` directory and injecting its content verbatim. Missing files emit a warning and are skipped. This block appears before all other content.
2. **Spec content** — for each spec in the collected context set, include its content using the following strategy. When `sections` is present, only the listed sections are rendered; when absent, all available sections are included (description + rules + constraints + scenarios).
   - If metadata exists and is fresh (via `SpecRepository.metadata()`): include the requested sections from the metadata. This is the compact, machine-optimised representation.
   - If metadata is absent or stale: fall back to the schema's `metadataExtraction` declarations. For each declared metadata field (rules, constraints, scenarios, etc.), the extraction engine loads the referenced artifact from `SpecRepository`, parses it via `ArtifactParser.parse()`, runs the declared extractors against the AST, and produces the same structured output as fresh metadata would. Only sections matching the `sections` filter are included when present. Extractors whose selectors match no nodes are silently skipped. Emit a staleness warning for this spec.
3. **Available steps** — list all steps declared in the schema's `workflow[]`, each annotated with whether it is currently available. Unavailable steps must name the blocking artifacts.

### Requirement: Result shape

`CompileContext.execute` must return a result object. The result must include:

- `stepAvailable: boolean` — whether the requested step is currently available
- `blockingArtifacts: string[]` — artifact IDs blocking the step (empty if available)
- `contextBlock: string` — the fully assembled context text
- `warnings: ContextWarning[]` — stale metadata warnings and any other advisory conditions

`CompileContext` must not throw on availability failures. It must throw on `ChangeNotFoundError` (change not found) and on schema resolution errors.

### Requirement: Missing spec IDs emit a warning

If a spec ID from an include pattern or `dependsOn` reference does not exist in the corresponding `SpecRepository`, `CompileContext` must emit a warning identifying the missing spec ID and skip it — no error is thrown. This allows the context to be compiled even when specs are temporarily absent, while making the gap visible.

### Requirement: Unknown workspace qualifiers emit a warning

If a pattern or `dependsOn` entry references a workspace name that has no corresponding `SpecRepository` in the `specs` map (e.g. `billing:auth/*` when `billing` was not wired at bootstrap), `CompileContext` must emit a warning and skip the path. It must not throw.

## Constraints

- Project `context` entries always appear first in the context block, before spec content
- Missing `file` references in `context` emit a warning and are skipped — no error
- Steps 1–4 (include/exclude patterns) are applied before `dependsOn` traversal (step 5)
- Specs added via `dependsOn` traversal are never removed by exclude rules
- A spec always appears at most once in the context output, at the position of the first include
- `CompileContext` must not perform direct filesystem reads — all file access goes through `SpecRepository` (for spec files and metadata) or `FileReader` (for `config.context` file entries)
- The caller resolves the config and constructs all `SpecRepository` and `FileReader` instances before calling the constructor
- The `specs` map must contain one entry per workspace declared in `specd.yaml`; workspaces missing from the map produce a warning, not an error
- Artifact instructions, rules, and delta context are NOT part of the context block — they are retrieved via `GetArtifactInstruction`
- `instruction:` hook entries are NOT part of the context block — they are retrieved via `GetHookInstructions`
- `dependsOn` traversal is opt-in via `followDeps: true`; when absent or `false`, step 5 is skipped entirely
- `depth` is only meaningful when `followDeps: true`; it limits traversal levels (1 = direct deps only)
- `sections` applies only to spec content rendering; project context entries and available steps are unaffected
- Cycle detection is mandatory — cycles in `dependsOn` must not cause infinite loops
- Fresh metadata (via `SpecRepository.metadata()`) is always preferred; the `metadataExtraction` fallback is only used when metadata is absent or stale

## Examples

### Context compilation for any step

```typescript
const result = await compileContext.execute({
  name: 'add-auth-flow',
  step: 'designing',
  config: {
    context: [
      { file: 'specd-bootstrap.md' },
      { instruction: 'Always prefer editing existing files over creating new ones.' },
    ],
    contextIncludeSpecs: ['default:*'],
    contextExcludeSpecs: [],
    workspaces: {
      default: { contextIncludeSpecs: ['*'], contextExcludeSpecs: [] },
    },
  },
})
// result.stepAvailable: true (designing has no requires)
// result.contextBlock: project context + spec content + available steps
```

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, `effectiveStatus`, active workspaces
- [`specs/core/config/spec.md`](../config/spec.md) — 5-step context spec resolution, include/exclude patterns, workspace-level patterns
- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — `.specd-metadata.yaml` format, `dependsOn` traversal, staleness detection
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `metadataExtraction` (fallback path), `workflow`
- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — `ArtifactParser` port (for metadataExtraction fallback)
- [`specs/core/selector-model/spec.md`](../selector-model/spec.md) — selector fields used in `metadataExtraction` extractors
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` format, parsing rules for `specIds`
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — active workspace determination, workspace-level context patterns, port-per-workspace pattern
- [`specs/core/get-artifact-instruction/spec.md`](../get-artifact-instruction/spec.md) — artifact instructions (separate concern)
- [`specs/core/get-hook-instructions/spec.md`](../get-hook-instructions/spec.md) — step hook instructions (separate concern)
