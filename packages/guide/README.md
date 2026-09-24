# @specd/guide

Headless, zero-core-dependency documentation guide and search engine for [specd](https://github.com/specd-sdd/SpecD). For more information, visit [getspecd.dev](https://getspecd.dev).

`@specd/guide` bundles the complete SpecD user guide library, pre-computes section headings and line boundaries at build time, and provides in-memory BM25 full-text search (`minisearch`) with section outline extraction and line-window slicing.

## Key features

- **Zero Core Runtime Dependency** — Fully decoupled from `@specd/core`. No AST parsers, delta engines, or schema validators loaded at runtime.
- **Pre-bundled Offline Catalog** — Guides are pre-parsed and bundled at build time into an immutable static TypeScript catalog with $O(1)$ lookups and 0 ms parsing latency.
- **Granular Outlines & Section Extraction** — Retrieve structural document maps (`--meta`), extract targeted sections by heading or slug (`--section`), and slice bounded line windows (`--start-line`, `--lines`) with 1-indexed line numbers.
- **In-Memory BM25 Search** — Powered by `minisearch`, with field boosting (`title: 5`, `heading: 3`, `content: 1`), stop-words filtering, prefix matching, typo tolerance, and contextual line-numbered snippets with copy-pasteable read commands.
- **Hexagonal Architecture** — Clean separation between domain models/errors, application queries/ports, infrastructure adapters, and composition root.

## Architecture

```
createGuideEngine(options?)
  └─ GuideEngine                    ← Public Facade
       ├─ ListGuidesQuery            ← lists catalog summaries sorted by sidebar_position
       ├─ GetGuideQuery              ← retrieves full GuideTopic entity
       ├─ GetGuideOutlineQuery       ← extracts GuideOutline with 1-indexed section line spans
       ├─ GetGuideSectionQuery       ← extracts targeted section body by heading or slug
       ├─ SearchGuidesQuery          ← BM25 ranked search across guide sections
       ├─ sliceGuideLines            ← line window slicing utility
       ├─ formatWithLineNumbers      ← 1-indexed padded line number formatter
       ├─ GuideCatalogPort (port)    ← implemented by PrebundledGuideCatalogAdapter
       └─ GuideSearchPort (port)     ← implemented by MiniSearchGuideEngineAdapter
```

## Available guide topics

| Topic             | Title                 | Description                                                                         |
| :---------------- | :-------------------- | :---------------------------------------------------------------------------------- |
| `getting-started` | Getting Started       | Core mental model, workflow introduction, and project structure                     |
| `configuration`   | Configuration Guide   | Comprehensive reference for `specd.yaml`, cascade layering, and settings            |
| `workflow`        | Workflow & Lifecycle  | The 12 lifecycle states, transitions, human approval gates, and skills              |
| `schemas`         | Schemas Concept       | Role of schemas in artifact DAGs, lifecycle governance, and constraints             |
| `standard-schema` | Standard Schema       | `@specd/schema-std` specification: proposal, specs, verify, design, tasks           |
| `custom-schemas`  | Custom Schemas        | Forking, extending, schema overrides, and authoring `schemaPlugins`                 |
| `templates`       | Artifact Templates    | Standard Markdown artifact templates and structural rules                           |
| `deltas`          | Delta Authoring       | Comprehensive guide on `.delta.yaml` operations, selectors, and conflict resolution |
| `code-graph`      | Code Graph Guide      | Graph-first intelligence protocol, indexing, impact analysis, and hotspots          |
| `workspaces`      | Workspaces Guide      | Multi-package repositories, external workspaces, and ownership semantics            |
| `selectors`       | AST Selectors Guide   | Targeting spec sections, paragraphs, lists, and code blocks in deltas               |
| `cli`             | CLI Command Reference | Practical command usage recipes, options, and scenario workflows                    |

## Quick start

```typescript
import { createGuideEngine } from '@specd/guide'

// 1. Initialize engine
const guide = createGuideEngine()

// 2. List available guides
const catalog = await guide.listGuides()
console.log(catalog.map((g) => `${g.topic}: ${g.title}`))

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

- `GuideTopic`: Full guide entity including title, description, content, line count, byte length, and section outline.
- `GuideSection`: Section descriptor with heading, level (1-6), 1-indexed `startLine`, `endLine`, `lines`, and content.
- `GuideSummary`: Lightweight projection for catalog listings (`topic`, `title`, `description`, `order`, `lineCount`, `byteLength`).
- `GuideOutline`: Structural map containing total lines, byte size, and an array of all `GuideSection` items.
- `GuideSearchHit`: Ranked search hit with topic, section, coordinates, BM25 score, formatted snippet, and `readCommand`.
