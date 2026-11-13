# Compliance audit — guide A

Scope: merged specs `guide:guide-model`, `guide:bundle-guides`, `guide:conventions`, `guide:list-guides`, and `guide:get-guide`, plus direct dependency `guide:errors` and the global error-contract implications referenced by it.

## Requirements Summary

| Spec                  | Requirements |   Pass | Partial |  Fail |
| --------------------- | -----------: | -----: | ------: | ----: |
| `guide:guide-model`   |            5 |      4 |       1 |     0 |
| `guide:bundle-guides` |            4 |      3 |       1 |     0 |
| `guide:conventions`   |            5 |      3 |       1 |     1 |
| `guide:list-guides`   |            2 |      1 |       1 |     0 |
| `guide:get-guide`     |            2 |      2 |       0 |     0 |
| **Total**             |       **18** | **13** |   **4** | **1** |

The implementation is broadly aligned: collection-aware domain records, JSON-only catalogs, recursive compilation, TypeDoc generation, package exports, catalog isolation, pagination, on-demand lookup, and structured errors are present. It is not clean: three high-severity and two medium-severity discrepancies remain.

## Implementation Status

### `guide:guide-model`

- `GuideTopic`, `GuideSection`, `GuideSummary`, `GuideOutline`, and `GuideSearchHit` contain the merged collection-aware fields. Source evidence: `packages/guide/src/domain/models/*.ts`.
- Real `sourcePath` values, generated-symbol package/import metadata, offsets, 1-indexed coordinates, and collection-derived read commands are represented and exercised by unit/integration tests.
- `qualifyTopic()` rejects `:` in collection and topic identifiers, and normalization preserves `/`. However, catalog construction itself does not enforce the reserved-delimiter invariant; see discrepancy D4.

### `guide:bundle-guides`

- `COLLECTIONS` configures `docs/guide`, `docs/sdk`, `docs/core`, `docs/code-graph`, `docs/skills`, and `docs/schemas`; collection traversal is recursive and ignores non-Markdown files by selecting only `.md`.
- Build output is exclusively `packages/guide/generated/guides.json` and `guides-sdk.json`; no runtime TypeScript catalog is consumed.
- TypeDoc is loaded as a library over the curated public-site entry points, with the public TypeDoc options, and generates per-symbol topics.
- Heading ranges, offsets, CRLF handling, deterministic ordering/indexing, source-root failures, isolation, package tarball loading, and absence of the legacy `src/infrastructure/generated` path have test evidence.
- Frontmatter parsing is hand-written and does not satisfy strict integer/YAML validation; see D1.

### `guide:conventions`

- Layer import scans found no domain-to-application/infrastructure/composition imports and no application-to-infrastructure/composition imports.
- `package.json` has only `minisearch` at runtime; TypeDoc tooling is in `devDependencies`. It declares `.`, `./internal`, and `./sdk`, and both builds run the bundler first.
- JSON assets are in `files`, and the extracted-tarball integration test loads both engines without repository docs.
- Error classes and the package-level error contract are covered by the package tests.
- The README is materially out of parity and contains a broken quick-start expression; see D3. The public entry boundary is also broader than the merged verification text permits; see D5.

### `guide:list-guides`

- `GuideCatalogPort` exposes `listGuides`, `getAllGuides`, `getCollections`, `getAllTopics`, and qualified `getGuide`.
- `ListGuidesQuery` filters before ordering, groups ordering by collection, sorts by order/topic using `Intl.Collator`, paginates, reports extents, and supports hand-written/generated scopes.
- Multi-value scopes are implemented incorrectly with `every`; see D2.

### `guide:get-guide`

- Normalization is trim, trailing `.md` removal, then lowercase, preserving qualified/nested identities.
- Blank input is rejected before port access and preserves the raw input in the error.
- Successful resolution is collection-aware. Unknown-topic alternatives are qualified and scoped, with intentional cross-collection title suggestions separated from directly resolvable candidates.
- Section bodies are extracted downstream from outline offsets; the catalog does not serialize duplicate section content.

## Discrepancies

### D1 — HIGH — Frontmatter validation accepts invalid numeric YAML and cannot report malformed YAML locations

Evidence:

- `packages/guide/scripts/guide-bundler.ts:66` uses `parseInt(rawPosition, 10)` and only checks `isNaN` or negativity. Values such as `1.5` and `1junk` are therefore accepted as `1`, contrary to the requirement that `sidebar_position` be an integer of valid type.
- The parser splits each non-comment line at its first colon instead of using a YAML parser. It cannot reliably reject malformed YAML or provide the required line/column parse error.
- `packages/guide/test/unit/infrastructure/bundle.test.ts` covers missing fields and `-3`, but has no decimal, partially numeric, malformed mapping, or tab-indentation case.

Resolution possibilities:

1. **Code fix:** use a real YAML parser (build-time dependency), validate the parsed value with `Number.isInteger(value) && value >= 0`, and preserve parser location details.
2. **Spec fix:** explicitly define the supported frontmatter as a restricted line-oriented subset and remove the malformed-YAML/line-column requirements. This would weaken compatibility with the current Docusaurus/YAML wording.

### D2 — HIGH — Multi-collection and multi-topic scopes cannot match

Evidence:

- The merged `guide:list-guides` requirement says scope may name “one or more collections”.
- `packages/guide/src/application/queries/list-guides-query.ts:322` uses `expected.every(...)` for collection arrays. A summary can equal every distinct requested collection only when the array contains one repeated value.
- The same defect exists for topic arrays at line 339 and qualified-topic arrays at line 367.
- Existing tests exercise a single string collection and generated boolean scopes, not arrays of two values.

Resolution possibilities:

1. **Code fix:** replace array `every` membership checks with `some`/`includes`, retaining `every` only for validation if desired.
2. **Spec fix:** remove multi-value scopes and type the API as a single selector. This conflicts with the current plural keys (`collections`, `topics`, `collectionTopics`) and stated requirement.

### D3 — HIGH — README violates catalog parity and documents stale/broken usage

Evidence:

- Generated `guides.json` contains 22 topics. The README table under `packages/guide/README.md:61` lists only 12, omits 11 real topics (`what-is-specd`, `index`, `installation`, `philosophy`, `specs`, `changes`, `project-structure`, `skills`, `artifacts`, `context-compilation`, `configuration-examples`) and lists nonexistent `templates`.
- `packages/guide/README.md:19` still claims an “immutable static TypeScript catalog”, contradicting the required and implemented JSON-only catalog.
- `packages/guide/README.md:118` calls `catalog.map(...)`, but `GuideEngine.listGuides()` returns `GuideListingResult`; the executable shape is `catalog.topics.map(...)`.
- No README/catalog parity test was found under `packages/guide/test`.

Resolution possibilities:

1. **Code/docs fix:** regenerate or update the table from `generated/guides.json`, state JSON assets, and correct the quick-start expression. Add a parity regression test.
2. **Spec fix:** remove exact parity and downgrade the table to examples. Even then, the nonexistent topic, stale TypeScript claim, and broken quick start remain documentation defects.

### D4 — MEDIUM — Reserved `:` invariant is not enforced when catalog topics are constructed

Evidence:

- `qualifyTopic()` correctly rejects delimiters, but `compileGuide()` assigns `collection` directly and derives `topic` from the relative path without calling validation.
- `compileCollections()` accepts arbitrary `CollectionConfig.collection`. A configuration or Markdown filename containing `:` can therefore create a catalog record that violates the model requirement before later qualification fails.
- Tests cover `qualifyTopic()` success but not rejection during catalog compilation.

Resolution possibilities:

1. **Code fix:** validate collection IDs and derived topics in `compileGuide`/`compileCollections`, failing the build with the offending root/file.
2. **Spec fix:** scope the invariant to externally addressable lookups and declare source/config values trusted. This is weaker than “MUST NOT appear in a collection or topic value”.

### D5 — MEDIUM — Public entry exports exceed the merged clean-boundary scenario

Evidence:

- Merged verification says the public entry exposes only the facade, `GuideEngine`, domain models, options, and error classes.
- `packages/guide/src/public.ts` additionally exports topic-identity helpers (line 12 onward), application ports/query types (line 30 onward), and application utilities (line 48 onward).
- Infrastructure adapters and raw catalogs are correctly absent from the public entry; the mismatch is limited to extra application/helper surface.

Resolution possibilities:

1. **Code fix:** move helper/port/utility exports to `./internal` if they are not intended as stable public API.
2. **Spec fix:** enumerate these exports as intentionally supported public API. This is plausible because SDK consumers may need the shared identity and slicing helpers.

## Test Coverage

- Executed `pnpm --filter @specd/guide test`: **10 files, 131 tests passed**.
- Domain model tests cover readonly shapes, UTF-8 byte length, CRLF line counts, section spans/offsets, source paths, and search-hit metadata.
- Bundler tests cover required frontmatter fields, heading fences, offsets, final boundaries, compiled topic shape, collection isolation, and output directory.
- Query tests cover sorting, pagination, generated/document scopes, normalization, blank input, qualified delegation, errors, outlines, sections, and searches.
- SDK integration tests cover configured collections, catalog isolation, qualified/nested lookup, generated symbols, real source paths, collection-filtered search, command derivation, JSON packaging, and extracted tarball imports.
- Error tests cover inheritance and structured fields relevant to `guide:errors` and the global error contract.

## Missing Tests

1. Reject decimal and partially numeric `sidebar_position` values.
2. Reject malformed YAML with file plus line/column evidence.
3. Select the union of two collections via `collections: ['core', 'schemas']`.
4. Select the union of multiple topics and multiple qualified topics.
5. Assert README topic-table parity against `generated/guides.json`.
6. Compile-time/build-time rejection of `:` in configured collections and derived topic paths.
7. Explicit public-entry export allowlist matching whichever boundary (code or revised spec) is chosen.
8. A README quick-start type/execution check, or at minimum an assertion of the `GuideListingResult.topics` shape used by documentation.

## Dependency Chain

```text
guide:conventions (global package/layer/runtime constraints)
├── guide:guide-model
│   ├── guide:bundle-guides
│   ├── guide:list-guides
│   └── guide:get-guide
└── guide:errors
    ├── guide:get-guide
    └── default:_global/error-handling-conventions
```

The highest-risk chain is `bundle-guides -> generated JSON -> PrebundledGuideCatalogAdapter -> ListGuidesQuery/GetGuideQuery -> public engines`. D1 can admit invalid catalog metadata at build time; D2 then affects every engine consumer that requests a plural scope. D3 affects users before runtime by advertising incorrect topics and an invalid code example.

## Summary counts

- Specs audited: **5 merged + 1 direct external dependency + 1 referenced global contract**.
- Requirements assessed in assigned merged specs: **18**.
- Pass: **13**.
- Partial: **4**.
- Fail: **1**.
- Discrepancies: **5** total — **3 HIGH**, **2 MEDIUM**, **0 LOW**.
- Test run: **131/131 passing**, but the suite does not exercise the five discrepancies above.

Verdict: **not clean; verification should fail until the high-severity frontmatter, plural-scope, and README-contract issues are resolved or the specs are deliberately revised.**
