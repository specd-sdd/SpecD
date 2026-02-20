# ADR-0010: Schema Format Design

## Status

Accepted

## Context

specd needs a schema system that defines the artifact workflow for a project (what artifacts exist, how they relate, how they are validated, how their sections are merged). The schema format must satisfy several constraints:

1. **Agent-agnostic instructions** — each artifact carries an `instruction` field that the AI reads; it must be schema-defined, not hardcoded in specd.
2. **Schema-driven delta merging** — the `mergeSpecs` function must not hardcode section names, block header patterns, or operation keywords; these come from the schema's `deltas[]` config and `deltaOperations` field.
3. **Structural validation** — `ValidateSpec` must evaluate rules defined in the schema, not in specd's core code. This applies to both base spec files (`validations[]`) and delta files (`deltaValidations[]`).
4. **Injectable context** — `CompileContext` must be able to include relevant sections of existing specs in the AI context, with section names and roles defined by the schema.
5. **Extensibility** — third-party schemas must be installable as npm packages; project-local and user-level overrides must be supported.

A spec-driven schema format (with `deltas[]`, `validations[]`, `changeVerify`, `apply`) was evaluated as the baseline.

## Decision

specd adopts a schema format directly derived from the evaluated baseline, with the following key decisions:

### 1. Operation keywords are configurable at schema level

The delta operation keywords (`ADDED`, `MODIFIED`, `REMOVED`, `RENAMED`) and the RENAMED pair markers (`FROM`, `TO`) are specd's built-in defaults but are all overridable via the schema's top-level `deltaOperations` field. This allows schemas to use localized or team-specific terminology (e.g. `AÑADIDO/MODIFICADO/ELIMINADO/RENOMBRADO` with `DE/A`) without forking specd. `mergeSpecs` and `ValidateSpec` read all keywords from the resolved schema — they do not hardcode the defaults.

The section content they target (e.g. `Requirements`) and the block header pattern (e.g. `### Requirement: {name}`) are schema-defined via `deltas[].section` and `deltas[].pattern`.

### 2. Fixed merge order: RENAMED → REMOVED → MODIFIED → ADDED

Operations are applied in this fixed sequence. RENAMED is resolved first so that subsequent REMOVED and MODIFIED operations can reference the new name. ADDED is last so new blocks cannot conflict with existing blocks being modified or removed in the same merge.

`mergeSpecs` runs conflict detection before applying any changes: duplicates within a section, cross-section conflicts (same name in MODIFIED+REMOVED, etc.), and RENAMED interplay (MODIFIED referencing an old `FROM` name, ADDED using a `TO` name that is already taken).

### 3. `deltaValidations[]` replaces `changeVerify`; approval is per-spec

The evaluated baseline's `changeVerify` field hardcoded which artifact held requirements/scenarios and what patterns identified them, in order to validate delta structure and trigger approval. This conflates two concerns and prevents schema customization.

specd replaces `changeVerify` with two independent mechanisms:

- **`deltaValidations[]`** on each artifact — structural validation rules applied to the delta file itself (analogous to `validations[]` on the base spec). Both `validations[]` and `deltaValidations[]` share the same three-mode rule structure: file-level (no qualifier — pattern must appear anywhere in the file), section-level (`scope` — pattern must appear somewhere within the named section), and per-block (`eachBlock` — pattern must appear within the body of every block in the named section). `scope` and `eachBlock` are mutually exclusive. Section names in `deltaValidations[]` use the schema's resolved operation keywords (e.g. `"ADDED Requirements"` instead of a base spec section name). This replaces the hardcoded scenario/normative-language checks that `changeVerify` performed.
- **Per-spec approval** — any spec file touched by a delta (via any operation) requires explicit approval before archiving. This is a specd-level workflow rule, not a schema-level concern. `specd archive` refuses if any touched spec is unapproved. `specd approve <spec-path>` records approval per spec within the current change. A spec created via `added` also requires approval so that ownership is explicitly claimed.

This separation means `deltaValidations[]` is purely structural, and the approval requirement applies uniformly to all operations regardless of schema.

### 4. `sections[]` added for injectable context

The evaluated baseline has no mechanism for injecting existing spec content into AI context. specd adds a `contextSections[]` array on each artifact. Every entry declares a section name to extract and an optional `contextTitle` for the compiled context block. `CompileContext` injects all declared sections — there is no opt-in flag; presence in the array means injection. This avoids sending full spec file content to the AI while still providing relevant context.

### 5. Three-level schema resolution

Schemas are resolved in order: project-local → user-global → npm package (`@specd/schema-<name>`). This allows per-project overrides without forking the schema package. Other tools use a similar pattern (Prettier plugins, ESLint configs).

The project-local path is not hardcoded — it comes from the `schemas.path` field in `specd.yaml` (default: `specd/schemas`). This is consistent with how storage paths are configured and lets teams place schemas wherever fits their repo layout.

### 6. Schema validation on load

`SchemaRegistry.resolve()` validates the schema structure before returning it. Unknown fields are ignored (forward compatibility). Missing required fields throw `SchemaValidationError`. This means schema bugs surface at startup, not mid-workflow.

### 7. `workflow` replaces `apply`; hooks live inside workflow entries

A top-level `workflow` array replaces the dedicated `apply` key. Each entry declares a skill name, the artifact IDs that must be `complete` before that skill is available, and optionally `hooks.pre` / `hooks.post` arrays of `instruction:` and `run:` hook entries. This unifies prerequisite gating and lifecycle hooks in a single structure.

`tracks` is dropped entirely. For skills that work through a task list (e.g. `apply`), the skill scans all artifacts listed in its `requires` for markdown checkboxes. The `requires` list implicitly defines where the work is — no separate pointer needed.

`specd.yaml` uses the same `workflow` format for project-level hook additions. Entries are matched by `skill` name; schema hooks fire first, then project hooks. This gives both levels a consistent format rather than a flat `hooks.pre-archive` key only available at project level.

### 8. Templates are files bundled with the schema; HTML comments are valid

Each artifact can declare a `template` field — a path relative to the directory containing `schema.yaml`. By convention templates live in a `templates/` subdirectory, but the path is explicit in the field so authors can place them elsewhere if needed.

`SchemaRegistry.resolve()` reads all referenced template files at load time. If a referenced file does not exist, `resolve()` throws a `SchemaValidationError`. Template content is plain markdown — no interpolation or placeholder substitution. HTML comments (`<!-- ... -->`) are valid and preserved as-is in the scaffolded file; they serve as guidance hints for the AI generating the artifact.

This approach keeps templates as first-class files with full editor support (syntax highlighting, preview) rather than embedding content as YAML multiline strings. Bundling them with the schema package means they are distributed and versioned together.

### 9. `artifactRules` in `specd.yaml` for project-level constraints

Teams often need to add project-specific constraints to artifact generation (e.g. "all requirements must reference the relevant RFC") without forking the schema. A top-level `artifactRules` field in `specd.yaml` provides this: keyed by artifact ID, each value is an array of rule strings injected by `CompileContext` alongside the schema's instruction.

This avoids the schema fork problem — the team picks a community schema and adds project-specific constraints locally. Rules are validated against the active schema's artifact IDs on load (unknown IDs produce a warning, not an error). Rules are `instruction:`-only; `run:` hooks are not supported here.

## Consequences

- `mergeSpecs` must accept `deltaConfigs: DeltaConfig[]`, `deltaOperations: OperationKeywords`, and perform conflict detection before applying any changes — the current implementation hardcodes defaults and applies operations without conflict checks; both must be updated
- `mergeSpecs` apply order is fixed: RENAMED → REMOVED → MODIFIED → ADDED
- `ValidateSpec` must read `artifact.validations[]` and `artifact.deltaValidations[]` from the schema; `deltaValidations[]` supports `scope`, `eachBlock`, and uses the schema's resolved `deltaOperations` keywords
- `ValidateSpec` must enforce `schema.requiredSpecArtifacts`: if any listed artifact ID is absent from the change, validation must fail with an error
- `ValidateSpec` must track which spec paths are touched by a delta and record them as requiring approval in the change manifest
- `ApproveChange` must become per-spec: `specd approve <spec-path>` records approval for a single spec path within the current change
- `ArchiveChange` must verify that all touched spec paths have been approved before proceeding
- `CompileContext` must read `artifact.contextSections[]` and `schema.workflow[]` from the schema; skill availability is gated by `workflow[].requires`; skills that work through task lists scan their required artifacts for checkboxes — no `tracks` pointer needed
- `CompileContext` must read `specd.yaml` `artifactRules` and inject them as a distinct constraints block in the compiled output; unknown artifact IDs emit a warning at load time
- `SchemaRegistry` must validate schemas on load, support three resolution locations, and read template files at load time — missing template files, duplicate artifact IDs, duplicate delta sections, duplicate workflow skill names, and unknown artifact IDs in `requires` are all `SchemaValidationError`
- Third-party schemas can be distributed as npm packages named `@specd/schema-<name>`; template files are bundled alongside `schema.yaml` and distributed as part of the package
- The standard schema ships in `@specd/schema-std` (spec-driven workflow) and `@specd/schema-openspec` (compatibility bridge)

## Spec

- [`specs/_global/schema-format/spec.md`](../../specs/_global/schema-format/spec.md)
