| status   | date       | decision-makers  | consulted | informed |
| -------- | ---------- | ---------------- | --------- | -------- |
| accepted | 2026-02-20 | specd maintainer | -         | -        |

# ADR-0011: Spec Layout — Global vs Package-Scoped

## Context and Problem Statement

specd uses specs to define requirements and constraints for its own development (dogfooding). As the codebase grows, specs accumulate for different concerns: cross-cutting constraints (architecture, conventions, commits), package-internal implementation details (use cases, domain services), and schema definitions.

Without a clear convention, two problems arise:

1. **Scope confusion** — a spec describing a `@specd/core` use case could end up in `specs/_global/`, making it appear as a constraint on all packages when it only applies to one.
2. **Discovery** — contributors and agents cannot reliably find which specs are binding on a given package without knowing the layout convention.

## Considered Options

- **Flat layout** — all specs under `specs/<topic>/spec.md` with no package scoping.
- **Scoped by package** — `specs/_global/` for cross-cutting constraints, `specs/<package>/` for package-internal specs.

## Decision Outcome

Chosen option: "Scoped by package", because the directory path alone signals the spec's audience without requiring the reader to open the file.

Specs are scoped by their audience:

- `specs/_global/<topic>/spec.md` — binding on **all** packages in the monorepo. Reserved for cross-cutting concerns: architecture, coding conventions, commit format, testing rules, storage design, schema format.
- `specs/<package>/<topic>/spec.md` — binding only on that package. `<package>` is the short package name: `core`, `cli`, `mcp`, `skills`, `schema-std`, `schema-openspec`.

Every spec file is named `spec.md` and lives in a named kebab-case subdirectory. A spec in `specs/<package>/` does not constrain any other package. All `spec.md` files follow a standard structure (mandatory sections: `## Overview`, `## Requirements`, `## Spec Dependencies`; optional sections: `## Constraints`, `## Examples`, `## ADRs`) to enable consistent tooling. `## Overview` serves as a human and machine-readable summary for listing and context injection. `## Spec Dependencies` makes the dependency graph between specs explicit and traversable. Scenarios use WHEN/THEN format; GIVEN is optional and used when the precondition is not obvious from the requirement context.

The flat layout is simple but conflates cross-cutting constraints with package internals — a spec for `ValidateSpec` would sit next to architecture rules, implying equal scope.

### Consequences

- Good, because agents and contributors can determine a spec's scope from its path alone — no need to read the spec to know if it applies.
- Good, because `specs/_global/` stays focused on constraints that genuinely apply everywhere; it does not grow with every new package feature.
- Good, because package-internal specs (`specs/core/`, `specs/cli/`, etc.) can be written and evolved without risk of accidentally constraining unrelated packages.
- Good, because pending specs for `@specd/core` (`delta-merger`, `snapshot-hasher`, `validate-spec`, `compile-context`, `archive-change`) live under `specs/core/`.

### Confirmation

`specs/_global/spec-layout/spec.md` defines this convention in full. `specd validate` checks that every spec directory contains all required artifact files.

## More Information

### Spec

- [`specs/_global/spec-layout/spec.md`](../../specs/_global/spec-layout/spec.md)
