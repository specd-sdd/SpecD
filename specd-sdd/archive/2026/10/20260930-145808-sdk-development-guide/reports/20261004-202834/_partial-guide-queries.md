# Compliance audit partial — guide query APIs and documentation

**Change:** `sdk-development-guide`  
**Scope:** `guide:list-guides`, `guide:get-guide`, `guide:get-guide-outline`, `guide:search-guides`, `guide:slice-guide-content`, and `default:_global/docs`; direct guide/global dependencies checked where applicable.  
**Method:** current merged spec previews, current graph symbol discovery, source/test inspection, and focused package tests.

## Requirements summary

| Spec                        | Key requirements examined                                                                                | Result                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `guide:list-guides`         | collection-aware catalog contract; filtering, ordering, pagination, generated-topic withholding          | Conforms                                              |
| `guide:get-guide`           | normalized lookup, blank rejection, collection-qualified identity, collection-local alternatives         | Partial — F1                                          |
| `guide:get-guide-outline`   | same lookup semantics; real path and content-free outline                                                | Conforms except inherited lookup ambiguity in F1      |
| `guide:slice-guide-content` | same lookup semantics; numeric/heading section extraction and 1-indexed utilities                        | Conforms except inherited lookup ambiguity in F1      |
| `guide:search-guides`       | in-memory section index, qualified filtering, safe queries, bounded snippets, exact-match-first ranking  | Partial — F2                                          |
| `default:_global/docs`      | frontmatter, dedicated CLI reference, and same-change documentation for public listing/summary contracts | Conforms for the change’s guide command documentation |

## Evidence and implementation status

### Listing

`GuideCatalogPort` declares the required full/summary/collection accessors and qualified lookup in `packages/guide/src/application/ports/guide-catalog-port.ts:11-41`. `ListGuidesQuery` calls `getAllGuides`, applies scope before ordering, orders with `Intl.Collator` by collection/order/topic, paginates, produces collection extents, and exposes withheld generated counts in `packages/guide/src/application/queries/list-guides-query.ts:132-199,237-377`. Unit coverage exercises ordering, page bounds, extents and generated scopes.

### Get, outline, and slice

`GetGuideQuery` normalizes trim → one `.md` suffix → lowercase, rejects blank input without port I/O, and now resolves a bare topic only when the catalog serves exactly one collection (`packages/guide/src/application/queries/get-guide-query.ts:50-65`). The new unit test proves a multi-collection port rejects bare `workflow` (`packages/guide/test/unit/application/queries.spec.ts`, `does not resolve an unqualified topic across multiple collections`).

`GetGuideOutlineQuery` delegates to that query and returns collection, actual `sourcePath`, counts and outline without serializing section bodies (`get-guide-outline-query.ts:35-51`). `GetGuideSectionQuery` supports trimmed numeric selectors, case-insensitive heading/slug resolution, ambiguity/not-found errors, and offset/range-based on-demand body construction (`get-guide-section-query.ts:46-122`). `sliceGuideLines` and `formatWithLineNumbers` preserve 1-indexed semantics and normalize CRLF (`slice-guide-lines.ts:1-67`); their focused tests cover ranges, invalid values, end-of-document behavior and CRLF.

### Search

`MiniSearchGuideEngineAdapter` creates an in-memory index of every section, names documents with `collection:topic#index`, stores source/location fields, enables title/heading/content boosting plus prefix/fuzzy matching, and tolerates special-character search through `safeSearch` (`packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts:46-113,235-356`). It filters qualified topics, keeps snippets within section bounds, and selects `specd guide-sdk` for SDK-collection hits. Adapter tests cover prefix/fuzzy behavior, punctuation safety, topic/collection filters, identifiers, and no-bleed snippets.

### Documentation

The change supplies [`docs/cli/guide-sdk.md`](../../../../docs/cli/guide-sdk.md) with required Docusaurus `title`, `description`, and `sidebar_position`; it documents command/flag behavior, listing envelope, errors, sections, snippets, examples, and SDK search. [`docs/cli/guide.md`](../../../../docs/cli/guide.md) introduces the sibling command, and the CLI directory includes it. This satisfies the global requirement that command/output-contract changes update the relevant CLI reference in the same change.

## Discrepancies

### F1 — Medium: merged collection-local alternative contract conflicts with implemented and documented cross-collection suggestions

**Affected requirement:** `guide:get-guide` says unavailable topics must be drawn from the collection served by the catalog/selected collection and requires collection-local resolution. Outline and slice inherit the same lookup policy.

**Evidence:** On a qualified miss, `GetGuideQuery` deliberately searches all catalog topics for matching titles when the requested collection has no title match (`packages/guide/src/application/queries/get-guide-query.ts:68-99`). It returns `crossCollection` metadata and suggestions such as a `code-graph:` address for a failed `sdk:` request. The behavior is tested in `queries.spec.ts` (`reports a title match from another collection when the request names the wrong one`) and explicitly documented in [`docs/cli/guide-sdk.md`](../../../../docs/cli/guide-sdk.md), Error Handling: “Naming the wrong collection … a title match is still reported when it lives in another collection.”

**Assessment:** Code and CLI documentation agree, but they contradict the merged spec’s collection-local alternative rule. This is a specification drift issue unless cross-collection suggestions are removed. The runtime does not silently resolve across collections anymore, so this finding is limited to error alternatives/suggestions, not successful retrieval.

**Recommended resolution:** either amend `guide:get-guide` (and inherited wording where needed) to permit non-resolving cross-collection title suggestions with explicit metadata, or change the error path and CLI documentation to keep all alternatives local. Add an assertion that the chosen policy applies through outline and section paths too.

### F2 — Medium: exact full-query search-hit ordering is not implemented or tested

**Affected requirement:** merged `guide:search-guides` requires a hit containing an exact case-insensitive full-query substring to rank ahead of partial-term-only hits before BM25 tie-breaking.

**Evidence:** `search` assigns `rawResults = safeSearch(ms, trimmed)`, filters them, then immediately slices the MiniSearch order (`minisearch-guide-engine-adapter.ts:235-278`). `findBestMatchLine` prioritizes exact text only while choosing the snippet line (`:126-180`); it does not reorder hits. A high-scoring title/heading partial match can therefore precede an exact full-query body match.

**Coverage gap:** no fixture compares an exact-body hit against a stronger partial title/heading hit and asserts exact-first result ordering. Existing tests prove normal ranking, fuzzy/prefix matching, and exact snippet placement, not the merged ordering guarantee.

**Recommended resolution:** stably partition filtered results by a case-insensitive full-query-substring predicate before applying the limit, preserving MiniSearch order within each partition; add the competing-hit regression test. If BM25 order is intentionally authoritative, revise the merged requirement instead.

## Test coverage

- `pnpm --filter @specd/guide test` passed: **10 files, 132 tests**.
- Focused CLI guide/guide-sdk test invocation completed successfully; its expected validation/error diagnostics were emitted while exercising invalid scopes/collections and unknown topics.

Remaining missing tests:

1. Cross-collection suggestion policy through `GetGuideOutlineQuery` and `GetGuideSectionQuery`, not just `GetGuideQuery`.
2. Exact-full-query-before-partial search ranking (F2).
3. A documentation/CLI contract test that the structured listing envelope described in `docs/cli/guide-sdk.md` remains synchronized with `buildGuideListingEnvelope` (`packages/cli/src/commands/guide/formatters.ts:46-66`).

## Dependency and global review

The inspected guide surfaces use named exports, explicit return types, readonly result shapes, and JSDoc, satisfying applicable `guide:conventions` / `default:_global/conventions` rules. Expected guide errors use `SpecdGuideError` and uppercase codes, compatible with `guide:errors` and global error conventions. No additional documentation-structure or frontmatter defect was found in the change’s relevant CLI documentation.

## Summary

- Change specs audited: 6.
- Focused requirements/groups checked: 24.
- Findings: **2 medium** (one spec/documentation drift, one implementation/test gap).
- Test status: guide package suite passing; focused CLI guide command tests passing.
