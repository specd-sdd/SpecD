# skills:skill-repository-port

## Purpose

Abstract interface for skill storage. This port defines the contract that infrastructure implementations must fulfill.

## Requirements

### Requirement: SkillRepositoryPort interface

`SkillRepositoryPort` MUST define the same interface as `SkillRepository`:

- `list(): Skill[]`
- `get(name: string): Skill | undefined`
- `getBundle(name: string, variables?: Record<string, string>, config?: SpecdConfig): SkillBundle`
- `listSharedFiles(): SharedFile[]`

The `getBundle` method SHALL support receiving a `SpecdConfig` to enable the injection of built-in variables during template resolution.

When `getBundle` includes files declared by `listSharedFiles()`, those resolved files MUST preserve their shared origin by setting the bundle file's shared marker. Skill-local template files MUST NOT be marked as shared.

### Requirement: Port abstraction

The port is an abstract interface. Concrete implementations (e.g., using node:fs) live in the infrastructure layer.

## Constraints

- The port interface MUST NOT contain any I/O code.

## Spec Dependencies

- [`core:core/config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`skills:skill`](../skill/spec.md) — domain types
- [`skills:skill-bundle`](../skill-bundle/spec.md) — bundle type
