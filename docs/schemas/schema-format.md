# Schema Format Reference

A SpecD schema is a YAML file that defines the artifact workflow for a project: what artifacts exist, how they relate to each other, what validation rules apply, and what instructions guide the AI at each phase.

For annotated, scenario-based examples see the [`examples/`](examples/) directory.

## Overview

Every SpecD project has exactly one active schema. The schema is declared in `specd.yaml` via the `schema` field and resolved at command dispatch time. For how schema references are resolved, see the [configuration reference](../config/config-reference.md#schema).

The schema controls:

- Which artifact files are created and expected in every spec directory (`scope: spec`)
- Which artifact files are produced during a change but not permanently archived (`scope: change`)
- The dependency order between artifacts (`requires`)
- Structural validation rules applied to artifact content (`validations`)
- Structural validation rules applied to delta files before application (`deltaValidations`)
- Lifecycle step definitions and their hooks (`workflow`)
- How metadata fields (title, description, rules, constraints, scenarios, dependsOn) are extracted from artifact content (`metadataExtraction`)

## File layout

A schema lives in a named subdirectory alongside its templates:

```
specd/schemas/
└── my-workflow/
    ├── schema.yaml
    └── templates/
        ├── proposal.md
        ├── spec.md
        ├── verify.md
        └── tasks.md
```

The `schema.yaml` file is the schema definition. Template files are plain text — no interpolation is performed on them. They serve as scaffolding when the agent creates a new artifact file. HTML comments (`<!-- ... -->`) are valid template content and are preserved in the scaffolded file; they are useful as guidance hints for the AI.

The `template` field in each artifact entry is a path relative to the directory containing `schema.yaml`.

## Top-level fields

| Field         | Type    | Required | Description                                                     |
| ------------- | ------- | -------- | --------------------------------------------------------------- |
| `name`        | string  | yes      | Machine identifier for this schema, e.g. `spec-driven`.         |
| `version`     | integer | yes      | Schema version, monotonically increasing.                       |
| `description` | string  | no       | Human-readable summary.                                         |
| `artifacts`   | array   | yes      | One entry per artifact type. See [`artifacts`](#artifacts).     |
| `workflow`    | array   | no       | Named lifecycle phase definitions. See [`workflow`](#workflow). |

A minimal schema with a single artifact:

```yaml
name: minimal
version: 1
description: Single-artifact schema for simple projects

artifacts:
  - id: spec
    scope: spec
    output: 'specs/**/spec.md'
    description: The specification document
```

## artifacts

Each entry in `artifacts` defines one type of file that participates in a change or lives permanently in a spec directory.

### Artifact fields

| Field                 | Type                                          | Required | Default             | Description                                                                                                     |
| --------------------- | --------------------------------------------- | -------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `id`                  | string                                        | yes      | —                   | Unique identifier within the schema. Must match `/^[a-z][a-z0-9-]*$/`.                                          |
| `scope`               | `spec` \| `change`                            | yes      | —                   | Where the artifact lives after archiving. See [`scope`](#scope).                                                |
| `output`              | string or glob                                | yes      | —                   | Path pattern for the artifact's files, relative to the change directory.                                        |
| `optional`            | boolean                                       | no       | `false`             | When `true`, the artifact may be absent without failing validation.                                             |
| `description`         | string                                        | no       | —                   | Human-readable summary for tooling.                                                                             |
| `template`            | string                                        | no       | —                   | Path to a template file, relative to the schema directory.                                                      |
| `instruction`         | string                                        | no       | —                   | AI instruction text injected by `CompileContext` for this artifact.                                             |
| `requires`            | array of IDs                                  | no       | `[]`                | Artifact IDs that must be complete before this artifact is ready.                                               |
| `format`              | `markdown` \| `json` \| `yaml` \| `plaintext` | no       | inferred            | Declares the file format explicitly when the extension is ambiguous.                                            |
| `delta`               | boolean                                       | no       | `false`             | Declares that this artifact supports delta files. Only valid with `scope: spec`.                                |
| `deltaInstruction`    | string                                        | no       | —                   | Domain-specific guidance injected alongside the format-level delta instructions. Only valid with `delta: true`. |
| `deltaValidations`    | array                                         | no       | —                   | Structural validation rules checked against the delta file AST. Only valid with `delta: true`.                  |
| `validations`         | array                                         | no       | —                   | Structural validation rules checked against the artifact content.                                               |
| `rules`               | object                                        | no       | —                   | Pre- and post-instruction rules injected around this artifact's `instruction`. See [`rules`](#rules).           |
| `preHashCleanup`      | array                                         | no       | —                   | Regex substitutions applied before computing the artifact's content hash.                                       |
| `taskCompletionCheck` | object                                        | no       | markdown checkboxes | How to detect incomplete task items in this artifact's content.                                                 |

### scope

`scope` is the single source of truth for what constitutes a complete spec directory and which files survive archiving.

- **`scope: spec`** — the artifact is a permanent part of the spec record. SpecD syncs it from the change directory into the `SpecRepository` when the change is archived. `specd validate` checks that every spec directory in the project contains all non-optional `scope: spec` artifacts. These are files like `spec.md` and `verify.md` — they outlive the change.
- **`scope: change`** — the artifact is a working document used during the change process. It is validated in the change but never synced to the spec directory. These are files like `proposal.md` and `tasks.md` — they belong to the change, not the spec.

`scope` and `optional` are independent. A `scope: spec` artifact can be `optional: true` — meaning it is not required in every spec directory, but if present it is synced normally.

### optional and requires

`optional: false` (the default) means the artifact is required in every change and, for `scope: spec` artifacts, in every spec directory. `ValidateArtifacts` fails if a required artifact is missing.

`optional: true` means the artifact may be absent. If the agent decides not to produce it, it must explicitly mark it as skipped via the appropriate CLI command. A skipped optional artifact is treated as resolved in `requires` chains — downstream artifacts and workflow steps are not blocked by it.

`requires` declares which other artifacts must be `complete` (or `skipped`, for optional ones) before this artifact can be validated. SpecD uses this to compute each artifact's effective status and to determine which workflow steps are available. The `requires` graph must be acyclic. A non-optional artifact must not hard-depend on an optional one.

```yaml
artifacts:
  - id: proposal
    scope: change
    output: proposal.md
    requires: [] # no dependencies

  - id: specs
    scope: spec
    output: 'specs/**/spec.md'
    requires: [proposal] # proposal must be complete first

  - id: verify
    scope: spec
    output: 'specs/**/verify.md'
    requires: [specs] # specs must be complete first

  - id: design
    scope: change
    optional: true # may be skipped
    output: design.md
    requires: [proposal]

  - id: tasks
    scope: change
    output: tasks.md
    requires: [specs] # skipped design does not block tasks
```

### output and template

`output` is a path pattern for the artifact's files relative to the change directory. It can be a literal filename (`proposal.md`) or a glob (`specs/**/spec.md`).

When creating a new artifact file within a change, SpecD derives the filename from the last literal segment of the glob — `spec.md` from `specs/**/spec.md`. If the last segment is a wildcard, the filename falls back to the template filename. If neither yields a determinate filename, schema loading fails with a `SchemaValidationError`.

`template` is the path to a scaffolding file relative to the schema directory. Its content is placed verbatim into the new artifact file when it is first created. Templates are plain text — SpecD performs no variable substitution.

### format

`format` declares the file format of the artifact. It determines which `ArtifactParser` adapter is used for delta application, context section extraction, and validation.

If omitted, SpecD infers the format from the file extension: `.md` → `markdown`, `.json` → `json`, `.yaml` / `.yml` → `yaml`, anything else → `plaintext`. Declare `format` explicitly when the extension is non-standard or ambiguous.

### delta, deltaInstruction, deltaValidations

`delta: true` declares that an artifact supports delta files — structured YAML documents that express changes to an existing spec as AST operations, rather than replacing it entirely. Only valid with `scope: spec`.

When `delta: true`, a delta file may be present at `deltas/<workspace>/<spec-path>/<artifact-filename>.delta.yaml` within the change directory. SpecD applies it deterministically during archiving.

`deltaInstruction` is an optional string injected by `CompileContext` alongside the format-level delta instructions when the agent is working with this artifact. Use it to describe domain-specific guidance — which sections to add or modify, what constitutes a meaningful change — without repeating the technical delta format, which the adapter provides automatically.

`deltaValidations` defines structural rules checked against the delta file's AST before application. It uses the same rule format as `validations`. See [Selector model](#selector-model) and the [validations and delta validations example](examples/validations-and-delta-validations.md).

```yaml
- id: specs
  scope: spec
  output: 'specs/**/spec.md'
  delta: true
  deltaInstruction: |
    When modifying existing requirements, use op: modified.
    When adding a new requirement, use op: added with a position.parent
    targeting the Requirements section.
  deltaValidations:
    - type: sequence-item
      where:
        op: 'added|modified'
      contentMatches: '#### Scenario:'
      required: true
```

A delta file is a YAML sequence of operation entries. Each entry has an `op` field. The supported operations are:

| `op`       | Description                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `added`    | Inserts a new node at a specified position in the target artifact.                                                                         |
| `modified` | Updates an existing node identified by `selector`. The node is replaced with `content` or `value`.                                         |
| `removed`  | Deletes the node identified by `selector` from the target artifact.                                                                        |
| `no-op`    | Records that no change is needed for this artifact in this delta. The entry is ignored during application but documents intent explicitly. |

The `no-op` operation is useful when a spec is listed in the proposal but its artifact requires no modifications in this change. Rather than omitting the delta file (which is ambiguous), write a `no-op` entry with a `description` explaining why no change is needed:

```yaml
- op: no-op
  description: 'No changes to this spec — only the verify.md scenarios are updated.'
```

For the full delta file format with all options, position hints, rename, and merge strategies, see [examples/delta-files.md](examples/delta-files.md).

### validations

`validations` defines structural constraints checked by `ValidateArtifacts` against the artifact content after delta application. Each rule identifies nodes in the artifact's AST and asserts they exist and optionally satisfy content constraints.

See [Selector model](#selector-model) for how to identify nodes. See [examples/validations-and-delta-validations.md](examples/validations-and-delta-validations.md) for annotated examples.

```yaml
validations:
  - type: section
    matches: '^Requirements$'
    required: true
    children:
      - type: section
        matches: '^Requirement:'
        required: true
```

### metadataExtraction

`metadataExtraction` is a **top-level schema field** that declares how to extract metadata fields from artifact content. This is the fallback mechanism used by `CompileContext` when `metadata.json` is absent or stale — SpecD extracts content directly from the artifact files using these declarations.

The structure is a **keyed object**, not a flat array. Each key is a metadata category; the value is either a single extractor entry (for scalar categories) or an array of entries (for array categories).

**Scalar categories** (single entry each):

| Category      | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `title`       | The spec title, typically extracted from the first H1 heading. |
| `description` | A prose description, typically the Overview/Purpose section.   |
| `dependsOn`   | Dependency spec paths extracted from link references.          |
| `keywords`    | Keyword terms.                                                 |

**Array categories** (one or more entries each):

| Category      | Description                                                     |
| ------------- | --------------------------------------------------------------- |
| `rules`       | Structured rule groups extracted from the spec.                 |
| `constraints` | Constraint strings extracted from the spec.                     |
| `scenarios`   | Structured scenario objects extracted from the verify artifact. |
| `context`     | Always-included context content.                                |

**Extractor entry fields:**

| Field       | Required | Description                                                                                                   |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `id`        | no       | Unique identifier for this entry within its category. Used by `schemaOverrides` to target individual entries. |
| `artifact`  | yes      | The artifact type ID this extractor targets (e.g. `'specs'`, `'verify'`).                                     |
| `extractor` | yes      | The extraction configuration — see Extractor fields below.                                                    |

**Extractor fields** (under the `extractor` key of each entry):

| Field       | Description                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selector`  | Selector identifying the AST node(s) to extract from. See [Selector model](#selector-model).                                                                     |
| `extract`   | What to extract: `'content'` (full subtree text), `'label'` (node heading/key only), or `'both'`. Defaults to `'content'`.                                       |
| `capture`   | Regex with a capture group applied to the extracted text. Only the captured portion is retained.                                                                 |
| `strip`     | Regex removed from labels or values before output.                                                                                                               |
| `groupBy`   | Group matched nodes by their label (after `strip`). Only `'label'` is supported.                                                                                 |
| `transform` | Named post-processing callback (e.g. `'resolveSpecPath'`).                                                                                                       |
| `fields`    | Structured field mapping. When present, each matched node produces one object with the declared fields. Used for complex structured extraction (e.g. scenarios). |

```yaml
metadataExtraction:
  title:
    artifact: specs
    extractor:
      selector: { type: section, level: 1 }
      extract: label

  description:
    artifact: specs
    extractor:
      selector: { type: section, matches: '^Purpose$' }
      extract: content

  dependsOn:
    artifact: specs
    extractor:
      selector: { type: section, matches: '^Spec Dependencies$' }
      extract: content
      capture: '\[.*?\]\(([^)]+)\)'
      transform: resolveSpecPath

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

  scenarios:
    - id: verify-scenarios
      artifact: verify
      extractor:
        selector:
          type: section
          matches: '^Scenario:'
          parent: { type: section, matches: '^Requirement:' }
        fields:
          name: { from: label, strip: '^Scenario:\s*' }
          requirement: { from: parentLabel, strip: '^Requirement:\s*' }
          when:
            childSelector: { type: list-item, matches: '^WHEN\b' }
            capture: '^WHEN\s+(.+)'
            followSiblings: '^(?:AND|OR)\b'
          then:
            childSelector: { type: list-item, matches: '^THEN\b' }
            capture: '^THEN\s+(.+)'
            followSiblings: '^(?:AND|OR)\b'

  context:
    - id: spec-overview
      artifact: specs
      extractor:
        selector: { type: section, matches: '^Purpose$' }
        extract: content
```

### preHashCleanup

`preHashCleanup` defines a list of regex substitutions applied to the artifact content before SpecD computes its hash. This allows volatile content — progress markers, timestamps, completion checkboxes — to be normalised away so that checking off a task does not invalidate an artifact's `complete` status.

Each entry has `pattern` (a regex string) and `replacement` (a string, may be empty). Substitutions are applied in declaration order.

```yaml
preHashCleanup:
  - pattern: '^\s*-\s+\[x\]'
    replacement: '- [ ]'
```

### taskCompletionCheck

`taskCompletionCheck` declares how to detect incomplete task items in this artifact's content. SpecD uses it to gate the `implementing → verifying` lifecycle transition: the transition is blocked while any item matching `incompletePattern` exists in any artifact listed in the `implementing` step's `requires`.

| Field               | Type           | Default                            | Description                      |
| ------------------- | -------------- | ---------------------------------- | -------------------------------- |
| `incompletePattern` | string (regex) | `^\s*-\s+\[ \]`                    | Matches an incomplete task item. |
| `completePattern`   | string (regex) | `^\s*-\s+\[x\]` (case-insensitive) | Matches a complete task item.    |

When both patterns are declared, the CLI can report progress (e.g. `3/5 tasks complete`) by counting matches of each. If `taskCompletionCheck` is omitted, the markdown checkbox defaults apply.

```yaml
taskCompletionCheck:
  incompletePattern: '^\s*-\s+\[ \]'
  completePattern: '^\s*-\s+\[x\]'
```

### rules

`rules` declares pre- and post-instruction text blocks injected around the artifact's `instruction` field. `pre` rules are injected before the instruction; `post` rules are injected after. Each rule entry requires both `id` and `instruction`.

```yaml
- id: tasks
  scope: change
  output: tasks.md
  instruction: |
    Create the implementation checklist.
  rules:
    pre:
      - id: read-design-first
        instruction: 'Read design.md in full before creating any tasks.'
    post:
      - id: verify-coverage
        instruction: |
          Every requirement in spec.md must map to at least one task.
          If any requirement is missing a task, add it before proceeding.
```

`schemaOverrides` can add or remove individual rule entries by `id` using `append`, `prepend`, and `remove` operations, without touching the base schema's artifact definition.

## Selector model

A selector identifies one or more nodes in an artifact's AST. Selectors appear in `validations`, `deltaValidations`, `metadataExtraction`, and inside delta file entries.

### Selector fields

| Field      | Type     | Description                                                                                                                                                                                            |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`     | string   | The node type. Must be one of the values for the target file format (see table below). Required.                                                                                                       |
| `matches`  | string   | Regex matched case-insensitively against the node's `label` (heading text, key name).                                                                                                                  |
| `contains` | string   | Regex matched case-insensitively against the node's `value` (paragraph text, scalar value). Useful for finding leaf nodes by content.                                                                  |
| `parent`   | selector | Constrains search to nodes whose nearest ancestor matches this selector. Used to disambiguate nodes with the same label at different nesting levels.                                                   |
| `index`    | integer  | For `array-item` and `sequence-item` nodes: targets the item at this zero-based index. Mutually exclusive with `where`.                                                                                |
| `where`    | object   | For `array-item` and `sequence-item` nodes that are objects: targets the item whose fields match all key–value pairs. Values are matched as case-insensitive regexes. Mutually exclusive with `index`. |
| `level`    | integer  | For markdown `section` nodes only: matches sections at exactly this heading level (1 = `#`, 2 = `##`, etc.). Non-markdown node types ignore `level`.                                                   |

### Node types by file format

| Format     | Addressable node types                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| Markdown   | `document`, `section`, `paragraph`, `list`, `list-item`, `code-block`, `thematic-break` |
| JSON       | `document`, `object`, `property`, `array`, `array-item`                                 |
| YAML       | `document`, `mapping`, `pair`, `sequence`, `sequence-item`                              |
| Plain text | `document`, `paragraph`, `line`                                                         |

The `label` field is the identifying value evaluated by `matches`. The `value` field is the scalar content evaluated by `contains`.

### matches patterns

`matches` is a case-insensitive regular expression evaluated against the node's label. Plain strings match anywhere in the label; use anchors for exact matches.

| Pattern                              | Matches                                           |
| ------------------------------------ | ------------------------------------------------- |
| `'Login'`                            | Any label containing `Login`                      |
| `'^Requirement: Login$'`             | Exactly the string `Requirement: Login`           |
| `'^Requirement:'`                    | Any label starting with `Requirement:`            |
| `'_url$'`                            | Any label ending with `_url`                      |
| `'^Requirement: .+ \(deprecated\)$'` | Labels like `Requirement: Old thing (deprecated)` |

```yaml
# Any section whose heading contains "Login"
selector:
  type: section
  matches: 'Login'

# Exactly the Requirements section at any nesting level
selector:
  type: section
  matches: '^Requirements$'

# Every Requirement: section inside the Requirements section
selector:
  type: section
  matches: '^Requirement:'
  parent:
    type: section
    matches: '^Requirements$'

# A YAML pair whose key ends with _url
selector:
  type: pair
  matches: '_url$'

# The item in a YAML sequence whose "name" field matches "Run tests"
selector:
  type: sequence-item
  parent:
    type: pair
    matches: 'steps'
  where:
    name: 'Run tests'
```

## workflow

`workflow` defines the named lifecycle phases of a change and what artifact conditions gate each one. The order of entries is the intended display order for tooling; it does not enforce sequential blocking between steps — each step is independently gated by its own `requires`.

### Step fields

| Field      | Type                  | Required | Description                                                                     |
| ---------- | --------------------- | -------- | ------------------------------------------------------------------------------- |
| `step`     | string                | yes      | Step name identifying a phase of the change lifecycle.                          |
| `requires` | array of artifact IDs | no       | Artifacts that must be `complete` (or `skipped`) before this step is available. |
| `hooks`    | object                | no       | `pre` and/or `post` arrays of hook entries for this step's boundaries.          |

### Hook entries

Each hook entry requires an `id` field. The `id` uniquely identifies the entry within its `pre` or `post` array and is used by `schemaOverrides` to target individual entries for appending, prepending, or removal.

Each entry is one of:

- `{ id: 'my-id', instruction: 'text' }` — injected into the AI context when this step is compiled. Used to guide agent behaviour during this phase.
- `{ id: 'my-id', run: 'shell command' }` — executed at the phase boundary. Supports template variables.
- `{ id: 'my-id', external: { type: 'docker', config: { ... } } }` — dispatched to a registered external hook runner whose accepted types include `docker`.

Explicit external hooks are part of the workflow model, not ad hoc shell escapes. The `type` field selects the runner; `config` is opaque runner-owned data. Unknown external hook types are errors.

**Hook failure behaviour:**

- **`pre` hook failure** — if a `run:` or `external:` hook fails, the step is aborted. The agent should offer to fix the problem before retrying.
- **`post` hook failure** — the step has already completed; it is not rolled back. After each failing executable hook, the user is prompted to continue with the remaining hooks or stop.

### Template variables in `run:` hooks

| Variable               | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| `{{change.name}}`      | The change's slug name                                 |
| `{{change.workspace}}` | The primary workspace of the change                    |
| `{{change.path}}`      | Absolute path to the change directory                  |
| `{{project.root}}`     | Absolute path to the directory containing `specd.yaml` |

### Relationship with schemaOverrides hooks

`schemaOverrides` in `specd.yaml` can append, prepend, or remove individual hook entries on any step declared in the schema by targeting them via `id`. Schema hooks always fire first. See the [configuration reference](../config/config-reference.md#schemaoverrides).

```yaml
workflow:
  - step: designing
    requires: []

  - step: implementing
    requires: [tasks]
    hooks:
      pre:
        - id: implementing-guidance
          instruction: |
            Read the pending tasks, work through them one by one,
            and mark each complete as you go.
      post:
        - id: run-tests
          run: 'pnpm test'
        - id: docker-smoke
          external:
            type: docker
            config:
              image: node:20
              command: pnpm test:smoke
        - id: confirm-tests
          instruction: |
            Confirm all tests pass before marking implementing complete.

  - step: verifying
    requires: [verify]
    hooks:
      pre:
        - id: verifying-guidance
          instruction: |
            Run through each scenario in verify.md and confirm the
            implementation satisfies it.

  - step: archiving
    requires: [specs, tasks]
    hooks:
      pre:
        - id: pre-archive-tests
          run: 'pnpm test'
      post:
        - id: create-branch
          run: 'git checkout -b specd/{{change.name}}'
```

## verify.md format

`verify.md` is the verification artifact for a spec. It contains WHEN/THEN scenarios that describe how to confirm the system behaves correctly. It is always paired with a `spec.md` — the spec describes what the system does; the verify file describes how to check it.

The file groups scenarios under `### Requirement: <name>` headings that mirror the `spec.md` structure exactly. `ValidateArtifacts` uses this heading pattern to correlate requirements with their verification scenarios.

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

In the schema, the `verify` artifact should declare `requires: [specs]` — scenarios are written after the spec is stable. The `verifying` workflow step should declare `requires: [verify]`.

## Schema validation on load

SpecD validates the schema YAML when it loads. Unknown top-level fields are ignored for forward compatibility. The following conditions produce a `SchemaValidationError` and prevent startup:

| Condition                                                      | Error                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| Duplicate `artifact.id` within `artifacts`                     | IDs must be unique within a schema.                        |
| `artifact.id` not matching `/^[a-z][a-z0-9-]*$/`               | IDs must be lowercase alphanumeric with hyphens.           |
| Duplicate `workflow[].step` within `workflow`                  | Step names must be unique.                                 |
| Unknown artifact ID in `artifact.requires`                     | References must resolve to a declared artifact.            |
| Circular dependency in the artifact `requires` graph           | Cycles are not allowed.                                    |
| Non-optional artifact depending on an optional artifact        | Would make the non-optional artifact effectively optional. |
| `deltaValidations` declared on an artifact with `delta: false` | `deltaValidations` is only meaningful when `delta: true`.  |
| `delta: true` combined with `scope: change`                    | Delta files only apply to permanent spec artifacts.        |
| No determinate filename from `output` glob or `template`       | SpecD cannot derive a filename for new artifact files.     |

## Examples

- [Full schema](examples/full-schema.md) — a complete annotated schema covering the standard proposal → specs → design → tasks workflow
- [Validations and delta validations](examples/validations-and-delta-validations.md) — structural validation rules using selector fields, JSONPath, nested children, and `contentMatches`
- [Delta files](examples/delta-files.md) — the `.delta.yaml` file format with all three operations, position hints, `rename`, `content` vs `value`, and array merge strategies
