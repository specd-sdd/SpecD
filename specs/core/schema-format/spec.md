# Schema Format

## Overview

A specd schema is a YAML file that defines the artifact workflow for a project. It specifies which artifacts exist, how they relate to each other, how they are validated, which sections to extract for AI context, and what instructions the AI should follow when creating each artifact.

Schemas are resolved at runtime via `SchemaRegistry`. Each project specifies a schema name in `specd.yaml`; the registry locates the corresponding `schema.yaml` by checking three locations in order: the project-local schemas directory (configured in `specd.yaml`, default `specd/schemas/`), the user's global override directory, and installed npm packages named `@specd/schema-*`.

The delta mechanism — file format, AST selectors, application algorithm, and structural validation — is defined in [`specs/core/delta-format/spec.md`](../delta-format/spec.md).

## Requirements

### Requirement: Schema file structure

A schema file must be a valid YAML document with the following top-level fields:

- `name` (string, required) — machine identifier, e.g. `spec-driven`
- `version` (integer, required) — schema version, monotonically increasing
- `description` (string, optional) — human-readable summary
- `artifacts` (array, required) — one entry per artifact type
- `workflow` (array, optional) — named phases of the change lifecycle, each with optional artifact prerequisites and hooks; see Requirement: Workflow

### Requirement: Artifact definition

Each entry in `artifacts` must include:

- `id` (string, required) — unique identifier within the schema, e.g. `proposal`, `specs`, `design`, `tasks`
- `scope` (`spec` | `change`, required) — declares where this artifact lives after the change is archived. `spec` means the artifact file is synced to the `SpecRepository` (e.g. `spec.md`, `verify.md` — files that become part of the project's permanent spec record). `change` means the artifact stays only in the change directory and is never synced (e.g. `proposal.md`, `tasks.md` — working documents used during the change process).
- `optional` (boolean, optional, default `false`) — when `false`, `ValidateArtifacts` requires this artifact to be present in the change before validation can pass. When `true`, the artifact may be absent without failing validation; if present, it is validated and (for `scope: spec` artifacts) synced normally. `scope` and `optional` are independent.
- `output` (string or glob, required) — path pattern for the artifact's files **relative to the change directory**, e.g. `proposal.md` or `specs/**/spec.md`. When creating a new artifact file within a change, the filename is derived from the last literal segment of the glob (e.g. `spec.md` from `specs/**/spec.md`); if the last segment is a wildcard, the filename falls back to the template filename (e.g. `spec.md` from `template: templates/spec.md`). If neither the glob nor the template yields a determinate filename, `SchemaRegistry.resolve()` must throw a `SchemaValidationError`. The final location of these files in the project repo after syncing is configured separately and may differ.
- `description` (string, optional) — human-readable summary for tooling
- `template` (string, optional) — path to a template file, relative to the schema directory; see Requirement: Template resolution
- `instruction` (string, optional) — AI instruction text injected by `CompileContext`
- `requires` (array of artifact IDs, optional) — artifacts that must be resolved before this one; used to compute `Change.effectiveStatus()`. A dependency is resolved when its status is `complete` or `skipped`. `skipped` is only reachable for `optional: true` artifacts. Any other state (`missing`, `in-progress`) blocks the dependent artifact.
- `format` (`markdown` | `json` | `yaml` | `plaintext`, optional) — declares the file format of this artifact. Used by `CompileContext` to select the correct `ArtifactParser` adapter when injecting delta instructions. If omitted, the format is inferred from the file extension of the derived output filename (`.md` → `markdown`, `.json` → `json`, `.yaml` / `.yml` → `yaml`); any other extension defaults to `plaintext`. Must be declared explicitly when the extension is ambiguous or non-standard.
- `delta` (boolean, optional, default `false`) — declares that this artifact supports delta files. Only valid when `scope: spec`; `SchemaRegistry.resolve()` must throw a `SchemaValidationError` if `delta: true` is combined with `scope: change`. When `true`, a delta file for this artifact (`deltas/<workspace>/<capability-path>/<filename>.delta.yaml`) may be present in the change directory. When `false`, delta files for this artifact are rejected at validation time.
- `deltaInstruction` (string, optional) — domain-specific guidance injected by `CompileContext` alongside the format-level delta instructions when `delta: true` and `activeArtifact` matches this artifact. Describes which domain concepts to add, modify, or remove (e.g. requirements, scenarios) without repeating the technical delta format, which is provided automatically by the `ArtifactParser` adapter. Only valid when `delta: true`.
- `deltaValidations` (array, optional) — structural validation rules checked against the normalized YAML AST of the delta file before application; see Requirement: Delta validation rules. Only valid when `delta: true`.
- `validations` (array, optional) — structural validation rules for the base artifact (after delta application); see Requirement: Validation rules
- `contextSections` (array, optional) — sections of existing specs to inject into the AI context; see Requirement: Context sections
- `preHashCleanup` (array, optional) — list of regex substitutions applied to the artifact content before computing any hash (both `validatedHash` for `ArtifactStatus` and the approval hash). Each entry has a `pattern` (regex string) and a `replacement` (string, may be empty). Substitutions are applied in declaration order. Use this to normalize progress markers or other volatile content that should not affect hash comparisons.
- `taskCompletionCheck` (object, optional) — declares how to detect task completion within this artifact's file content. Used to gate the `implementing → verifying` transition: if the artifact is listed in the `implementing` step's `requires`, all items matching `incompletePattern` must be absent (zero matches) before the transition is allowed. Both fields are optional and default to markdown checkbox syntax:
  - `incompletePattern` (string, regex, default `^\s*-\s+\[ \]`) — matches an incomplete task item
  - `completePattern` (string, regex, default `^\s*-\s+\[x\]`, case-insensitive) — matches a complete task item

  When both patterns are present, the CLI can report progress (e.g. `3/5 tasks complete`) by counting matches of each. If `taskCompletionCheck` is omitted entirely, the defaults apply.

### Requirement: Template resolution

Template files are bundled alongside `schema.yaml` in a `templates/` subdirectory by convention. The `template` field is a path relative to the directory containing `schema.yaml`. `SchemaRegistry.resolve()` reads all referenced template files at load time and makes their content available in the resolved schema. Template content is plain text — no interpolation or placeholder substitution is performed. HTML comments (`<!-- ... -->`) are valid template content and are preserved as-is in the scaffolded file; they serve as guidance hints for the AI generating the artifact.

```
specd/schemas/spec-driven/
├── schema.yaml
└── templates/
    ├── proposal.md
    ├── spec.md
    ├── design.md
    └── tasks.md
```

### Requirement: Validation rules

`validations` on an artifact defines structural constraints checked by `ValidateArtifacts` against the artifact content (after delta application for `scope: spec` artifacts). Each rule identifies nodes in the normalized artifact AST and asserts that they exist and optionally satisfy further constraints.

A validation rule is an object with:

**Node identification** — one of two mutually exclusive approaches:

- **Selector fields** — the same fields defined in [`specs/core/delta-format/spec.md` — Requirement: Selector model](../delta-format/spec.md): `type`, `matches`, `contains`, `parent`, `index`, `where`. Identifies nodes by type, label pattern, value pattern, ancestry, or position.
- **`path`** (string) — a JSONPath expression (RFC 9535) evaluated against the normalized AST. Use when the structural query requires more expressive power than the selector fields provide.

**Additional fields** — compatible with both identification styles:

- `required` (boolean, optional, default `true`) — whether absence of a matching node is an error (`true`) or a warning (`false`)
- `contentMatches` (string, optional) — a regex matched case-insensitively against the serialized text of the matched node's subtree; `ArtifactParser` serializes the subtree to its native format before matching; useful for asserting that a node's full rendered content contains expected text regardless of its internal AST structure
- `children` (array, optional) — sub-rules evaluated with each matched node as root; each entry is a full validation rule

A rule passes vacuously when it matches zero nodes — no error or warning is produced.

```yaml
validations:
  # Selector fields: structural checks with readable syntax
  - type: section
    matches: '^Requirements$'
    required: true
    children:
      - type: section
        matches: '^Requirement:'
        required: true
        children:
          - type: section
            matches: '^Scenario:'
            required: true

  # contentMatches: assert the section body contains normative language
  - type: section
    matches: '^Requirement:'
    contentMatches: 'SHALL|MUST'
    required: false

  # path: JSONPath for queries that need more expressive power
  - path: '$..children[?(@.type=="section" && @.level==2)]'
    required: true
```

### Requirement: Delta validation rules

`deltaValidations` on a schema artifact defines rules that `ValidateArtifacts` checks against the delta file before application. It works identically to `validations` — each rule uses the same structure and evaluation semantics — but the document is the **normalized YAML AST of the delta file** rather than the artifact content. Only valid when `delta: true`.

The delta file is a YAML sequence of operation entries. When parsed by the YAML adapter, each entry becomes a `sequence-item` containing a `mapping` with `pair` nodes for `op`, `selector`, `content`, `position`, etc. The `where` field on `sequence-item` rules is particularly useful here for correlated checks — asserting that the same entry satisfies multiple field conditions simultaneously.

Each rule uses the same structure as `validations` rules: selector fields or `path` for node identification, plus `required`, `contentMatches`, and `children`.

A rule passes vacuously when it matches zero nodes.

```yaml
deltaValidations:
  # At least one added/modified entry must contribute content containing a Scenario.
  # where: checks multiple fields on the same sequence-item (correlated condition).
  # contentMatches: checks the rendered text of the entry's content field subtree.
  - type: sequence-item
    where:
      op: 'added|modified'
    contentMatches: '#### Scenario:'
    required: true

  # Warning if nothing is being removed (may indicate a delta that only adds)
  - type: sequence-item
    where:
      op: 'removed'
    required: false
```

### Requirement: Per-spec approval

Any spec file touched by a delta — whether created via an `added` operation or modified via a `modified` or `removed` operation — requires explicit approval before the change can be archived. Approval is tracked per spec path, not per change.

`specd archive` must refuse to proceed if any spec touched by the change has not been approved. `specd approve <spec-path>` records the approval for that spec within the current change.

A spec created by an `added` operation also requires approval: someone must take ownership of the new spec, even if ownership is granted by the same person who submitted the change.

### Requirement: Context sections

`contextSections` on an artifact declares which nodes of that artifact's spec files are relevant context for workflow steps. `CompileContext` uses these declarations to extract and inject the matched nodes when compiling context for a step as a fallback when `.specd-metadata.yaml` is absent or stale. Each entry must include:

- `selector` (selector, required) — identifies which node(s) to extract, using the same selector model defined in [`specs/core/delta-format/spec.md` — Requirement: Selector model](../delta-format/spec.md); when the selector matches multiple nodes, each is extracted separately
- `role` (`rules` | `constraints` | `scenarios` | `context`, optional, default `context`) — semantic category of the extracted content; `CompileContext` uses this to label and group the injected block so the LLM receives the same structural signal as when fresh metadata is available
- `extract` (`content` | `label` | `both`, optional, default `content`) — what to inject for each matched node: `content` serializes the node's full subtree to the artifact's native format; `label` injects only the node's identifying value (heading text, key name); `both` injects label followed by serialized content
- `contextTitle` (string, optional) — title used for this section in the compiled context block; if omitted, the node's `label` is used as the title

### Requirement: Artifact scope

`scope` on an artifact is the single source of truth for what constitutes a complete spec and what files are expected in the spec directory. It has three responsibilities:

1. **Spec directory layout** — artifacts with `scope: spec` (and `optional: false`) are the files specd expects to find in every `specs/<name>/` directory. When compiling context, specd reads all of them.
2. **Existing spec validation** — `specd validate` checks that every spec directory in the project contains all non-optional `scope: spec` artifact files; missing files are reported as validation errors.
3. **Change validation** — `ValidateArtifacts` requires all non-optional artifacts (regardless of scope) to be present in the change before validation can pass.

`scope: change` artifacts (e.g. `proposal.md`, `tasks.md`) are working documents used during the change process. They are validated in the change but never synced to the `SpecRepository`. `scope: spec` artifacts (e.g. `spec.md`, `verify.md`) are merged or copied into the `SpecRepository` during `ArchiveChange`.

### Requirement: Workflow

`workflow` is an array of named lifecycle phase definitions for a change. Each entry describes a distinct phase — such as designing specs, applying changes, verifying work, or archiving — and declares what artifact conditions must be met for that phase to become active, along with any hooks to run at phase boundaries.

Steps are not limited to AI agent invocations. They may represent human review phases, automated checks, artifact generation, or any recurring activity in the change lifecycle. `CompileContext` uses step definitions to gate context compilation and to inject phase-specific instructions and hooks into the AI context.

> The canonical set of lifecycle step names and their semantics is defined in a dedicated spec (TBD). The schema format only defines the structure of step entries — step naming conventions are out of scope here.

Entries must include:

- `step` (string, required) — step name identifying a phase of the change lifecycle
- `requires` (array of artifact IDs, optional) — artifacts that must be `complete` before this step is available; empty or omitted means always available
- `hooks` (object, optional) — hooks for this step's boundaries; each key is `pre` or `post`, each value is an array of `instruction:` or `run:` hook entries

Every hook entry is either:

- `{ instruction: string }` — AI context injected when this step is compiled; used to guide agent behaviour during this phase
- `{ run: string }` — shell command executed at the phase boundary; supports template variables `{{change.name}}`, `{{change.path}}`, `{{project.root}}`

**`pre` hook failure** — if a `run:` hook exits with a non-zero code, the step is aborted and the user is informed of the failure. The agent should offer to attempt to fix the problem before retrying.

**`post` hook failure** — the step has already completed, so the operation is not rolled back. After each failing `run:` hook, the user is prompted to choose: continue with the remaining hooks, or stop.

The order of entries in `workflow` is the intended progression of the change lifecycle and is used by tooling to display status. It does not enforce sequential blocking between consecutive steps — each step is independently gated by its own `requires`.

`specd.yaml` uses the same `workflow` format to add project-level hooks. Each entry only accepts `step` and `hooks` — `requires` is not valid in `specd.yaml` workflow entries and must be rejected at load time. Entries are matched by `step` name; schema hooks fire first, then project hooks, within the same `pre`/`post` event.

### Requirement: Project-level artifactRules

`artifactRules` in `specd.yaml` allows teams to add per-artifact constraints without forking the schema. Each key is an artifact ID; each value is an array of rule strings. `CompileContext` injects them alongside the schema-defined instruction as a distinct constraints block.

```yaml
# specd.yaml
artifactRules:
  specs:
    - 'All requirements must reference the relevant RFC number'
  design:
    - 'Architecture decisions must note which ADR they relate to'
```

Rule keys are validated against the active schema's artifact IDs on load. Unknown keys produce a warning but do not prevent startup. Rules are additive — they extend the schema's instruction, not replace it.

### Requirement: Schema resolution

`SchemaRegistry.resolve(ref)` interprets the `schema` value from `specd.yaml` using a prefix convention. The prefix determines exactly where to look — there is no implicit fallback across multiple locations:

- **`@scope/name`** (starts with `@`) — npm package. Loads from `node_modules/@scope/name/schema.yaml`.
- **`#workspace:name`** — workspace-qualified name. Loads from `workspaces.<workspace>.schemas.fs.path/<name>/schema.yaml`.
- **`#name`** or **bare name** (no prefix, not a path) — equivalent to `#default:name`. Loads from `workspaces.default.schemas.fs.path/<name>/schema.yaml`.
- **Relative or absolute path** — direct file reference. Relative paths are resolved from the directory containing `specd.yaml`.

`SchemaRegistry.resolve()` receives the full `ref` string and a resolved map of workspace schema paths. It does not read `specd.yaml` itself.

If the resolved file does not exist, `resolve()` must return `null`; the caller is responsible for converting `null` to `SchemaNotFoundError`.

### Requirement: Schema validation on load

`SchemaRegistry.resolve()` must validate the parsed YAML against the schema structure before returning it. Unknown top-level fields must be ignored (forward compatibility). Missing required fields and structural duplicates must produce a `SchemaValidationError`:

- Duplicate `artifact.id` within `artifacts`
- Duplicate `workflow[].step` within `workflow`
- `artifact.id` not matching `/^[a-z][a-z0-9-]*$/`
- Unknown artifact ID referenced in `artifact.requires`
- Circular dependency in artifact `requires` graph
- Non-optional artifact hard-depending on an optional artifact
- `deltaValidations` declared on an artifact with `delta: false`
- `requires` present in a `specd.yaml` workflow entry

### Requirement: verify.md format

`verify.md` is the verification artifact for a spec. It contains WHEN/THEN scenarios that describe how to confirm the system behaves correctly. It is always paired with a `spec.md` — the spec describes what the system does; the verify file describes how to check it.

The file groups scenarios under `### Requirement: <name>` headings that mirror the `spec.md` structure. This is required — using the same heading pattern as the `spec` artifact allows `ValidateArtifacts` to correlate requirements with their verification scenarios.

```markdown
# Verification: <spec name>

## Requirements

### Requirement: <Name>

#### Scenario: <scenario name>

- **WHEN** <condition>
- **THEN** <expected outcome>
- **AND** <additional assertion> (optional)
```

Only scenarios that add information beyond what the requirement prose already states are included. Scenarios that merely restate the happy path from the spec are omitted.

The `verify` artifact in the schema should declare `requires: [spec]` — scenarios are written after the spec is stable. The `workflow.verify` step should declare `requires: [verify]`.

## Constraints

- `artifact.id` must match `/^[a-z][a-z0-9-]*$/` and must be unique within a schema
- `artifact.scope` must be `spec` or `change`; it is required and has no default
- `artifact.optional` defaults to `false`; a non-optional artifact with `scope: spec` must be present in every spec directory and every change
- `workflow[].step` must be unique — duplicate step names in the same `workflow` array are a schema validation error
- `requires` must not contain cycles; circular dependencies in the artifact graph are a schema validation error
- If artifact A is `optional: true`, any artifact that lists A in its `requires` must also be `optional: true`
- `deltaValidations` is only valid on artifacts with `delta: true`; declaring `deltaValidations` on a non-delta artifact is a schema validation error
- `requires` in `specd.yaml` workflow entries is invalid and must be rejected at load time; only `step` and `hooks` are accepted
- The order of entries in `workflow` is the intended display order for tooling; it does not enforce sequential blocking between consecutive steps
- Delta file format, selector model, and application constraints are defined in `specs/core/delta-format/spec.md`

## Schema Example

```yaml
name: schema-example
version: 1
description: Proposal → specs → design → tasks workflow

artifacts:
  - id: proposal
    scope: change
    output: proposal.md
    description: Initial proposal outlining why the change is needed
    template: templates/proposal.md
    instruction: |
      Create the proposal document that establishes WHY this change is needed.
    requires: []

  - id: specs
    scope: spec
    output: 'specs/**/spec.md'
    description: Detailed specifications defining what the system should do
    template: templates/spec.md
    requires:
      - proposal
    instruction: |
      Create specification files defining WHAT the system should do.
      Do not include WHEN/THEN scenarios — those go in verify.md.
    delta: true
    deltaValidations:
      - type: sequence-item
        where:
          op: 'added|modified'
        contentMatches: '#### Scenario:'
        required: true
    contextSections:
      - selector:
          type: section
          matches: '^Requirements$'
        role: rules
        contextTitle: Spec Requirements
      - selector:
          type: section
          matches: '^Constraints$'
        role: constraints
    validations:
      - type: section
        matches: '^Purpose$'
        required: true
      - type: section
        matches: '^Requirements$'
        required: true
        children:
          - type: section
            matches: '^Requirement:'
            required: true
            children:
              - type: section
                matches: '^Scenario:'
                required: true

  - id: verify
    scope: spec
    output: 'specs/**/verify.md'
    description: Verification scenarios for the spec
    template: templates/verify.md
    requires:
      - specs
    instruction: |
      Create verification scenarios (WHEN/THEN) for the spec.
      Group scenarios under ### Requirement: headings matching the spec.md requirements exactly.
      Only include scenarios that add information beyond what the requirement prose already states.
    delta: true
    validations:
      - type: section
        matches: '^Requirements$'
        required: true
        children:
          - type: section
            matches: '^Requirement:'
            required: true
            children:
              - type: section
                matches: '^Scenario:'
                required: true

  - id: design
    scope: change
    optional: true
    output: design.md
    description: Technical design with implementation decisions
    template: templates/design.md
    requires:
      - proposal
    instruction: |
      Create the design document explaining HOW to implement the change.

  - id: tasks
    scope: change
    output: tasks.md
    description: Implementation checklist with trackable tasks
    template: templates/tasks.md
    requires:
      - specs
    instruction: |
      Create the task list breaking down the implementation work.
      If a design document (design.md) exists, use it to inform the task breakdown.
      If it does not exist, derive tasks from the specs alone.
    preHashCleanup:
      - pattern: '^\s*-\s+\[x\]'
        replacement: '- [ ]'
    taskCompletionCheck:
      incompletePattern: '^\s*-\s+\[ \]'
      completePattern: '^\s*-\s+\[x\]'

workflow:
  - step: designing
    requires: []
  - step: implementing
    requires: [tasks]
    hooks:
      pre:
        - instruction: |
            Read pending tasks, work through them one by one,
            mark each complete as you go. Pause if you hit a blocker.
      post:
        - run: 'pnpm test'
        - instruction: |
            Confirm all tests pass before marking implementing complete.
  - step: verifying
    requires: [verify]
    hooks:
      pre:
        - instruction: |
            Run through each scenario in verify.md and confirm the implementation satisfies it.
  - step: archiving
    requires: [specs, tasks]
    hooks:
      pre:
        - run: 'pnpm test'
        - instruction: |
            Review the delta files before confirming the archive.
      post:
        - run: 'git checkout -b specd/{{change.name}}'
        - instruction: |
            Summarise what changed in this archive.
```

## Spec Dependencies

- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — delta file format, selector model, ArtifactParser port, and structural validation rules

## ADRs

- [ADR-0010: Schema Format Design](../../../docs/adr/0010-schema-format.md)
