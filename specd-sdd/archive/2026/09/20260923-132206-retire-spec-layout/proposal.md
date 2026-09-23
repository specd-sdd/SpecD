# Proposal: retire-spec-layout

## Motivation

The global specification `default:_global/spec-layout` was written during the early repository bootstrapping phase (ADR-0011, February 2026) before SpecD supported declarative schemas, automated AST artifact validation, or dynamic workspace configuration.

With `@specd/schema-std` now serving as the authoritative standard schema engine, the requirements defined in `spec-layout` are completely obsolete. Rather than physically deleting the spec files from the repository, we neutralize `default:_global/spec-layout` via delta so that it imposes no active requirements or constraints, while preserving historical continuity.

## Current behaviour

`default:_global/spec-layout` lives under `specs/_global/spec-layout/` with `spec.md`, `verify.md`, and `spec-lock.json`. It attempts to document:

1. Markdown section structure (`Purpose`, `Requirements`, `Spec Dependencies`, `Scenario:`).
2. Workspace directory layout (`specs/_global/` vs `specs/<package>/`).

This specification is obsolete because:

- **Artifact syntax & structure:** `@specd/schema-std` (`packages/schema-std/schema.yaml`) and `schema-std:standard-schema` declaratively specify and strictly validate all artifact headings, AST hierarchies, scenario rules, and cross-artifact parity.
- **Directory layout:** Monorepo workspace layout is dynamically configured in `specd.yaml` and resolved by `@specd/core` (`FsSpecRepository`).
- **Dependency coupling:** `cli:spec-search` currently declares a formal dependency on `default:_global/spec-layout`.
- **Context overhead:** When compiled into agent contexts via `default:*`, it unnecessarily repeats authoring instructions that are already enforced by schemas.

## Proposed solution

1. **Neutralize `default:_global/spec-layout` via delta:**
   - In `spec.md.delta.yaml`, remove all obsolete requirements (`Global specs for cross-cutting constraints`, `Package specs for package-internal concerns`, `Spec file naming`, `spec.md structure`, `verify.md structure`, `Spec Dependencies section`) and constraints. Introduce a single requirement declaring that spec layout is superseded by `@specd/schema-std`.
   - Update `## Spec Dependencies` to `_none_`.
   - In `verify.md.delta.yaml`, remove old scenarios and provide a minimal scenario aligning with the superseded requirement.
2. **Update `cli:spec-search` via delta:**
   - Remove `default:_global/spec-layout` from its `## Spec Dependencies` section.
3. **Document decision status:**
   - Add an amendment note in `docs/adr/0011-spec-layout.md` recording that markdown layout and validation rules are superseded by `@specd/schema-std`.

## Specs affected

### New specs

_none_

### Modified specs

- `cli:spec-search`: Remove stale dependency on `default:_global/spec-layout` from `## Spec Dependencies`.
  - Depends on (added): none
  - Depends on (removed): `default:_global/spec-layout`

- `default:_global/spec-layout`: Supersede all previous requirements by `@specd/schema-std` and remove obsolete constraints, leaving the spec inert.
  - Depends on (added): none
  - Depends on (removed): `core:schema-format`, `core:content-extraction`, `core:spec-id-format`

## Impact

- **Specifications:**
  - `specs/_global/spec-layout/` remains in the tree, but neutralized with no binding operational requirements.
  - `specs/cli/spec-search/spec.md` updated via delta to drop the dependency.
- **Context Compilation:** `default:_global/spec-layout` becomes a tiny informational placeholder without heavy AST constraints or obsolete rules.
- **Code:** No runtime package logic (`@specd/core`, `@specd/cli`, etc.) requires modification.

## Technical context

- **Discovery:** User confirmed that `default:_global/spec-layout` should not be physically deleted, but rather neutralized via delta to leave it null/superseded.
- **Analysis:** Reviewed schema validations (`has-purpose`, `has-requirements`, `specs-verify-requirement-parity`). Every spec in `schema-std` requires at least one requirement block and matching verify scenario. Therefore, neutralizing the spec requires removing the 6 historical requirements and replacing them with a single requirement stating that layout is superseded by `@specd/schema-std`.
- **Dependencies:** All dependencies of `default:_global/spec-layout` (`core:schema-format`, `core:content-extraction`, `core:spec-id-format`) are removed.

## Open questions

_none — all requirements and scope boundaries are agreed._
