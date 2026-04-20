# CompileContext

## Purpose

AI agents entering a lifecycle step need relevant spec content and project context to understand the codebase they're working with — assembling this from scattered sources manually would be error-prone and inconsistent. `CompileContext` automates this assembly: it collects context specs according to the project's include/exclude configuration, reads structured metadata via `SpecRepository.metadata()`, evaluates step availability, and combines project context entries, spec content, and available steps into a single structured output. Artifact instructions and step hooks are separate concerns retrieved via `GetArtifactInstruction` and `GetHookInstructions` respectively.

## Requirements

### Requirement: Ports and constructor

`CompileContext` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `SchemaProvider`, `FileReader`, `ArtifactParserRegistry`, `ContentHasher`, and `PreviewSpec`.

```typescript
class CompileContext {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemaProvider: SchemaProvider,
    files: FileReader,
    parsers: ArtifactParserRegistry,
    hasher: ContentHasher,
    previewSpec: PreviewSpec,
  )
}
```

`SchemaProvider` is a lazy, caching port that returns the fully-resolved schema (with plugins and overrides applied). It replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple. All are injected at kernel composition time, not passed per invocation.

`PreviewSpec` is the use case `CompileContext` delegates to when it needs a materialized merged view of a spec with validated deltas applied. `ContentHasher` is used for metadata freshness checks and context fingerprint inputs.

### Requirement: Input

`CompileContext.execute` receives:

- `name` — the change name to compile context for
- `step` — the lifecycle step name being entered (e.g. `'designing'`, `'implementing'`, `'verifying'`, `'archiving'`)
- `config` — the resolved project configuration containing `context`, `contextIncludeSpecs`, `contextExcludeSpecs`, per-workspace `contextIncludeSpecs` / `contextExcludeSpecs`, and `contextMode`
- `includeChangeSpecs` (optional, default `false`) — when `true`, directly seeds `change.specIds` into the collected set. When `false`, direct seeding is skipped; the same specs may still be included through include patterns, `change.specDependsOn`, or `dependsOn` traversal.
- `followDeps` (optional, default `false`) — when `true`, performs the `dependsOn` transitive traversal (step 5 of context spec collection) to discover additional specs. When `false` or absent, traversal is skipped and only specs collected in steps 1-4 are included.
- `depth` (optional) — only valid when `followDeps` is `true`; limits `dependsOn` traversal to N levels deep (1 = direct dependencies only, 2 = deps of deps, etc.). When absent and `followDeps` is `true`, traversal is unlimited.
- `sections` (optional) — when present, restricts the metadata-derived content rendered for each full-mode spec in the output to the listed sections (`'rules'`, `'constraints'`, `'scenarios'`). When absent, full-mode specs are rendered from their artifact files rather than from metadata sections. `sections` applies only to full-mode spec content — it does not affect list-mode specs, summary-mode specs, project context entries, or available steps.
- `fingerprint` (optional) — when provided, `CompileContext` compares this value against the fingerprint it calculates from the current context inputs. If they match, the result's `status` field is set to `'unchanged'` and the full context is not assembled. If omitted or the fingerprint does not match, `status` is `'changed'` and the full context is returned with the new fingerprint.

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

`CompileContext` must collect the set of specs to include in the context by applying the five-step resolution defined in [`specs/core/config/spec.md` — Requirement: Context spec selection](../config/spec.md) on top of an optional change-scoped seed set.

Before steps 1-5 begin, `CompileContext` seeds the collected set with:

- every spec in `change.specIds`, only when `includeChangeSpecs: true`
- every spec that appears as a value in `change.specDependsOn`

Specs seeded from `change.specIds` because `includeChangeSpecs: true` are mandatory context members for that call and MUST remain in the collected set even when later project-level or workspace-level exclude rules would otherwise match them. When `includeChangeSpecs` is `false` or absent, `change.specIds` are not mandatory seeds, but they may still be included if selected by project-level include patterns, workspace-level include patterns, `change.specDependsOn`, or `dependsOn` traversal.

After seeding, `CompileContext` applies the five-step resolution:

1. **Project-level include patterns** — always applied, regardless of which workspaces are active.
2. **Project-level exclude patterns** — always applied; removes specs matched by any project-level exclude pattern from the accumulated set, except mandatory `change.specIds` seed entries from this call.
3. **Workspace-level include patterns** — applied only for workspaces active in the current change (a workspace is active if any of its spec IDs appears in `change.specIds`).
4. **Workspace-level exclude patterns** — applied only for active workspaces; removes further specs from the set, except mandatory `change.specIds` seed entries from this call.
5. **`dependsOn` traversal** — only performed when `followDeps: true` is passed. Starting from `change.specIds`, `CompileContext` resolves each spec's metadata `dependsOn` entries via `SpecRepository.metadata()`, then follows links transitively until no new specs are discovered or the `depth` limit is reached. Specs added in this step are **not** subject to the exclude rules from steps 2 or 4. When `followDeps` is `false` or absent, this step is skipped entirely. This works in all change states (designing, ready, implementing, etc.) — it is not gated on reaching `ready`.

When a spec in the traversal has no metadata, `CompileContext` emits a `missing-metadata` warning identifying the spec and suggesting metadata generation. Traversal continues with any `dependsOn` information available from the change manifest's `specDependsOn` or from content extraction via the schema's `metadataExtraction` declarations.

The final collected set is deduplicated across all seed and traversal sources. A spec matched by multiple include patterns appears exactly once, at the position of the first matching include pattern. Specs added via `dependsOn` traversal that were already included earlier also appear once, at their earlier position.

### Requirement: Context display modes

After collecting all context specs (steps 1-5), `CompileContext` MUST classify each spec for rendering based on `config.contextMode`. The accepted display modes are `list`, `summary`, `full`, and `hybrid`. When `config.contextMode` is absent, `summary` is used.

**When `contextMode` is `'list'`:**

- All collected specs are emitted as list entries.
- Entries include the spec ID, source, and mode, but no description or full content.
- `sections` filters have no effect.

**When `contextMode` is `'summary'`:**

- All collected specs are emitted as summary entries.
- Entries include spec ID, title, description, source, and mode, but no full content.
- `sections` filters have no effect.

**When `contextMode` is `'full'`:**

- All collected specs are rendered with full content.
- `sections` filters restrict full content to the requested metadata sections.

**When `contextMode` is `'hybrid'`:**

- Specs included directly from `change.specIds` with `includeChangeSpecs: true` are rendered with full content.
- All other collected specs are rendered as summary entries.
- `sections` filters apply only to the full entries.

Display-mode classification MUST happen after the full collection pipeline (steps 1-5) completes and before rendering. The `hybrid` mode preserves the previous tiered behavior, except that direct change-spec inclusion is controlled by `includeChangeSpecs`.

### Requirement: dependsOn resolution order

For each spec in Step 5, `dependsOn` is resolved using a three-tier fallback:

1. `change.specDependsOn[specId]` — per-spec dependencies declared in the change manifest (highest priority)
2. Metadata `dependsOn` field — the persisted metadata loaded via `SpecRepository.metadata()`
3. Schema `metadataExtraction` engine — extracts `dependsOn` from spec content when metadata is absent or stale, using the shared extractor-transform registry and caller-owned origin context bag

The first tier that returns a non-empty result is used. If all tiers return empty, the spec is treated as having no dependencies.

### Requirement: Cycle detection during dependsOn traversal

During step 5, if `CompileContext` detects a cycle in the `dependsOn` graph (spec A depends on spec B which depends back on spec A), it must break the cycle and stop following the repeated edge. It must not enter an infinite loop. All specs that can be reached without traversing the repeated edge are still included.

A detected cycle is an internal traversal condition, not a user-facing warning. `CompileContext` must not emit a warning solely because a `dependsOn` cycle exists.

### Requirement: Staleness detection and content fallback

Whenever `CompileContext` needs structured metadata-derived content for a spec — summary fields (`title`, `description`) or section-filtered full content (`rules`, `constraints`, `scenarios`) — it must check whether the spec's metadata exists (via `SpecRepository.metadata()`) and whether its `contentHashes` are fresh (all required artifact file hashes match the recorded values).

- **Fresh metadata** — use the structured content from metadata (`rules`, `constraints`, `scenarios`, `description`).
- **Stale or absent metadata** — fall back to live extraction from the spec's artifact files using the schema's `metadataExtraction` declarations, the shared extractor-transform registry, and caller-owned origin context for each artifact. Emit a warning identifying the spec path so the caller knows metadata should be regenerated.

For specs in `change.specIds`, when `CompileContext` is rendering section-filtered full content and merged preview artifacts are available from `PreviewSpec`, the same metadata/extraction flow MUST operate over the merged artifact set rather than over the base spec files. This keeps merged previews and non-merged specs on the same rendering path for `sections`.

When `sections` is absent, full-mode spec content is rendered from ordered spec-scoped artifact files rather than from metadata sections. In that case metadata freshness does not control the full-content body, though metadata may still supply summary fields.

### Requirement: Step availability

`CompileContext` must evaluate whether the requested step is available for the current change. A step is available if all artifact IDs in the matching `workflow` entry's `requires` list (the entry whose `step` field equals the requested step name) have effective status `complete` or `skipped` via `change.effectiveStatus(type)`. A skipped optional artifact satisfies the requirement in the same way a completed artifact does.

If the step is not available (one or more required artifacts are neither `complete` nor `skipped`), `CompileContext` must include the availability status and the list of blocking artifacts in the result. It must not throw — unavailability is surfaced to the caller, not treated as an error.

### Requirement: Structured result assembly

`CompileContext` MUST assemble the result by producing three structured components rather than a single text string:

1. **Project context entries** (`projectContext: ProjectContextEntry[]`) — for each entry in `config.context` (in declaration order): resolve `instruction` values verbatim; resolve `file` values by reading the file at the given path relative to the `specd.yaml` directory. Missing files emit a warning and are skipped. Each entry is an object with:
   - `source` (`'instruction' | 'file'`) — the type of context entry
   - `path` (string, only for `file` entries) — the file path
   - `content` (string) — the rendered text content
2. **Spec entries** (`specs: ContextSpecEntry[]`) — for each spec in the collected context set, produce an entry with: specs MUST appear in stable collection order: direct `change.specIds` seeds for the call (when `includeChangeSpecs: true`), then `change.specDependsOn` seeds, then include-pattern matches in declaration order, then `dependsOn` traversal discoveries.
   - `specId` (string) — the fully-qualified spec ID (e.g. `core:core/compile-context`)
   - `title` (string, summary/full modes) — the spec title from metadata or extracted from the artifact set
   - `description` (string, summary/full modes) — the spec description from metadata (2–3 sentence summary)
   - `source` (`'specIds' | 'specDependsOn' | 'includePattern' | 'dependsOnTraversal'`) — how this spec was collected. When a spec qualifies through multiple sources, the highest-priority source wins: `specIds` > `specDependsOn` > `dependsOnTraversal` > `includePattern`.
   - `mode` (`'list' | 'summary' | 'full'`) — rendering shape for this entry according to `contextMode` and `includeChangeSpecs`
   - `content` (string, present only when `mode` is `'full'`) — the rendered spec content.

Full-mode rendering follows these rules:

- When `sections` is absent, `CompileContext` renders all artifacts whose schema `scope` is `spec` for that spec. If a file named `spec.md` exists, it is rendered first. All remaining spec-scoped artifact files are rendered after it in alphabetical order by filename.
- The rendered full content concatenates those files in display order and labels each file with its filename so multi-file specs remain readable.
- For specs in `change.specIds`, `CompileContext` uses the merged artifact set returned by `PreviewSpec` when available, preserving the same ordering rule (`spec.md` first if present, then alphabetical). If merged preview files are unavailable, it falls back to the base spec artifact set.
- When `sections` is present, `CompileContext` does not render raw artifact files. Instead it renders only the selected metadata-derived sections. For specs in `change.specIds`, those selected sections are extracted from the merged preview artifact set when available so merged deltas affect `rules`, `constraints`, and `scenarios` output. For all other specs, the selected sections come from fresh metadata or fallback extraction against the base artifact set.

3. **Available steps** (`availableSteps: AvailableStep[]`) — list all steps declared in the schema's `workflow[]`, each with:
   - `step` (string) — the step name
   - `available` (boolean) — whether the step is currently available
   - `blockingArtifacts` (string\[]) — artifact IDs blocking the step (empty if available)

### Requirement: Result shape

`CompileContextResult` MUST include:

- `contextFingerprint` — the calculated fingerprint for the emitted logical context
- `status` — `'changed'` or `'unchanged'`
- `stepAvailable` — whether the requested lifecycle step is available
- `blockingArtifacts` — artifact IDs blocking the requested step
- `projectContext` — rendered project context entries
- `specs` — ordered context spec entries
- `availableSteps` — all workflow steps with availability status
- `warnings` — stale metadata warnings and advisory conditions

Each spec entry MUST include `specId`, `source`, and `mode`. `mode` is one of `'list'`, `'summary'`, or `'full'`. Summary and full entries include `title` and `description`; list entries do not require them. Full entries include `content`; list and summary entries MUST NOT include `content`.

`contextMode`, `includeChangeSpecs`, `followDeps`, `depth`, `sections`, warnings, available steps, project context entries, and emitted specs are part of the logical context and MUST affect the fingerprint when they change. Presentation-only flags such as `--format` MUST NOT affect the fingerprint.

### Requirement: Missing spec IDs emit a warning

If a spec ID from an include pattern or `dependsOn` reference does not exist in the corresponding `SpecRepository`, `CompileContext` must emit a warning identifying the missing spec ID and skip it — no error is thrown. This allows the context to be compiled even when specs are temporarily absent, while making the gap visible.

### Requirement: Unknown workspace qualifiers emit a warning

If a pattern or `dependsOn` entry references a workspace name that has no corresponding `SpecRepository` in the `specs` map (e.g. `billing:auth/*` when `billing` was not wired at bootstrap), `CompileContext` must emit a warning and skip the path. It must not throw.

### Requirement: Context fingerprint

`CompileContext` calculates a fingerprint that uniquely identifies the current compiled context state. The fingerprint is a SHA-256 hash of a canonicalized representation of the complete logical output that `CompileContext` would emit when `status` is `'changed'`.

The canonicalized fingerprint input MUST include every emitted field whose value affects the compiled context seen by callers, including:

- step availability (`stepAvailable`, `blockingArtifacts`)
- rendered project context entries
- rendered spec entries, including their resolved `source`, `mode`, summary fields, and full content when present
- available workflow steps and their blocking artifacts
- emitted warnings

The fingerprint must therefore change whenever the compiled result changes, including changes caused by `change.specIds`, `change.specDependsOn`, include/exclude resolution, dependency traversal, metadata freshness, rendered content fallback, workflow availability, or any execution flag that changes the logical result (for example `followDeps`, `depth`, or `sections`).

The fingerprint MUST remain format-agnostic. Differences in CLI presentation format such as `text`, `json`, or `toon` do not affect the fingerprint when the logical compiled context is otherwise identical.

When `fingerprint` is provided to `execute()`:

- If `fingerprint` matches the calculated fingerprint, `status` is `'unchanged'` and the context is not assembled into the returned `projectContext` and `specs` arrays.
- If `fingerprint` does not match or is omitted, `status` is `'changed'` and the full context is assembled and returned.

The fingerprint enables clients to skip re-fetching unchanged context without comparing the full output themselves.

## Constraints

- Project `context` entries always appear first in `projectContext`, before spec entries
- Missing `file` references in `context` emit a warning and are skipped — no error
- Steps 1-4 (include/exclude patterns) are applied before `dependsOn` traversal (step 5)
- Specs added via `dependsOn` traversal are never removed by exclude rules
- A spec always appears at most once in the `specs` array, classified by its highest-priority source
- `CompileContext` MUST NOT perform direct filesystem reads — all file access goes through `SpecRepository` (for spec files and metadata) or `FileReader` (for `config.context` file entries)
- The caller resolves the config and constructs all `SpecRepository` and `FileReader` instances before calling the constructor
- The `specs` map must contain one entry per workspace declared in `specd.yaml`; workspaces missing from the map produce a warning, not an error
- Artifact instructions, rules, and delta context are NOT part of the result — they are retrieved via `GetArtifactInstruction`
- `instruction:` hook entries are NOT part of the result — they are retrieved via `GetHookInstructions`
- `dependsOn` traversal is opt-in via `followDeps: true`; when absent or `false`, step 5 is skipped entirely
- `depth` is only meaningful when `followDeps: true`; it limits traversal levels (1 = direct deps only)
- `sections` applies only to full-mode spec content rendering; summary-mode specs, project context entries, and available steps are unaffected
- Cycle detection is mandatory — cycles in `dependsOn` must not cause infinite loops
- Fresh metadata (via `SpecRepository.metadata()`) is always preferred; the `metadataExtraction` fallback is only used when metadata is absent or stale
- `contextMode` supports `list`, `summary`, `full`, and `hybrid`; when omitted, `summary` is used
- In `hybrid`, only direct `change.specIds` entries included via `includeChangeSpecs: true` are full; other collected specs remain summaries
- `PreviewSpec` errors MUST NOT block context compilation — `CompileContext` falls back to base content on any preview failure

## Examples

### Context compilation for any step

```typescript
const result = await compileContext.execute({
  name: 'add-auth-flow',
  step: 'designing',
  includeChangeSpecs: true,
  config: {
    context: [
      { file: 'specd-bootstrap.md' },
      { instruction: 'Always prefer editing existing files over creating new ones.' },
    ],
    contextIncludeSpecs: ['default:*'],
    contextExcludeSpecs: [],
    contextMode: 'hybrid',
    workspaces: {
      default: { contextIncludeSpecs: ['*'], contextExcludeSpecs: [] },
    },
  },
})
// result.stepAvailable: true (designing has no requires)
// result.projectContext: [{ source: 'file', path: 'specd-bootstrap.md', content: '...' }, ...]
// result.specs: [
//   { specId: 'default:auth/login', title: '...', source: 'specIds', mode: 'full', content: '...' },
//   { specId: 'default:_global/architecture', title: '...', source: 'includePattern', mode: 'summary', description: '...' },
// ]
// result.availableSteps: [{ step: 'designing', available: true, blockingArtifacts: [] }, ...]
```

## Spec Dependencies

- [`core:core/change`](../change/spec.md) — Change entity, `effectiveStatus`, active workspaces
- [`core:core/config`](../config/spec.md) — 5-step context spec resolution, include/exclude patterns, workspace-level patterns
- [`core:core/spec-metadata`](../spec-metadata/spec.md) — `.specd-metadata.yaml` format, `dependsOn` traversal, staleness detection
- [`core:core/schema-format`](../schema-format/spec.md) — `metadataExtraction` (fallback path), `workflow`
- [`core:core/delta-format`](../delta-format/spec.md) — `ArtifactParser` port (for metadataExtraction fallback)
- [`core:core/selector-model`](../selector-model/spec.md) — selector fields used in `metadataExtraction` extractors
- [`core:core/spec-id-format`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` format, parsing rules for `specIds`
- [`core:core/workspace`](../workspace/spec.md) — active workspace determination, workspace-level context patterns, port-per-workspace pattern
- [`core:core/get-artifact-instruction`](../get-artifact-instruction/spec.md) — artifact instructions (separate concern)
- [`core:core/get-hook-instructions`](../get-hook-instructions/spec.md) — step hook instructions (separate concern)
- [`core:core/preview-spec`](../preview-spec/spec.md) — delta merge for materialized spec views in context
