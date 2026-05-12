# Proposal: fix-delta-apply-bugs

## Motivation

The delta application engine in `@specd/core` has bugs that cause content loss when applying deltas to structured artifacts. This affects users who add multi-section content (e.g., multiple `### Requirement:` headings) via delta files — only the first section is inserted, silently losing the rest.

## Current behaviour

When applying an `added` delta entry:

1. **Bug #1 — Only first child inserted:** The code in `applyDelta` (lines 580-587 of `apply-delta.ts`) takes only `parsed.root.children?.[0]`, ignoring any additional sections. This is inconsistent with `modified` operations, which use all children (`parsed.root.children ?? []`).

2. **Bug #2 — Ambiguous `position.parent` not rejected:** When `position.parent` matches multiple nodes, the code silently takes the first match (line 574) without error. This is inconsistent with `modified`/`removed` selectors, which explicitly reject ambiguous matches with `DeltaApplicationError`.

3. **Bug #3 — Unknown nodeType in value operations:** When using `value` in an `added` operation, the code passes `nodeType: 'unknown'` to `valueToNode` (line 591). Some adapters may need the actual node type to construct nodes correctly.

## Proposed solution

Fix the bugs in `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`:

1. **For Bug #1:** Modify the `added` operation to use all children from the parsed content, not just the first child.

2. **For Bug #2:** Add explicit validation to reject ambiguous `position.parent` selectors.

3. **For Bug #3:** Research and fix the nodeType passed to `valueToNode` — may need to infer from `position.parent` or use a more appropriate type.

## Specs affected

### Modified specs

- `core:core/delta-format`: Add requirements specifying correct behavior for multi-section content in `added` operations and explicit rejection of ambiguous `position.parent` selectors
  - Depends on (added): none

- `core:core/artifact-parser-port`: No changes needed — bug is in implementation, not port definition
  - Depends on (added): none

## Impact

- **File:** `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`
- **Tests:** `packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`
- **No API changes** — internal bug fixes only
- **No breaking changes** — fixes incorrect behavior

## Technical context

The bugs were discovered through code review and comparison with the spec (`core:core/delta-format`):

- **Bug #1:** `modified` operation uses all children (line 475), but `added` uses only first child (line 582)
- **Bug #2:** `modified`/`removed` reject ambiguous selectors with `DeltaApplicationError` (lines 350-353), but `position.parent` silently takes first match
- **Bug #3:** Line 591 passes `nodeType: 'unknown'` — may break adapters that need actual type

## Open questions

- **Bug #3:** Need to investigate which adapters (markdown, YAML, JSON, plaintext) are affected by `nodeType: 'unknown'`
