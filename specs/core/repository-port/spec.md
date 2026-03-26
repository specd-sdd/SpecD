# Repository Base

## Purpose

All repository ports share three construction-time invariants — workspace, ownership, and locality — that determine how use cases interact with stored data. Without a shared base, each port would duplicate these fields, their accessors, and their semantics. `Repository` is the abstract base class that encapsulates these invariants once, so that subclasses only need to declare their storage-specific operations.

## Requirements

### Requirement: RepositoryConfig shape

`Repository` is constructed from a `RepositoryConfig` object:

```typescript
interface RepositoryConfig {
  readonly workspace: string
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  readonly isExternal: boolean
}
```

- `workspace` — the workspace name this repository is bound to (e.g. `"default"`, `"billing"`)
- `ownership` — the ownership level declared in `specd.yaml`:
  - `owned` — full control, no restrictions
  - `shared` — writes allowed but recorded in the change manifest as `touchedSharedSpecs`
  - `readOnly` — no writes allowed; data may only be read
- `isExternal` — whether this repository points to data outside the current git repository. External repositories may not be accessible to agents restricted to the git root.

### Requirement: Abstract class, not interface

`Repository` MUST be an `abstract class`. It sets the three invariant fields in its constructor from `RepositoryConfig` and exposes them as methods. This follows the architecture spec requirement that ports with shared construction are abstract classes — the TypeScript compiler enforces both the construction contract and the method contract.

### Requirement: Immutable accessors

`Repository` MUST expose three methods that return the values set at construction time:

- `workspace(): string` — the workspace name
- `ownership(): 'owned' | 'shared' | 'readOnly'` — the ownership level
- `isExternal(): boolean` — whether the repository is external

These values MUST NOT change during the lifetime of the instance. The backing fields are private — subclasses access them only through the methods.

### Requirement: Subclass contract

Subclasses (`ChangeRepository`, `SpecRepository`, `ArchiveRepository`) extend `Repository` and declare their storage operations as `abstract` methods. The base class defines no storage operations — it only provides the shared construction and accessor contract.

### Requirement: ReadOnlyWorkspaceError

`Repository` MUST export a `ReadOnlyWorkspaceError` class for use by subclasses and use cases that enforce `readOnly` ownership. The error MUST extend the project's base `DomainError` class.

The constructor MUST accept a `message` string. Callers construct the message with context appropriate to the enforcement point (spec ID, workspace name, operation type). The error class itself does not format messages — it is a marker type that consumers can catch or inspect.

`ReadOnlyWorkspaceError` is a domain error because ownership is a domain concept — it represents a violated invariant, not an I/O failure or a user input error.

## Constraints

- Repository defines no storage operations — it is purely a construction and accessor base
- All three accessors are explicit methods, not property signatures (per architecture spec)
- Backing fields are private to Repository — subclasses cannot access them directly
- RepositoryConfig is a plain interface, not a class
- ReadOnlyWorkspaceError extends DomainError and is exported from the repository-port module

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — ports with shared construction are abstract classes; all port methods are explicit methods
