# Compliance Audit Partial: Guide Core

## Scope

Read-only audit of `guide:guide-model`, `guide:bundle-guides`, `guide:composition`,
`guide:conventions`, `guide:list-guides`, `guide:get-guide-outline`, and
`guide:slice-guide-content`, including their direct `guide:errors` / catalog and
composition dependencies. The focused regression under review is metadata-only
outline serialization.

## Requirements Summary

- Guide domain values retain collection-qualified identity, real source paths, byte/line
  metadata, 1-indexed section geometry, and offset-based on-demand section extraction.
- Bundling and composition expose single-catalog engines, derive typed summaries and
  outlines, and keep document content available for explicit reads/section slicing.
- Listing returns compact summaries with collection and pagination/scope metadata.
- Outline retrieval resolves through the shared topic-resolution path, preserves the
  document's real source path, and must omit optional `GuideSection.content` from every
  returned outline item.
- Section retrieval remains the on-demand body path; it supports index/name/slug selection,
  ambiguity reporting, and bounded line utilities.

## Implementation Status

Compliant for the audited scope.

`GetGuideOutlineQuery.execute` (`packages/guide/src/application/queries/get-guide-outline-query.ts`)
uses `GetGuideQuery` for catalog resolution, copies the required metadata, and explicitly
constructs each returned section from structural fields only (`index`, `heading`, `level`,
line bounds/count, and offsets). It never spreads the catalog section, so an input
`content` property cannot cross the outline boundary. The separate
`GetGuideSectionQuery` remains the body-returning route.

The public `GuideEngine` composition wires the outline query through both the user and SDK
catalog factories. The domain model permits optional section content internally, which is
consistent with deferred section retrieval, while the outline mapper excludes it externally.

## Test Coverage

- `packages/guide/test/unit/application/queries.spec.ts`: exercises an outline from a mock
  catalog, asserts that its section has no `content`, and confirms explicit section retrieval
  returns the body.
- `packages/guide/test/integration/guide-engine.test.ts`: verifies real user-guide outline
  numbering, line coordinates, and inclusive line spans.
- `packages/guide/test/integration/sdk-catalog.spec.ts`: verifies SDK-catalog outline
  collection identity, actual source path, and nonempty structural outline.
- `packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts`: verifies `--meta` text excludes
  the document body and JSON metadata has no top-level `content` field.

The implementation's explicit field projection makes the metadata-only invariant apply to
every section, not just the first test fixture entry.

## Missing Tests / Residual Risk

No blocking gap found. A future strengthening opportunity is a CLI JSON assertion that each
individual `outline` element lacks `content`; the unit-level mapper test already covers the
boundary directly. This is informational only and is not a discrepancy.

## Dependency Chain

`GuideEngine.getGuideOutline` -> `GetGuideOutlineQuery` -> `GetGuideQuery` ->
`GuideCatalogPort` -> `GuideTopic` / `GuideSection`.

Graph evidence reports `GetGuideOutlineQuery` as MEDIUM dependency risk and HIGH dependent
risk, with dependents including user/SDK engine factories, the CLI guide command, and their
integration/command tests. This is consistent with the shared mapping being the correct
single enforcement point.

## Discrepancies

None in the audited guide-core scope.

## Counts

| Measure                               | Count |
| ------------------------------------- | ----: |
| Scoped specs reviewed                 |     7 |
| Implementation discrepancies          |     0 |
| Blocking findings                     |     0 |
| Non-blocking test-strengthening notes |     1 |
| Directly evidenced test layers        |     3 |
