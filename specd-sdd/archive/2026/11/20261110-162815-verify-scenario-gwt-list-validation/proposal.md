# Proposal: verify-scenario-gwt-list-validation

## Motivation

Agents can author `verify.md` scenarios that pass structural validation yet produce empty `given` / `when` / `then` arrays in metadata extraction, because validation only requires `#### Scenario:` headings while extraction requires Gherkin list items. Closing that gap now prevents silent empty scenarios from reaching design, implementation, and archive.

## Current behaviour

`@specd/schema-std` verify validations enforce `## Requirements` → `### Requirement:` → `#### Scenario:` cardinality and uniqueness, plus cross-artifact requirement parity with `spec.md`. They do **not** require `list-item` nodes for WHEN or THEN inside each scenario.

Metadata extraction (`verify-scenarios`) selects list items matching `^GIVEN\b` / `^WHEN\b` / `^THEN\b`. Prose-only or non-list GWT bodies still validate, then extract as empty arrays.

Authoring instruction text says scenarios use exactly four hashtags and “Never three, never bullets,” which agents can misread as forbidding bullet lists for GWT clauses even though the template and extractor require list items.

## Proposed solution

Tighten the `verify` artifact contract in `packages/schema-std/schema.yaml` only (no Core validation-engine changes):

1. Under each `#### Scenario:` validation node, add nested `list-item` children requiring at least one WHEN and one THEN; GIVEN remains optional (`required: false`).
2. Clarify the verify `instruction` so scenario _headings_ must be `####` (not `###`, not bullet titles), while scenario _bodies_ MUST use list items for GWT clauses (matching `templates/verify.md` and the extractor).
3. Keep `templates/verify.md` as-is unless a guidance comment tweak is needed; prefer a `no-op` templates delta when the file already matches the contract.
4. Prefer full-file structural validations for GWT enforcement; extend `deltaValidations` only if design shows merge-time validation would miss malformed delta bodies before they land.

Hard-fail (`required: true`) for WHEN/THEN — detection must block, not warn. Bump `schema.yaml` `version` integer if project packaging conventions require it for schema content changes; behaviour remains within the same major schema package version / backwards-compat constraint (stricter validation may fail previously accepted malformed verifies).

## Specs affected

### New specs

_none_

### Modified specs

- `schema-std:standard-schema`: Extend the Verify Artifact Contract so structural validations require WHEN/THEN list items under each scenario (GIVEN optional); clarify authoring instruction semantics for headings vs GWT list bodies; add/adjust verify scenarios covering the new rules.
  - Depends on (added): none
  - Depends on (removed): none

- `schema-std:templates`: Confirm verify template still scaffolds Gherkin list placeholders; expect `no-op` unless a small guidance clarification is required.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- Primary: `packages/schema-std/schema.yaml` (`artifacts[id=verify].validations`, `instruction`; possibly `deltaValidations` / `version`).
- Secondary: `packages/schema-std/templates/verify.md` only if guidance comments need alignment (likely unchanged).
- Consumers: any change or workspace `verify.md` that lacks WHEN/THEN list items will start failing `changes validate` / `specs validate` after the schema update — intentional.
- Docs/guides that describe verify validations as “scenario headings only” may need a short follow-up during implementation if they become inaccurate.
- No Core, CLI, or parser API changes expected; nested `list-item` validation is already supported.

## Technical context

- Agreed approach: nested AST `list-item` validations under Scenario, not post-extraction emptiness checks (unsupported today) and not weak `contentMatches`-only checks.
- WHEN/THEN required; GIVEN optional — matches existing prose contract and `templates/verify.md`.
- Matcher should use the same label surface as the extractor (`^WHEN\b` / `^THEN\b` / `^GIVEN\b`); official content uses `- **WHEN**` and extraction already succeeds because list-item labels strip emphasis.
- Rejected: making GIVEN required; Core feature for “extracted field non-empty”; relying solely on `contentMatches`.
- Exploration anchors: `packages/schema-std/schema.yaml` (~320–348 validations; ~254–257 instruction; ~611–633 extractors), `packages/schema-std/templates/verify.md`.

## Open questions

_none — resolved during discovery:_

1. Matcher: use extractor-aligned `^WHEN\b` / `^THEN\b` / `^GIVEN\b` (AST plain labels).
2. Delta rules: start with full-file validations; add deltaValidations only if needed after inspecting merge behaviour.
3. Severity: hard fail for WHEN/THEN.
4. Instruction: clarify heading vs list-body wording in the same change.
5. Version integer: bump only if required by schema packaging practice when editing `schema.yaml`.
