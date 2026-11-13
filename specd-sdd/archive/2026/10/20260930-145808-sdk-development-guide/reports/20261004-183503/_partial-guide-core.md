# Compliance audit — guide core batch

## Scope and method

Audited the merged change specifications `guide:guide-model`, `guide:bundle-guides`, `guide:composition`, `guide:conventions`, and `guide:errors`, plus direct dependencies `default:_global/conventions` and `default:_global/error-handling-conventions`. Graph freshness was confirmed (`stale: false`); graph navigation located `createGuideSdkEngine` (`guide:src/composition/guide-sdk-engine.ts:18`) and `bundleAllCollections` (`guide:scripts/bundle-guides.ts:62`) and their dependent tests. Code and tests were then inspected directly.

## Requirements summary and implementation status

| Spec                  | Requirements reviewed | Status                                          | Evidence                                                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------: | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `guide:guide-model`   |                     5 | Conforms                                        | Immutable, dependency-free interfaces in `src/domain/models/`; collection-qualified identity helpers in `src/domain/topic-identity.ts`; catalog construction in `scripts/guide-bundler.ts`.                                                                                                                              |
| `guide:bundle-guides` |                     4 | Conforms                                        | `scripts/bundle-guides.ts` configures the six roots, emits `generated/guides.json` and `generated/guides-sdk.json`; `guide-bundler.ts` validates frontmatter, recursively collects Markdown, and calculates offsets; `sdk-api-generator.ts:1209` imports TypeDoc and calls `Application.bootstrapWithPlugins`/`convert`. |
| `guide:composition`   |                     3 | One violation                                   | Factories and curated public barrel conform, but the broader internal barrel exports the SDK factory contrary to an explicit prohibition.                                                                                                                                                                                |
| `guide:conventions`   |                     4 | One inherited violation                         | Architecture, zero-core runtime dependency, errors, package metadata, and README are materially present. The same internal-barrel SDK export violates this spec too.                                                                                                                                                     |
| `guide:errors`        |                     4 | One ordering discrepancy / spec decision needed | Error hierarchy and fields conform; the unknown-topic path performs an all-topics catalog read after a miss, which conflicts with the merged spec's literal no-catalog-lookup-before-error wording.                                                                                                                      |

## Discrepancies

### GCORE-001 — SDK factory leaks through `./internal` (high)

**Spec evidence.** Both merged `guide:composition` and `guide:conventions` require that `src/index.ts`/`./internal` **MUST NOT** expose the SDK catalog factory; `createGuideSdkEngine` must be available only through the dedicated `./sdk` subpath. The intent is to prevent consumers of either root barrel from loading/parsing the SDK catalog.

**Code evidence.** `packages/guide/src/index.ts:7` explicitly contains:

```ts
export { createGuideSdkEngine } from './composition/guide-sdk-engine.js'
```

The graph confirms the factory declaration at `packages/guide/src/composition/guide-sdk-engine.ts:18`; `packages/guide/src/sdk.ts:1` is the compliant dedicated-subpath export. Thus the SDK factory has two public routes, not one.

**Assessment.** This is an implementation bug, not merely an ambiguous spec: the two merged specs agree and the source contradicts both. Remove the internal-barrel export (while retaining `src/sdk.ts`) and add an export-surface test.

### GCORE-002 — Unknown-topic error does catalog work after collection resolution (medium; spec/code decision)

**Spec evidence.** Merged `guide:errors` says `GuideTopicNotFoundError` “MUST be raised before any filesystem access or catalog lookup beyond the collection resolution step.” The same requirement also requires a collection-scoped, collection-qualified `availableTopics` list.

**Code evidence.** After failed qualified lookup(s), `packages/guide/src/application/queries/get-guide-query.ts:70-89` calls `this.catalog.getAllTopics()`, filters that list to the requested collection, computes title matches and ranked available topics, then throws `GuideTopicNotFoundError`. This is an explicit catalog lookup beyond collection resolution. It is exercised by `packages/guide/test/unit/application/queries.spec.ts` and `packages/guide/test/integration/sdk-catalog.spec.ts:253-267`.

**Assessment.** The implementation is necessary to construct the required `availableTopics`; absent an API that obtains the collection's topic set during “collection resolution,” the two clauses are internally tense. Treat as a spec decision: either permit a bounded in-memory catalog read to populate the structured candidates (code behavior), or change the port/collection-resolution contract so those candidates are returned there. Do not silently claim compliance with the current literal wording.

## Requirement evidence and dependency consistency

- **Model and identity:** `GuideTopic`, `GuideSummary`, `GuideOutline`, `GuideSearchHit`, and `GuideSection` carry collection/source-path/offset fields required by the merged model. `compileGuide` strips frontmatter, computes UTF-8 bytes and logical lines, while `extractSections` recognizes levels 1–6, ignores fenced-code headings, and provides inclusive spans. `qualifyTopic` rejects `:` in components; nested `/` segments survive normalization.
- **Bundle:** `COLLECTIONS` maps `guide`, `sdk`, `core`, `code-graph`, `skills`, and `schemas` roots; `bundleAllCollections` keeps user and SDK JSON outputs separate. JSON is package-root generated data, `package.json` publishes `generated/`, and `PrebundledGuideCatalogAdapter` loads package JSON rather than docs roots. TypeDoc options are loaded from `apps/public-web/typedoc.json`, which declares `skipErrorChecking`, `excludePrivate`, and `excludeInternal`.
- **Composition:** `createGuideEngine` uses `guides.json`; `createGuideSdkEngine` uses `guides-sdk.json`; both assemble the same queries and search adapter. `src/public.ts` is appropriately curated and does not export the SDK factory. Only `src/index.ts` creates the leak in GCORE-001.
- **Errors/global dependency:** `SpecdGuideError` extends native `Error`, uses `specd: true` and upper-snake getter codes without importing core. Topic, section-not-found, and ambiguous-section errors preserve raw requested text and expose structured candidates. Ambiguity candidates are formatted with index/heading/line spans and the message includes each concrete `--section N` choice, satisfying the global actionable-error convention.

## Test coverage

Strong coverage exists for frontmatter failures, heading ranges and offsets (`test/unit/infrastructure/bundle.test.ts`), models/errors (`test/unit/domain/*.test.ts`), query behavior and ambiguity (`test/unit/application/queries.spec.ts`), packaged JSON loading and SDK catalogs (`test/integration/sdk-catalog.spec.ts`), and main-engine behavior (`test/integration/guide-engine.test.ts`). The verification entry hook also reported the full suite passing before this audit.

### Missing or incomplete tests

1. **GCORE-001 regression test (missing):** no test imports the `./internal` built/package export and asserts that `createGuideSdkEngine` is absent while `@specd/guide/sdk` exports it. Existing tests import the composition module directly, which cannot enforce barrel isolation.
2. **CRLF catalog compilation (partial):** slicing has CRLF coverage (`test/unit/application/slicing.test.ts`), but no focused `compileGuide`/`extractSections` test proves that CRLF input produces the same line count and exact offsets as LF input.
3. **Reserved delimiter normalization/rejection (partial):** the identity helpers are implemented, but no focused test covers malformed multi-colon collection/topic inputs and confirms the required rejection/normalization boundary.
4. **README parity automation (missing):** README content describes catalog intent, but no test compares every documented user topic against `generated/guides.json` in both directions as required by `guide:conventions`.
5. **GCORE-002 semantics (missing):** no test asserts the intended port-call ordering for an unknown qualified topic. The current tests deliberately assert populated suggestions, not the merged no-extra-lookup condition.

## Dependency chain

`default:_global/conventions` → `guide:conventions` → (`guide:guide-model`, `guide:bundle-guides`, `guide:composition`, `guide:errors`); additionally `default:_global/error-handling-conventions` → `guide:errors` and `guide:conventions` → `guide:errors`. GCORE-001 propagates from the composition barrel into the package-conventions requirement. GCORE-002 is constrained by the global requirement for structured, actionable expected-failure errors.

## Counts

- Specs audited: 5 change specs + 2 direct/global dependencies
- Requirement groups reviewed: 20
- Conforming: 18
- Definite implementation discrepancies: 1 (GCORE-001)
- Spec/code decision discrepancies: 1 (GCORE-002)
- Missing test areas: 5 (2 missing, 3 partial)
