# @specd/guide

Headless, zero-core-dependency documentation guide and search engine for [specd](https://github.com/specd-sdd/SpecD). For more information, visit [getspecd.dev](https://getspecd.dev).

`@specd/guide` bundles the complete SpecD user guide library plus an SDK and extension documentation collection, pre-computes section headings and line boundaries at build time, and provides in-memory BM25 full-text search (`minisearch`) with section outline extraction and line-window slicing.

Two catalogs ship from this package and are loaded through separate entry points:

| Entry point        | Catalog | Contents                                                                                                               |
| :----------------- | :------ | :--------------------------------------------------------------------------------------------------------------------- |
| `@specd/guide`     | `guide` | The 22 user-facing guide documents served by `specd guide`                                                             |
| `@specd/guide/sdk` | `sdk`   | SDK and extension references across `sdk`, `core`, `code-graph`, `skills`, `schemas`, plus generated public API topics |

The SDK catalog is only reachable through the `/sdk` subpath, so importing `@specd/guide` never loads it. `specd guide-sdk` in `@specd/cli` resolves it through a lazy dynamic import.

## Key features

- **Zero Core Runtime Dependency** — Fully decoupled from `@specd/core`. No AST parsers, delta engines, or schema validators loaded at runtime.
- **Pre-bundled Offline Catalog** — Guides are pre-parsed and bundled at build time into immutable JSON catalog assets with $O(1)$ lookups and no runtime parsing latency.
- **Granular Outlines & Section Extraction** — Retrieve structural document maps (`--meta`), extract targeted sections by heading or slug (`--section`), and slice bounded line windows (`--start-line`, `--lines`) with 1-indexed line numbers.
- **In-Memory BM25 Search** — Powered by `minisearch`, with field boosting (`title: 5`, `heading: 3`, `content: 1`), stop-words filtering, prefix matching, typo tolerance, and contextual line-numbered snippets with copy-pasteable read commands.
- **Hexagonal Architecture** — Clean separation between domain models/errors, application queries/ports, infrastructure adapters, and composition root.
- **Collection-Aware Identity** — Every topic is addressed as `collection:topic`. `:` is reserved as the collection delimiter while `/` stays valid inside a topic, so nested documents such as `core:examples/implementing-a-port` resolve normally.
- **Generated Public API Topics** — TypeDoc runs over the curated package entry points declared in the public site's config and emits one addressable topic per exported reflection, each pointing at its real TypeScript declaration. Generated topics live only in the SDK catalog.
- **Bounded Listings** — `specd guide-sdk` excludes generated topics by default and supports scoped, paginated listings, so a catalog holding thousands of API symbols stays navigable.

## Architecture

```
createGuideEngine(options?)                createGuideSdkEngine()
  └─ GuideEngine   ← public facade          └─ GuideEngine   ← public facade
       ├─ ListGuidesQuery                      ├─ ListGuidesQuery        (scope + pagination)
       ├─ GetGuideQuery                        ├─ GetGuideQuery          (collection-qualified)
       ├─ GetGuideOutlineQuery                 ├─ GetGuideOutlineQuery
       ├─ GetGuideSectionQuery                 ├─ GetGuideSectionQuery
       ├─ SearchGuidesQuery                    ├─ SearchGuidesQuery      (collection filter)
       ├─ sliceGuideLines                      └─ PrebundledGuideCatalogAdapter ← generated/guides-sdk.json
       ├─ formatWithLineNumbers
       ├─ PrebundledGuideCatalogAdapter ← generated/guides.json
       └─ MiniSearchGuideEngineAdapter
```

### Generated catalogs

`scripts/bundle-guides.ts` compiles the hand-written Markdown sources into
`generated/guides.json` (user) and `generated/guides-sdk.json` (SDK). The two files
are emitted independently, so adding the SDK catalog never changes the user catalog's
content. Every source document must carry strict frontmatter (`title`, `description`,
`sidebar_position`).

`scripts/sdk-api-generator.ts` additionally runs TypeDoc over the curated entry points in
`apps/public-web/src/lib/public-docs-config.ts`, using the public site's TypeDoc options
from `apps/public-web/typedoc.json`, and emits generated topics into `generated/guides-sdk.json`
only. TypeDoc and its Markdown plugin are `devDependencies`; nothing is resolved at
runtime.

Generated topics are named `<kind>/<Symbol>`, for example `sdk:classes/ArtifactDag`.
That kind directory is what distinguishes a generated topic from a hand-written nested
document such as `core:examples/implementing-a-port`.

## Available guide topics

| Topic                    | Title                                       |
| :----------------------- | :------------------------------------------ |
| `what-is-specd`          | What is SpecD?                              |
| `getting-started`        | Getting Started with SpecD                  |
| `index`                  | Guides Overview                             |
| `installation`           | Installation & Initialization               |
| `philosophy`             | The Philosophy of Spec-Driven Development   |
| `workflow`               | Change Lifecycle Guide                      |
| `specs`                  | Specifications in SpecD                     |
| `changes`                | Changes in SpecD                            |
| `configuration`          | Configuring Your SpecD Project              |
| `project-structure`      | Project Structure & Organization            |
| `skills`                 | Skills                                      |
| `workspaces`             | Workspaces & Multi-Package Organization     |
| `cli`                    | CLI Guide & Command Interface               |
| `schemas`                | Workflow Schemas                            |
| `selectors`              | Selectors, Extractors, and Validation Rules |
| `artifacts`              | Artifacts & Templates                       |
| `context-compilation`    | Context Compilation                         |
| `deltas`                 | Spec Deltas & Unified Specifications        |
| `code-graph`             | Code Graph & Codebase Intelligence          |
| `configuration-examples` | Configuration Examples                      |
| `standard-schema`        | Standard Schema Reference                   |
| `custom-schemas`         | Authoring Custom Schemas                    |

## SDK collection

| Collection   | Source                                | Examples                                                |
| :----------- | :------------------------------------ | :------------------------------------------------------ |
| `sdk`        | `docs/sdk/`                           | `sdk:index`, `sdk:classes/ArtifactDag`                  |
| `core`       | `docs/core/`                          | `core:ports`, `core:examples/implementing-a-port`       |
| `code-graph` | `docs/code-graph/`                    | `code-graph:index`, `code-graph:services`               |
| `skills`     | `docs/skills/`                        | `skills:skills-template-rendering`                      |
| `schemas`    | `docs/schemas/`                       | `schemas:schema-format`, `schemas:examples/full-schema` |
| generated    | TypeDoc reflections over entry points | `sdk:interfaces/Kernel`, `core:functions/createKernel`  |

```typescript
import { createGuideSdkEngine } from '@specd/guide/sdk'

const sdk = createGuideSdkEngine()

// Hand-written documents only, matching the `specd guide` catalog in size.
const documents = await sdk.listGuides({ scope: { generated: false } })

// One collection, a bounded page.
const corePage = await sdk.listGuides({
  scope: { collection: 'core' },
  pagination: { page: 1, pageSize: 20 },
})

// Generated public API symbols are addressable like any other topic.
const symbol = await sdk.getGuide('sdk:interfaces/Kernel')
console.log(symbol.sourcePath) // packages/core/src/composition/kernel.ts
```

## Quick start

```typescript
import { createGuideEngine } from '@specd/guide'

// 1. Initialize engine
const guide = createGuideEngine()

// 2. List available guides
const catalog = await guide.listGuides()
console.log(catalog.topics.map((g) => `${g.topic}: ${g.title}`))

// 3. Inspect document outline (low token usage)
const outline = await guide.getGuideOutline('workflow')
console.log(outline.sections)

// 4. Extract targeted section
const section = await guide.getGuideSection('workflow', 'Lifecycle States')
console.log(section.content)

// 5. Search across guides
const results = await guide.searchGuides('cascade configuration', { limit: 3 })
for (const hit of results) {
  console.log(`${hit.topic} > ${hit.section} (score: ${hit.score})`)
  console.log(hit.snippet)
  console.log(`Read command: ${hit.readCommand}`)
}
```

## Domain entity reference

- `GuideTopic`: Full guide entity including `collection`, `topic`, `sourcePath`, title, description, content, line count, byte length, and section outline. `sourcePath` is the collection-relative Markdown path for a hand-written document, and the real TypeScript declaration path for a generated topic.
- `GuideCollection`: A named group of topics served by one catalog. `:` is reserved inside a collection identifier.
- `GuideSection`: Section descriptor with heading, level (1-6), 1-indexed `startLine`, `endLine`, `lines`, and content.
- `GuideSummary`: Lightweight projection for catalog listings (`collection`, `topic`, `title`, `description`, `order`, `lineCount`, `byteLength`).
- `GuideOutline`: Structural map containing the collection, the real source file path, total lines, byte size, and an array of all `GuideSection` items.
- `GuidePagination`: `{ page, pageSize }` window applied after scope filtering and ordering.
- `GuideSearchHit`: Ranked search hit with `collection`, `topic`, `file`, section, coordinates, BM25 score, formatted snippet, and a `readCommand` pointing at the command that serves its collection (`specd guide` for `guide`, `specd guide-sdk` otherwise).

## Identity helpers

`normalizeTopicRef`, `qualifyTopic`, and `isGeneratedTopic` are exported from
`@specd/guide` so that adapters and callers share one normalization rule: trim, strip a
trailing `.md`, lowercase, then split on the first `:`.
