---
status: accepted
date: 2026-02-22
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0013: Workspaces, Not Scopes

## Context and Problem Statement

The original design used the term "scope" for two distinct concepts:

1. **The config section** that declares spec directories, code roots, and schema paths — the unit that groups all paths for a logical part of the project.
2. **The namespace prefix** of a `SpecPath` — the first segment of a path like `auth/oauth`, which implicitly identifies which workspace a spec belongs to.

Additionally, "scope" already appears in two other unrelated contexts in the same config:

- **npm scope** — `@scope/name` notation for npm packages (e.g. `@specd/schema-std`).
- **`ValidationRule.scope`** — restricts a validation rule to a named section within a spec file (e.g. `"Requirements"`).

This created three different meanings for the same word within a single config file, and made the domain model harder to reason about.

## Decision Drivers

- "scope" is ambiguous in at least three different contexts within the same config file, creating confusion for contributors and agents.
- The concept being named reflects more than a namespace boundary: each entry declares a spec directory (`path`), an implementation directory (`codeRoot`), a local schema directory (`schemasPath`), and an ownership relationship.
- "workspace" is familiar from monorepo tooling (pnpm workspaces, yarn workspaces), which matches the primary use case.

## Considered Options

- **Keep "scope"** — no rename; accept the ambiguity.
- **Use "workspace"** — rename the config section and domain concept to `workspaces`.
- **Use "project"** — rename to `projects` to reflect the idea of a self-contained unit.

## Decision Outcome

Chosen option: "Use 'workspace'", because it unambiguously names a full context unit with its own directory layout, and is already familiar from monorepo tooling.

Use **`workspaces`** as the canonical term for the config section and domain concept:

- `specd.yaml` declares `workspaces:` (not `scopes:`).
- `default` is the reserved workspace name for the local project workspace.
- Domain entities (`Change`, `Spec`, `ArchivedChange`) expose a `workspace` property.
- Repository ports expose `workspace()` (not `scope()`).
- `RepositoryConfig` uses `workspace` (not `scope`).
- Schema references use `#workspace:name` syntax (not `#scope:name`).
- Template variables use `{{change.workspace}}` (not `{{change.scope}}`).

`ValidationRule.scope` retains its name — it refers to a section within a spec file, which is a different concept unrelated to workspaces.

Keeping "scope" would leave three different meanings for the same word in a single config file. Using "project" would be confusing since the whole `specd.yaml` already represents a project.

### Consequences

- Good, because the config file is unambiguous — `workspaces` is distinct from npm scope notation and from validation rule section scopes.
- Good, because the domain model is clearer: a workspace is not just a namespace prefix but a full context unit with its own paths.
- Good, because monorepo users will recognise the concept immediately from existing tooling.
- Bad, because the rename is a breaking change for any code already written against the old `scope` API — all occurrences in `@specd/core` have been updated in the same commit.

### Confirmation

Absence of `scope` (as workspace concept) in all source files and specs confirms the rename is complete. `ValidationRule.scope` is intentionally retained with its own meaning and is not subject to this constraint.

## More Information

### Spec

- [`specs/core/config/spec.md`](../../specs/core/config/spec.md)
