# skills:skill-repository-infra

## Purpose

Infrastructure implementation of `SkillRepositoryPort` using node:fs for file system operations.

## Requirements

### Requirement: File reading

The infrastructure MUST use `node:fs/promises` to read template files from `packages/skills/templates/`.

### Requirement: TemplateReader

A `TemplateReader` component MUST read `.md` files from `packages/skills/templates/<skill-name>/` and return them as `SkillTemplate` objects with lazy content loading.

### Requirement: Shared file scanning

The infrastructure MUST scan `templates/shared/` for `.meta.json` files containing:

```json
{
  "filename": "...",
  "skills": ["skill1", "skill2"]
}
```

Each shared file's content is loaded on demand.

### Requirement: createSkillRepository factory

The module MUST export `createSkillRepository(): SkillRepositoryPort` as the main factory function.

## Constraints

- All I/O happens in this infrastructure layer.
- The domain layer remains pure.

## Spec Dependencies

- [`skills:skill-repository-port`](../skill-repository-port/spec.md) — port being implemented
