# Guide-domain compliance audit — partial report

**Change:** `sdk-development-guide`  
**Scope:** `guide:guide-model`, `guide:bundle-guides`, `guide:composition`, `guide:conventions`, `guide:list-guides`, `guide:get-guide`, `guide:get-guide-outline`, `guide:search-guides`, `guide:slice-guide-content`, and `guide:errors`, plus direct dependencies.  
**Method:** merged artifacts from `changes spec-preview`; graph-current discovery; source and test inspection; focused `@specd/guide` test run. No source or spec files were modified.

## Requirements Summary

The merged guide specs require a two-catalog design: the established user catalog and an SDK catalog, represented by separately publishable JSON assets. The SDK catalog combines recursive hand-written documentation collections with TypeDoc-generated API topics and is served only by `@specd/guide/sdk`. The main entry must remain isolated from SDK loading.

The required domain/application contract is collection-qualified identity (`collection:topic`), normalized lookup, scoped and paginated listings, metadata/outline/section extraction from precomputed offsets, collection-aware search/read commands, and typed errors without `@specd/core` at runtime. Runtime is permitted to read packaged JSON assets, but must not read documentation roots or parse Markdown/TypeDoc.

## Implementation Status

| Spec                        | Status             | Evidence                                                                                                                                                                                                                             |
| --------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `guide:guide-model`         | Mostly implemented | Collection/topic identity, summary fields, offsets and generated-topic metadata are present in models/catalogs.                                                                                                                      |
| `guide:bundle-guides`       | **Failed**         | Bundler creates both JSON catalogs and TypeDoc topics, but writes only `src/infrastructure/generated/*.json`; published runtime reads root `generated/*.json`.                                                                       |
| `guide:composition`         | Implemented        | `createGuideEngine()` uses user JSON; `createGuideSdkEngine()` is isolated in `./sdk`, each with its own adapter and search engine.                                                                                                  |
| `guide:conventions`         | **Failed**         | No core runtime dependency and `files: [dist/, generated/]` are correct, but a fresh bundle does not refresh the published `generated/` assets it declares.                                                                          |
| `guide:list-guides`         | Mostly implemented | Port methods, collection-aware summaries, filtering, pagination and collection extents exist.                                                                                                                                        |
| `guide:get-guide`           | **Failed**         | Resolution semantics mostly work, but the query scans `getAllTopics()` instead of delegating the qualified key to `GuideCatalogPort.getGuide()`, and it does not reject blank input before catalog lookup.                           |
| `guide:get-guide-outline`   | Implemented        | Outline delegates through `GetGuideQuery` and returns collection/topic, source path, metrics, offsets and generated import metadata.                                                                                                 |
| `guide:search-guides`       | **Failed**         | MiniSearch is namespaced, collection-aware and identifier-tokenized, but snippets can cross a section boundary.                                                                                                                      |
| `guide:slice-guide-content` | Implemented        | Numeric/heading/slug selection, ambiguity and not-found errors, offset slicing, CRLF-aware line slicing and line formatting are present.                                                                                             |
| `guide:errors`              | Artifact conflict  | Error objects carry structured candidates, but `GuideTopicNotFoundError.message` intentionally omits the catalog, contrary to this merged spec and consistent with the SDK CLI requirement to avoid enumerating thousands of topics. |

## Discrepancies

### 1. Published JSON can become stale after a normal build — failed

`scripts/bundle-guides.ts` writes only:

- `packages/guide/src/infrastructure/generated/guides.json`
- `packages/guide/src/infrastructure/generated/guides-sdk.json`

The runtime adapter loads `../generated/guides.json` / `../generated/guides-sdk.json` relative to `dist`, which resolves to package-root `generated/`. `package.json` also publishes package-root `generated/`. There is no copy/synchronization step in the bundler or package scripts.

The checked-in source and root assets happen to have matching hashes in this worktree, but their modification times differ (source assets were refreshed later). Therefore a future docs/API change can build `dist` from new source JSON while `npm pack` ships old root JSON. This violates `guide:bundle-guides` independent-loadability/packed-artifact scenarios and `guide:conventions`' requirement that each runtime JSON asset included in the package be the asset the entry point loads.

### 2. Search snippets can bleed into neighbouring sections — failed

`MiniSearchGuideEngineAdapter.generateSnippet()` correctly constrains matching to `[sectionStartLine, sectionEndLine]`, but derives the displayed window with `Math.max(0, matchIdx - contextLines)` and `Math.min(lines.length - 1, matchIdx + contextLines)`. Those bounds are document-wide, not section-wide. A match near a section's first or last line will include the preceding/following section. This directly violates the merged `guide:search-guides` rule: “A snippet MUST NOT bleed across section boundaries.”

### 3. `GetGuideQuery` bypasses the catalog lookup contract and late-validates blank input — failed

The merged `guide:get-guide` spec requires collection-qualified lookup through the catalog port, preserving the composite key, and requires blank/whitespace-only input to be rejected before catalog lookup. `GetGuideQuery.execute()` calls `catalog.getAllTopics()` and performs local filtering rather than `catalog.getGuide(...)`; blank input therefore reaches a full-catalog read before `GuideTopicNotFoundError` is raised. It meets case/extension normalization, but not these port/ordering requirements.

### 4. `guide:errors` conflicts with the bounded SDK error contract — artifact discrepancy

The merged `guide:errors` requirement says `GuideTopicNotFoundError.message` “MUST include … the available topics.” The implementation deliberately excludes them from the message and keeps them structured in `availableTopics`; its integration test asserts the message remains shorter than 80 characters. That design matches the SDK CLI requirement that an unknown generated topic not enumerate the thousand-plus-topic catalog. The artifacts need reconciliation; restoring enumeration would contradict the higher-volume SDK behaviour.

## Test Coverage

Focused execution completed successfully:

```text
pnpm --filter @specd/guide test
10 test files passed; 125 tests passed
```

Existing coverage substantively exercises SDK collection registration, scoped listing, generated-topic access, normalization, pagination, catalog isolation, package factories, TypeDoc-generated data, search commands, and core query/error paths. The integration suite also verifies that both engines initialize from the current checked-in catalogs.

## Missing Tests

1. **Fresh-build → packed-artifact propagation:** mutate/rebuild a fixture catalog (or compare output assets after `bundle:guides`), pack the package, extract it, and prove the extracted engines consume the newly emitted JSON rather than a pre-existing root copy.
2. **Search boundary windows:** a query matching the first and last line of a section with `snippetLines > 0`; assert no line from an adjacent section occurs in the snippet.
3. **Port delegation:** a spy/fake `GuideCatalogPort` proving `GetGuideQuery` calls `getGuide` with the normalized `collection:topic` key and does not require `getAllTopics` for successful lookup.
4. **Blank topic short-circuit:** a fake port that fails if called, proving whitespace-only input raises `UNKNOWN_GUIDE_TOPIC` before catalog access.
5. **Error-message policy:** one test/spec decision explicitly states that candidates are structured-only for large catalogs, while smaller collection messaging (if desired) has a bounded representation. Current tests encode the implementation but the merged `guide:errors` text says the opposite.

## Spec Dependency Chain

```text
default:_global/conventions / error-handling-conventions
  └─ guide:conventions
      ├─ guide:guide-model
      ├─ guide:bundle-guides
      ├─ guide:list-guides ─┬─ guide:get-guide ─┬─ guide:get-guide-outline
      │                    │                    └─ guide:slice-guide-content
      │                    └─ guide:composition ─┬─ guide:search-guides
      │                                           └─ guide:errors
      └─ @specd/guide runtime and package artifact
```

The packaging discrepancy originates in `guide:bundle-guides` but makes `guide:conventions` and both composed engines non-conforming. The lookup and snippet defects propagate through `guide:composition` into every CLI/MCP host using the engines.

## Summary Counts

- Specs audited: **10**
- Implemented/mostly implemented: **6**
- Confirmed implementation discrepancies: **3**
- Artifact/spec-policy conflicts requiring design resolution: **1**
- Focused tests: **125 passed / 125 run**
- Critical missing regression areas: **5**

**Verdict:** this guide-domain slice is not ready to pass verification. The JSON approach itself is correct and preserved, but the fresh-build-to-published-asset path and section-bounded snippets need implementation fixes; the unknown-topic message requirement needs a spec decision before final compliance signoff.
