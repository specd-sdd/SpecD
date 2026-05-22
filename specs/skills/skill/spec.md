# skills:skill

## Purpose

Defines the core domain models for skills: `Skill` and `SkillTemplate`. These are pure domain types with no I/O dependencies.

## Requirements

### Requirement: Skill interface

`Skill` MUST be an interface with:

- `name: string` — unique identifier for the skill
- `description: string` — human-readable description of what the skill does
- `templates: SkillTemplate[]` — template files associated with this skill

### Requirement: SkillTemplate interface

`SkillTemplate` MUST be an interface with:

- `filename: string` — template file name
- `getContent(): Promise<string>` — lazy content loading, returns the template content

### Requirement: No I/O in domain

The domain layer MUST NOT contain any I/O (file system, network, etc.). All I/O happens in the infrastructure layer.

### Requirement: Lazy content loading

Template content MUST be loaded lazily via `getContent()`. The `Skill` object itself MUST NOT hold loaded content in memory.

### Requirement: Typed errors for skill operations

All skill-related domain errors (e.g., "Skill not found") MUST use typed error classes extending a package-level base class (e.g., `SpecdSkillsError`). This base class MUST follow the "Specd Error Contract" and extend `SpecdError` from `@specd/core`.

## Constraints

- Domain types MUST be pure TypeScript interfaces.
- No dependencies on node:fs or any I/O library.

## Spec Dependencies

- _none_
- [`default:_global/error-handling-conventions`](../../_global/error-handling-conventions/spec.md) — canonical error handling standards for the monorepo.
