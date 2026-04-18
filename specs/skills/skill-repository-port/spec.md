# skills:skill-repository-port

## Purpose

Abstract interface for skill storage. This port defines the contract that infrastructure implementations must fulfill.

## Requirements

### Requirement: SkillRepositoryPort interface

`SkillRepositoryPort` MUST define the same interface as `SkillRepository`:

- `list(): Skill[]`
- `get(name: string): Skill | undefined`
- `getBundle(name: string, variables?: Record<string, string>): SkillBundle`
- `listSharedFiles(): SharedFile[]`

### Requirement: Port abstraction

The port is an abstract interface. Concrete implementations (e.g., using node:fs) live in the infrastructure layer.

## Constraints

- The port interface MUST NOT contain any I/O code.

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — domain types
- [`skills:skill-bundle`](../skill-bundle/spec.md) — bundle type
