# Guide query and cross-cutting audit

## Requirements Summary

Audited merged requirements for `guide:list-guides`, `guide:get-guide`,
`guide:get-guide-outline`, `guide:search-guides`, and
`guide:slice-guide-content`, plus the applicable documentation and architecture
constraints. In scope: collection-qualified guide identities; catalog isolation;
filtered, ordered, paginated listings; on-demand outline and section retrieval;
search filtering and empty-query behavior; line slicing/formatting; and the
hexagonal delivery/dependency boundaries.

## Implementation Status

- `GuideCatalogPort` exposes `getAllGuides`, `getCollections`, `getAllTopics`,
  and qualified `getGuide`; `ListGuidesQuery` consumes `getAllGuides`, filters
  before sorting/pagination, reports page metadata, collection extents, topic
  scope, and withheld generated-topic counts. Evidence:
  `packages/guide/src/application/ports/guide-catalog-port.ts:11` and
  `packages/guide/src/application/queries/list-guides-query.ts:157`.
- Ordering is collection, numeric sidebar order, then locale-aware topic order;
  the `Intl.Collator` is explicit. Scope supports collection, topic,
  collection-qualified topic, and generated-document selection. Evidence:
  `list-guides-query.ts:264-365`.
- `GetGuideQuery` normalizes trim -> one trailing `.md` removal -> lowercase,
  performs direct qualified lookup before enumeration, preserves nested paths,
  and uses structured not-found errors with collection-scoped candidates and
  explicit cross-collection title suggestions. Evidence:
  `get-guide-query.ts:45-91`.
- Outline retrieval projects source path, collection, document metrics, optional
  generated-symbol import metadata, and offset-bearing sections without section
  bodies. Section retrieval slices content lazily from offsets (with a line-span
  fallback), and handles numeric, heading, slug, ambiguous, and unknown section
  selectors. Evidence: `get-guide-outline-query.ts:31-54` and
  `get-guide-section-query.ts:44-126`.
- Search returns immediately for blank input and delegates normalized topic /
  collection filters to its driven port. Evidence:
  `search-guides-query.ts:37-78`. Line utilities implement the specified
  one-indexed slicing, bounds behavior, CRLF normalization, and aligned
  formatting at `slice-guide-lines.ts:9-56`.
- Application queries depend on ports/domain models only; construction and
  adapter imports are confined to `composition/guide-engine.ts`, satisfying the
  applicable global architecture rule. The graph identifies the CLI delivery
  command, both engine factories, and tests as dependents rather than the query
  layer importing delivery code.

## Discrepancies

### GQ-001 — P2: collection-qualified identity requirement conflicts with implemented and verified single-collection shorthand

The merged `guide:get-guide` requirement states that topics **MUST** be addressed
as `collection:topic`. However, `GetGuideQuery.execute` intentionally resolves
an unqualified reference whenever `getCollections()` returns exactly one
collection (`get-guide-query.ts:54-61`), and the merged verification artifact
still requires successful unqualified requests such as `workflow`,
`GETTING-STARTED`, and `configuration.md`. The unit suite also locks that
behavior in (`packages/guide/test/unit/application/queries.spec.ts:286-296`).

This is a specification/internal-verification inconsistency rather than a
runtime defect: unqualified shorthand is a reasonable backward-compatible API
for a single-collection catalog, but it is incompatible with an unconditional
"MUST be addressed" statement. Resolve it by either (a) changing the
requirement to allow unqualified identifiers only for a one-collection catalog,
which matches code and tests, or (b) removing shorthand behavior and updating
the legacy verification scenarios. No code change is recommended unless option
(b) is selected.

## Test Coverage

- Unit query coverage in `packages/guide/test/unit/application/queries.spec.ts`
  exercises ordering, pagination clamping and extents, generated withholding,
  qualified normalization and no-enumeration-on-hit, blank input, qualified
  errors and cross-collection suggestions, outline projection, section slicing
  and ambiguity errors, and blank/delegated search.
- `packages/guide/test/unit/application/slicing.test.ts` covers bounded and
  unbounded slices, zero/negative bounds, CRLF input, formatting padding, and
  empty input.
- `packages/guide/test/unit/infrastructure/search.test.ts` covers topic and
  collection scopes, limits, snippets, exact-match ranking, stop words, and
  collection namespacing; `packages/guide/test/integration/sdk-catalog.spec.ts`
  covers SDK catalog scope, generated entries, collection identity, and engine
  isolation.
- The surrounding full verification run recorded the repository `pnpm test`
  gate as passing; this audit performed no state-changing or duplicate test run.

## Missing Tests

- Add a direct contract test documenting the chosen resolution of GQ-001:
  either assert unqualified shorthand is accepted only for one collection, or
  assert it is rejected in every catalog. Existing tests cover the former in
  practice but do not name it as an intentional exception to the qualified-key
  contract.
- No other material missing test was identified in the audited query scope.

## Dependency Chain

`GuideCatalogPort` / `GuideSearchPort` -> application queries ->
`assembleGuideEngine` / `createGuideEngine` / `createGuideSdkEngine` -> CLI
guide delivery adapter. Graph impact marks `list-guides-query.ts` CRITICAL,
with 12 affected files including both engine factories,
`packages/cli/src/commands/guide/index.ts`, SDK CLI tests, search adapter, and
guide integration/unit tests. `GetGuideQuery` is shared by outline and section
queries, so identity/error semantics flow directly into both read surfaces.

## Summary Counts

- Requirements assessed: 7 specifications/constraint surfaces
- Implemented and evidenced: 6
- Discrepancies: 1 (P2 specification/verification/implementation ambiguity)
- Missing-test follow-ups: 1 focused contract test
