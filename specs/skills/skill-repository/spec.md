# skills:skill-repository

## Purpose

Defines the `SkillRepository` interface that provides access to skills and their bundles. The repository owns skill template discovery, skill metadata loading, shared template resolution, and capability-aware bundle rendering through `@specd/skills`.

## Requirements

### Requirement: list() method

The `list()` method MUST:

- Return an array of all `Skill` objects (metadata only, no template content)
- Scan both `templates/skills/` and `templates/agents/` directories
- Correctlty set the `kind` property for each skill based on its parent directory
- Return `readonly Skill[]`

### Requirement: get() method

The `get()` method MUST:

- Accept a `name: string` parameter
- Return `Skill | undefined` — the skill with that name, or undefined if not found

### Requirement: getBundle() method

The `getBundle()` method MUST:

- accept `name: string` and optional structured render context
- return `SkillBundle` with all template files resolved
- load the target skill's `skill.meta.json`
- normalize the provided capability list into the internal template capability model
- validate that `requiredCapabilities` are satisfied before rendering skill templates
- validate that templates do not rely on undeclared shared template requirements
- render template content using recursive variables and normalized capabilities

The repository interface MUST NOT require callers to pass pre-normalized capability objects.

### Requirement: listSharedFiles() method

The `listSharedFiles()` method MUST:

- scan the `templates/shared/` directory for shared template source files
- return `SharedFile[]` where each `SharedFile` has:
  - `filename: string`
  - `content: string`
- avoid depending on a shared-side inverse consumer index to determine which skills use which shared template

Shared template selection for bundle resolution MUST come from each skill's `requiredSharedTemplates` declaration instead.

## Constraints

- No I/O in the interface definition — implementations handle I/O.
- Bundle resolution MUST support install-time rendering from structured context, not only flat string substitution.
- Template source filenames and emitted bundle filenames MUST remain distinct: `.md.tpl` on disk in `packages/skills/templates/`, `.md` in resolved bundle output.
- `variables` MUST support recursive values addressable by template path traversal.
- Shared-file routing metadata MUST be preserved by rendering.
- Shared template inclusion MUST be driven by each skill's `requiredSharedTemplates` declaration.
- The repository MUST support internal normalization of `sharedFolder` without exposing absolute paths in rendered output.

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — base skill type
- [`skills:skill-bundle`](../skill-bundle/spec.md) — bundle type
- [`skills:skill-templates-source`](../skill-templates-source/spec.md) — skill metadata, shared template declaration, and rendering contract
