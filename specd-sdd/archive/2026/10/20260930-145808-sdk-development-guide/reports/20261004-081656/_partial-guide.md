# Full compliance audit — guide-domain slice

**Change:** `sdk-development-guide`  
**Scope:** `guide:guide-model`, `guide:bundle-guides`, `guide:composition`, `guide:conventions`, `guide:list-guides`, `guide:get-guide`, `guide:get-guide-outline`, `guide:search-guides`, `guide:slice-guide-content`, and `guide:errors`, including their direct global dependencies.  
**Method:** merged `spec-preview` requirements and scenarios; current code and test review; graph-first discovery (the graph subsequently remained `GRAPH_BUSY` during concurrent indexing, so direct inspection was used as the permitted fallback); focused test/typecheck/lint; dry pack plus extracted-package runtime test. No implementation or spec artifact was edited.

## Requirements Summary

The merged guide specifications require two independently loadable collections: the legacy user guide and an SDK/extension guide. Build-time compilation must recursively gather configured Markdown roots, create TypeDoc API topics, and emit deterministic package-root JSON assets (`generated/guides.json` and `generated/guides-sdk.json`). Runtime may load only those packaged JSON assets; it must not parse docs, frontmatter, or TypeDoc.

The application contract is collection-qualified identity, normalized lookup, collection-aware paging/filtering, offset-backed outlines and sections, in-memory collection-namespaced search, and typed package-local errors. The main guide factory must remain isolated from the SDK catalog, which is exposed only by `@specd/guide/sdk`. The global conventions require ESM, strict layer separation, no `@specd/core` runtime dependency, and SpecD-compatible errors.

## Implementation Status

| Spec                        | Status                                                 | Evidence                                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guide:guide-model`         | Pass                                                   | Collection-qualified models, source paths, offsets, line/byte metrics, generated import metadata, and collection-aware search hits are implemented.                                                                                                                     |
| `guide:bundle-guides`       | Pass                                                   | `bundleAllCollections()` writes both JSON catalogs directly to package-root `generated/`; it recursively compiles configured roots and invokes the TypeDoc generator.                                                                                                   |
| `guide:composition`         | Pass                                                   | `createGuideEngine()` reads only the user JSON; `createGuideSdkEngine()` is isolated behind `./sdk` and uses the SDK JSON.                                                                                                                                              |
| `guide:conventions`         | Pass                                                   | ESM exports, `generated/` package inclusion, build-before-consume scripts, dev-only documentation tooling, no SpecD runtime package dependencies, and layer boundaries pass static checks.                                                                              |
| `guide:list-guides`         | Pass                                                   | Port operations, collection identity, scope-before-ordering, pagination, extents and withheld generated-topic counts are implemented.                                                                                                                                   |
| `guide:get-guide`           | Pass                                                   | Empty input is rejected before catalog access; normalized qualified resolution delegates through `GuideCatalogPort.getGuide`; candidate lists are collection-qualified.                                                                                                 |
| `guide:get-guide-outline`   | Pass                                                   | Outline retrieval delegates through the normalized lookup and reports correct collection/topic/statistics/sections and generated import metadata.                                                                                                                       |
| `guide:search-guides`       | Pass                                                   | MiniSearch stores namespaced section documents, expands identifier terms, scopes topic/collection filters, creates collection-appropriate read commands, and clamps snippets to section bounds.                                                                         |
| `guide:slice-guide-content` | Pass                                                   | Numeric and heading/slug resolution, ambiguity/not-found handling, offset extraction, CRLF-safe line slicing and formatted absolute line numbers are present.                                                                                                           |
| `guide:errors`              | **Partial — specification-level message contract gap** | The typed hierarchy and structured fields comply; however, `GuideTopicNotFoundError.message` does not direct callers to listing, metadata index, and search commands as the merged guide spec explicitly requires. The CLI delivery adapter adds those hints correctly. |

## Discrepancies

### `guide:errors`: domain error message lacks the mandated browse/retrieval guidance

The merged `guide:errors` requirement says the unknown-topic error message must include the requested topic, must not enumerate the catalog, **and must direct callers to the listing, metadata index, and search commands**. `GuideTopicNotFoundError` currently emits only the concise headline (and a title-match suggestion when applicable), for example `Guide topic 'core:prot' not found.`. It does not mention any discovery command.

The CLI adapter supplies the missing guidance through `browseHint()` and its structured error payload, so user-facing `specd guide-sdk` behaviour is correct. Nevertheless, the package-level error itself does not meet its own merged requirement and is directly unit-tested to omit all candidates without checking any discovery guidance. This is a localized implementation discrepancy in `guide:errors`, not a reason to restore catalog enumeration.

No TypeScript generated catalog or generated-catalog symbol remains in the guide package: search found no `guides.ts`, `GUIDES_CATALOG`, `GUIDES_INDEX`, or `src/infrastructure/generated` reference. The definitive JSON migration is therefore consistent with the requested direction.

## Test Coverage

Executed during this audit:

```text
pnpm --filter @specd/guide test
10 test files passed; 130 tests passed

pnpm --filter @specd/guide typecheck
TypeScript: No errors found

pnpm --filter @specd/guide lint
exit 0
```

Packaging was also checked in two layers:

1. `npm pack --dry-run --json` lists both `generated/guides.json` and `generated/guides-sdk.json`.
2. A real tarball was extracted outside the repository (without documentation roots). Its main and `./sdk` entry points initialized successfully and reported `{ "user": 22, "sdk": 1319 }` topics.

Existing tests cover the repaired package-root output directory, independent collection factories, nested paths, scope/pagination/order, qualified lookup and blank short-circuiting, source paths, identifier token expansion, section-clamped snippets, generated API symbols, and catalog isolation. This is materially stronger than the previous audit cycle: the three then-confirmed implementation faults are fixed and covered.

## Missing Tests

1. Add a package-domain assertion that `GuideTopicNotFoundError.message` itself contains all three bounded discovery routes (listing, metadata index, search), rather than validating those hints only at the CLI adapter.
2. Add an automated `npm pack`/extract regression test in the package suite. The audit manually proved it, but the existing “Published package catalog contract” test only inspects `package.json` and initializes in-repo source code.
3. Add a build freshness test that changes a controlled source fixture (or asserts output destination after an actual bundle) then loads the packed entry points; this protects the package-root JSON path against future regressions.

## Dependency Chain

```text
default:_global/conventions ──────────────┐
default:_global/error-handling-conventions ┼─ guide:conventions
                                          │    ├─ guide:guide-model
                                          │    ├─ guide:bundle-guides
                                          │    ├─ guide:list-guides ─┬─ guide:get-guide ─┬─ guide:get-guide-outline
                                          │    │                    │                    └─ guide:slice-guide-content
                                          │    │                    └─ guide:composition ─┬─ guide:search-guides
                                          │    │                                           └─ guide:errors
                                          │    └─ package artifacts (`dist/`, `generated/`)
                                          └─ CLI/MCP delivery adapters
```

The sole remaining discrepancy sits in the domain-error presentation contract. It does not compromise JSON loading, package isolation, catalog generation, query correctness, or the CLI's discovery UX; the CLI already compensates for it. It should nevertheless be fixed in the package or explicitly relaxed in the spec to achieve literal full compliance.

## Counts

- Specs audited: **10**
- Fully passing: **9**
- Partially compliant: **1** (`guide:errors` message guidance)
- Confirmed implementation discrepancies: **1**
- Previously reported implementation discrepancies now verified fixed: **3**
- Focused tests: **130 / 130 passing**
- Additional checks: **typecheck pass, lint pass, package dry-run pass, extracted-tarball runtime pass**

**Verdict:** the guide-domain implementation is functionally and packaging compliant with the JSON-only migration. Literal full compliance remains blocked by one small `GuideTopicNotFoundError.message` requirement; fix it or adjust that specific package-level requirement before signoff.
