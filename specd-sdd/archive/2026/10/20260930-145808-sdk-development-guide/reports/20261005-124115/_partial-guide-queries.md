# Compliance audit partial — guide queries

## Scope

- Change: `sdk-development-guide`
- Specs reviewed: `guide:get-guide`, `guide:errors`, `guide:search-guides`
- Implementations reviewed: `GetGuideQuery`, `GuideTopicNotFoundError`, and `MiniSearchGuideEngineAdapter`.
- Graph state: current; the ranking adapter reaches both user-guide and SDK composition paths, plus focused integration and unit tests.

## Requirements summary

| Requirement                                                                                                                              | Implementation evidence                                                                                                                                                                          | Status    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Normalize a topic, do direct collection-qualified lookup, and enumerate only after a miss                                                | `GetGuideQuery.execute()` normalizes the reference, calls `getGuide()` before `getAllTopics()`, and has an explicit successful-lookup non-enumeration regression.                                | Compliant |
| Keep ordinary candidates collection-scoped; expose sibling title-equivalent results only through structured cross-collection suggestions | On a qualified miss, `scoped` is filtered to the requested collection; `titleMatches` uses the full catalog only if no scoped title match exists; `availableTopics` is built from `scoped` only. | Compliant |
| Preserve the original failed lookup and surface a typed, host-neutral error                                                              | `GuideTopicNotFoundError` retains raw `topic`, supplies qualified candidates and `titleMatches`/`crossCollection`, and does not redirect or mention a host command.                              | Compliant |
| Promote exact full-query substrings before applying `limit`, while retaining BM25 order inside each group                                | `rankExactQueryMatches()` is applied after all filters and before slicing; its stable sort partitions exact title/heading/content matches without changing order within a partition.             | Compliant |

## Implementation status

`GetGuideQuery` does not resolve across collections: a failed qualified lookup is followed by catalog enumeration solely for the error payload. Its cross-collection branch removes sibling title hits from `availableTopics` and places them in `titleMatches`, setting `crossCollection` only when a sibling title hit is present.

The search adapter performs filtering first, then exact-substring promotion, then applies the requested limit. `isExactQueryMatch()` covers all required indexed fields (title, heading, content), and snippets are subsequently generated from the selected document.

## Test coverage

- `packages/guide/test/unit/application/queries.spec.ts`
  - direct normalized lookup passes the exact composite key;
  - success does not call `getAllTopics()`;
  - blank input does not access the catalog;
  - sibling `ArtifactDag` stays out of `availableTopics`, appears in `titleMatches`, and sets `crossCollection`.
- `packages/guide/test/unit/domain/errors.spec.ts`
  - validates raw topic, structured suggestion fields, collection-qualified candidates, and host-neutral messages.
- `packages/guide/test/unit/infrastructure/search.test.ts`
  - proves an exact body substring is returned ahead of a partial-term hit when `limit: 1`, and that the snippet contains the exact phrase.

The parent verification run reports the guide suite, lint, typecheck, and full test gate as passing; this read-only audit did not re-run them.

## Discrepancies

None found in this scope.

## Missing tests / residual risk

No required scenario lacks an implementation regression. A low residual risk remains that MiniSearch's own scoring changes could alter the fixture's pre-promotion ordering; the test asserts the contractual final ordering under a limiting result, which is the relevant observable behavior.

## Dependency chain

`guide:get-guide` → `guide:errors` / `guide:guide-model` / `guide:conventions`.

`guide:search-guides` → `GuideSearchPort` → `MiniSearchGuideEngineAdapter` → user-guide and SDK guide-engine composition paths. Graph impact marks `rankExactQueryMatches` MEDIUM and identifies both compositions plus the targeted unit/integration tests.

## Counts

- Requirements checked: 4
- Compliant: 4
- Discrepancies: 0
- Missing required tests: 0
