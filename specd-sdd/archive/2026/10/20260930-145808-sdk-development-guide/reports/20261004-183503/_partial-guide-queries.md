# Compliance audit partial — Guide query APIs

**Change:** `sdk-development-guide`  
**Scope:** `guide:list-guides`, `guide:get-guide`, `guide:get-guide-outline`, `guide:slice-guide-content`, `guide:search-guides`, plus direct dependencies `guide:conventions`, `guide:guide-model`, `guide:errors`, `default:_global/conventions`, and `default:_global/error-handling-conventions`.  
**Audit method:** merged change previews; graph-symbol search and impact analysis; source and focused-test inspection; `pnpm --filter @specd/guide test`.

## Requirements summary

| Spec                        | Principal merged obligations                                                                                                                                                        | Status                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `guide:list-guides`         | Catalog exposes complete, collection-aware listing data; list query filters, orders, paginates, identifies generated records, and reports withheld generated records.               | Conforms                                    |
| `guide:get-guide`           | Resolve collection-qualified topics using the catalog; normalize only trim / one `.md` suffix / lowercase; reject blank input; report collection-local qualified alternatives.      | **Non-conforming**                          |
| `guide:get-guide-outline`   | Delegate identical qualified resolution; return metadata and outline without section bodies or synthesized paths.                                                                   | **Non-conforming through delegated lookup** |
| `guide:slice-guide-content` | Delegate identical qualified resolution; select/index/slug sections and dynamically extract their bounded body; retain 1-indexed utility behavior.                                  | **Non-conforming through delegated lookup** |
| `guide:search-guides`       | In-memory MiniSearch section index, collection-aware filtering/identifiers, safe special-character handling, bounded snippets, and exact full-query matches before partial matches. | **Non-conforming ranking guarantee**        |

## Implementation status and evidence

### `guide:list-guides` — conforming

- `GuideCatalogPort` declares `listGuides`, mandatory `getAllGuides`, `getCollections`, `getAllTopics`, and collection-qualified `getGuide` in `packages/guide/src/application/ports/guide-catalog-port.ts:11-41`.
- `ListGuidesQuery` uses `getAllGuides`, filters before sorting, sorts by collection/order/topic through `Intl.Collator`, paginates, adds page/scope, produces collection extents, and computes withheld generated count: `packages/guide/src/application/queries/list-guides-query.ts:132-199, 237-377`.
- Coverage exists for ordering, page coordinates, clamping, extents, generated scopes, and withheld count in `packages/guide/test/unit/application/queries.spec.ts` (`ListGuidesQuery` block). The focused package suite passes.

### `guide:get-guide`, `guide:get-guide-outline`, and `guide:slice-guide-content` — partial conformance

- Normalization and blank-input handling are implemented by `normalizeTopicRef` and `GetGuideQuery` (`get-guide-query.ts:50-99`); qualified requests are passed to the port as normalized `collection:topic`, demonstrated by `queries.spec.ts`.
- `GetGuideOutlineQuery` delegates to `GetGuideQuery` and returns collection, real `sourcePath`, metadata, and the outline without serializing content: `get-guide-outline-query.ts:35-51`.
- `GetGuideSectionQuery` delegates to `GetGuideQuery`, supports numeric and trimmed numeric selection, case-insensitive heading/slug selection, ambiguity errors, and dynamic offset/range slicing: `get-guide-section-query.ts:46-122`. `sliceGuideLines` and `formatWithLineNumbers` satisfy the 1-indexed and CRLF behavior in `slice-guide-lines.ts:1-67`; focused slicing tests cover normal, invalid, end-of-content, and CRLF behavior.

### `guide:search-guides` — partial conformance

- `SearchGuidesQuery` trims blank requests and delegates nonblank searches (`search-guides-query.ts:35-54`).
- `MiniSearchGuideEngineAdapter` constructs an in-memory index from every section and stores collection/topic/source path/title/heading/level/line bounds; it enables title/heading/body boosts, prefix and fuzzy matching (`minisearch-guide-engine-adapter.ts:46-113`). It namespaces section IDs as `${collection}:${topic}#${index}`, protects punctuation search via `safeSearch`, filters collection-qualified topics, bounds snippets to section lines, and chooses `guide-sdk` for non-user collections (`:235-356`, `:398-479`). Focused adapter tests exercise prefix/fuzzy search, punctuation safety, collection filters, line-boundary snippets, and generated identifiers.

## Discrepancies

### F1 — High: unqualified and cross-catalog guide lookup contradicts collection-qualified isolation

**Affected merged specs:** `guide:get-guide`; transitively `guide:get-guide-outline` and `guide:slice-guide-content`.

**Requirement evidence:**

- `guide:get-guide` requires topics to be addressed as `collection:topic`, says the query must pass that composite key to the port, and requires resolution only within the collection served by the port.
- `guide:get-guide-outline` and `guide:slice-guide-content` explicitly require the same collection-qualified resolution and collection-local operation.
- `guide:list-guides`/`GuideCatalogPort` establish the compatible catalog model: one port serves exactly one catalog and `getGuide` receives the collection-qualified identity.

**Implementation evidence:**

- `GetGuideQuery.execute` deliberately accepts an unqualified reference, calls `catalog.getCollections()`, and tries `getGuide(qualifyTopic(collection, ref.topic))` for _every_ collection (`packages/guide/src/application/queries/get-guide-query.ts:50-66`). It therefore resolves a bare `workflow` across collections rather than rejecting a non-qualified key.
- On a qualified miss it searches all topics and offers title matches from another collection (`:68-99`). The committed tests explicitly preserve this behavior: `queries.spec.ts` tests bare `workflow`, bare `ArtifactDag`, and a wrong `code-graph:ArtifactDag` request that suggests a `guide:` topic.
- Outline and section queries construct `GetGuideQuery` internally (`get-guide-outline-query.ts:20-25`, `get-guide-section-query.ts:35-42`), inheriting that behavior.

**Impact / interpretation:** This is an implementation bug if the newly merged requirements are authoritative: a consumer can receive a document from a collection it did not address, defeating the collision/isolation contract. Conversely, the tests and user-friendly title-suggestion design indicate an intentional product behavior, in which case the merged requirements are too strict and should be revised. The two are not simultaneously satisfiable.

**Recommended resolution:** choose one policy. To retain isolation, reject unqualified input before collection enumeration and restrict alternatives/title matches to the port's catalog/qualified collection; update outline and section regression tests. To retain convenience lookup, amend all three merged specs to expressly allow bare lookup and cross-collection suggestions while defining ambiguity behavior.

### F2 — Medium: search does not enforce exact full-query results ahead of partial results

**Affected merged spec:** `guide:search-guides`.

**Requirement evidence:** The merged contextual-snippet requirement states that a hit containing an exact case-insensitive full-query substring **MUST rank ahead** of hits matched only by partial terms, before ordinary BM25 tie-breaking.

**Implementation evidence:** `MiniSearchGuideEngineAdapter.search` obtains `rawResults = safeSearch(ms, trimmed)` and immediately filters and slices that MiniSearch/BM25 order (`packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts:235-278`). `findBestMatchLine` gives exact matches a high score only for choosing a line _inside an already-ranked hit_ (`:126-180`); nothing reorders `rawResults` by full-query substring presence. A high BM25 partial-title/heading match may therefore precede a body hit containing the complete query.

**Test evidence:** existing tests validate that a typical title/heading match ranks highly and that snippets prefer exact lines, but no fixture creates an exact-substring hit and a higher-BM25 partial-only hit to assert the required cross-hit ordering.

**Impact / interpretation:** This is most likely an implementation omission. If BM25 order was intended to remain authoritative, the spec’s mandatory precedence must instead be weakened; presently code and merged requirement conflict.

**Recommended resolution:** stably partition/sort filtered results by a case-insensitive full-query-substring predicate before BM25 score, retaining existing BM25 order inside each partition, and add a regression fixture. Alternatively revise the requirement if this precedence is intentionally not desired.

## Test coverage and missing tests

`pnpm --filter @specd/guide test` passed: **10 files, 131 tests**. This confirms the current implementation, not the two merged guarantees above.

Existing coverage is strong for list ordering/pagination/generated scope, qualified normalization, empty requests, outline fields, section selection/errors, line slicing/CRLF, MiniSearch punctuation/prefix/fuzzy behavior, filtering, and snippet bounds.

Missing or contradictory coverage:

1. A negative test that every affected query rejects unqualified `topic` values rather than enumerating collections (required by the merged collection-qualified contract).
2. A two-collection collision test proving that a wrong qualified collection cannot resolve or suggest a document in another collection, including outline and section query paths.
3. A search ranking fixture where an exact full-query body match competes with a strong partial title/heading match, asserting exact-first ordering.
4. An adapter-level test proving `getGuide` cannot accept unqualified IDs (the adapter itself already effectively rejects them; the query-layer enumeration masks that boundary).

## Direct dependency / global conformance

- The audited query code remains within `@specd/guide` application/domain/infrastructure boundaries and uses named exports, explicit public return types, readonly API shapes, and JSDoc in the inspected surfaces, consistent with `guide:conventions` and `default:_global/conventions`.
- The inspected expected errors (`GuideTopicNotFoundError`, `GuideSectionNotFoundError`, `GuideSectionAmbiguousError`) extend `SpecdGuideError`, expose uppercase snake-case codes and documented metadata, consistent with `guide:errors` and `default:_global/error-handling-conventions`.
- No additional direct-dependency contradiction was found beyond F1’s conflict with the collection-aware catalog model established by `guide:list-guides` / `GuideCatalogPort`.

## Summary counts

- Specs audited: 5 change specs + 5 direct/global dependencies reviewed for applicable constraints.
- Requirements materially checked: 23 grouped requirements.
- Conforming: 20.
- Partial/non-conforming: 3 grouped query contracts (F1 affects three) and 1 search ranking guarantee (F2).
- Findings: **2** total — **1 high**, **1 medium**.
