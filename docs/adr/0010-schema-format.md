---
status: accepted
date: 2026-02-20
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0010: Schema Format Design

## Context and Problem Statement

SpecD needs a schema system that defines the artifact workflow for a project (what artifacts exist, how they relate, how they are validated, how their sections are merged). The schema format must satisfy several constraints: artifact instructions must be schema-defined and agent-agnostic; delta merging must be schema-driven with no hardcoded section names or keywords; structural validation rules must be declared in the schema, not in SpecD's core code; `CompileContext` must be able to inject relevant sections of existing specs with roles defined by the schema; and third-party schemas must be distributable as npm packages with project-local and user-level overrides.

## Decision Drivers

- Agent-agnostic instructions — each artifact carries an `instruction` field that the AI reads; it must be schema-defined, not hardcoded in SpecD
- Schema-driven delta merging — `mergeSpecs` must not hardcode section names, block header patterns, or operation keywords; these come from the schema
- Structural validation — `ValidateSpec` must evaluate rules defined in the schema, not in SpecD's core code
- Injectable context — `CompileContext` must inject relevant sections of existing specs with section names and roles defined by the schema
- Extensibility — third-party schemas must be installable as npm packages; project-local and user-level overrides must be supported

## Considered Options

- **Spec-driven baseline format** — `deltas[]`, `validations[]`, `changeVerify`, `apply` keys; evaluated as the starting point
- **Adopted format** — derives directly from the baseline with configurable operation keywords, `deltaValidations[]` replacing `changeVerify`, `metadataExtraction` for injectable context, `workflow` replacing `apply`, and three-level schema resolution

## Decision Outcome

Chosen option: "Adopted format derived from the spec-driven baseline", because it resolves the baseline's inflexibilities — hardcoded operation keywords, conflated validation and approval concerns, missing context injection, and a fixed resolution path — while preserving its core structure.

The fourteen key decisions are as follows. Decisions 1–8 define the original schema format; decisions 9–14 extend it with a schema customisation model.

### 1. Operation keywords are configurable at schema level

The delta operation keywords (`ADDED`, `MODIFIED`, `REMOVED`, `RENAMED`) and the RENAMED pair markers (`FROM`, `TO`) are SpecD's built-in defaults but are all overridable via the schema's top-level `deltaOperations` field. This allows schemas to use localized or team-specific terminology (e.g. `AÑADIDO/MODIFICADO/ELIMINADO/RENOMBRADO` with `DE/A`) without forking SpecD. `mergeSpecs` and `ValidateSpec` read all keywords from the resolved schema — they do not hardcode the defaults.

The section content they target (e.g. `Requirements`) and the block header pattern (e.g. `### Requirement: {name}`) are schema-defined via `deltas[].section` and `deltas[].pattern`.

### 2. Fixed merge order: RENAMED → REMOVED → MODIFIED → ADDED

Operations are applied in this fixed sequence. RENAMED is resolved first so that subsequent REMOVED and MODIFIED operations can reference the new name. ADDED is last so new blocks cannot conflict with existing blocks being modified or removed in the same merge.

`mergeSpecs` runs conflict detection before applying any changes: duplicates within a section, cross-section conflicts (same name in MODIFIED+REMOVED, etc.), and RENAMED interplay (MODIFIED referencing an old `FROM` name, ADDED using a `TO` name that is already taken).

### 3. `deltaValidations[]` replaces `changeVerify`; approval is per-spec

The baseline's `changeVerify` field hardcoded which artifact held requirements/scenarios and what patterns identified them, in order to validate delta structure and trigger approval. This conflates two concerns and prevents schema customization.

SpecD replaces `changeVerify` with two independent mechanisms:

- **`deltaValidations[]`** on each artifact — structural validation rules applied to the delta file itself (analogous to `validations[]` on the base spec). Both `validations[]` and `deltaValidations[]` share the same three-mode rule structure: file-level (no qualifier — pattern must appear anywhere in the file), section-level (`scope` — pattern must appear somewhere within the named section), and per-block (`eachBlock` — pattern must appear within the body of every block in the named section). `scope` and `eachBlock` are mutually exclusive. Section names in `deltaValidations[]` use the schema's resolved operation keywords (e.g. `"ADDED Requirements"` instead of a base spec section name). This replaces the hardcoded scenario/normative-language checks that `changeVerify` performed.
- **Per-spec approval** — any spec file touched by a delta (via any operation) requires explicit approval before archiving. This is a SpecD-level workflow rule, not a schema-level concern. `specd archive` refuses if any touched spec is unapproved. `specd approve <spec-path>` records approval per spec within the current change. A spec created via `added` also requires approval so that ownership is explicitly claimed.

This separation means `deltaValidations[]` is purely structural, and the approval requirement applies uniformly to all operations regardless of schema.

### 4. `metadataExtraction` added for injectable context

The baseline has no mechanism for injecting existing spec content into AI context. SpecD adds a top-level `metadataExtraction` field on the schema. Every entry declares a section name to extract and an optional `contextTitle` for the compiled context block. `CompileContext` injects all declared sections — there is no opt-in flag; presence in the array means injection. This avoids sending full spec file content to the AI while still providing relevant context.

### 5. Three-level schema resolution

Schemas are resolved in order: project-local → user-global → npm package (`@specd/schema-<name>`). This allows per-project overrides without forking the schema package. Other tools use a similar pattern (Prettier plugins, ESLint configs).

The project-local path is not hardcoded — it comes from the `schemas.path` field in `specd.yaml` (default: `specd/schemas`). This is consistent with how storage paths are configured and lets teams place schemas wherever fits their repo layout.

### 6. Schema validation on load

`SchemaRegistry.resolve()` validates the schema structure before returning it. Unknown fields are ignored (forward compatibility). Missing required fields throw `SchemaValidationError`. This means schema bugs surface at startup, not mid-workflow.

### 7. `workflow` replaces `apply`; hooks live inside workflow entries

A top-level `workflow` array replaces the dedicated `apply` key. Each entry declares a skill name, the artifact IDs that must be `complete` before that skill is available, and optionally `hooks.pre` / `hooks.post` arrays of `instruction:` and `run:` hook entries. This unifies prerequisite gating and lifecycle hooks in a single structure.

`tracks` is dropped entirely. For skills that work through a task list (e.g. `apply`), the skill scans all artifacts listed in its `requires` for markdown checkboxes. The `requires` list implicitly defines where the work is — no separate pointer needed.

### 8. Templates are files bundled with the schema; HTML comments are valid

Each artifact can declare a `template` field — a path relative to the directory containing `schema.yaml`. By convention templates live in a `templates/` subdirectory, but the path is explicit in the field so authors can place them elsewhere if needed.

`SchemaRegistry.resolve()` reads all referenced template files at load time. If a referenced file does not exist, `resolve()` throws a `SchemaValidationError`. Template content is plain markdown — no interpolation or placeholder substitution. HTML comments (`<!-- ... -->`) are valid and preserved as-is in the scaffolded file; they serve as guidance hints for the AI generating the artifact.

This approach keeps templates as first-class files with full editor support (syntax highlighting, preview) rather than embedding content as YAML multiline strings. Bundling them with the schema package means they are distributed and versioned together.

### 9. Three customisation mechanisms: `extends`, `schemaPlugins`, `schemaOverrides`

The monolithic schema model required forking an entire schema for any customisation. Three complementary mechanisms replace this:

- **`extends`** — a schema-level field (`extends: string`) that declares a parent schema. The child inherits all parent definitions and may override or extend them. Chains are permitted (`A extends B extends C`); cycles produce `SchemaValidationError`. Both parent and child must have `kind: schema`.
- **`schemaPlugins`** — a `specd.yaml`-level field (`schemaPlugins: string[]`) that lists schema-plugin references. Each plugin is a partial schema (`kind: schema-plugin`) containing only `description` and merge operations — no artifacts, workflow, or metadataExtraction of its own. Plugins are applied after extends resolution.
- **`schemaOverrides`** — a `specd.yaml`-level inline block (`schemaOverrides: { create?, remove?, set?, append?, prepend? }`) for project-specific customisations. Applied last, after plugins.

All three feed into a unified merge engine (`mergeSchemaLayers`) that applies operations in a fixed order. The resolution pipeline is: resolve base schema → resolve extends chain → resolve plugins → apply overrides → `buildSchema`.

### 10. Five merge operations with fixed intra-layer order

The merge engine supports five operations, applied in this fixed order within each layer:

1. **`remove`** — delete entries from arrays by `id`/`step`, or remove scalar fields entirely
2. **`create`** — add new entries to arrays (must not collide with existing `id`/`step`)
3. **`prepend`** — insert entries at the beginning of arrays, in declaration order
4. **`append`** — insert entries at the end of arrays, in declaration order
5. **`set`** — replace scalar values (last-writer-wins for scalars)

This fixed order ensures deterministic results regardless of declaration order within a layer. Cross-layer order is: extends → plugins (in declaration order) → overrides.

### 11. `kind` field as schema type discriminator

Every schema file must declare a `kind` field:

- `kind: schema` — a full schema with artifacts, workflow, metadataExtraction, and optional `extends`
- `kind: schema-plugin` — a partial schema containing only `description` and merge operations (no artifacts, workflow, or metadataExtraction)

`kind` is required. Omitting it is a `SchemaValidationError`. This allows tooling and the merge engine to distinguish full schemas from plugins without inspecting content heuristically.

### 12. Mandatory `id` on all array entries

Every entry in schema arrays — `workflow[].hooks.pre[]`, `workflow[].hooks.post[]`, `artifacts[].validations[]`, `artifacts[].deltaValidations[]`, `artifacts[].rules.pre[]`, `artifacts[].rules.post[]`, `artifacts[].preHashCleanup[]`, and `metadataExtraction.*[]` — must carry an `id` field.

Format: `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, 1–64 characters. IDs must be unique within their immediate array.

Identity matching by `id` is how the merge engine targets specific entries for `remove`, `set`, and positional operations. Without mandatory IDs, the merge engine would need fragile content-based or index-based matching.

Workflow steps use `step` instead of `id` as their identity field — the `step` name already serves this role.

### 13. `rules.pre` / `rules.post` on artifacts

Each artifact may declare `rules: { pre: [], post: [] }` — arrays of `{ id, instruction }` entries. `CompileContext` injects them as constraint blocks:

- `rules.pre` — injected **before** the artifact's `instruction`
- `rules.post` — injected **after** the artifact's `instruction`

Project-specific rules are expressed as `schemaOverrides.append.artifacts[].rules.post` (or `.pre`), which supports both pre and post positions and all five merge operations.

### 14. `schemaOverrides` replaces `artifactRules` and `workflow` in `specd.yaml`

Two former `specd.yaml` fields are replaced by `schemaOverrides`:

- **`artifactRules`** — replaced by `schemaOverrides` targeting `artifacts[].rules.post` (or `.pre`). The override model subsumes `artifactRules` with more granular control.
- **`workflow`** (project-level hook additions) — replaced by `schemaOverrides` targeting `workflow[].hooks`. The override model allows not just appending hooks but also removing, prepending, or replacing them.

### Consequences

- Good, because `mergeSpecs` and `ValidateSpec` are fully schema-driven with no hardcoded section names, patterns, or keywords
- Good, because teams can localize operation keywords without forking SpecD
- Good, because `deltaValidations[]` and per-spec approval are cleanly separated concerns
- Good, because `metadataExtraction` enables targeted context injection without sending full file content to the AI
- Good, because three-level schema resolution supports community schemas, user overrides, and project overrides in a consistent pattern
- Good, because templates ship as first-class files with editor support, versioned alongside the schema
- Good, because the three customisation mechanisms (`extends`, `schemaPlugins`, `schemaOverrides`) eliminate the need to fork schemas for any level of customisation
- Good, because a unified merge engine with five operations and fixed order ensures deterministic, composable schema customisation
- Good, because mandatory `id` on array entries enables stable identity matching across schema layers
- Good, because `rules.pre`/`rules.post` on artifacts provide expressive control over constraint injection (before/after instruction, all five operations)
- Good, because `schemaOverrides` consolidates all project-level customisation into a single mechanism, reducing config surface
- Bad, because `mergeSpecs` must be updated — the current implementation hardcodes defaults and applies operations without conflict checks; both must be changed
- Bad, because `ApproveChange` must become per-spec rather than per-change, requiring a manifest format update
- Bad, because `SchemaRegistry` load-time validation adds startup cost proportional to the number of referenced template files
- Bad, because mandatory `id` on all array entries adds verbosity to schema files — every hook, validation rule, and cleanup entry needs a unique identifier

### Confirmation

`specs/core/schema-format/verify.md` scenarios serve as acceptance tests for the format, including `kind`, `extends`, `id` uniqueness, and `rules.pre`/`rules.post` semantics. `specs/core/schema-merge/verify.md` scenarios cover the five merge operations, layer ordering, identity matching, and post-merge validation. `mergeSpecs` unit tests verify schema-driven section resolution, configurable operation keywords, fixed apply order (RENAMED → REMOVED → MODIFIED → ADDED), and conflict detection before any mutation. `ValidateSpec` unit tests verify `validations[]`, `deltaValidations[]` (all three modes: file-level, `scope`, `eachBlock`), and that `deltaValidations[]` section names use the schema's resolved `deltaOperations` keywords.

## More Information

### Spec

- [`specs/core/schema-format/spec.md`](../../specs/core/schema-format/spec.md)
- [`specs/core/schema-merge/spec.md`](../../specs/core/schema-merge/spec.md)
