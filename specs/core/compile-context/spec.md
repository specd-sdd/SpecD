# CompileContext

## Purpose

AI agents entering a lifecycle step need relevant spec content and project context to understand the codebase they're working with — assembling this from scattered sources manually would be error-prone and inconsistent. `CompileContext` automates this assembly: it collects context specs according to the project's include/exclude configuration, reads structured metadata via `SpecRepository.metadata()`, and combines project context entries and spec content into a single structured output. Lifecycle state and readiness are separate concerns retrieved through `GetStatus`. Artifact instructions and step hook instructions are separate concerns retrieved via `GetArtifactInstruction` and `GetHookInstructions` respectively.

## Requirements

### Requirement: Ports and constructor

`CompileContext` receives at construction time: `ChangeRepository`, `ListWorkspaces`, `SchemaProvider`, `FileReader`, `ArtifactParserRegistry`, `ContentHasher`, `PreviewSpec`, `GetSpecMetadata`, and a yaml-derived `CompileContextConfig` default snapshot.

```typescript
class CompileContext {
  constructor(
    changes: ChangeRepository,
    listWorkspaces: ListWorkspaces,
    schemaProvider: SchemaProvider,
    files: FileReader,
    parsers: ArtifactParserRegistry,
    hasher: ContentHasher,
    previewSpec: PreviewSpec,
    getMetadata: GetSpecMetadata,
    defaultConfig: CompileContextConfig,
  )
}
```

The `defaultConfig` value MUST be produced from the resolved `SpecdConfig` at kernel composition time (via the internal composition helper). It MUST include project-level `context`, `contextIncludeSpecs`, `contextExcludeSpecs`, per-workspace context patterns, `projectRoot`, and `configPath`. It MUST NOT include per-call runtime overrides such as `contextMode` or `llmOptimizedContext` unless those are the yaml defaults.

`SchemaProvider` is a lazy, caching port that returns the fully-resolved schema (with plugins and overrides applied). It replaces the previous `SchemaRegistry` + `schemaRef` + `workspaceSchemasPaths` triple. All are injected at kernel composition time, not passed per invocation.

`PreviewSpec` is the use case `CompileContext` delegates to when it needs a materialized merged view of a spec with validated deltas applied. `ContentHasher` is used for context fingerprint inputs. `GetSpecMetadata` is the use case `CompileContext` delegates to whenever it needs usable normalized or optimized content for a spec that is actually included in the compiled context — it replaces direct `SpecRepository.metadata()` freshness checks with the shared self-healing materialization contract (`policy: 'if-needed'`).

`CompileContext` MUST NOT accept `LifecycleEngine` or `ImplementationDetector`, evaluate lifecycle availability, or invoke implementation autodetection. It MUST NOT call `SpecRepository.readMetadataSnapshot()` directly — that method is reserved for materialization and diagnostics.

### Requirement: Input

`CompileContext.execute` receives:

- `name` — the change name to compile context for
- `step` — the lifecycle step being entered (e.g. `'designing'`, `'implementing'`, `'verifying'`, `'archiving'`); it identifies the requested context entry point but MUST NOT cause lifecycle readiness to be evaluated or returned
- `contextMode` (optional) — runtime override for display mode (`'list'`, `'summary'`, `'full'`, `'hybrid'`). When absent, the baked default from construction is used.
- `llmOptimizedContext` (optional) — runtime override for whether optimized context is preferred. When absent, the baked default from construction is used.
- `includeChangeSpecs` (optional, default `false`) — when `true`, directly seeds `change.specIds` into the collected set. When `false`, direct seeding is skipped; the same specs may still be included through include patterns, `change.specDependsOn`, or `dependsOn` traversal.
- `followDeps` (optional, default `false`) — when `true`, performs the `dependsOn` transitive traversal (step 5 of context spec collection) to discover additional specs. When `false` or absent, traversal is skipped and only specs collected in steps 1-4 are included.
- `depth` (optional) — only valid when `followDeps` is `true`; limits `dependsOn` traversal to N levels deep (1 = direct deps only, 2 = deps of deps, etc.). When absent and `followDeps` is `true`, traversal is unlimited.
- `sections` (optional) — when present, restricts the metadata-derived content rendered for each full-mode spec in the output to the listed sections (`'rules'`, `'constraints'`, `'scenarios'`). When absent, full-mode specs are rendered from their artifact files rather than from metadata sections. `sections` applies only to full-mode spec content — it does not affect list-mode specs, summary-mode specs, or project context entries.
- `fingerprint` (optional) — when provided, `CompileContext` compares this value against the fingerprint it calculates from the current context inputs. If they match, the result's `status` field is set to `'unchanged'` and the full context is not assembled. If omitted or the fingerprint does not match, `status` is `'changed'` and the full context is returned with the new fingerprint.

`CompileContext.execute` MUST NOT accept a `config` field. Yaml-derived configuration is read from the construction-time default snapshot only.

### Requirement: Baked default configuration merge

At the start of `execute`, `CompileContext` MUST build the effective `CompileContextConfig` by shallow-merging the construction-time default snapshot with any runtime overrides present on the input:

- `contextMode` from input overrides the baked default when provided
- `llmOptimizedContext` from input overrides the baked default when provided
- all other `CompileContextConfig` fields (`context`, include/exclude patterns, per-workspace patterns, `projectRoot`, `configPath`) MUST come from the baked default unless a future change explicitly adds additional runtime override fields

Hosts MUST NOT pass yaml-derived configuration on each call. They pass runtime overrides only.

### Requirement: Caller-owned implementation tracking refresh

`CompileContext` MUST assemble context from the tracked implementation state already persisted on the change.

It MUST NOT invoke `ImplementationDetector` or merge detected files during context compilation. Callers that require fresh tracked files MUST invoke `RefreshImplementationTracking` before `CompileContext`.

### Requirement: Schema name guard

After resolving the schema from config, `CompileContext` must compare `schema.name()` with `change.schemaName`. If they differ, it must throw `SchemaMismatchError`. This must happen before any context collection or instruction assembly.

### Requirement: Workspace resolution for spec IDs

Every spec ID handled by `CompileContext` carries an explicit or implicit workspace qualifier:

- **Explicit qualifier** (e.g. `billing:auth/login`) — the workspace name before `:` is used to look up the corresponding `SpecRepository` in the active workspaces list.
- **No qualifier** (e.g. `auth/login`) — the workspace is inferred from context:
  - In include/exclude patterns at project level, an unqualified path resolves to `default`.
  - In include/exclude patterns at workspace level, an unqualified path resolves to that workspace.
  - In `dependsOn` entries from metadata, an unqualified path resolves to the same workspace as the spec that declared it.

If a pattern or `dependsOn` entry references a workspace name that has no entry in the active workspaces resolved via `ListWorkspaces`, `CompileContext` must emit a warning and skip that path. It must not throw.

### Requirement: Context spec collection

`CompileContext` must collect the set of specs to include in the context by applying the five-step resolution defined in [`specs/core/config/spec.md` — Requirement: Context spec selection](../config/spec.md) on top of an optional change-scoped seed set.

Before steps 1-5 begin, `CompileContext` seeds the collected set with:

- every spec in `change.specIds`, only when `includeChangeSpecs: true`
- every spec that appears as a value in `change.specDependsOn`

Specs seeded from `change.specIds` because `includeChangeSpecs: true` are mandatory context members for that call and MUST remain in the collected set even when later project-level or workspace-level exclude rules would otherwise match them. When `includeChangeSpecs` is `false` or absent, `change.specIds` are not mandatory seeds, but they may still be included if selected by project-level include patterns, workspace-level include patterns, `change.specDependsOn`, or `dependsOn` traversal.

After seeding, `CompileContext` applies the five-step resolution:

1. **Project-level include patterns** — start with specs matched by any project-level include pattern.
2. **Project-level exclude patterns** — always applied; removes specs matched by any project-level exclude pattern from the accumulated set, except mandatory `change.specIds` seed entries from this call.
3. **Workspace-level include patterns** — applied only for workspaces active in the current change (a workspace is active if any of its spec IDs appears in `change.specIds`).
4. **Workspace-level exclude patterns** — applied only for active workspaces; removes further specs from the set, except mandatory `change.specIds` seed entries from this call.
5. **`dependsOn` traversal** — only performed when `followDeps: true` is passed. Starting from `change.specIds`, `CompileContext` resolves each spec's dependency information using the resolution order defined in `Requirement: dependsOn resolution order`, then follows links transitively until no new specs are discovered or the `depth` limit is reached. Manifest-declared dependencies MUST be consulted before any repository access, so dependencies declared for change-scoped specs that are not yet persisted traverse transitively instead of being dropped. Specs added in this step are **not** subject to the exclude rules from steps 2 or 4. When `followDeps` is `false` or absent, this step is skipped entirely. This works in all change states (designing, ready, implementing, etc.) — it is not gated on reaching `ready`.

During traversal, a discovered spec MUST pass an existence check against the corresponding workspace `SpecRepository` BEFORE it is registered into the collected set: unresolvable discoveries are neither registered nor warned — they are skipped silently. Warnings for genuinely unresolvable references surface later through seeding or rendering paths.

When a persisted spec's metadata cannot be materialized at all during traversal, `CompileContext` emits a `missing-metadata` warning identifying the spec and continues with any dependency information available from the change manifest's `specDependsOn` or from schema extraction fallback when the schema declares `metadataExtraction.dependsOn`. Non-persisted specs never produce this warning merely for lacking persisted state.

When a spec in the traversal has stale metadata, `CompileContext` keeps the persisted canonical metadata result visible to the caller, emits a `stale-metadata` warning, and applies the dependency-resolution rules below without collapsing stale metadata into the same case as missing metadata.

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
- For specs in `change.specIds`, `title` and `description` MUST come from schema-driven extraction over the merged preview artifact set (see `Requirement: Extracted-first rendering for change-scoped specs`), falling back to the canonical metadata projection when the merged view is unavailable or yields nothing.
- `sections` filters have no effect.

**When `contextMode` is `'full'`:**

- All collected specs are rendered with full content.
- `sections` filters restrict full content to the requested metadata sections.

**When `contextMode` is `'hybrid'`:**

- Specs included directly from `change.specIds` with `includeChangeSpecs: true` are rendered with full content.
- All other collected specs are rendered as summary entries.
- `sections` filters apply only to the full entries.

Display-mode classification MUST happen after the full collection pipeline (steps 1-5) completes and before rendering. The `hybrid` mode preserves the previous tiered behavior, except that direct change-spec inclusion is controlled by `includeChangeSpecs`.

### Requirement: Extracted-first rendering for change-scoped specs

For every collected spec whose ID is in `change.specIds`, `CompileContext` MUST treat the merged artifact set produced by `PreviewSpec` (persisted artifacts plus validated deltas, including spec files that exist only inside the change directory) as the PRIMARY content source in every display mode except `list`. This applies in summary mode exactly as in full and hybrid modes.

Title, description, and section-filtered content for these specs MUST be obtained by running the schema's `metadataExtraction` engine over the merged artifact set — the same format-agnostic, selector-driven pipeline used for canonical metadata generation. Markdown-specific heuristics (such as H1 regular expressions) MUST NOT be used as the primary extractor.

The fallback ladder, applied in order, is:

1. Schema-driven extraction over the merged preview artifact set.
2. The canonical `GetSpecMetadata` projection (persisted, self-healing) — used when preview is unavailable, returns no files, or extraction yields no usable fields.
3. Schema-driven extraction over the base persisted artifact set — used when no merged view exists and the canonical projection is unusable.

While any rung of the ladder produces usable data, `CompileContext` MUST NOT emit metadata-absence warnings (`stale-metadata` or `missing-metadata`) for the spec. A spec that exists only inside the change therefore compiles cleanly without persisted metadata.

Lock-owned LLM optimizations MUST NOT be applied to change-scoped specs (see `Requirement: Prefer LLM-optimized context`).

### Requirement: dependsOn resolution order

For each spec in Step 5, `dependsOn` is resolved using a three-tier fallback:

1. `change.specDependsOn[specId]` — per-spec dependencies declared in the change manifest (highest priority). This tier MUST be consulted before any repository access, so dependencies declared for change-scoped specs that are not yet persisted resolve normally.
2. The canonical normalized dependency projection obtained by calling `GetSpecMetadata.execute({ specId })` — self-healing, so a missing or stale cache is regenerated rather than treated as a frozen stale snapshot.
3. Schema `metadataExtraction.dependsOn` engine — extracts `dependsOn` from spec content only when materialization cannot produce a projection at all and the schema declares dependency extraction, using the shared extractor-transform registry and caller-owned origin context bag. For change-scoped specs, extraction operates over the merged preview artifact set; for all other specs, over the base persisted artifact set.

The first tier that returns a non-empty result is used. If all tiers return empty, the spec is treated as having no dependencies.

### Requirement: Cycle detection during dependsOn traversal

During step 5, if `CompileContext` detects a cycle in the `dependsOn` graph (spec A depends on spec B which depends back on spec A), it must break the cycle and stop following the repeated edge. It must not enter an infinite loop. All specs that can be reached without traversing the repeated edge are still included.

A detected cycle is an internal traversal condition, not a user-facing warning. `CompileContext` must not emit a warning solely because a `dependsOn` cycle exists.

### Requirement: Staleness detection and content fallback

Whenever `CompileContext` needs structured metadata-derived content for a spec that is actually included in the compiled context — summary fields (`title`, `description`) or section-filtered full content (`rules`, `constraints`, `scenarios`) — it MUST follow the source rules defined in `Requirement: Extracted-first rendering for change-scoped specs` for specs in `change.specIds`, and obtain content via `GetSpecMetadata.execute({ specId })` with the default `'if-needed'` policy for all other specs — never by reading `SpecRepository.metadata()` and reasoning about freshness itself.

`CompileContext` only materializes specs it actually renders (it MUST NOT eagerly materialize every collected spec before display-mode classification narrows the set).

- When materialization returns `source: 'persisted'` with `regenerated: false`, `CompileContext` uses the returned structured content directly.
- When materialization regenerates the projection (`regenerated: true`) or falls back after a source-conflict retry, `CompileContext` still uses the returned in-memory projection — it is a valid, current projection by construction. Cache-miss regeneration is provenance information carried on the structured result (`source`, `regenerated`), NOT a warning condition: `CompileContext` MUST NOT emit a warning solely because a projection was regenerated. Only actionable materialization failures — such as `metadata-cache-write-failed` — are forwarded into the `warnings` array.
- When materialization cannot produce a valid projection at all (e.g. the schema has no `metadataExtraction` declarations and generation yields nothing), `CompileContext` emits a `missing-metadata` warning identifying the spec path and renders an empty/minimal entry for that spec rather than throwing. This warning MUST NOT fire while the extracted-first fallback ladder still yields usable data for change-scoped specs.

When `sections` is absent, full-mode spec content is rendered from ordered spec-scoped artifact files rather than from metadata sections. In that case metadata materialization is not required to render the full-content body, though a materialized projection may still supply summary fields.

### Requirement: Structured result assembly

`CompileContext` MUST assemble the result by producing two structured components rather than a single text string:

1. **Project context entries** (`projectContext: ProjectContextEntry[]`) — for each entry in `config.context` (in declaration order): resolve `instruction` values verbatim; resolve `file` values by reading the file at the given path relative to the `specd.yaml` directory. Missing files emit a warning and are skipped. Each entry is an object with:
   - `source` (`'instruction' | 'file'`) — the type of context entry
   - `path` (string, only for `file` entries) — the file path
   - `content` (string) — the rendered text content
2. **Spec entries** (`specs: ContextSpecEntry[]`) — for each spec in the collected context set, produce an entry with: specs MUST appear in stable collection order: direct `change.specIds` seeds for the call (when `includeChangeSpecs: true`), then `change.specDependsOn` seeds, then include-pattern matches in declaration order, then `dependsOn` traversal discoveries.
   - `specId` (string) — the fully-qualified spec ID (e.g. `core:compile-context`)
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

### Requirement: Result shape

`CompileContextResult` MUST include:

- `contextFingerprint` — the calculated fingerprint for the emitted logical context
- `status` — `'changed'` or `'unchanged'`
- `projectContext` — rendered project context entries
- `specs` — rendered context spec entries
- `warnings` — context-collection, metadata, or rendering warnings

It MUST NOT include lifecycle state, requested-step availability, blocking artifacts, or per-step availability. Consumers that need lifecycle information MUST use `GetStatus`.

### Requirement: Missing spec IDs emit a warning

If a spec ID selected by an include pattern or otherwise referenced during collection (outside `dependsOn` traversal) does not exist in the corresponding `SpecRepository`, `CompileContext` must emit a warning identifying the missing spec ID and skip it — no error is thrown. This allows the context to be compiled even when specs are temporarily absent, while making the gap visible.

Dependencies discovered during `dependsOn` traversal are governed by the traversal existence check (see `Requirement: Context spec collection`): unresolvable discoveries are skipped without registration and without a warning. References that reach rendering through seeding remain warned at rendering time when no content source can resolve them.

### Requirement: Unknown workspace qualifiers emit a warning

If a pattern or `dependsOn` entry references a workspace name that has no corresponding `SpecRepository` in the active workspaces resolved via `ListWorkspaces` (e.g. `billing:auth/*` when `billing` was not wired at bootstrap), `CompileContext` must emit a warning and skip the path. It must not throw.

### Requirement: Context fingerprint

`CompileContext` MUST calculate the fingerprint from the canonicalized emitted logical context: project context entries, spec entries, context diagnostics, and result-shaping inputs that change those emitted entries. It MUST NOT include lifecycle state, lifecycle availability, or lifecycle blockers. The requested step affects the fingerprint only when it changes emitted context, such as the effective section selection.

Because change-scoped spec entries are rendered from merged preview content, any edit to a change's deltas changes the emitted entries and therefore the fingerprint. A cached `'unchanged'` result MUST NOT survive delta modifications.

When `fingerprint` matches the current context fingerprint, the result's `status` MUST be `'unchanged'` and `projectContext` and `specs` MUST be empty arrays. Otherwise, the result's `status` MUST be `'changed'` and it MUST return the assembled context with the new fingerprint.

### Requirement: Prefer LLM-optimized context

If `llmOptimizedContext: true` is active in the project configuration, the context compiler SHALL prefer `optimizedContext` for each spec if it exists and is not empty. If missing or empty, it SHALL fall back to the standard `context`.

**Strict Bypass**: `optimizedContext` usage is strictly bypassed (forced to `false`) if `sections` is passed but does not include both `rules` and `constraints`. This is because the monolithic optimized context cannot be filtered by individual sections. If `scenarios` are requested while `optimizedContext` is active, the scenarios MUST still be extracted and appended to the result. `optimizedDescription` preference is unaffected by this bypass.

**Change-scope bypass**: for specs whose IDs appear in `change.specIds`, lock-owned optimizations (`optimizedContext` and `optimizedDescription`) MUST NOT be applied — they describe pre-change content by definition and the merged artifact set is authoritative. These specs render through the extracted-first ladder regardless of optimization freshness. This bypass is independent of the `sections` Strict Bypass and applies in every display mode.

### Requirement: Optimization warning signal

When `llmOptimizedContext` is enabled, optimization warnings are emitted ONLY for collected specs that are NOT in `change.specIds`. Two distinct conditions are distinguished as separate warning types:

- `missing-optimization` — the spec's lock-owned state records no optimization value for the field at all (never optimized).
- `stale-optimization` — an optimization is recorded but its artifact or schema baselines no longer match the current persisted artifacts (drifted after a content change).

Both warning messages MUST include remediation instructions: "Launch specd-spec-context-optimizer agent to refresh".

Specs inside `change.specIds` MUST NOT produce optimization warnings: their lock state is irrelevant while the change is in flight because optimizations are never applied to them.

### Requirement: Config-based factory delegates through resolveCompileContextDeps

The config-based `createCompileContext(config, options?)` form MUST derive `CompileContextDeps` through `resolveCompileContextDeps(resolver)` and then delegate to canonical `createCompileContext(deps)`.

`resolveCompileContextDeps(resolver)` MUST resolve:

- `changes: ChangeRepository`
- `listWorkspaces: ListWorkspaces`
- `schemaProvider: SchemaProvider`
- `files: FileReader`
- `parsers: ArtifactParserRegistry`
- `hasher: ContentHasher`
- `previewSpec: PreviewSpec`
- `getMetadata: GetSpecMetadata`
- `extractorTransforms: ExtractorTransformRegistry`
- `workspaceRoutes: readonly SpecWorkspaceRoute[]`
- `defaultConfig: CompileContextConfig`

It MUST NOT resolve `LifecycleEngine`.

The helper is the only use-case-specific composition entry for config-based bootstrap. The factory MUST NOT reconstruct fs-shaped wiring inline.

## Constraints

- Project `context` entries always appear first in `projectContext`, before spec entries
- Missing `file` references in `context` emit a warning and are skipped — no error
- Steps 1-4 (include/exclude patterns) are applied before `dependsOn` traversal (step 5)
- Specs added via `dependsOn` traversal are never removed by exclude rules
- A spec always appears at most once in the `specs` array, classified by its highest-priority source
- `CompileContext` MUST NOT perform direct filesystem reads — all file access goes through `SpecRepository` (for spec files and metadata) or `FileReader` (for `config.context` file entries)
- The caller resolves the config and constructs all `SpecRepository` and `FileReader` instances before calling the constructor
- The active workspaces resolved via `ListWorkspaces` must contain one entry per workspace declared in `specd.yaml`; workspaces missing from the active list produce a warning, not an error
- Artifact instructions, rules, and delta context are NOT part of the result — they are retrieved via `GetArtifactInstruction`
- `instruction:` hook entries are NOT part of the result — they are retrieved via `GetHookInstructions`
- `dependsOn` traversal is opt-in via `followDeps: true`; when absent or `false`, step 5 is skipped entirely
- `depth` is only meaningful when `followDeps: true`; it limits traversal levels (1 = direct deps only)
- `sections` applies only to full-mode spec content rendering; summary-mode specs and project context entries are unaffected
- Cycle detection is mandatory — cycles in `dependsOn` must not cause infinite loops
- For specs outside `change.specIds`, fresh canonical metadata is preferred; the `metadataExtraction` fallback is only used when metadata is absent or stale. For specs inside `change.specIds`, schema-driven extraction over the merged preview set is the primary source (extracted-first), with canonical metadata as fallback
- `contextMode` supports `list`, `summary`, `full`, and `hybrid`; when omitted, `summary` is used
- In `hybrid`, only direct `change.specIds` entries included via `includeChangeSpecs: true` are full; other collected specs remain summaries
- `PreviewSpec` errors MUST NOT block context compilation — `CompileContext` falls back to base content on any preview failure

## Examples

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
// result.contextFingerprint: 'sha256:...'
// result.status: 'changed'
// result.projectContext: [{ source: 'file', path: 'specd-bootstrap.md', content: '...' }, ...]
// result.specs: [
//   { specId: 'default:auth/login', title: '...', source: 'specIds', mode: 'full', content: '...' },
//   { specId: 'default:_global/architecture', title: '...', source: 'includePattern', mode: 'summary', description: '...' },
// ]
// result.warnings: []
```

## Spec Dependencies

- [`core:change`](../change/spec.md)
- [`core:config`](../config/spec.md)
- [`core:spec-metadata`](../spec-metadata/spec.md)
- [`core:schema-format`](../schema-format/spec.md)
- [`core:delta-format`](../delta-format/spec.md)
- [`core:selector-model`](../selector-model/spec.md)
- [`core:content-extraction`](../content-extraction/spec.md) — format-agnostic extraction engine that backs extracted-first rendering for change-scoped specs
- [`core:spec-id-format`](../spec-id-format/spec.md)
- [`core:workspace`](../workspace/spec.md)
- [`core:get-artifact-instruction`](../get-artifact-instruction/spec.md)
- [`core:get-hook-instructions`](../get-hook-instructions/spec.md)
- [`core:preview-spec`](../preview-spec/spec.md)
- [`core:refresh-implementation-tracking`](../refresh-implementation-tracking/spec.md)
- [`core:project-metadata`](../project-metadata/spec.md)
- [`core:get-spec-metadata`](../get-spec-metadata/spec.md) — self-healing metadata read (`if-needed`) used instead of direct repository freshness checks
- [`core:spec-optimization`](../spec-optimization/spec.md) — per-field optimization freshness backing the optimization warning signals
- [`core:composition-resolver`](../composition-resolver/spec.md)
