# Design: retire-spec-layout

## Affected areas

### Specifications

- `specs/cli/spec-search/spec.md`:
  - **Modification**: Remove dependency line `- [default:_global/spec-layout](../../../_global/spec-layout/spec.md)` from `## Spec Dependencies`.
  - **Risk**: Low. `specd specs search` functions independently of `spec-layout`.
- `specs/_global/spec-layout/spec.md`:
  - **Modification**: Replace obsolete requirements and constraints with a single requirement `### Requirement: Superseded by schema-std` and clear `Spec Dependencies` to `_none_`.
  - **Risk**: Low. Reduces prompt token consumption across all monorepo change workflows.
- `specs/_global/spec-layout/verify.md`:
  - **Modification**: Replace 6 obsolete scenario groups with a single scenario `#### Scenario: Spec layout enforcement delegated to active schema`.
  - **Risk**: Low. Satisfies `specs-verify-requirement-parity`.

### Documentation

- `docs/adr/0011-spec-layout.md`:
  - **Modification**: Add an `## Amendment (2026-09-23)` section recording that the markdown structure, AST validation, and scenario conventions originally documented here are now formally governed by `@specd/schema-std` (`schema-std:standard-schema`), rendering `default:_global/spec-layout` inert.

## New constructs

_none — this change only updates specifications and documentation; no new source code files, classes, or types are introduced._

## Data models & Contracts

### Spec Contract: `default:_global/spec-layout` (Neutralized)

```markdown
# Spec Layout

## Purpose

This specification previously defined spec directory organization and artifact formatting.
All spec layout, artifact structure, AST-based validations, and verification scenario rules
are now formally specified and enforced by `@specd/schema-std` (`schema-std:standard-schema`).
This spec is retained for historical continuity and imposes no active requirements.

## Requirements

### Requirement: Superseded by schema-std

Spec layout, artifact document structures, section hierarchies, and scenario conventions
SHALL be governed exclusively by the project's active schema (`@specd/schema-std`).
This spec imposes no additional constraints on packages or tooling.

## Constraints

- None — all constraints are superseded by `@specd/schema-std` and project configuration in `specd.yaml`.

## Spec Dependencies

_none — this specification is superseded and inert_

## ADRs

- [ADR-0011: Spec Layout — Global vs Package-Scoped](../../../docs/adr/0011-spec-layout.md)
```

## Approach & Execution flow

1. **Spec Deltas Verification**:
   - Ensure `deltas/cli/spec-search/spec.md.delta.yaml` and `deltas/cli/spec-search/verify.md.delta.yaml` are validated and produce correct merged output via `specd changes spec-preview retire-spec-layout cli:spec-search`.
   - Ensure `deltas/default/_global/spec-layout/spec.md.delta.yaml` and `deltas/default/_global/spec-layout/verify.md.delta.yaml` are validated and produce correct merged output via `specd changes spec-preview retire-spec-layout default:_global/spec-layout`.
2. **Documentation Update**:
   - Update `docs/adr/0011-spec-layout.md` with an amendment section explaining that schema-std has superseded the spec-level formatting requirements while preserving the historical context.
3. **Verification**:
   - Execute project-wide test and validation commands (`pnpm test`, `pnpm typecheck`, `pnpm lint`) to confirm that all tools and repositories pass without regressions.

## Error handling & Edge cases

- **Validation Failure / Parity Mismatch**: If `spec.md` and `verify.md` headings diverge, `schema-std` cross-artifact validation `specs-verify-requirement-parity` will catch it. The deltas have been paired to ensure identical labels: `Requirement: Superseded by schema-std`.
- **Dangling Dependency References**: Checked graph and repo references; `cli:spec-search` was the only active spec pointing to `spec-layout`.

## Key decisions

1. **Neutralize in place rather than delete**:
   - The user requested not deleting the spec directory, but neutralizing it with a delta. This keeps Git history linear, avoids breaking any external references or links, and leaves the spec in a clean, non-binding state.
2. **Single placeholder requirement**:
   - Because `schema-std` enforces `has-requirements` (minimum 1 requirement) and `has-scenario` (minimum 1 scenario), removing all requirements completely would violate schema structural validation. Introducing `Requirement: Superseded by schema-std` satisfies schema invariants while asserting that no active constraints exist.
3. **Clear dependencies**:
   - All transitive dependencies from `default:_global/spec-layout` (`core:schema-format`, `core:content-extraction`, `core:spec-id-format`) are removed, simplifying the global dependency graph.

## Trade-offs

- **Directory footprint**: The spec remains on the filesystem, but its AST footprint and compiled token size are reduced to the absolute minimum.

## Spec impact

- `cli:spec-search`: No longer pulls `default:_global/spec-layout` into its dependency tree.
- `default:_global/spec-layout`: Neutralized; no longer imposes constraints on other packages.

## Dependency map

```
Before:
cli:spec-search ──► default:_global/spec-layout ──► [core:schema-format, core:content-extraction, core:spec-id-format]
                ──► core:search-specs
                ──► core:list-workspaces
                ──► cli:entrypoint

After:
cli:spec-search ──► core:search-specs
                ──► core:list-workspaces
                ──► cli:entrypoint

default:_global/spec-layout (inert, depends on none)
```

## Migration / Rollback

- **Migration**: Changes are applied via standard specd archive. When archived, deltas are merged permanently into `specs/_global/spec-layout/` and `specs/cli/spec-search/`.
- **Rollback**: Standard git revert of the archive commit.

## Testing

### Automated Validations

- Validate change artifacts:
  ```bash
  node packages/cli/dist/index.js changes validate retire-spec-layout --format text
  ```
- Run unit and integration tests:
  ```bash
  pnpm test
  ```
- Typecheck:
  ```bash
  pnpm typecheck
  ```
- Linting:
  ```bash
  pnpm lint
  ```

### Manual Verification

- Check preview of `default:_global/spec-layout`:
  ```bash
  node packages/cli/dist/index.js changes spec-preview retire-spec-layout default:_global/spec-layout --format text
  ```
- Check preview of `cli:spec-search`:
  ```bash
  node packages/cli/dist/index.js changes spec-preview retire-spec-layout cli:spec-search --format text
  ```

## Open questions

_none — all decisions resolved and confirmed._
