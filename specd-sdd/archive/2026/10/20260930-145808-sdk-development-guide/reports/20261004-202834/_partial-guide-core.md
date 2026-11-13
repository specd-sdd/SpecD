# Compliance audit — guide core

## Scope and method

Fresh read-only review of merged `guide:guide-model`, `guide:bundle-guides`, `guide:composition`, `guide:conventions`, and `guide:errors`, with direct constraints `default:_global/conventions` and `default:_global/error-handling-conventions`. The graph is current (`stale: false`, `contentFresh: true`). Graph evidence located `createGuideSdkEngine` at `packages/guide/src/composition/guide-sdk-engine.ts:18` (published only through `src/sdk.ts`) and identified `GetGuideQuery` as a critical, broadly depended-on path (10 affected files, including CLI and both engines).

## Requirements coverage

| Spec                  | Requirement groups | Result                             | Evidence                                                                                                                                                                                                                                                                                        |
| --------------------- | -----------------: | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guide:guide-model`   |                  5 | Conforms                           | Pure readonly interfaces under `src/domain/models`; identity helpers reserve `:` and preserve nested `/`; `scripts/guide-bundler.ts` carries source paths, offsets, UTF-8 byte lengths, and 1-indexed line spans.                                                                               |
| `guide:bundle-guides` |                  4 | Conforms                           | `bundle-guides.ts` configures guide/sdk/core/code-graph/skills/schemas roots and writes only package-root JSON catalogs; `guide-bundler.ts` validates frontmatter and parses headings; `sdk-api-generator.ts:1209+` imports TypeDoc and uses `Application.bootstrapWithPlugins` plus `convert`. |
| `guide:composition`   |                  3 | Conforms                           | User and SDK factories use distinct JSON assets with the same facade/query wiring; `src/public.ts` is curated; refreshed `src/index.ts` no longer exports `createGuideSdkEngine`; `src/sdk.ts` is the dedicated subpath entry.                                                                  |
| `guide:conventions`   |                  4 | Conforms                           | Hexagonal layers, package exports/scripts, package-root generated assets, core-free runtime dependencies, domain error hierarchy, and README are present.                                                                                                                                       |
| `guide:errors`        |                  4 | One spec/code decision discrepancy | Error classes and structured fields conform, but the literal required error-path ordering conflicts with the implementation needed to construct `availableTopics`.                                                                                                                              |

## Detailed evidence

### Model, bundling, and runtime boundaries

- `GuideTopic`, `GuideSection`, `GuideSummary`, `GuideOutline`, and `GuideSearchHit` all expose the collection-qualified fields required by the merged model. `GuideOutline.file`/`GuideSearchHit.file` use real `sourcePath`, rather than synthesizing a Markdown filename.
- `compileGuide` removes frontmatter, sets `lineCount` from logical lines, and uses `Buffer.byteLength(..., 'utf-8')`. `extractSections` recognizes heading levels 1–6, excludes fenced-code headings, calculates inclusive spans, and provides offsets used by `GetGuideSectionQuery` and MiniSearch to avoid re-parsing.
- `COLLECTIONS` maps six documentation roots. `bundleAllCollections` emits `packages/guide/generated/guides.json` and `guides-sdk.json` independently; `package.json` publishes `generated/`, runs the catalog builder before tsup, and places TypeDoc tooling in `devDependencies`.
- `PrebundledGuideCatalogAdapter` loads only packaged JSON in source or compiled layouts; it does not traverse docs roots at runtime. The extracted-tarball integration test validates both entry points without repository docs.
- The previously observed internal-barrel leak is fixed: `packages/guide/src/index.ts` exports only domain/application/infrastructure and user-engine internals, while graph public bindings now show `createGuideSdkEngine` only at its implementation surface and `guide:src/sdk.ts`.

### Error handling

- `SpecdGuideError` extends native `Error`, returns `specd: true`, has an abstract code contract, and imports no core type. Concrete errors return `UNKNOWN_GUIDE_TOPIC`, `UNKNOWN_GUIDE_SECTION`, and `AMBIGUOUS_GUIDE_SECTION`.
- `GuideTopicNotFoundError` preserves the raw caller input, keeps structured candidates collection-qualified, and avoids enumerating the catalog in its message. `GuideSectionAmbiguousError` preserves index ordering, emits `[N] heading (lines start-end)`, and enumerates every concrete `--section N` selection in the message.

## Finding

### GCORE-001 — Unknown-topic path exceeds the merged error lookup boundary

- **Severity:** Medium
- **Type:** Spec/code semantic conflict; requires a product/spec decision, not an unqualified code bug.
- **Spec evidence:** `guide:errors` requires `GuideTopicNotFoundError` to be raised “before any filesystem access or catalog lookup beyond the collection resolution step,” while also requiring collection-scoped, collection-qualified `availableTopics`.
- **Code evidence:** `packages/guide/src/application/queries/get-guide-query.ts:54-89` calls `getCollections()`, attempts `getGuide()`, then on a miss calls `getAllTopics()` to filter the searched collection, compute title matches, rank candidates, and construct `availableTopics`. That is a catalog lookup beyond collection resolution.
- **Impact:** The behavior is covered and useful—tests assert collection-qualified suggestions and title matches—but it does not satisfy the literal timing clause. The two requirements are difficult to satisfy together with the present port API: candidates cannot be constructed without reading collection membership.
- **Resolution choices:** (a) revise the spec to allow a bounded in-memory catalog read for structured candidates, preserving current behavior; or (b) redesign collection resolution/the port contract to return candidate identities as part of that resolution step, then add a call-order test.

## Tests and coverage

Existing tests provide strong evidence for frontmatter failures, section bounds/offsets, compile output, catalog isolation, packaged tarball loading, SDK topic identity, user-vs-SDK engine isolation, errors, query behavior, search command derivation, and CRLF line slicing. `GetGuideQuery` is exercised in unit and integration tests; graph impact confirms it feeds outline/section queries, both composition factories, CLI guide handling, and SDK command tests.

Coverage gaps (not current code failures):

1. No explicit built-export test asserts `@specd/guide/internal` lacks `createGuideSdkEngine` while `@specd/guide/sdk` provides it. The source/graph state is now correct, but a regression test should protect the subpath isolation contract.
2. No focused `compileGuide`/`extractSections` CRLF-equivalence test verifies both exact offsets and line counts against an LF fixture; current CRLF coverage is for line slicing.
3. No focused malformed multi-colon identifier test demonstrates the required reserved-delimiter rejection boundary.
4. No automated two-way README-vs-`generated/guides.json` topic parity test was found, despite the conventions requirement.
5. No test documents the intended resolution of GCORE-001's lookup-order rule.

## Dependency chain

`default:_global/conventions` → `guide:conventions` → `guide:guide-model`, `guide:bundle-guides`, `guide:composition`, and `guide:errors`; `default:_global/error-handling-conventions` → `guide:errors`. `GetGuideQuery` is the operational bridge from error semantics to guide/SDK composition and CLI consumers.

## Summary

- Change specs audited: 5; direct/global constraints checked: 2
- Requirement groups reviewed: 20
- Conforming: 19
- Definite implementation violations: 0
- Spec/code decision discrepancies: 1 (GCORE-001)
- Test coverage gaps: 5
