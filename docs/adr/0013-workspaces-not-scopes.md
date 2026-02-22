# ADR-0013: Workspaces, Not Scopes

## Status

Accepted

## Context

The original design used the term "scope" for two distinct concepts:

1. **The config section** that declares spec directories, code roots, and schema paths — the unit that groups all paths for a logical part of the project.
2. **The namespace prefix** of a `SpecPath` — the first segment of a path like `auth/oauth`, which implicitly identifies which workspace a spec belongs to.

Additionally, "scope" already appears in two other unrelated contexts in the same config:

- **npm scope** — `@scope/name` notation for npm packages (e.g. `@specd/schema-std`).
- **`ValidationRule.scope`** — restricts a validation rule to a named section within a spec file (e.g. `"Requirements"`).

This created three different meanings for the same word within a single config file, and made the domain model harder to reason about.

The concept being named is not merely a namespace prefix. Each entry declares a full context: a spec directory (`path`), an implementation directory (`codeRoot`), a local schema directory (`schemasPath`), and an ownership relationship. That is closer to a _workspace_ — a distinct unit of work with its own directory layout and context — than to a _scope_, which implies only a namespace boundary.

The term "workspace" is also familiar from monorepo tooling (pnpm workspaces, yarn workspaces), which matches the primary use case: a monorepo or coordinator repo where each logical unit has its own paths.

## Decision

Use **`workspaces`** as the canonical term for the config section and domain concept.

- `specd.yaml` declares `workspaces:` (not `scopes:`).
- `default` is the reserved workspace name for the local project workspace.
- Domain entities (`Change`, `Spec`, `ArchivedChange`) expose a `workspace` property.
- Repository ports expose `workspace()` (not `scope()`).
- `RepositoryConfig` uses `workspace` (not `scope`).
- Schema references use `#workspace:name` syntax (not `#scope:name`).
- Template variables use `{{change.workspace}}` (not `{{change.scope}}`).

`ValidationRule.scope` retains its name — it refers to a section within a spec file, which is a different concept unrelated to workspaces.

## Consequences

- The config file is unambiguous: `workspaces` is distinct from npm scope notation and from validation rule section scopes.
- The domain model is clearer: a workspace is not just a namespace prefix but a full context unit with its own paths.
- Monorepo users will recognise the concept immediately from existing tooling.
- The rename is a breaking change for any code already written against the old `scope` API — all occurrences in `@specd/core` have been updated in the same commit.

## Spec

- [`specs/_global/config/spec.md`](../../specs/_global/config/spec.md)
