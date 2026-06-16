# skills:skill-repository-infra

## Purpose

Infrastructure implementation of `SkillRepositoryPort` using node:fs for file system operations.

## Requirements

### Requirement: File reading

The infrastructure MUST use `node:fs/promises` to read template files from `packages/skills/templates/skills/` and `packages/skills/templates/agents/`.

### Requirement: TemplateReader

A `TemplateReader` component MUST read `.md.tpl` files from `packages/skills/templates/skills/<name>/` or `packages/skills/templates/agents/<name>/` and return them as `SkillTemplate` objects with lazy content loading.

### Requirement: createSkillRepository factory

The module MUST export `createSkillRepository(): SkillRepositoryPort` as the main factory function.

## Constraints

- All I/O happens in this infrastructure layer.
- The domain layer remains pure.

## Spec Dependencies

- [`skills:skill-repository-port`](../skill-repository-port/spec.md) — port being implemented
