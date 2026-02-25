# CompileContext

## Overview

`CompileContext` is the application use case that assembles the instruction block an AI agent receives when entering a lifecycle step of a change. It collects context specs according to the project's include/exclude configuration, reads structured metadata from each spec's `.specd-metadata.yaml`, evaluates step availability, and combines schema instructions, artifact rules, spec content, and step hooks into a single structured output.

## Requirements

### Requirement: Ports and constructor

`CompileContext` receives at construction time: `ChangeRepository`, a map of `SpecRepository` instances (one per configured workspace), `SchemaRegistry`, and `FileReader`.

```typescript
class CompileContext {
  constructor(
    changes: ChangeRepository,
    specs: ReadonlyMap<string, SpecRepository>,
    schemas: SchemaRegistry,
    files: FileReader,
  )
}
```

`specs` is keyed by workspace name (e.g. `'default'`, `'billing'`). The bootstrap layer constructs one `SpecRepository` instance per workspace declared in `specd.yaml` and passes them all here. `CompileContext` does not create or configure repositories — it only reads from them.

Each `SpecRepository` in the map must have been constructed with the matching `RepositoryConfig.workspace` value so that `repo.workspace()` returns the same key used in the map.

`FileReader` is the port used to read arbitrary files by absolute path — used for resolving `config.context[].file` entries. It returns the file content as a string, or `null` if the file does not exist. The bootstrap layer constructs it bound to the project root (the directory containing `specd.yaml`). `CompileContext` does not perform direct filesystem reads.

### Requirement: Input

`CompileContext.execute` receives:

- `name` — the change name to compile context for
- `step` — the lifecycle step name being entered (e.g. `'designing'`, `'implementing'`, `'verifying'`, `'archiving'`)
- `activeArtifact` (optional) — the artifact ID currently active in the step's iteration. Only applicable to the `designing` step, which traverses the artifact DAG and calls `CompileContext` once per artifact being created. Steps after `ready` (`implementing`, `verifying`, `archiving`) do not use this field — their artifacts already exist by that point. When present, only this artifact's `instruction` and `artifactRules` are injected. When absent, no artifact instructions are injected.
- `schemaRef` — the schema reference string from `specd.yaml`
- `workspaceSchemasPaths` — resolved workspace-to-schemas-path map
- `config` — the resolved project configuration containing `context`, `contextIncludeSpecs`, `contextExcludeSpecs`, `artifactRules`, `workflow`, and per-workspace `contextIncludeSpecs` / `contextExcludeSpecs`

### Requirement: Workspace resolution for spec paths

Every spec path handled by `CompileContext` carries an explicit or implicit workspace qualifier:

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
3. **Workspace-level include patterns** — applied only for workspaces active in the current change (a workspace is active if any of its spec paths appears in `change.specIds`).
4. **Workspace-level exclude patterns** — applied only for active workspaces; removes further specs from the set.
5. **`dependsOn` traversal** — starting from `change.contextSpecIds`, `CompileContext` reads each spec's `.specd-metadata.yaml` and follows `dependsOn` links transitively until no new specs are discovered. Specs added in this step are **not** subject to the exclude rules from steps 2 or 4.

A spec matched by multiple include patterns appears exactly once, at the position of the first matching include pattern. Specs added via `dependsOn` traversal that were already included in steps 1–4 also appear once (at their earlier position).

### Requirement: Cycle detection during dependsOn traversal

During step 5, if `CompileContext` detects a cycle in the `dependsOn` graph (spec A depends on spec B which depends back on spec A), it must break the cycle and emit a warning. It must not enter an infinite loop. All specs that can be reached without traversing the cycle are still included.

### Requirement: Staleness detection and content fallback

For every spec in the collected context set, `CompileContext` must check whether the spec's `.specd-metadata.yaml` exists and whether its `contentHashes` are fresh (all required artifact file hashes match the recorded values).

- **Fresh metadata** — use the structured content from `.specd-metadata.yaml` (`rules`, `constraints`, `scenarios`, `description`).
- **Stale or absent metadata** — fall back to the full raw content of the spec's artifact files. Emit a warning identifying the spec path so the caller knows metadata should be regenerated.

Staleness is advisory — it never blocks context compilation. The fallback ensures the context is always assembled, even for specs whose metadata has not yet been generated.

### Requirement: Step availability

`CompileContext` must evaluate whether the requested step is available for the current change. A step is available if all artifact IDs in the matching `workflow` entry's `requires` list (the entry whose `step` field equals the requested step name) have effective status `complete` via `change.effectiveStatus(type)`.

If the step is not available (one or more required artifacts are not `complete`), `CompileContext` must include the availability status and the list of blocking artifacts in the result. It must not throw — unavailability is surfaced to the caller, not treated as an error.

### Requirement: Assembled instruction block

`CompileContext` must assemble the instruction block by combining the following components in order:

1. **Project context entries** — for each entry in `config.context` (in declaration order): resolve `instruction` values verbatim; resolve `file` values by reading the file at the given path relative to the `specd.yaml` directory and injecting its content verbatim. Missing files emit a warning and are skipped. This block appears before all other content.

2. **Schema instruction** — if `activeArtifact` is present, include that artifact's `instruction` field from the schema if present. If `activeArtifact` is absent, no artifact instruction is injected.

3. **Project artifact rules** — if `activeArtifact` is present and it appears in `config.artifactRules`, append the rule strings as a distinct constraints block below the schema instruction. Rules from `artifactRules` are additive — they do not replace the schema instruction.

4. **Spec content** — for each spec in the collected context set, include its content using the following strategy:
   - If `.specd-metadata.yaml` exists and is fresh: include `description`, `rules`, `constraints`, and `scenarios` from the metadata. This is the compact, machine-optimised representation.
   - If metadata is absent or stale: fall back to extracting the sections declared in the artifact's `contextSections[]` from the spec's artifact files (loaded via `SpecRepository.artifact()`). Each entry in `contextSections` declares a section heading (`name`) and an optional display title (`contextTitle`); missing sections are silently skipped. Emit a staleness warning for this spec.

5. **Step hooks** — for the requested step, include all `instruction:` entries from the matching workflow step's `hooks.pre` and `hooks.post`, in declaration order (schema hooks before project-level hooks). `run:` entries are not included — they are executed at archive time, not injected as AI context.

6. **Available steps** — list all steps declared in the schema's `workflow[]`, each annotated with whether it is currently available. Unavailable steps must name the blocking artifacts.

### Requirement: Result shape

`CompileContext.execute` must return a result object. The result must include:

- `stepAvailable: boolean` — whether the requested step is currently available
- `blockingArtifacts: string[]` — artifact IDs blocking the step (empty if available)
- `instructionBlock: string` — the fully assembled instruction text to inject into the AI context
- `warnings: ContextWarning[]` — stale metadata warnings and any other advisory conditions

`CompileContext` must not throw on availability failures. It must throw on `ChangeNotFoundError` (change not found) and on schema resolution errors.

### Requirement: Missing spec paths emit a warning

If a spec path from an include pattern or `dependsOn` reference does not exist in the corresponding `SpecRepository`, `CompileContext` must emit a warning identifying the missing path and skip it — no error is thrown. This allows the context to be compiled even when specs are temporarily absent, while making the gap visible.

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
- Artifact instructions and `artifactRules` are included only when `activeArtifact` is provided — and only for that artifact
- Step hooks (`pre`/`post`) fire once per step, not once per artifact iteration
- `instruction:` hook entries are included in the compiled output; `run:` hook entries are not
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
  schemaRef: '@specd/schema-std',
  workspaceSchemasPaths: { default: 'specd/schemas' },
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
  schemaRef: '@specd/schema-std',
  workspaceSchemasPaths: { default: 'specd/schemas' },
  config: {
    /* ... */
  },
})
// result.instructionBlock: project context + spec content + step hooks (no artifact instruction)
```

## Spec Dependencies

- [`specs/core/change/spec.md`](../change/spec.md) — Change entity, `contextSpecIds`, `effectiveStatus`, active workspaces
- [`specs/core/config/spec.md`](../config/spec.md) — 5-step context spec resolution, include/exclude patterns, workspace-level patterns, `artifactRules`, workflow hooks
- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — `.specd-metadata.yaml` format, `dependsOn` traversal, staleness detection
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `contextSections` (fallback path), `workflow`, `instruction`, `requiredSpecArtifacts`
