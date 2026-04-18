# skills:skill-repository

## Purpose

Defines the `SkillRepository` interface that provides access to skills and their bundles. This is the concrete implementation combining skill retrieval with bundle resolution.

## Requirements

### Requirement: list() method

The `list()` method MUST:

- Return an array of all `Skill` objects (metadata only, no template content)
- Return `readonly Skill[]`

### Requirement: get() method

The `get()` method MUST:

- Accept a `name: string` parameter
- Return `Skill | undefined` — the skill with that name, or undefined if not found

### Requirement: getBundle() method

The `getBundle()` method MUST:

- Accept `name: string` and optional `variables: Record<string, string>` (defaults to `{}`)
- Return `SkillBundle` with all template files resolved
- Replace `{{key}}` placeholders in template content with values from the variables map
- Variables are passed at invocation time — the repository does not define predefined variables

### Requirement: listSharedFiles() method

The `listSharedFiles()` method MUST:

- Scan the `templates/shared/` directory for `.meta.json` files
- Return `SharedFile[]` where each `SharedFile` has:
  - `filename: string`
  - `content: string`
  - `skills: string[]` — which skills use this shared file

## Constraints

- No I/O in the interface definition — implementations handle I/O.

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — base skill type
- [`skills:skill-bundle`](../skill-bundle/spec.md) — bundle type
