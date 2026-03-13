# Schema Format

## Purpose

Without a single declarative definition of a project's artifact workflow, every tool in the ecosystem would need to hardcode artifact types, validation rules, and AI instructions independently. A specd schema is a YAML file that solves this by defining which artifacts exist, how they relate to each other, how they are validated, which sections to extract for AI context, and what instructions the AI should follow when creating each artifact. Schemas are resolved at runtime via `SchemaRegistry` using a prefix convention that checks project-local directories, user overrides, or installed npm packages. The delta mechanism (file format, AST selectors, application algorithm, structural validation) is defined in [`specs/core/delta-format/spec.md`](../delta-format/spec.md).

## Requirements

### Requirement: Schema file structure

A schema file must be a valid YAML document with the following top-level fields:

- `kind` (`schema` | `schema-plugin`, required) — discriminates full schemas from plugins; see Requirement: Schema kind field
- `name` (string, required) — machine identifier, e.g. `spec-driven`
- `version` (integer, required) — schema version, monotonically increasing
- `description` (string, optional) — human-readable summary
- `extends` (string, optional) — reference to a parent schema; see Requirement: Schema extends
- `artifacts` (array, required for `kind: schema`) — one entry per artifact type
- `workflow` (array, optional, only valid for `kind: schema`) — named phases of the change lifecycle, each with optional artifact prerequisites and hooks; see Requirement: Workflow

### Requirement: Schema kind field

Every schema file must declare a `kind` field:

- `kind: schema` — a full schema with `artifacts`, `workflow`, `metadataExtraction`, and optional `extends`. `artifacts` is required; `workflow` and `metadataExtraction` are optional.
- `kind: schema-plugin` — a partial schema containing only `description` and merge operations. `artifacts`, `workflow`, `metadataExtraction`, and `extends` are not valid on a plugin and must be rejected at validation time.

Omitting `kind` is a `SchemaValidationError`.

### Requirement: Schema extends

A schema with `kind: schema` may declare an `extends` field — a string referencing another schema. The reference uses the same convention as the `schema` field in `specd.yaml` (npm package, workspace-qualified, bare name, or path). The referenced schema must also have `kind: schema`.

Extends chains are permitted: schema A may extend schema B which extends schema C. The chain is resolved recursively until a schema with no `extends` is reached (the root). The root schema is the base; each child in the chain is applied as a merge layer in order from root to leaf.

Cycles in the extends chain must be detected and produce a `SchemaValidationError` identifying the cycle. Detection uses the resolved schema file path to avoid false positives from different references pointing to the same file.

`kind: schema-plugin` must not declare `extends` — it is a validation error.

### Requirement: Array entry identity

Every entry in the following schema arrays must carry an `id` field:

- `workflow[].hooks.pre[]` and `workflow[].hooks.post[]`
- `artifacts[].validations[]`
- `artifacts[].deltaValidations[]`
- `artifacts[].rules.pre[]` and `artifacts[].rules.post[]`
- `artifacts[].preHashCleanup[]`
- `metadataExtraction` array entries (entries in `rules[]`, `constraints[]`, `scenarios[]`, `context[]`)

Format: `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, 1–64 characters. IDs must be unique within their immediate array. Duplicate IDs within the same array produce a `SchemaValidationError`.

Workflow steps use `step` as their identity field instead of `id`. Artifact entries use their existing `id` field.

Single-entry metadata fields (`title`, `description`, `dependsOn`, `keywords`) do not have `id` — they are scalars, not array entries.

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
- `metadataExtraction` (object, optional) — top-level declaration of how to extract metadata fields from artifact content; see Requirement: Metadata extraction
- `rules` (object, optional) — constraint text blocks injected by `CompileContext` around the artifact's `instruction`:
  - `pre` (array, optional) — entries injected **before** the instruction. Each entry: `{ id: string, text: string }`.
  - `post` (array, optional) — entries injected **after** the instruction. Each entry: `{ id: string, text: string }`.
    `id` follows the standard array entry identity format. `text` is injected verbatim as a constraint block.
- `preHashCleanup` (array, optional) — list of regex substitutions applied to the artifact content before computing any hash (both `validatedHash` for `ArtifactStatus` and the approval hash). Each entry has `id` (string, required — standard array entry identity format), `pattern` (regex string), and `replacement` (string, may be empty). Substitutions are applied in declaration order. Use this to normalize progress markers or other volatile content that should not affect hash comparisons.
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

- **Selector fields** — the selector fields defined in [`specs/core/selector-model/spec.md`](../selector-model/spec.md): `type`, `matches`, `contains`, `parent`, `index`, `where`. Identifies nodes by type, label pattern, value pattern, ancestry, or position.
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

Any spec file touched by a delta — whether created via an `added` operation or modified via a `modified` or `removed` operation — requires explicit approval before the change can be archived. Approval is tracked per spec ID, not per change.

`specd archive` must refuse to proceed if any spec touched by the change has not been approved. `specd approve <spec-path>` records the approval for that spec within the current change.

A spec created by an `added` operation also requires approval: someone must take ownership of the new spec, even if ownership is granted by the same person who submitted the change.

### Requirement: Metadata extraction

`metadataExtraction` is a top-level schema field that declares how to extract metadata fields from artifact content using selectors and the existing parser infrastructure. It enables deterministic metadata generation without LLM involvement. `CompileContext` and `GetProjectContext` use these declarations as a fallback when `.specd-metadata.yaml` is absent or stale.

Each metadata field maps to one or more `MetadataExtractorEntry` objects with:

- `artifact` (string, required) — the artifact ID whose content to extract from (e.g. `specs`, `verify`)
- `extractor` (object, required) — an `Extractor` declaring how to extract content:
  - `selector` (selector, required) — identifies which node(s) to extract, using the selector model defined in [`specs/core/selector-model/spec.md`](../selector-model/spec.md)
  - `extract` (`content` | `label` | `both`, optional, default `content`) — what to extract for each matched node
  - `capture` (string, optional) — regex with capture group applied to extracted text
  - `strip` (string, optional) — regex removed from labels/values
  - `groupBy` (`label`, optional) — group matched nodes by their label
  - `transform` (string, optional) — named post-processing callback (e.g. `resolveSpecPath`)
  - `fields` (object, optional) — structured field mapping for complex objects (e.g. scenarios)

Supported metadata fields: `title`, `description`, `dependsOn`, `keywords` (single-entry), `rules`, `constraints`, `scenarios`, `context` (array-entry).

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

Every hook entry must include an `id` field (standard array entry identity format) and exactly one of:

- `{ id: string, instruction: string }` — AI context injected when this step is compiled; used to guide agent behaviour during this phase
- `{ id: string, run: string }` — shell command executed at the phase boundary; supports template variables `{{change.name}}`, `{{change.path}}`, `{{project.root}}`

**`pre` hook failure** — if a `run:` hook exits with a non-zero code, the step is aborted and the user is informed of the failure. The agent should offer to attempt to fix the problem before retrying.

**`post` hook failure** — the step has already completed, so the operation is not rolled back. After each failing `run:` hook, the user is prompted to choose: continue with the remaining hooks, or stop.

The order of entries in `workflow` is the intended progression of the change lifecycle and is used by tooling to display status. It does not enforce sequential blocking between consecutive steps — each step is independently gated by its own `requires`.

Project-level hook additions are no longer declared via a `workflow` section in `specd.yaml`. Instead, they are expressed as `schemaOverrides` targeting `workflow[].hooks` — see [`specs/core/config/spec.md`](../config/spec.md).

### Requirement: Schema plugin kind

A schema file with `kind: schema-plugin` is a partial schema that provides only merge operations for composing with a base schema. A plugin must declare:

- `kind: schema-plugin` (required)
- `name` (string, required) — plugin identifier
- `version` (integer, required) — plugin version
- `description` (string, optional) — human-readable summary

A plugin must not declare `artifacts`, `workflow`, `metadataExtraction`, or `extends` — these are validation errors. The plugin's customisation intent is expressed via `schemaOverrides`-style operations when referenced in `specd.yaml`'s `schemaPlugins`. The plugin file itself contains the operations inline under top-level operation keys (`create`, `remove`, `set`, `append`, `prepend`).

Plugins are resolved using the same reference conventions as schemas (npm, workspace-qualified, bare name, path).

### Requirement: Schema resolution

`SchemaRegistry.resolve(ref)` interprets the `schema` value from `specd.yaml` using a prefix convention. The prefix determines exactly where to look — there is no implicit fallback across multiple locations:

- **`@scope/name`** (starts with `@`) — npm package. Loads from `node_modules/@scope/name/schema.yaml`.
- **`#workspace:name`** — workspace-qualified name. Loads from `workspaces.<workspace>.schemas.fs.path/<name>/schema.yaml`.
- **`#name`** or **bare name** (no prefix, not a path) — equivalent to `#default:name`. Loads from `workspaces.default.schemas.fs.path/<name>/schema.yaml`.
- **Relative or absolute path** — direct file reference. Relative paths are resolved from the directory containing `specd.yaml`.

`SchemaRegistry.resolve()` receives the full `ref` string and a resolved map of workspace schema paths. It does not read `specd.yaml` itself.

If the resolved file does not exist, `resolve()` must return `null`; the caller is responsible for converting `null` to `SchemaNotFoundError`.

### Requirement: Schema validation on load

`SchemaRegistry.resolve()` must validate the parsed YAML against a Zod schema before constructing the `Schema` object. Unknown top-level fields must be ignored (forward compatibility). Structural mismatches and semantic errors must produce a `SchemaValidationError` — a domain error extending `SpecdError` — before any domain object construction takes place. Validation covers:

- `kind` missing or not one of `schema` | `schema-plugin`
- `kind: schema-plugin` declaring `artifacts`, `workflow`, `metadataExtraction`, or `extends`
- Duplicate `artifact.id` within `artifacts`
- Duplicate `workflow[].step` within `workflow`
- `artifact.id` not matching `/^[a-z][a-z0-9-]*$/`
- Array entry `id` not matching `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/` or exceeding 64 characters
- Duplicate `id` within the same array (hooks, validations, rules, deltaValidations, preHashCleanup, metadataExtraction entries)
- Unknown artifact ID referenced in `artifact.requires`
- Circular dependency in artifact `requires` graph
- Non-optional artifact hard-depending on an optional artifact
- `deltaValidations` declared on an artifact with `delta: false`
- Cycle in `extends` chain (detected via resolved file path)

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

- `kind` is required on every schema file; must be `schema` or `schema-plugin`
- `kind: schema-plugin` must not declare `artifacts`, `workflow`, `metadataExtraction`, or `extends`
- `extends` is only valid on `kind: schema`; cycles in extends chains are a validation error
- `artifact.id` must match `/^[a-z][a-z0-9-]*$/` and must be unique within a schema
- Array entry `id` must match `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`, 1–64 characters, unique within its immediate array
- `artifact.scope` must be `spec` or `change`; it is required and has no default
- `artifact.optional` defaults to `false`; a non-optional artifact with `scope: spec` must be present in every spec directory and every change
- `artifact.rules.pre` and `artifact.rules.post` are optional arrays of `{ id, text }` entries
- `workflow[].step` must be unique — duplicate step names in the same `workflow` array are a schema validation error
- Every hook entry must include an `id` field alongside its `instruction` or `run` field
- `requires` must not contain cycles; circular dependencies in the artifact graph are a schema validation error
- If artifact A is `optional: true`, any artifact that lists A in its `requires` must also be `optional: true`
- `deltaValidations` is only valid on artifacts with `delta: true`; declaring `deltaValidations` on a non-delta artifact is a schema validation error
- The order of entries in `workflow` is the intended display order for tooling; it does not enforce sequential blocking between consecutive steps
- Delta file format, selector model, and application constraints are defined in `specs/core/delta-format/spec.md`

## Schema Example

```yaml
kind: schema
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
    rules:
      post:
        - id: normative-language
          text: 'Use SHALL / MUST for normative statements.'
    delta: true
    deltaValidations:
      - id: added-has-scenario
        type: sequence-item
        where:
          op: 'added|modified'
        contentMatches: '#### Scenario:'
        required: true
    validations:
      - id: has-purpose
        type: section
        matches: '^Purpose$'
        required: true
      - id: has-requirements
        type: section
        matches: '^Requirements$'
        required: true
        children:
          - id: has-requirement-block
            type: section
            matches: '^Requirement:'
            required: true
            children:
              - id: has-scenario
                type: section
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
      - id: has-requirements
        type: section
        matches: '^Requirements$'
        required: true
        children:
          - id: has-requirement-block
            type: section
            matches: '^Requirement:'
            required: true
            children:
              - id: has-scenario
                type: section
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
      - id: normalize-checkboxes
        pattern: '^\s*-\s+\[x\]'
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
        - id: read-tasks
          instruction: |
            Read pending tasks, work through them one by one,
            mark each complete as you go. Pause if you hit a blocker.
      post:
        - id: run-tests
          run: 'pnpm test'
        - id: confirm-tests
          instruction: |
            Confirm all tests pass before marking implementing complete.
  - step: verifying
    requires: [verify]
    hooks:
      pre:
        - id: run-scenarios
          instruction: |
            Run through each scenario in verify.md and confirm the implementation satisfies it.
  - step: archiving
    requires: [specs, tasks]
    hooks:
      pre:
        - id: run-tests
          run: 'pnpm test'
        - id: review-deltas
          instruction: |
            Review the delta files before confirming the archive.
      post:
        - id: create-branch
          run: 'git checkout -b specd/{{change.name}}'
        - id: summarise
          instruction: |
            Summarise what changed in this archive.

metadataExtraction:
  title:
    artifact: specs
    extractor:
      selector: { type: section, level: 1 }
      extract: label
  description:
    artifact: specs
    extractor:
      selector: { type: section, matches: '^Overview$|^Purpose$' }
      extract: content
  rules:
    - id: spec-requirements
      artifact: specs
      extractor:
        selector:
          type: section
          matches: '^Requirement:'
          parent: { type: section, matches: '^Requirements$' }
        groupBy: label
        strip: '^Requirement:\s*'
        extract: content
  constraints:
    - id: spec-constraints
      artifact: specs
      extractor:
        selector:
          type: list-item
          parent: { type: section, matches: '^Constraints$' }
        extract: label
```

## Spec Dependencies

- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — delta file format, ArtifactParser port, and structural validation rules
- [`specs/core/selector-model/spec.md`](../selector-model/spec.md) — selector fields used in `validations`, `deltaValidations`, and `metadataExtraction`
- [`specs/core/content-extraction/spec.md`](../content-extraction/spec.md) — `Extractor` and `FieldMapping` value objects used in `metadataExtraction` declarations
- [`specs/core/schema-merge/spec.md`](../schema-merge/spec.md) — merge engine for `extends`, plugins, and overrides

## ADRs

- [ADR-0010: Schema Format Design](../../../docs/adr/0010-schema-format.md)
