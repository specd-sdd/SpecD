# Schema Format

## Overview

A specd schema is a YAML file that defines the artifact workflow for a project. It specifies which artifacts exist, how they relate to each other, how they are validated, how delta blocks are merged when archiving, which sections to extract for AI context, and what instructions the AI should follow when creating each artifact.

Schemas are resolved at runtime via `SchemaRegistry`. Each project specifies a schema name in `specd.yaml`; the registry locates the corresponding `schema.yaml` by checking three locations in order: the project-local schemas directory (configured in `specd.yaml`, default `specd/schemas/`), the user's global override directory, and installed npm packages named `@specd/schema-*`.

## Requirements

### Requirement: Schema file structure

A schema file must be a valid YAML document with the following top-level fields:

- `name` (string, required) — machine identifier, e.g. `spec-driven`
- `version` (integer, required) — schema version, monotonically increasing
- `description` (string, optional) — human-readable summary
- `deltaOperations` (object, optional) — configurable keyword labels for delta operations; see Requirement: Delta operation keywords
- `requiredSpecArtifacts` (array of strings, optional) — artifact IDs that must be present in every change
- `artifacts` (array, required) — one entry per artifact type
- `workflow` (array, optional) — skill definitions with prerequisite gates and lifecycle hooks; see Requirement: Workflow

#### Scenario: Minimal valid schema
- **WHEN** a schema file contains `name`, `version`, and at least one artifact
- **THEN** `SchemaRegistry.resolve()` must return the parsed schema without error

#### Scenario: Missing required field
- **WHEN** a schema file is missing `name` or `version`
- **THEN** `SchemaRegistry.resolve()` must throw a validation error

### Requirement: Delta operation keywords

`deltaOperations` at the schema level defines the keyword labels used as prefixes in delta section headings. All four keys are optional and fall back to the specd defaults:

```yaml
deltaOperations:
  added:    "ADDED"    # default
  modified: "MODIFIED" # default
  removed:  "REMOVED"  # default
  renamed:  "RENAMED"  # default
  from:     "FROM"     # default — used inside RENAMED sections
  to:       "TO"       # default — used inside RENAMED sections
```

These labels appear as prefixes in delta section headings: `## {added} Requirements`, `## {modified} Requirements`, `## {removed} Requirements`, `## {renamed} Requirements`. The `from` and `to` labels are used as line prefixes inside RENAMED sections: `{from}: ### Requirement: Old name` / `{to}: ### Requirement: New name`. `mergeSpecs` and `ValidateSpec` read all keywords from the resolved schema — they do not hardcode the default strings.

#### Scenario: Custom operation keywords
- **WHEN** a schema defines `deltaOperations.added: "AÑADIDO"`
- **THEN** delta files using `## AÑADIDO Requirements` are processed correctly by `mergeSpecs`

#### Scenario: Partial override
- **WHEN** a schema defines only `deltaOperations.added` and omits the rest
- **THEN** the omitted keys fall back to their specd defaults

#### Scenario: Default keywords
- **WHEN** a schema omits `deltaOperations` entirely
- **THEN** `mergeSpecs` uses `ADDED`, `MODIFIED`, `REMOVED`, and `RENAMED`

### Requirement: Artifact definition

Each entry in `artifacts` must include:

- `id` (string, required) — unique identifier within the schema, e.g. `proposal`, `specs`, `design`, `tasks`
- `generates` (string or glob, required) — file path(s) the artifact produces, e.g. `proposal.md` or `specs/**/spec.md`
- `description` (string, optional) — human-readable summary for tooling
- `template` (string, optional) — path to a template file, relative to the schema directory; see Requirement: Template resolution
- `instruction` (string, optional) — AI instruction text injected by `CompileContext`
- `requires` (array of artifact IDs, optional) — artifacts that must be complete before this one; used to compute `Change.effectiveStatus()`. An artifact is _complete_ when its spec file(s) have been validated and the content hash recorded in the change manifest. Any other state (`missing`, `draft`, `in-progress`) is not complete.
- `deltas` (array, optional) — delta merge configuration; see Requirement: Delta configuration
- `deltaValidations` (array, optional) — structural validation rules for delta files; see Requirement: Delta validations
- `validations` (array, optional) — structural validation rules for the base spec; see Requirement: Validation rules
- `contextSections` (array, optional) — sections of existing specs to inject into the AI context; see Requirement: Context sections

#### Scenario: Artifact with no requirements
- **WHEN** an artifact omits `requires`
- **THEN** its effective status depends only on its own validated hash

#### Scenario: Artifact with dependency chain
- **WHEN** artifact B declares `requires: [a]` and artifact A is `in-progress`
- **THEN** `Change.effectiveStatus('b')` must return `in-progress`

#### Scenario: Circular dependency in artifact graph
- **WHEN** artifact A declares `requires: [b]` and artifact B declares `requires: [a]`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError` identifying the cycle

### Requirement: Template resolution

Template files are bundled alongside `schema.yaml` in a `templates/` subdirectory by convention. The `template` field is a path relative to the directory containing `schema.yaml`. `SchemaRegistry.resolve()` reads all referenced template files at load time and makes their content available in the resolved schema. Template content is plain markdown — no interpolation or placeholder substitution is performed. HTML comments (`<!-- ... -->`) are valid template content and are preserved as-is in the scaffolded file; they serve as guidance hints for the AI generating the artifact.

```
specd/schemas/spec-driven/
├── schema.yaml
└── templates/
    ├── proposal.md
    ├── spec.md
    ├── design.md
    └── tasks.md
```

#### Scenario: Template loaded at resolve time
- **WHEN** an artifact declares `template: templates/proposal.md` and the file exists in the schema directory
- **THEN** `SchemaRegistry.resolve()` returns the artifact with the template content populated

#### Scenario: Template file not found
- **WHEN** an artifact declares a `template` path that does not exist relative to the schema directory
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: No template declared
- **WHEN** an artifact omits `template`
- **THEN** no template content is provided for that artifact; scaffolding falls back to an empty file

### Requirement: Delta configuration

`deltas` on an artifact defines how its content is merged during `specd archive`. Each entry in `deltas` must include:

- `section` (string, required) — the section name in the base spec, e.g. `Requirements`
- `pattern` (string, required) — the block header pattern with a `{name}` placeholder, e.g. `### Requirement: {name}`

Delta sections in a delta spec file use the format `## {added} {section}`, `## {modified} {section}`, `## {removed} {section}`, or `## {renamed} {section}`, where the operation keywords come from the schema's `deltaOperations` field (or their defaults).

`mergeSpecs(base, delta, deltaConfigs, deltaOperations)` applies all delta configs in the order they appear. Each config is processed independently against its own section.

#### Scenario: Multiple delta configs
- **WHEN** an artifact declares multiple entries in `deltas`
- **THEN** each entry is processed independently against its own section

### Requirement: Delta merge operations

`mergeSpecs` applies delta operations in a fixed order: **RENAMED → REMOVED → MODIFIED → ADDED**. This order ensures that renames are resolved before removals or modifications reference the new names, and that additions cannot conflict with existing blocks that have already been processed.

**RENAMED** — each entry consists of a `FROM:` line followed immediately by a `TO:` line, both matching the block header pattern:

```markdown
## RENAMED Requirements

FROM: ### Requirement: Old name
TO:   ### Requirement: New name
```

Where `RENAMED`, `FROM`, and `TO` are the schema's resolved `deltaOperations.renamed`, `deltaOperations.from`, and `deltaOperations.to` values respectively.

The block is found by its `FROM` name, its header line is rewritten to the `TO` name, and it is re-keyed under the new name. All further operations in the same merge (REMOVED, MODIFIED, ADDED) must reference the new name, not the old one.

**REMOVED** — lists block header lines (or names) to delete. No block body is needed. If a named block does not exist in the base spec, the removal is silently ignored.

**MODIFIED** — each entry is a full block (header + body) that replaces the corresponding block in the base spec. If the block does not exist, it is inserted (upsert).

**ADDED** — each entry is a full block (header + body) appended to the section. Existing blocks are preserved; their relative order is maintained, with ADDED blocks appended after them.

If the section does not exist in the base spec, it is created. If all blocks in a section are removed, the section itself is removed from the merged spec.

#### Scenario: RENAMED operation
- **WHEN** a delta spec contains a RENAMED section with `FROM: ### Requirement: Old` / `TO: ### Requirement: New`
- **THEN** the block is found by `Old`, its header is rewritten to `New`, and subsequent MODIFIED/REMOVED operations must use `New`

#### Scenario: REMOVED operation
- **WHEN** a delta spec contains a REMOVED section with `### Requirement: X`
- **THEN** block `X` is deleted from the base spec; if it does not exist, the removal is silently ignored

#### Scenario: MODIFIED operation
- **WHEN** a delta spec contains a MODIFIED section with a full `### Requirement: X` block
- **THEN** the block replaces the existing block; if the block does not exist, it is inserted

#### Scenario: ADDED operation
- **WHEN** a delta spec contains an ADDED section with `### Requirement: X` blocks
- **THEN** those blocks are appended to the section after all existing blocks

#### Scenario: Section created when missing
- **WHEN** the base spec has no `## Requirements` section and the delta adds blocks to it
- **THEN** the section is created in the merged spec

#### Scenario: Section removed when empty
- **WHEN** all blocks in a section are removed by the delta
- **THEN** the section itself is removed from the merged spec

### Requirement: Delta conflict detection

`mergeSpecs` must detect and reject conflicting delta operations before applying any changes. The following conditions are errors:

- Duplicate block names within ADDED
- Duplicate block names within MODIFIED
- Duplicate block names within REMOVED
- Duplicate `FROM` or `TO` names within RENAMED
- A name appears in both MODIFIED and REMOVED
- A name appears in both MODIFIED and ADDED
- A name appears in both ADDED and REMOVED
- A MODIFIED block references a name that is a `FROM` in RENAMED (must use the `TO` name instead)
- An ADDED block uses a name that is a `TO` in RENAMED (the name is already taken by the renamed block)

#### Scenario: Conflict in same section
- **WHEN** a delta spec lists the same requirement name in both MODIFIED and REMOVED
- **THEN** `mergeSpecs` must throw a conflict error before applying any changes

#### Scenario: MODIFIED references old name after RENAMED
- **WHEN** a delta spec renames `Old` to `New` and also has a MODIFIED block for `Old`
- **THEN** `mergeSpecs` must throw a conflict error (MODIFIED must use `New`)

### Requirement: Pattern matching

The `pattern` field on validation rules is matched against file content using the following rules, in order:

1. **`{name}` placeholder** — if the pattern contains `{name}`, it is treated as a structural pattern. `{name}` is replaced with `.+` and the result is used as a regex anchored to the start of a line (e.g. `"### Requirement: {name}"` matches any line starting with `### Requirement: ` followed by any non-empty text). This is the same `{name}` expansion used by `mergeSpecs`.
2. **Regex** — if the pattern contains no `{name}`, it is used directly as a JavaScript regular expression with the multiline flag (e.g. `"SHALL|MUST"` matches either word anywhere in the content).
3. **Literal fallback** — if the pattern is not a valid regular expression, it is matched as a literal substring.

When `eachBlock` is set, blocks within the named section are identified using the block pattern from `deltas[]` for that section — the same pattern expansion (`{name}` → `.+`) used by `mergeSpecs`. A block starts at a line matching the block pattern and ends at the next line matching the same pattern, the next `##`-level section header, or end of file. The `pattern` check runs against the full content of each block (including its header line and any nested sub-sections), so a rule can match content at any depth within the block — e.g. a `HAS TO` inside a `#### New Decision` sub-section within a `### Decision: {name}` block.

If `eachBlock` names a section that has no entry in `deltas[]`, `ValidateSpec` must report a configuration error — block boundaries cannot be determined without the block pattern.

#### Scenario: Pattern with {name} placeholder
- **WHEN** a rule has `pattern: "### Requirement: {name}"`
- **THEN** it matches any line of the form `### Requirement: <anything>`

#### Scenario: Regex pattern
- **WHEN** a rule has `pattern: "SHALL|MUST"`
- **THEN** it matches any occurrence of `SHALL` or `MUST` anywhere in the target content

#### Scenario: Literal pattern fallback
- **WHEN** a rule has a pattern that is not valid regex and contains no `{name}`
- **THEN** it is matched as a literal substring

#### Scenario: Pattern check inside nested sub-section
- **WHEN** a rule has `eachBlock: Decisions` and `pattern: "HAS TO"`, the block pattern is `### Decision: {name}`, and a block contains `#### New Decision: Redis` with `The system HAS TO use Redis` inside it
- **THEN** the pattern `"HAS TO"` matches because the check runs against the full block content including nested sub-sections at any depth

#### Scenario: Sub-section with name placeholder
- **WHEN** a rule has `eachBlock: Decisions` and `pattern: "#### New Decision: {name}"`, and a `### Decision: X` block contains `#### New Decision: Redis`
- **THEN** the pattern matches within that block; a block with no `#### New Decision: ` line fails

#### Scenario: eachBlock section not in deltas
- **WHEN** a rule has `eachBlock: "Decisions"` but `deltas[]` has no entry with `section: "Decisions"`
- **THEN** `ValidateSpec` must report a configuration error

### Requirement: Delta validations

`deltaValidations` on an artifact defines structural validation rules that `ValidateSpec` checks against the delta file for that artifact — not against the base spec. This is distinct from `validations`, which checks the final merged spec. These rules validate that the delta file is well-formed before the merge is attempted.

Each entry must include:

- `pattern` (string, required) — a pattern to search for; see Requirement: Pattern matching
- `required` (boolean, optional, default `true`) — whether the pattern must be present
- `scope` (string, optional) — restrict the check to a named delta section, e.g. `"ADDED Requirements"`; uses the schema's resolved operation keywords
- `eachBlock` (string, optional) — a block pattern with a `{name}` placeholder, e.g. `"### Requirement: {name}"`; runs the check once per block matching this pattern; if `scope` is also set, only blocks within that section are considered

`scope` and `eachBlock` are independent and can be combined: `scope` narrows the search space to a section, `eachBlock` iterates blocks within it.

`required` always applies to the `pattern` — `true` means absence is an error, `false` means absence is a warning. This is uniform across all modes: section not existing (for `scope`), pattern not found in section, and block not containing the pattern (for `eachBlock`) are all treated as "pattern absent". The only exception is `eachBlock` with no matching blocks — the rule passes vacuously regardless of `required`, since there is nothing to validate.

Full structural validation is expressed as three explicit rules:

```yaml
# 1. The ## ADDED Requirements section must exist
- pattern: "## ADDED Requirements"
  required: true

# 2. It must contain at least one requirement block
- pattern: "### Requirement: {name}"
  required: true
  scope: "ADDED Requirements"

# 3. Each requirement block must contain a scenario
- pattern: "#### Scenario: {name}"
  required: true
  scope: "ADDED Requirements"
  eachBlock: "### Requirement: {name}"
```

The section name in `scope` uses the schema's resolved operation keywords. If `deltaOperations.added` is `"AÑADIDO"`, the section name is `"AÑADIDO Requirements"`.

#### Scenario: Section missing with required true
- **WHEN** a rule has `scope: "ADDED Requirements"` and `required: true` and the section does not exist
- **THEN** `ValidateSpec` must report an error — the pattern was not found

#### Scenario: Section missing with required false
- **WHEN** a rule has `scope: "ADDED Requirements"` and `required: false` and the section does not exist
- **THEN** `ValidateSpec` must report a warning — the pattern was not found

#### Scenario: Per-block check passes vacuously
- **WHEN** a rule has `eachBlock: "### Requirement: {name}"` and no blocks match that pattern
- **THEN** the rule passes regardless of `required` — there is nothing to validate

#### Scenario: Per-block check fails on missing pattern
- **WHEN** a rule has `eachBlock: "### Requirement: {name}"` and one block does not contain the pattern
- **THEN** `ValidateSpec` must report an error or warning based on `required`, identifying which block is missing the pattern

#### Scenario: scope section does not exist with eachBlock
- **WHEN** a rule has `scope: "ADDED Requirements"` and `eachBlock: "### Requirement: {name}"` and the section does not exist in the delta file
- **THEN** the rule passes vacuously — the section has no blocks to iterate; use a separate file-level rule to enforce section existence

#### Scenario: Custom keywords in scope
- **WHEN** the schema defines `deltaOperations.added: "AÑADIDO"` and a rule has `scope: "AÑADIDO Requirements"`
- **THEN** the check is run against the `## AÑADIDO Requirements` section of the delta file

### Requirement: Validation rules

`validations` on an artifact defines structural validation rules checked by `ValidateSpec` against the base spec file (after merging). Each entry must include:

- `pattern` (string, required) — a pattern to search for; see Requirement: Pattern matching
- `required` (boolean, optional, default `true`) — whether the pattern must be present
- `scope` (string, optional) — restrict the check to a named section, e.g. `Requirements`
- `eachBlock` (string, optional) — a block pattern with a `{name}` placeholder, e.g. `"### Requirement: {name}"`; runs the check once per block matching this pattern; if `scope` is also set, only blocks within that section are considered

`scope` and `eachBlock` are independent and can be combined: `scope` narrows the search space to a section, `eachBlock` iterates blocks within it.

`required` always applies to the `pattern` — `true` means absence is an error, `false` means absence is a warning. This is uniform across all modes: section not existing (for `scope`), pattern not found in section, and block not containing the pattern (for `eachBlock`) are all treated as "pattern absent". The only exception is `eachBlock` with no matching blocks — the rule passes vacuously regardless of `required`, since there is nothing to validate.

Full structural validation is expressed as three explicit rules:

```yaml
# 1. The ## Requirements section must exist
- pattern: "## Requirements"
  required: true

# 2. It must contain at least one requirement block
- pattern: "### Requirement: {name}"
  required: true
  scope: Requirements

# 3. Each requirement block must contain a scenario
- pattern: "#### Scenario: {name}"
  required: true
  scope: Requirements
  eachBlock: "### Requirement: {name}"
```

#### Scenario: File-level required pattern
- **WHEN** a rule has `required: true` and no `scope` or `eachBlock`
- **THEN** `ValidateSpec` must report an error if the pattern is not found anywhere in the file

#### Scenario: Section missing with required true
- **WHEN** a rule has `scope: Requirements` and `required: true` and the section does not exist
- **THEN** `ValidateSpec` must report an error — the pattern was not found

#### Scenario: Section missing with required false
- **WHEN** a rule has `scope: Requirements` and `required: false` and the section does not exist
- **THEN** `ValidateSpec` must report a warning — the pattern was not found

#### Scenario: Per-block passes vacuously with no blocks
- **WHEN** a rule has `eachBlock: "### Requirement: {name}"` and no blocks match
- **THEN** the rule passes regardless of `required` — there is nothing to validate

#### Scenario: Per-block fails on missing pattern
- **WHEN** a rule has `eachBlock: "### Requirement: {name}"` and one block does not contain the pattern
- **THEN** `ValidateSpec` must report an error or warning based on `required`, identifying which block is missing the pattern

#### Scenario: scope section does not exist with eachBlock
- **WHEN** a rule has `scope: Requirements` and `eachBlock: "### Requirement: {name}"` and the section does not exist in the spec
- **THEN** the rule passes vacuously — the section has no blocks to iterate; use a separate file-level rule to enforce section existence

### Requirement: Per-spec approval

Any spec file touched by a delta — whether created via an `added` operation or modified via a `modified`, `removed`, or `renamed` operation — requires explicit approval before the change can be archived. Approval is tracked per spec path, not per change.

`specd archive` must refuse to proceed if any spec touched by the change has not been approved. `specd approve <spec-path>` records the approval for that spec within the current change.

A spec created by an `added` operation also requires approval: someone must take ownership of the new spec, even if ownership is granted by the same person who submitted the change.

#### Scenario: New spec requires approval
- **WHEN** a delta creates a new spec via an `added` operation
- **THEN** that spec path must be approved before archiving

#### Scenario: Modified spec requires approval
- **WHEN** a delta modifies, removes blocks from, or renames blocks in an existing spec
- **THEN** that spec path must be approved before archiving

#### Scenario: All specs approved
- **WHEN** every spec path touched by the change has been approved
- **THEN** `specd archive` proceeds without an approval error

#### Scenario: Partially approved
- **WHEN** at least one touched spec path has not been approved
- **THEN** `specd archive` must refuse and report which spec paths are pending approval

### Requirement: Context sections

`contextSections` on an artifact declares which sections of that artifact's spec files are relevant context for skills. `CompileContext` uses these declarations to extract and inject the named sections when compiling context for a skill. Each entry must include:

- `name` (string, required) — section heading to extract, e.g. `Requirements`
- `contextTitle` (string, optional) — title used for this section in the compiled context block; if omitted, `name` is used as the title

#### Scenario: Section injected
- **WHEN** an artifact has a `contextSections` entry and the spec contains that section
- **THEN** `CompileContext` includes the section content in the compiled context under the given `contextTitle`

#### Scenario: contextTitle omitted
- **WHEN** a `contextSections` entry has no `contextTitle`
- **THEN** `CompileContext` uses `name` as the context section title

#### Scenario: Section not present in spec
- **WHEN** the spec does not contain the named section
- **THEN** `CompileContext` skips that entry without error

### Requirement: requiredSpecArtifacts

`requiredSpecArtifacts` is an array of artifact IDs. Every change validated by `ValidateSpec` must have all listed artifacts present (not `missing`) before validation can succeed.

#### Scenario: Missing required artifact
- **WHEN** a change is missing an artifact listed in `requiredSpecArtifacts`
- **THEN** `ValidateSpec` must report a validation error

### Requirement: Workflow

`workflow` is an array of skill definitions. Each entry declares which artifacts must be `complete` before that skill is available, and optionally defines lifecycle hooks for that skill. Entries must include:

- `skill` (string, required) — skill name, e.g. `explore`, `plan`, `apply`, `verify`, `archive`
- `requires` (array of artifact IDs, optional) — artifacts that must be `complete` before this skill is unlocked; empty or omitted means always available
- `hooks` (object, optional) — lifecycle hooks for this skill; each key is `pre` or `post`, each value is an array of `instruction:` or `run:` hook entries

Every hook entry is either:
- `{ instruction: string }` — AI prompt injected into the compiled context for this skill
- `{ run: string }` — shell command executed at the lifecycle point; supports template variables `{{change.name}}`, `{{change.path}}`, `{{project.root}}`

**`pre` hook failure** — if a `run:` hook exits with a non-zero code, the skill is aborted and the user is informed of the failure. The skill should offer to attempt to fix the problem before retrying — for example, if a test suite fails, the skill offers to investigate and correct the failures.

**`post` hook failure** — the skill has already completed, so the operation is not rolled back. After each failing `run:` hook, the user is prompted to choose: continue with the remaining hooks, or stop.

```yaml
workflow:
  - skill: explore
    requires: []
  - skill: plan
    requires: []
  - skill: apply
    requires: [tasks]
    hooks:
      pre:
        - instruction: |
            Read pending tasks, work through them one by one,
            mark each complete as you go. Pause if you hit a blocker.
      post:
        - instruction: |
            Run the test suite and confirm all scenarios pass.
  - skill: verify
    requires: [specs]
  - skill: archive
    requires: [specs, tasks]
    hooks:
      pre:
        - run: "pnpm test"
        - instruction: |
            Review the delta specs before confirming the archive.
      post:
        - instruction: |
            Summarise what changed in this archive.
```

The order of entries in `workflow` is the intended progression of the workflow and is used by tooling to display status. It does not enforce sequential blocking between consecutive skills — each skill is independently gated by its own `requires`.

`specd.yaml` uses the same `workflow` format to add project-level hooks. Each entry only accepts `skill` and `hooks` — `requires` is not valid in `specd.yaml` workflow entries and must be rejected at load time. Entries are matched by `skill` name; schema hooks fire first, then project hooks, within the same `pre`/`post` event.

```yaml
# specd.yaml — project-level additions
workflow:
  - skill: archive
    hooks:
      post:
        - run: "pnpm run notify-team"
```

#### Scenario: Pre hook failure aborts skill
- **WHEN** a `pre` `run:` hook exits with a non-zero code
- **THEN** the skill is aborted, the user is informed of the failure, and the skill offers to attempt to fix the problem before retrying

#### Scenario: Post hook failure prompts user
- **WHEN** a `post` `run:` hook exits with a non-zero code
- **THEN** the user is prompted to choose whether to continue with remaining hooks or stop; the completed skill operation is not rolled back

#### Scenario: Skill with unsatisfied prerequisites
- **WHEN** a skill's `requires` lists an artifact that is not `complete`
- **THEN** `CompileContext` must report that the skill is blocked and which artifacts are incomplete

#### Scenario: Skill with no prerequisites
- **WHEN** a skill has an empty or omitted `requires`
- **THEN** the skill is always available regardless of artifact state

#### Scenario: Apply scans required artifacts for tasks
- **WHEN** the `apply` skill has `requires: [tasks]` and `tasks.md` contains markdown checkboxes
- **THEN** the apply skill reads pending tasks from `tasks.md` and surfaces them in the compiled context

#### Scenario: Tasks spread across multiple artifacts
- **WHEN** the `apply` skill has `requires: [tasks, specs]`
- **THEN** the apply skill scans both artifacts for checkboxes and aggregates them

#### Scenario: Schema and project hooks merged
- **WHEN** both the schema and `specd.yaml` define `workflow` entries for the same skill
- **THEN** schema hooks fire first, followed by project hooks, within the same `pre`/`post` event

#### Scenario: Project-level entry adds a new hook
- **WHEN** `specd.yaml` defines a `workflow` entry for a skill with no hooks in the schema
- **THEN** the project hooks are appended without error

### Requirement: Project-level artifactRules

`artifactRules` in `specd.yaml` allows teams to add per-artifact constraints without forking the schema. Each key is an artifact ID; each value is an array of rule strings. `CompileContext` injects them alongside the schema-defined instruction as a distinct constraints block.

```yaml
# specd.yaml
artifactRules:
  specs:
    - "All requirements must reference the relevant RFC number"
  design:
    - "Architecture decisions must note which ADR they relate to"
```

Rule keys are validated against the active schema's artifact IDs on load. Unknown keys produce a warning but do not prevent startup. Rules are additive — they extend the schema's instruction, not replace it.

#### Scenario: Rules injected into compiled context
- **WHEN** `specd.yaml` defines artifactRules for artifact `specs`
- **THEN** `CompileContext` includes those artifactRules in the compiled instruction block for the `specs` artifact, clearly marked as constraints the agent must follow but not copy into its output

#### Scenario: Unknown artifact ID in artifactRules
- **WHEN** `specd.yaml` defines artifactRules for an artifact ID not present in the active schema
- **THEN** `SchemaRegistry` emits a warning at load time and ignores those artifactRules

### Requirement: Schema resolution order

`SchemaRegistry.resolve(name)` must search for `schema.yaml` in the following order:

1. `<schemasPath>/<name>/schema.yaml` — project-local, where `schemasPath` is the path configured in `specd.yaml` (default: `specd/schemas`)
2. `~/.local/share/specd/schemas/<name>/schema.yaml` — user-global override
3. `node_modules/@specd/schema-<name>/schema.yaml` — installed npm package

The first match wins. If no match is found, `resolve()` must throw a `SchemaNotFoundError`.

The project-local schemas path is declared in `specd.yaml`:

```yaml
# specd.yaml
schemas:
  path: specd/schemas   # default; relative to project root
```

#### Scenario: Project-local override takes precedence
- **WHEN** a schema with the same name exists both locally and in node_modules
- **THEN** the project-local version is used

#### Scenario: Configured schemas path is respected
- **WHEN** `specd.yaml` sets `schemas.path` to a non-default value
- **THEN** `SchemaRegistry` searches that path instead of the default

#### Scenario: Schema not found
- **WHEN** no file matches in any search location
- **THEN** `SchemaRegistry.resolve()` must throw `SchemaNotFoundError`

### Requirement: Schema validation on load

`SchemaRegistry.resolve()` must validate the parsed YAML against the schema structure before returning it. Unknown top-level fields must be ignored (forward compatibility). Missing required fields and structural duplicates must produce a `SchemaValidationError`.

#### Scenario: Unknown field ignored
- **WHEN** a schema file includes a top-level field not in the current spec
- **THEN** the schema loads successfully and the unknown field is ignored

#### Scenario: Duplicate artifact ID
- **WHEN** a schema file declares two artifacts with the same `id`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Duplicate delta section
- **WHEN** an artifact declares two `deltas` entries with the same `section`
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Duplicate workflow skill
- **WHEN** the `workflow` array contains two entries with the same `skill` name
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

#### Scenario: Unknown artifact ID in requires
- **WHEN** an artifact declares `requires: [unknown-id]` and no artifact with that ID exists in the schema
- **THEN** `SchemaRegistry.resolve()` must throw a `SchemaValidationError`

## Constraints

- The `deltas[].section` name is case-sensitive and must match the `## {section}` heading in the base spec exactly
- The `scope` name in `validations[]` and `deltaValidations[]` is case-sensitive and must match the section heading exactly
- The `{name}` placeholder must appear exactly once in `deltas[].pattern` fields and in `eachBlock` values — these are always block header patterns; validation `pattern` fields may omit `{name}` entirely and use plain regex instead
- `artifact.id` must match `/^[a-z][a-z0-9-]*$/` (lowercase letters, digits, hyphens; must start with a letter) and must be unique within a schema
- `deltas[].section` must be unique within an artifact — duplicate section names in the same `deltas` array are a schema validation error
- `workflow[].skill` must be unique — duplicate skill names in the same `workflow` array are a schema validation error
- `requires` must not contain cycles; circular dependencies in the artifact graph are a schema validation error
- `eachBlock` must contain a `{name}` placeholder — it is always a block pattern, never a plain section name
- `required` on an `eachBlock` rule only applies when a block exists but the pattern is missing; it does not enforce block existence
- `mergeSpecs` must not hardcode operation keywords; it receives them from the resolved schema's `deltaOperations` field
- `deltaValidations[].scope` strings must use the schema's resolved operation keywords, not the specd defaults, when the schema overrides them
- Block order in the merged spec is preserved from the original; ADDED blocks are always appended after existing blocks
- The order of entries in `workflow` is the intended display order for tooling; it does not enforce sequential blocking between consecutive skills
- `requires` in `specd.yaml` workflow entries is invalid and must be rejected at load time; only `skill` and `hooks` are accepted

## Schema Example

```yaml
name: spec-driven
version: 1
description: Proposal → specs → design → tasks workflow

# Optional: override default operation keywords
# deltaOperations:
#   added:    "ADDED"
#   modified: "MODIFIED"
#   removed:  "REMOVED"
#   renamed:  "RENAMED"

requiredSpecArtifacts:
  - specs

artifacts:
  - id: proposal
    generates: proposal.md
    description: Initial proposal outlining why the change is needed
    template: templates/proposal.md
    instruction: |
      Create the proposal document that establishes WHY this change is needed.
    requires: []

  - id: specs
    generates: "specs/**/spec.md"
    description: Detailed specifications defining what the system should do
    template: templates/spec.md
    requires:
      - proposal
    deltas:
      - section: Requirements
        pattern: "### Requirement: {name}"
    deltaValidations:
      # ADDED and MODIFIED requirement blocks must each contain a scenario
      - pattern: "#### Scenario: {name}"
        required: true
        scope: "ADDED Requirements"
        eachBlock: "### Requirement: {name}"
      - pattern: "#### Scenario: {name}"
        required: true
        scope: "MODIFIED Requirements"
        eachBlock: "### Requirement: {name}"
      # ADDED and MODIFIED requirement blocks must use normative language
      - pattern: "SHALL|MUST"
        required: true
        scope: "ADDED Requirements"
        eachBlock: "### Requirement: {name}"
      - pattern: "SHALL|MUST"
        required: true
        scope: "MODIFIED Requirements"
        eachBlock: "### Requirement: {name}"
    validations:
      - pattern: "## Purpose"
        required: true
      - pattern: "## Requirements"
        required: true
      - pattern: "### Requirement: {name}"
        required: true
        scope: Requirements
      - pattern: "#### Scenario: {name}"
        required: true
        scope: Requirements
        eachBlock: "### Requirement: {name}"
      - pattern: "SHALL|MUST"
        required: true
        scope: Requirements
        eachBlock: "### Requirement: {name}"
    instruction: |
      Create specification files defining WHAT the system should do.

  - id: design
    generates: design.md
    description: Technical design with implementation decisions
    template: templates/design.md
    requires:
      - proposal
    instruction: |
      Create the design document explaining HOW to implement the change.

  - id: tasks
    generates: tasks.md
    description: Implementation checklist with trackable tasks
    template: templates/tasks.md
    requires:
      - specs
      - design
    instruction: |
      Create the task list breaking down the implementation work.

workflow:
  - skill: explore
    requires: []
  - skill: plan
    requires: []
  - skill: apply
    requires: [tasks]
    hooks:
      pre:
        - instruction: |
            Read pending tasks, work through them one by one,
            mark each complete as you go. Pause if you hit a blocker.
  - skill: verify
    requires: [specs]
  - skill: archive
    requires: [specs, tasks]
    hooks:
      pre:
        - instruction: |
            Review the delta specs before confirming the archive.
      post:
        - instruction: |
            Summarise what changed in this archive.
```

## Spec Dependencies

_none — this is a global constraint spec_

## ADRs

- [ADR-0010: Schema Format Design](../../../docs/adr/0010-schema-format.md)
