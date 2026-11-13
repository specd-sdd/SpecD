# Compliance Audit — Guide B

Scope: merged change previews for `guide:composition`, `guide:get-guide-outline`, `guide:search-guides`, `guide:slice-guide-content`, `guide:errors`, and `default:_global/docs`; direct dependencies `guide:conventions`, `guide:guide-model`, `guide:list-guides`, `guide:get-guide`, and `default:_global/error-handling-conventions`; global constraints `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`, and `default:_global/eslint`.

Method: change specs were read through `changes spec-preview sdk-development-guide <specId>`; external dependency/global specs through `specs show`; implementation discovery was graph-first after reindexing; linked source, tests, package manifest, documentation, and sidebar files were then inspected read-only. No production code or spec was changed.

## Requirements Summary

The implementation substantially covers the requested SDK guide collection: separate generated JSON catalogs, a dedicated `./sdk` package subpath, collection-aware topic resolution, real source paths, outline offsets, scoped BM25 search, section extraction, typed errors, guide-sdk documentation, and tombstone removal are present.

However, the merged contract is not fully compliant. There are three direct behavior/export violations, two dependency-spec conflicts, one manifest violation, and global test-naming/JSDoc violations. Several verification scenarios also lack focused tests.

Audited top-level requirement groups: 31.

- Fully compliant: 23
- Partially compliant or internally conflicted: 5
- Non-compliant: 3
- Clean areas: architecture layer direction, zero runtime dependency on core, dedicated package export map, outline source paths/offsets, collection isolation, search identifiers/read commands, line utilities, documentation discoverability, tombstone deletion, and SDK source-root exclusion.

## Implementation Status

### `guide:composition`

- `GuideEngine`, `GuideEngineOptions`, `assembleGuideEngine`, and `createGuideEngine` exist in `packages/guide/src/composition/guide-engine.ts`.
- The default engine uses `generated/guides.json`; `createGuideSdkEngine` uses `generated/guides-sdk.json`.
- The package export map correctly maps `.` to `dist/public.js`, `./internal` to `dist/index.js`, and `./sdk` to `dist/sdk.js`.
- `src/public.ts` is curated and does not expose SDK factory/catalog symbols.
- `src/sdk.ts` exposes the SDK factory as required.
- `src/index.ts` does expose `createGuideSdkEngine`, contrary to the merged composition spec.
- The implemented `GuideEngine.listGuides(options?)` returns `GuideListingResult`, not the `Promise<readonly GuideSummary[]>` signature still stated by the merged composition spec.

### `guide:get-guide-outline`

- `GetGuideOutlineQuery` delegates resolution to `GetGuideQuery`, preserving normalization and resolution errors.
- It returns `collection`, canonical topic, real `sourcePath`, counts, and the existing outline without copying section content.
- Section offsets are generated and carried through the domain model.
- Real SDK catalog integration tests cover top-level and nested source paths and generated TypeScript paths.
- Focused unit verification is incomplete for empty outlines, absence of serialized content, offset fidelity through the query, and error identity propagation.

### `guide:search-guides`

- The adapter indexes one document per section, with title/heading/content fields, boosts `5/3/1`, prefix search, fuzzy search, and collection-qualified IDs.
- Stored fields include collection, topic, source path, section index, level, and line bounds.
- Topic and collection filters are implemented; malformed query syntax is caught without throwing.
- Snippets are clamped to section bounds; source paths and collection-specific read commands are emitted correctly.
- Stop words affect snippet line selection only, not index membership.
- The code does not explicitly enforce that a document with an exact full-query substring outranks a document containing the terms separately. Exact-substring priority is only used to choose a line _inside each already-ranked hit_.
- Several normative scenarios have no direct tests (listed below).

### `guide:slice-guide-content`

- Numeric strings are digits-only after trimming; numeric selection is 1-indexed.
- Heading matching is case-insensitive, whitespace-tolerant, and slug-aware.
- Duplicate headings raise `GuideSectionAmbiguousError`; index selection disambiguates.
- Offset-based extraction includes nested headings and ends at the compiled section boundary.
- Line slicing and number formatting behavior is implemented and unit-tested, including CRLF, empty input, out-of-range starts, and count bounds.
- Ambiguity diagnostics do not satisfy the merged error contract: raw duplicate headings are supplied and the message gives only a generic placeholder.

### `guide:errors`

- `SpecdGuideError` directly extends native `Error`, duck-types `specd: true`, and imports no core runtime.
- Concrete codes are uppercase snake case and implemented as getter-only properties.
- Topic errors preserve the raw caller input, keep the catalog out of the message, and expose collection-qualified available topics when raised through `GetGuideQuery`.
- Section not-found diagnostics expose available values.
- Ambiguity diagnostics are incomplete relative to the merged requirements and verification scenarios.

### `default:_global/docs`

- `docs/cli/guide-sdk.md` exists and covers listing, topic reads, sections, metadata, scopes, collections, pagination, search, formats, and the distinction from `specd guide`.
- `docs/cli/index.md` indexes the command; `docs/guide/cli.md` contains scenario-oriented recipes; `apps/public-web/sidebars.ts` exposes `cli/guide-sdk`.
- `docs/core/sdk.md` is deleted and no live sidebar/Markdown reference to it was found.
- Host integration guidance remains under `docs/sdk/`.
- The SDK bundler source roots exclude `docs/cli/` and `docs/public-web/`; build-time frontmatter validation is implemented and covered in bundler tests.
- JSON catalogs are the runtime artifacts; deleted generated TypeScript catalogs are not used.

## Discrepancies

### 1. HIGH — SDK factory leaks from a forbidden root barrel

Evidence:

- Merged `guide:composition`: the SDK factory/catalog “MUST NOT be exported from either root barrel” and must be available only through `./sdk`.
- `packages/guide/src/index.ts:11` explicitly exports `createGuideSdkEngine`.
- Graph public-binding resolution confirms `createGuideSdkEngine` is reachable from `guide:src/index.ts` as well as `guide:src/sdk.ts`.
- `package.json` exposes `src/index.ts` output through the public `./internal` subpath.

Possible correction:

- Code: remove the SDK factory reexport from `src/index.ts`; keep it only in `src/sdk.ts`.
- Spec: if SDK access from `./internal` is intentional, relax the “both root barrels” prohibition and explicitly permit the internal barrel. This weakens the stated lazy-loading boundary and should be justified.

### 2. HIGH — `GuideEngine.listGuides` contradicts the merged composition contract

Evidence:

- Merged `guide:composition` still declares `listGuides(): Promise<readonly GuideSummary[]>`.
- `packages/guide/src/composition/guide-engine.ts:40-49` declares `listGuides(options?: ListGuidesOptions): Promise<GuideListingResult>` and also adds `getCollections()`.
- All current CLI and SDK tests consume the envelope (`topics`, `pagination`, `collections`), showing the implemented API is deliberate.
- Living direct dependency `guide:list-guides` still specifies an array-returning `ListGuidesQuery`, while the implementation returns a listing envelope.

Possible correction:

- Specs (preferred if the pagination work is accepted): update `guide:composition`, `guide:list-guides`, and their verification scenarios to the implemented envelope/options contract, including `getCollections` if public.
- Code: revert the facade/query to the array contract and move pagination/collection metadata to a separate API. This would conflict with the new CLI behavior and is likely the less suitable path.

### 3. HIGH — Ambiguous-section error lacks required candidate details and exact commands

Evidence:

- Merged `guide:errors` requires `matchingHeadings` to contain formatted section titles with line numbers.
- Verification requires the message to explicitly mention `--section 3` and `--section 8` (or the actual matching indices).
- `GetGuideSectionQuery` passes only `matches.map((s) => s.heading)`.
- `GuideSectionAmbiguousError` emits only `Use --section <number> to disambiguate.` and never interpolates the matching indices.
- Existing unit tests assert the generic placeholder, so they preserve rather than detect the mismatch.

Possible correction:

- Code: pass formatted candidates such as `[3] Examples (lines 20-35)` and construct the message from every index (`--section 3`, `--section 8`). Update focused tests.
- Spec: reduce the requirement to raw headings plus a generic placeholder. This would remove actionable detail explicitly added by the change and is not recommended.

### 4. MEDIUM — Exact-query preference is only implemented within a hit, not across hits

Evidence:

- Merged `guide:search-guides` says an exact full-query substring must take priority over partial term matches; its verification scenario compares two candidate sections.
- `findBestMatchLine()` adds exact-match priority only while choosing a snippet line inside one section.
- Result ordering remains MiniSearch score order; there is no post-ranking exact-substring boost or sort across documents.
- No focused test creates the required two-document exact-vs-separated-terms case.

Possible correction:

- Code: incorporate an exact-query boost into document ranking or stable post-ranking, then add the two-section regression test.
- Spec: clarify that the rule applies only to snippet-line selection. The current scenario says otherwise.

### 5. MEDIUM — Direct dependency `guide:conventions` conflicts with the new internal-barrel design

Evidence:

- `guide:conventions` says both `src/index.ts` and `src/public.ts` expose only the clean public facade/domain/options/errors, and that adapter mechanics are not leaked.
- Merged `guide:composition` now explicitly defines `src/index.ts` as a broader internal barrel and maps it to `./internal`.
- `src/index.ts` exports `PrebundledGuideCatalogAdapter`, `MiniSearchGuideEngineAdapter`, the entire application/domain surfaces, and `assembleGuideEngine`.

Possible correction:

- Spec: update `guide:conventions` in this change to distinguish curated `public.ts` from internal `index.ts`, matching the composition delta and export map.
- Code: make `src/index.ts` curated too and introduce a differently named internal entry point. This contradicts the new composition design.

### 6. MEDIUM — `package.json` omits manifest fields required by `guide:conventions`

Evidence:

- `guide:conventions` verification requires `main`, `types`, and `exports` to target `dist/`.
- `packages/guide/package.json` has a correct `exports` map but no top-level `main` or `types` fields.

Possible correction:

- Code/manifest: add `main` and `types` pointing to the curated build output, if compatibility fields remain required.
- Spec: explicitly define the modern conditional `exports` map as sufficient and remove the obsolete `main`/`types` requirement.

### 7. MEDIUM — Modified tests violate global naming and description conventions

Evidence:

- `default:_global/testing` requires `.spec.ts`, source-mirroring names, and behavior descriptions in `given…, when…, then…` form.
- This change modifies multiple `.test.ts` files, including `packages/guide/test/integration/guide-engine.test.ts`, `packages/guide/test/unit/application/queries.test.ts`, `packages/guide/test/unit/domain/errors.test.ts`, `packages/guide/test/unit/domain/models.test.ts`, `packages/guide/test/unit/infrastructure/bundle.test.ts`, `packages/guide/test/unit/infrastructure/search.test.ts`, and `packages/cli/test/commands/guide/guide.test.ts`; it also adds `expand-guide-terms.test.ts` and `workspace-package-roots.test.ts`.
- Most descriptions are concise action phrases rather than the mandated BDD form.
- Two new focused suites were correctly renamed to `.spec.ts`, but the remaining touched suites were not.

Possible correction:

- Code/tests: rename all touched/new `.test.ts` files to `.spec.ts`, update references/implementation links, and progressively convert changed behavior descriptions to the mandated form.
- Spec: grandfather legacy `.test.ts` files, but newly added files and changed tests would still need a clearly documented exception.

### 8. LOW — Use-case JSDoc does not enumerate all propagated typed errors

Evidence:

- `default:_global/error-handling-conventions` requires use cases to document errors with `@throws`.
- `GetGuideOutlineQuery.execute` propagates `GuideTopicNotFoundError` but has no `@throws` tag.
- `GetGuideSectionQuery.execute` documents section-not-found and ambiguity but not the propagated `GuideTopicNotFoundError`.

Possible correction:

- Code/docs: add the missing `@throws` tags.
- Spec: narrow the JSDoc requirement to directly constructed errors, though that would make propagated public failure modes harder to discover.

### 9. LOW — Available-heading diagnostic shape varies by selector mode

Evidence:

- Merged `guide:slice-guide-content` requires a documented, consistent available-heading shape.
- Numeric misses pass strings formatted as `"<index>: <heading>"`; named misses pass bare heading strings.
- Both are `readonly string[]`, but the semantic shape varies across error cases and is not documented in the public type beyond “list of valid section headings and indices”.

Possible correction:

- Code: use one descriptor format for both numeric and named misses.
- Spec: explicitly permit selector-dependent formatting and document it.

## Test Coverage

Strong coverage exists for:

- User/SDK catalog isolation and portable packed-package imports.
- Qualified and nested topic resolution.
- Generated API source paths and import metadata.
- Listing scope, collection filters, pagination, formats, and CLI error envelopes.
- Outline indices and source-path integration.
- Numeric/string/slug section selection and duplicate-heading rejection.
- Line slicing, numbering, empty input, bounds, and CRLF.
- Prefix/fuzzy search, topic scoping, limits, special-character safety, snippet boundaries, identifier expansion, and collection-specific read commands.
- Documentation registration and sidebar exposure.

The existing suites would not catch discrepancies 1–4: they import the composition factory directly or from `src/index.ts`, expect the envelope contract, assert the generic ambiguity placeholder, and do not test cross-document exact-query ordering.

No test command was executed by this partial auditor because the assignment restricted writes to this report; this section assesses source-level coverage. The implementation manifest and graph are current and complete after reindexing.

## Missing Tests

1. Import both compiled root barrels and assert `createGuideSdkEngine` is absent; import `./sdk` and assert it is present.
2. A type-level/API-contract test for the final accepted `GuideEngine.listGuides` signature.
3. Ambiguous heading with indices 3 and 8: assert formatted `matchingHeadings` with line spans and exact `--section 3` / `--section 8` guidance.
4. Search two sections where one contains the contiguous full query and one only separated terms; assert the exact hit ranks first.
5. Stop-word-only search (`the`, `of`) that proves results are not removed by preprocessing.
6. Emoji and non-ASCII query safety (the current special-character test is ASCII punctuation only).
7. Explicit stored-field assertions for `level`, `startLine`, and `endLine` without reparsing.
8. Snippet fallback to section start when no query term occurs on any line.
9. Search IDs with identical topic/section index in two collections, asserting neither overwrites the other.
10. `GetGuideOutlineQuery`: empty headings, absence of serialized section content, collection field, nested/generated source path, offsets that slice exactly, foreign-collection rejection, and identical propagated error object.
11. `GuideTopicNotFoundError`: code immutability in strict mode and every returned qualified topic resolving when passed back.
12. Test/package lint rule that rejects `.test.ts` under touched/new files if the global naming requirement remains strict.

## Dependency Chain

```text
default:_global/architecture
  -> guide:conventions
     -> guide:guide-model
     -> guide:list-guides
     -> guide:get-guide
     -> guide:get-guide-outline
     -> guide:search-guides
     -> guide:slice-guide-content
     -> guide:errors
     -> guide:composition

default:_global/error-handling-conventions
  -> guide:errors
     -> guide:slice-guide-content
     -> guide:composition

default:_global/conventions
  -> default:_global/docs
  -> default:_global/testing
  -> default:_global/eslint

guide:composition
  -> @specd/guide main export (src/public.ts)
  -> @specd/guide/internal (src/index.ts)
  -> @specd/guide/sdk (src/sdk.ts)
  -> CLI guide and guide-sdk delivery adapters
```

Key ripple: accepting the paginated listing envelope requires coordinated updates to `guide:list-guides`, `guide:composition`, model/public API documentation, and tests. Accepting the broader internal barrel requires updating `guide:conventions`; otherwise the change leaves two source-of-truth specs in direct conflict.

## Summary Counts

- Findings: 9
- HIGH: 3
- MEDIUM: 4
- LOW: 2
- Direct implementation violations: 3 (SDK root export, ambiguity diagnostics, exact-query cross-hit preference)
- Spec/API alignment conflicts: 2 (`listGuides`; internal barrel)
- Global/dependency convention violations: 4 (manifest fields, test naming/descriptions, JSDoc throws, diagnostic-shape consistency)
- Missing focused test scenarios: 12 groups
- Fully clean audited areas: 10 major areas listed in Requirements Summary

Conclusion: **not clean**. The feature is broadly implemented and documented, but it should not receive a clean compliance result until the three HIGH findings are resolved or the affected specs are deliberately revised. The most likely intended resolution is spec alignment for the listing envelope/internal barrel, plus code fixes for SDK factory isolation and actionable ambiguity diagnostics.
