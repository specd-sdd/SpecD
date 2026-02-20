# ADR-0011: Spec Layout — Global vs Package-Scoped

## Status

Accepted

## Context

specd uses specs to define requirements and constraints for its own development (dogfooding). As the codebase grows, specs accumulate for different concerns: cross-cutting constraints (architecture, conventions, commits), package-internal implementation details (use cases, domain services), and schema definitions.

Without a clear convention, two problems arise:

1. **Scope confusion** — a spec describing a `@specd/core` use case could end up in `specs/_global/`, making it appear as a constraint on all packages when it only applies to one.
2. **Discovery** — contributors and agents cannot reliably find which specs are binding on a given package without knowing the layout convention.

Two layouts were considered:

**Flat** — all specs under `specs/<topic>/spec.md` with no package scoping. Simple, but conflates cross-cutting constraints with package internals. A spec for `ValidateSpec` would sit next to architecture rules, implying equal scope.

**Scoped by package** — `specs/_global/` for cross-cutting constraints, `specs/<package>/` for package-internal specs. Clear scope signal from the directory alone. Consistent with how source code is scoped by package.

## Decision

Specs are scoped by their audience:

- `specs/_global/<topic>/spec.md` — binding on **all** packages in the monorepo. Reserved for cross-cutting concerns: architecture, coding conventions, commit format, testing rules, storage design, schema format.
- `specs/<package>/<topic>/spec.md` — binding only on that package. `<package>` is the short package name: `core`, `cli`, `mcp`, `skills`, `schema-std`, `schema-openspec`.

Every spec file is named `spec.md` and lives in a named kebab-case subdirectory. A spec in `specs/<package>/` does not constrain any other package.

### Standard spec file structure

All `spec.md` files follow a standard structure to enable consistent tooling (listing, context injection, validation). Mandatory sections: `## Overview`, `## Requirements`, `## Spec Dependencies`. Optional sections: `## Constraints`, `## Examples`, `## ADRs`.

`## Overview` is mandatory — it serves as a human and machine-readable summary for listing and context injection. `## Spec Dependencies` is mandatory — it makes the dependency graph between specs explicit and traversable.

Scenarios use WHEN/THEN format. GIVEN is optional and used when the precondition is not obvious from the requirement context — expected to be more common in CLI and MCP specs than in domain specs.

The structure is consistent across all specs in the monorepo, enabling uniform tooling regardless of which package a spec belongs to.

## Consequences

- Agents and contributors can determine a spec's scope from its path alone — no need to read the spec to know if it applies
- `specs/_global/` stays focused on constraints that genuinely apply everywhere; it does not grow with every new package feature
- Package-internal specs (`specs/core/`, `specs/cli/`, etc.) can be written and evolved without risk of accidentally constraining unrelated packages
- Pending specs for `@specd/core` (`delta-merger`, `snapshot-hasher`, `validate-spec`, `compile-context`, `archive-change`) live under `specs/core/`

## Spec

- [`specs/_global/spec-layout/spec.md`](../../specs/_global/spec-layout/spec.md)
