# CompileContext

## Overview

`CompileContext` is the application use case that assembles the instruction block an AI agent receives when entering a lifecycle step of a change. It collects context specs according to the project's include/exclude configuration, reads structured metadata from each spec's `.specd-metadata.yaml`, evaluates step availability, and combines schema instructions, artifact rules, spec content, and step hooks into a single structured output.

## Requirements

### Requirement: Ports and constructor

`CompileContext` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `SchemaRegistry`, `FileReader`, `ArtifactParserRegistry`, `schemaRef`, and `workspaceSchemasPaths`.

```typescript
class CompileContext {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    files: FileReader,
    parsers: ArtifactParserRegistry,
    schemaRef: string,
    workspaceSchemasPaths: ReadonlyMap<string, string>,
  )
}
```

`schemaRef` is the schema reference string from `specd.yaml`. `workspaceSchemasPaths` is the resolved workspace-to-schemas-path map, passed through to `SchemaRegistry.resolve()`. Both are injected at kernel composition time, not passed per invocation.

`ArtifactParserRegistry` is a map from format name (`'markdown'`, `'json'`, `'yaml'`, `'plaintext'`) to the corresponding `ArtifactParser` adapter. `CompileContext` uses it to look up the correct adapter when injecting delta context for a delta-capable artifact.

`specs` is keyed by workspace name (e.g. `'default'`, `'billing'`). The bootstrap layer constructs one `SpecRepository` instance per workspace declared in `specd.yaml` and passes them all here. `CompileContext` does not create or configure repositories — it only reads from them.

Each `SpecRepository` in the map must have been constructed with the matching `RepositoryConfig.workspace` value so that `repo.workspace()` returns the same key used in the map.

`FileReader` is the port used to read arbitrary files by absolute path — used for resolving `config.context[].file` entries. It returns the file content as a string, or `null` if the file does not exist. The bootstrap layer constructs it bound to the project root (the directory containing `specd.yaml`). `CompileContext` does not perform direct filesystem reads.

### Requirement: Input

`CompileContext.execute` receives:

- `name` — the change name to compile context for
- `step` — the lifecycle step name being entered (e.g. `'designing'`, `'implementing'`, `'verifying'`, `'archiving'`)
- `activeArtifact` (optional) — the artifact ID currently active in the step's iteration. Only applicable to the `designing` step, which traverses the artifact DAG and calls `CompileContext` once per artifact being created. Steps after `ready` (`implementing`, `verifying`, `archiving`) do not use this field — their artifacts already exist by that point. When present, only this artifact's `instruction` and `artifactRules` are injected. When absent, no artifact instructions are injected.
- `config` — the resolved project configuration containing `context`, `contextIncludeSpecs`, `contextExcludeSpecs`, `artifactRules`, `workflow`, and per-workspace `contextIncludeSpecs` / `contextExcludeSpecs`
- `followDeps` (optional, default `false`) — when `true`, performs the `dependsOn` transitive traversal (step 5 of context spec collection) to discover additional specs. When `false` or absent, traversal is skipped and only specs collected in steps 1–4 are included.
- `depth` (optional) — only valid when `followDeps` is `true`; limits `dependsOn` traversal to N levels deep (1 = direct dependencies only, 2 = deps of deps, etc.). When absent and `followDeps` is `true`, traversal is unlimited.
- `sections` (optional) — when present, restricts the metadata content rendered for each spec in the output to the listed sections (`'rules'`, `'constraints'`, `'scenarios'`). When absent, all available sections are rendered (description + rules + constraints + scenarios). `sections` applies only to spec content (step 5 of the assembled instruction block) — it does not affect schema instructions, delta context, artifact rules, step hooks, or available steps.

### Requirement: Schema name guard

After resolving the schema from config, `CompileContext` must compare `schema.name()` with `change.schemaName`. If they differ, it must throw `SchemaMismatchError`. This must happen before any context collection or instruction assembly.

### Requirement: Workspace resolution for spec IDs

Every spec ID handled by `CompileContext` carries an explicit or implicit workspace qualifier:

- **Explicit qualifier** (e.g. `billing:auth/login`) — the workspace name before `:` is used to look up the corresponding `SpecRepository` in the map.
- **No qualifier** (e.g. `auth/login`) — the workspace is inferred from context:
  - In include/exclude patterns at project level, an unqualified path resolves to `default`.
  - In include/exclude patterns at workspace level, an unqualified path resolves to that workspace.
  - In `dependsOn` entries from `.specd-metadata.yaml`, an unqualified path resolves to the same workspace as the spec that declared it.

If a pattern or `dependsOn` entry references a workspace name that has no entry in the `specs` map, `CompileContext` must emit a warning and skip that path. It must not throw.

### Requirement: Context spec collection

`CompileContext` must collect the set of specs to include in the context by applying the five-step resolution defined in [`specs/core/config/spec.md` — Requirement: Context spec selection](../config/spec.md). The steps are:

1. **Project-level include patterns** — always applied, regardless of which workspaces are active.
2. **Project-level exclude patterns** — always applied; removes specs matched by any project-level exclude pattern from the accumulated set.
3. **Workspace-level include patterns** — applied only for workspaces active in the current change (a workspace is active if any of its spec IDs appears in `change.specIds`).
4. **Workspace-level exclude patterns** — applied only for active workspaces; removes further specs from the set.
5. **`dependsOn` traversal** — only performed when `followDeps: true` is passed. Starting from `change.specIds`, `CompileContext` resolves each spec's `.specd-metadata.yaml` `dependsOn` entries, then follows links transitively until no new specs are discovered or the `depth` limit is reached. Specs added in this step are **not** subject to the exclude rules from steps 2 or 4. When `followDeps` is `false` or absent, this step is skipped entirely. This works in all change states (designing, ready, implementing, etc.) — it is not gated on reaching `ready`.

A spec matched by multiple include patterns appears exactly once, at the position of the first matching include pattern. Specs added via `dependsOn` traversal that were already included in steps 1–4 also appear once (at their earlier position).

### Requirement: Cycle detection during dependsOn traversal

During step 5, if `CompileContext` detects a cycle in the `dependsOn` graph (spec A depends on spec B which depends back on spec A), it must break the cycle and emit a warning. It must not enter an infinite loop. All specs that can be reached without traversing the cycle are still included.

### Requirement: Staleness detection and content fallback

For every spec in the collected context set, `CompileContext` must check whether the spec's `.specd-metadata.yaml` exists and whether its `contentHashes` are fresh (all required artifact file hashes match the recorded values).

- **Fresh metadata** — use the structured content from `.specd-metadata.yaml` (`rules`, `constraints`, `scenarios`, `description`).
- **Stale or absent metadata** — fall back to the full raw content of the spec's artifact files. Emit a warning identifying the spec path so the caller knows metadata should be regenerated.

Staleness is advisory — it never blocks context compilation. The fallback ensures the context is always assembled, even for specs whose metadata has not yet been generated.

### Requirement: Step availability

`CompileContext` must evaluate whether the requested step is available for the current change. A step is available if all artifact IDs in the matching `workflow` entry's `requires` list (the entry whose `step` field equals the requested step name) have effective status `complete` or `skipped` via `change.effectiveStatus(type)`. A skipped optional artifact satisfies the requirement in the same way a completed artifact does.

If the step is not available (one or more required artifacts are neither `complete` nor `skipped`), `CompileContext` must include the availability status and the list of blocking artifacts in the result. It must not throw — unavailability is surfaced to the caller, not treated as an error.

### Requirement: Assembled instruction block

`CompileContext` must assemble the instruction block by combining the following components in order:

1. **Project context entries** — for each entry in `config.context` (in declaration order): resolve `instruction` values verbatim; resolve `file` values by reading the file at the given path relative to the `specd.yaml` directory and injecting its content verbatim. Missing files emit a warning and are skipped. This block appears before all other content.

2. **Schema instruction** — if `activeArtifact` is present, include that artifact's `instruction` field from the schema if present. If `activeArtifact` is absent, no artifact instruction is injected.

3. **Delta context** — if `activeArtifact` is present and the artifact has `delta: true`, inject three sub-blocks in order:
   - **Format instructions** — call `parsers.get(artifact.format).deltaInstructions()` and inject the result verbatim. This explains selector syntax, op semantics, `content` vs `value`, file location (`deltas/<workspace>/<capability-path>/<filename>.delta.yaml`), and includes a concrete format-specific example.
   - **Domain instructions** — inject the artifact's `deltaInstruction` field if present. This describes which domain concepts (requirements, scenarios, etc.) to add, modify, or remove.
   - **Existing artifact outlines** — for each spec ID in `change.specIds`, read the corresponding artifact file from the `SpecRepository` for that workspace, parse it via `ArtifactParser.parse()`, call `outline(ast)`, and inject the result as a compact, labelled structure. If the file does not exist (new spec, not yet modified), skip it silently. This block is omitted entirely if no existing artifacts are found.

4. **Project artifact rules** — if `activeArtifact` is present and it appears in `config.artifactRules`, append the rule strings as a distinct constraints block below the schema instruction. Rules from `artifactRules` are additive — they do not replace the schema instruction.

5. **Spec content** — for each spec in the collected context set, include its content using the following strategy. When `sections` is present, only the listed sections are rendered; when absent, all available sections are included (description + rules + constraints + scenarios).
   - If `.specd-metadata.yaml` exists and is fresh: include the requested sections from the metadata. This is the compact, machine-optimised representation.
   - If metadata is absent or stale: fall back to extracting nodes declared in the artifact's `contextSections[]` from the spec's artifact files (loaded via `SpecRepository.artifact()`). For each entry: parse the artifact file via `ArtifactParser.parse()`, apply the `selector` to find matching nodes, extract content per `extract` (`content` → `parser.renderSubtree(node)`; `label` → `node.label`; `both` → label + serialized content), and inject the result labelled with `role` and titled with `contextTitle` (falling back to `node.label`). Only entries whose `role` matches a requested section are included when `sections` is present. Entries whose selector matches no node are silently skipped. Emit a staleness warning for this spec.

6. **Step hooks** — for the requested step, include all `instruction:` entries from the matching workflow step's `hooks.pre` and `hooks.post`, in declaration order (schema hooks before project-level hooks). Each entry is prefixed with `[pre]` or `[post]` according to its hook list. `run:` entries are not included — they are executed at archive time, not injected as AI context.

7. **Available steps** — list all steps declared in the schema's `workflow[]`, each annotated with whether it is currently available. Unavailable steps must name the blocking artifacts.

### Requirement: Result shape

`CompileContext.execute` must return a result object. The result must include:

- `stepAvailable: boolean` — whether the requested step is currently available
- `blockingArtifacts: string[]` — artifact IDs blocking the step (empty if available)
- `instructionBlock: string` — the fully assembled instruction text to inject into the AI context
- `warnings: ContextWarning[]` — stale metadata warnings and any other advisory conditions

`CompileContext` must not throw on availability failures. It must throw on `ChangeNotFoundError` (change not found) and on schema resolution errors.

### Requirement: Missing spec IDs emit a warning

If a spec ID from an include pattern or `dependsOn` reference does not exist in the corresponding `SpecRepository`, `CompileContext` must emit a warning identifying the missing spec ID and skip it — no error is thrown. This allows the context to be compiled even when specs are temporarily absent, while making the gap visible.

### Requirement: Unknown workspace qualifiers emit a warning

If a pattern or `dependsOn` entry references a workspace name that has no corresponding `SpecRepository` in the `specs` map (e.g. `billing:auth/*` when `billing` was not wired at bootstrap), `CompileContext` must emit a warning and skip the path. It must not throw.

## Constraints

- Project `context` entries (step 1) always appear first in the instruction block, before schema instructions and spec content
- Missing `file` references in `context` emit a warning and are skipped — no error
- Steps 1–4 (include/exclude patterns) are applied before `dependsOn` traversal (step 5)
- Specs added via `dependsOn` traversal are never removed by exclude rules
- A spec always appears at most once in the context output, at the position of the first include
- `CompileContext` must not perform direct filesystem reads — all file access goes through `SpecRepository` (for spec files) or `FileReader` (for `config.context` file entries)
- The caller resolves the config and constructs all `SpecRepository` and `FileReader` instances before calling the constructor
- The `specs` map must contain one entry per workspace declared in `specd.yaml`; workspaces missing from the map produce a warning, not an error
- Artifact instructions, delta context, and `artifactRules` are included only when `activeArtifact` is provided — and only for that artifact
- Delta context (format instructions + domain instructions + outlines) is injected only when `activeArtifact` has `delta: true`
- Existing artifact outlines are injected per spec ID in `change.specIds`; missing files are silently skipped
- `ArtifactParserRegistry` must contain an adapter for every `format` value declared in the schema's artifacts; a missing adapter must emit a warning and skip the delta context block — no error
- Step hooks (`pre`/`post`) fire once per step, not once per artifact iteration
- `instruction:` hook entries are included in the compiled output, each prefixed with `[pre]` or `[post]`; `run:` hook entries are not
- `dependsOn` traversal is opt-in via `followDeps: true`; when absent or `false`, step 5 is skipped entirely
- `depth` is only meaningful when `followDeps: true`; it limits traversal levels (1 = direct deps only)
- `sections` applies only to spec content rendering; schema instructions, delta context, artifact rules, step hooks, and available steps are unaffected
- Cycle detection is mandatory — cycles in `dependsOn` must not cause infinite loops
- Metadata-based content (fresh `.specd-metadata.yaml`) is always preferred; the `contextSections` fallback is only used when metadata is absent or stale

## Examples

### Context compilation for the `designing` step — active artifact iteration

```typescript
// Called once per artifact in the DAG traversal. Here: designing the `spec` artifact.
const result = await compileContext.execute({
  name: 'add-auth-flow',
  step: 'designing',
  activeArtifact: 'spec',
  config: {
    context: [
      { file: 'specd-bootstrap.md' },
      { instruction: 'Always prefer editing existing files over creating new ones.' },
    ],
    contextIncludeSpecs: ['default:*'],
    contextExcludeSpecs: [],
    artifactRules: {
      spec: ['All requirements must use normative language (SHALL/MUST)'],
    },
    workflow: [],
    workspaces: {
      default: { contextIncludeSpecs: ['*'], contextExcludeSpecs: [] },
    },
  },
})
// result.stepAvailable: true (designing has no requires)
// result.instructionBlock: project context + spec instruction + spec artifactRules + spec content + step hooks

// Next iteration: designing the `tasks` artifact (requires: [spec] — spec is now complete)
const result2 = await compileContext.execute({
  name: 'add-auth-flow',
  step: 'designing',
  activeArtifact: 'tasks',
  // ...same config
})
```

### Context compilation for the `implementing` step — no active artifact

```typescript
// No activeArtifact: implementing has no artifact-by-artifact loop.
const result = await compileContext.execute({
  name: 'add-auth-flow',
  step: 'implementing',
  config: {
    /* ... */
  },
})
// result.instructionBlock: project context + spec content + step hooks (no artifact instruction)
```

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, `effectiveStatus`, active workspaces
- [`specs/core/config/spec.md`](../config/spec.md) — 5-step context spec resolution, include/exclude patterns, workspace-level patterns, `artifactRules`, workflow hooks
- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — `.specd-metadata.yaml` format, `dependsOn` traversal, staleness detection
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `contextSections` (fallback path), `workflow`, `instruction`, `delta`, `format`, `deltaInstruction`
- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — `ArtifactParser` port, `deltaInstructions()`, `outline()`
- [`specs/core/selector-model/spec.md`](../selector-model/spec.md) — selector fields used in `contextSections[]`
- [`specs/core/spec-id-format/spec.md`](../spec-id-format/spec.md) — canonical `workspace:capabilityPath` format, parsing rules for `specIds`
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — active workspace determination, workspace-level context patterns, port-per-workspace pattern
