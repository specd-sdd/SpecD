# ADR-0010: Schema Format Design

## Status

Accepted — 2026-02-20

## Context and Problem Statement

specd needs a schema system that defines the artifact workflow for a project (what artifacts exist, how they relate, how they are validated, how their sections are merged). The schema format must satisfy several constraints: artifact instructions must be schema-defined and agent-agnostic; delta merging must be schema-driven with no hardcoded section names or keywords; structural validation rules must be declared in the schema, not in specd's core code; `CompileContext` must be able to inject relevant sections of existing specs with roles defined by the schema; and third-party schemas must be distributable as npm packages with project-local and user-level overrides.

## Decision Drivers

- Agent-agnostic instructions — each artifact carries an `instruction` field that the AI reads; it must be schema-defined, not hardcoded in specd
- Schema-driven delta merging — `mergeSpecs` must not hardcode section names, block header patterns, or operation keywords; these come from the schema
- Structural validation — `ValidateSpec` must evaluate rules defined in the schema, not in specd's core code
- Injectable context — `CompileContext` must inject relevant sections of existing specs with section names and roles defined by the schema
- Extensibility — third-party schemas must be installable as npm packages; project-local and user-level overrides must be supported

## Considered Options

- **Spec-driven baseline format** — `deltas[]`, `validations[]`, `changeVerify`, `apply` keys; evaluated as the starting point
- **Adopted format** — derives directly from the baseline with configurable operation keywords, `deltaValidations[]` replacing `changeVerify`, `contextSections[]` for injectable context, `workflow` replacing `apply`, and three-level schema resolution

## Decision Outcome

Chosen option: "Adopted format derived from the spec-driven baseline", because it resolves the baseline's inflexibilities — hardcoded operation keywords, conflated validation and approval concerns, missing context injection, and a fixed resolution path — while preserving its core structure.

The nine key decisions are as follows:

### 1. Operation keywords are configurable at schema level

The delta operation keywords (`ADDED`, `MODIFIED`, `REMOVED`, `RENAMED`) and the RENAMED pair markers (`FROM`, `TO`) are specd's built-in defaults but are all overridable via the schema's top-level `deltaOperations` field. This allows schemas to use localized or team-specific terminology (e.g. `AÑADIDO/MODIFICADO/ELIMINADO/RENOMBRADO` with `DE/A`) without forking specd. `mergeSpecs` and `ValidateSpec` read all keywords from the resolved schema — they do not hardcode the defaults.

The section content they target (e.g. `Requirements`) and the block header pattern (e.g. `### Requirement: {name}`) are schema-defined via `deltas[].section` and `deltas[].pattern`.

### 2. Fixed merge order: RENAMED → REMOVED → MODIFIED → ADDED

Operations are applied in this fixed sequence. RENAMED is resolved first so that subsequent REMOVED and MODIFIED operations can reference the new name. ADDED is last so new blocks cannot conflict with existing blocks being modified or removed in the same merge.

`mergeSpecs` runs conflict detection before applying any changes: duplicates within a section, cross-section conflicts (same name in MODIFIED+REMOVED, etc.), and RENAMED interplay (MODIFIED referencing an old `FROM` name, ADDED using a `TO` name that is already taken).

### 3. `deltaValidations[]` replaces `changeVerify`; approval is per-spec

The baseline's `changeVerify` field hardcoded which artifact held requirements/scenarios and what patterns identified them, in order to validate delta structure and trigger approval. This conflates two concerns and prevents schema customization.

specd replaces `changeVerify` with two independent mechanisms:

- **`deltaValidations[]`** on each artifact — structural validation rules applied to the delta file itself (analogous to `validations[]` on the base spec). Both `validations[]` and `deltaValidations[]` share the same three-mode rule structure: file-level (no qualifier — pattern must appear anywhere in the file), section-level (`scope` — pattern must appear somewhere within the named section), and per-block (`eachBlock` — pattern must appear within the body of every block in the named section). `scope` and `eachBlock` are mutually exclusive. Section names in `deltaValidations[]` use the schema's resolved operation keywords (e.g. `"ADDED Requirements"` instead of a base spec section name). This replaces the hardcoded scenario/normative-language checks that `changeVerify` performed.
- **Per-spec approval** — any spec file touched by a delta (via any operation) requires explicit approval before archiving. This is a specd-level workflow rule, not a schema-level concern. `specd archive` refuses if any touched spec is unapproved. `specd approve <spec-path>` records approval per spec within the current change. A spec created via `added` also requires approval so that ownership is explicitly claimed.

This separation means `deltaValidations[]` is purely structural, and the approval requirement applies uniformly to all operations regardless of schema.

### 4. `contextSections[]` added for injectable context

The baseline has no mechanism for injecting existing spec content into AI context. specd adds a `contextSections[]` array on each artifact. Every entry declares a section name to extract and an optional `contextTitle` for the compiled context block. `CompileContext` injects all declared sections — there is no opt-in flag; presence in the array means injection. This avoids sending full spec file content to the AI while still providing relevant context.

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

### Consequences

- Good: `mergeSpecs` and `ValidateSpec` are fully schema-driven with no hardcoded section names, patterns, or keywords
- Good: teams can localize operation keywords without forking specd
- Good: `deltaValidations[]` and per-spec approval are cleanly separated concerns
- Good: `contextSections[]` enables targeted context injection without sending full file content to the AI
- Good: three-level schema resolution supports community schemas, user overrides, and project overrides in a consistent pattern
- Good: templates ship as first-class files with editor support, versioned alongside the schema
- Good: `artifactRules` lets teams extend any community schema without forking it
- Bad: `mergeSpecs` must be updated — the current implementation hardcodes defaults and applies operations without conflict checks; both must be changed
- Bad: `ApproveChange` must become per-spec rather than per-change, requiring a manifest format update
- Bad: `SchemaRegistry` load-time validation adds startup cost proportional to the number of referenced template files

### Confirmation

`specs/_global/schema-format/verify.md` scenarios serve as acceptance tests for the format. `mergeSpecs` unit tests verify schema-driven section resolution, configurable operation keywords, fixed apply order (RENAMED → REMOVED → MODIFIED → ADDED), and conflict detection before any mutation. `ValidateSpec` unit tests verify `validations[]`, `deltaValidations[]` (all three modes: file-level, `scope`, `eachBlock`), and that `deltaValidations[]` section names use the schema's resolved `deltaOperations` keywords.

## Spec

- [`specs/_global/schema-format/spec.md`](../../specs/_global/schema-format/spec.md)
