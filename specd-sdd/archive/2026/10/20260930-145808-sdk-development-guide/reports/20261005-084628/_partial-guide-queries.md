# Guide query compliance partial — `sdk-development-guide`

## Scope and evidence

Audited merged change specs and verification scenarios for `guide:get-guide`, `guide:errors`, and `guide:search-guides`, plus their guide-model/conventions dependencies. Graph lookup resolves the relevant implementation symbols to `GetGuideQuery`, `GuideTopicNotFoundError`, and `MiniSearchGuideEngineAdapter`; its dependency traversal confirms that the query is isolated to the catalog port, topic identity, models, and domain errors.

Reviewed implementation and tests in:

- `packages/guide/src/application/queries/get-guide-query.ts`
- `packages/guide/src/domain/errors/guide-topic-not-found-error.ts`
- `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts`
- `packages/guide/test/unit/application/queries.spec.ts`
- `packages/guide/test/unit/domain/errors.spec.ts`
- `packages/guide/test/unit/infrastructure/search.test.ts`

## Requirements and implementation status

| Requirement area                                        | Status         | Evidence                                                                                                                                              |
| ------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct topic lookup before catalog enumeration          | Implemented    | `GetGuideQuery.execute()` calls `getGuide()` before `getAllTopics()` after resolving its serving collection.                                          |
| Normalization and no silent cross-collection resolution | Implemented    | The query uses `normalizeTopicRef`, qualifies the requested collection, and always throws after a miss.                                               |
| Bounded structured topic-not-found payload              | **Discrepant** | See GQ-001.                                                                                                                                           |
| Exact-query promotion before search limiting            | Implemented    | `rankExactQueryMatches()` is called after filters and before `slice(0, limit)`; stable sort preserves MiniSearch order within exact/non-exact groups. |
| Exact-match snippet selection                           | Implemented    | `findBestMatchLine()` gives a complete substring a dominant score before partial term matching.                                                       |
| In-memory search and collection/topic filtering         | Implemented    | Adapter indexes per-section documents in memory, applies scoped filters before ranking, and namespaces IDs by collection/topic.                       |

## Findings

### GQ-001 — High: cross-collection title suggestions leak into `availableTopics`

- **Requirement:** `guide:get-guide` and `guide:errors` require a qualified miss to keep ordinary `error.availableTopics` scoped to the requested collection. Sibling title-equivalent alternatives belong only in `error.titleMatches`, with `error.crossCollection = true`.
- **Evidence:** In `packages/guide/src/application/queries/get-guide-query.ts`, the cross-collection branch computes `titleMatches` from the whole catalog, then calls `new GuideTopicNotFoundError(topic, [...titleMatches, ...rest], titleMatches, ...)`. `rest` is collection-scoped, but the leading `titleMatches` are not. Thus a request such as `core:ArtifactDag` can expose `sdk:classes/ArtifactDag` through `availableTopics`, contrary to the merged scenarios.
- **Test gap:** The existing cross-collection test at `packages/guide/test/unit/application/queries.spec.ts` asserts `titleMatches`, `crossCollection`, and message text, but never asserts that `availableTopics` excludes the sibling identifier. There is also no direct-hit test proving `getAllTopics()` is not called after a successful `getGuide()`.
- **Recommendation:** Pass only the scoped candidates as the second `GuideTopicNotFoundError` argument; pass cross-collection matches exclusively as the third argument. Add a regression assertion that `availableTopics` contains only the requested collection and a spy-based direct-hit/no-enumeration test.

## Test coverage assessment

- The unit suite covers normalization, empty inputs, title suggestions, cross-collection structured fields, exact-query promotion with `limit: 1`, snippets, scoped search, and special-character safety.
- The newly added exact-query ranking test is meaningful: its partial-only title/heading candidate is indexed before the body exact-substring candidate, and the result confirms the exact candidate wins after the pre-limit promotion.
- Coverage is incomplete for the two scenarios called out under GQ-001. The current tests would allow the observed cross-collection candidate leak.

## Dependency consistency

The three audited specs are consistent with their declared dependencies: query code depends on `GuideCatalogPort`, topic identity, guide models, and package-local errors; the search adapter remains in the infrastructure layer and uses the in-memory MiniSearch engine. The discrepancy is internal to assembling the error payload, not an undeclared package or architecture dependency.

## Summary

- Requirements reviewed: 3 spec surfaces.
- Confirmed implemented: direct lookup ordering, normalization/non-resolution behavior, error shape, exact-query promotion, snippets, and search scoping.
- Discrepancies: 1 high-severity implementation/spec mismatch (GQ-001).
- Missing targeted tests: 2 scenarios (collection-scoped `availableTopics`; no enumeration following direct success).
