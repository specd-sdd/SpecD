# Design: Complete Guide and Configuration Documentation

## Overview

This change brings the user documentation under `docs/guide/` and the JSDoc comments in `@specd/core` into complete parity with the real `@specd/core`, `@specd/code-graph`, and `@specd/cli` engine implementations. An exhaustive audit against the codebase revealed omissions and inaccuracies in configuration pattern variables, template expander behavior, workspace options, reserved workspace names, context compilation wildcards, schema template variable support, the `specd project update` lifecycle command, and a critical deficit in the user-facing documentation of the **Code Graph** platform pillar.

Per documentation conventions, documentation focuses strictly on supported, current capabilities and options that work today; unsupported variables and legacy/deprecated formats are omitted entirely.

The deliverables are:

1. Update user guides in `docs/guide/` (`configuration.md`, `configuration-examples.md`, `workspaces.md`, `context-compilation.md`, `schemas.md`, `workflow.md`, `cli.md`, `installation.md`, `code-graph.md`, `index.md`, `philosophy.md`, `skills.md`).
2. Correct JSDoc comments in `packages/core/src/application/specd-config.ts` for `ArchiveStorageConfig.archivePattern` to list all 6 supported variables and remove negative mentions of unsupported variables.
3. Document `specd project update` across `configuration.md`, `installation.md`, and `cli.md`, clearly explaining when it is required vs. dynamic config reads.
4. Transform `docs/guide/code-graph.md` into an exhaustive user guide documenting document indexing and search (`--documents`), full-text source search (`--files`), spec content search (`--specs`), spec-level blast radius (`--spec`), public export route impact (`--export`), multi-file aggregated blast radius, traversal directions and depth, hotspot detection, and coverage diagnostics.
5. Elevate Code Graph prominence across `index.md`, `philosophy.md`, `skills.md`, and `cli.md` to reflect its status as a core pillar of SpecD.
6. Re-bundle the built-in guides in `@specd/guide` (`pnpm --filter @specd/guide bundle:guides`).
7. Validate that all documentation and guides conform to frontmatter, link integrity, and CLI schema rules.
8. Add an opening page, `docs/guide/what-is-specd.md`, that explains what SpecD is and what a reader can do with it, with the Code Graph as a core part of that explanation. Make that page the first guide and the public docs entry.

## Architecture & Patterns

SpecD documents are authored in Markdown under `docs/guide/` with Docusaurus-compatible YAML frontmatter. These files serve a dual purpose:

1. Web & repository documentation (rendered via Docusaurus in `apps/public-web`).
2. Built-in interactive terminal guides compiled by `@specd/guide` into serialized JSON / Toon bundles used by `specd guide`.

The documentation reflects the Hexagonal Architecture of `@specd/core`, `@specd/code-graph`, and the orchestration in `@specd/cli`:

- Domain entities & value objects (`SymbolNode`, `LogicalSymbol`, `PrefixZodSchema`).
- Application use-cases and codebase intelligence (`SearchCodeGraph`, `AnalyzeImpact`, `RankHotspots`, `ConfigLoader`, `CompositionResolver`, `TemplateExpander`).
- Infrastructure repositories (`ArchiveRepository`, `SpecRepository`, `ChangeRepository`, `IsolatedIndexWorker`).
- CLI commands and plugin orchestration (`registerProjectUpdate`, `updatePluginsWithKernel`, `UpdatePlugin`).

No architectural modifications or breaking API changes are introduced in this documentation alignment.

## Affected areas

### 1. `packages/core/src/application/specd-config.ts`

- **Construct**: `ArchiveStorageConfig.archivePattern` JSDoc comment.
- **Modification**: List all 6 supported variables (`{{year}}`, `{{month}}`, `{{day}}`, `{{date}}`, `{{change.name}}`, `{{change.archivedName}}`). Remove the negative mention of unsupported variables.

### 2. `docs/guide/configuration.md`

- **Sections updated**:
  - `storage.archive.pattern`: Document all 6 supported variables.
  - `workspaces.<name>`: Document `specs.fs.metadataPath`, `graph` block, reserved workspace name `'root'`.
  - Standard adapter format: Exclusively document the current structured format.
  - Context entry IDs: Document optional `id` on context entries.
  - Agent plugins and `project update`: Document `specd project update` and dynamic reload distinctions.

### 3. `docs/guide/code-graph.md` (Major Overhaul)

- **Sections overhauled**:
  - **Foundational Architecture**: Codebase intelligence, AST parsing, symbol resolution through barrel files and re-exports, multi-workspace indexing, and markdown document indexing.
  - **Graph Indexing & Lifecycle**: `specd graph index` (incremental vs. `--force`, worker isolation, metrics, auto-indexing).
  - **Multi-Modal Search (`specd graph search`)**:
    - Symbols: Definitions, signatures, `--kind` filtering (`class`, `interface`, `type`, `function`, `method`, etc.).
    - Source files: Full-text search with code snippet previews (`--files`, `--snippet`).
    - Specs: Finding normative requirements, titles, descriptions, and full content (`--specs`, `--spec-content`).
    - Documents: Discovering markdown documentation, guides, and ADRs across workspaces (`--documents`).
    - Scoping: Monorepo filtering via `--workspace`, `--exclude-workspace`, `--file`, and `--exclude-path`.
  - **Blast Radius & Impact Analysis (`specd graph impact`)**:
    - Target types: Symbols (`--symbol`), files (`--file`), specs (`--spec <id>`), and public export surfaces (`--export <name> --from <surface>`).
    - Aggregated multi-file impact analysis (`--file a.ts --file b.ts`).
    - Traversal directions: `dependents` (downstream), `dependencies` (upstream), and `both`.
    - Depth control: `--depth <n>`.
    - Risk scoring model: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` risk classification.
    - Affected entities breakdown: files, symbols, specs, processes.
  - **Hotspot Analysis & Debt Reduction (`specd graph hotspots`)**:
    - Ranking symbols by architectural coupling, direct callers, cross-workspace callers, and risk thresholds.
    - Options: `--min-risk`, `--min-score`, `--include-importer-only`, `--kind`.
  - **Graph Health & Coverage Diagnostics**:
    - `specd graph stats`: Node counts, language support, staleness indicators.
    - `coverageDiagnostics`: Detecting broken implementation links (`SYMBOL_NOT_FOUND`, `FILE_NOT_INDEXED`, `SYMBOL_AMBIGUOUS`).
  - **Playbooks & Practical Workflows**:
    - Playbook 1: Safe refactoring with symbol and export blast-radius analysis.
    - Playbook 2: Spec requirement tracing to implementation code.
    - Playbook 3: Cross-workspace dependency auditing.

### 4. Code Graph Prominence Across Other Guides

- **`docs/guide/index.md`**: Elevate Code Graph to a primary pillar in the guide navigation map.
- **`docs/guide/philosophy.md`**: Document the intelligence layer's role in providing deterministic context to agents and ending context-wasteful blind lexical grepping.
- **`docs/guide/skills.md`**: Detail how the Graph-First Protocol is enforced during `/specd-design` and `/specd-implement`.
- **`docs/guide/cli.md`**: Update `specd graph` section to detail all commands, options (`--documents`, `--files`, `--specs`, `--spec`, `--export`, etc.), and practical examples.

### 5. `docs/guide/installation.md`

- Document `specd project update` and plugin asset synchronization.

### 6. `docs/guide/configuration-examples.md`, `workspaces.md`, `context-compilation.md`, `schemas.md`, `workflow.md`

- Parity updates as previously completed.

### 7. `@specd/guide` distribution bundle

- Re-bundle guides via `pnpm --filter @specd/guide build`.

## Approach & Execution flow

1. **Code Graph Overhaul**: Rewrite `docs/guide/code-graph.md` with complete, exhaustive documentation and playbooks.
2. **Prominence Updates**: Enhance `docs/guide/index.md`, `docs/guide/philosophy.md`, `docs/guide/skills.md`, and `docs/guide/cli.md` to highlight the Code Graph as a core capability.
3. **Guide Bundling & Rebuild**: Run `pnpm --filter @specd/guide build` and `pnpm --filter @specd/cli build`.
4. **Verification**: Run `pnpm typecheck`, `pnpm test`, and inspect CLI guide output via `specd guide code-graph`.

### 8. Opening page: What is SpecD?

Create `docs/guide/what-is-specd.md`. Do not replace `docs/guide/index.md`. The index stays the topic map.

Frontmatter:

```yaml
---
title: What is SpecD?
description: What SpecD is, what you can do with it, and how the Code Graph fits in.
sidebar_position: 0
---
```

`sidebar_position: 0` makes this the first bundled guide. Change `docs/guide/index.md` from `sidebar_position: 0` to `sidebar_position: 1` so the overview is no longer tied for first place. Leave every other guide's `sidebar_position` unchanged.

Page body, in this order. Write each section in prose a new reader can finish without opening another guide. Link out for the full reference. Do not copy the philosophy essay or the Code Graph command catalog into this page.

1. **What SpecD is.** SpecD is a spec-driven development platform for real codebases. A spec says what a capability must do. A change tracks that work from idea through archive. The Code Graph is the map of the repository: symbols, calls, imports, specs, and markdown. The page is for the person who writes the software and for the agent that implements it.
2. **What you can do.** Four capabilities, each with its own short subsection, not a single sentence:
   - Write specs (`spec.md`) and verification scenarios (`verify.md`) that stay in the repository.
   - Move a change through design, implementation, verification, and archive.
   - Drive that same workflow from the CLI and from agent skills (`/specd`, `/specd-new`, `/specd-design`, `/specd-implement`, `/specd-verify`, `/specd-archive`).
   - Query the Code Graph before editing, instead of searching the repository by hand.
3. **How the pieces fit.** A short path from idea to archive: proposal, specs, verify, design, tasks, implementation, verification, archive. Name what lives in the repository (`specs/`, the change under the specd changes directory, application code, `docs/guide/`). State what SpecD does not replace: the editor, the language toolchain, and the test runner. Tests check that code behaves as programmed. Verification checks that the implementation satisfies the spec. Link to [Philosophy](./philosophy.md) for why the order is inverted, and to [Workflow & Lifecycle](./workflow.md) for the state machine.
4. **The Code Graph.** A long section. State what is indexed (symbols, calls, imports, specifications, markdown documents). Explain search across those categories, blast radius (`specd graph impact`), and hotspots (`specd graph hotspots`). Include three concrete commands: a symbol search, an impact query with `--direction dependents`, and a hotspot query with `--min-risk HIGH`. Mention coverage diagnostics only as a pointer (`FILE_NOT_INDEXED`, `SYMBOL_NOT_FOUND`, `SYMBOL_AMBIGUOUS` on `specd graph index`). Link to [Code Graph & Intelligence](./code-graph.md) for flags, the risk model, and playbooks. Do not duplicate that guide.
5. **People and agents.** The person defines what the system must do. The agent reads the spec, the design, and the Code Graph, and uses the same CLI. Mention context compilation in one paragraph and link to [Context Compilation](./context-compilation.md) and [Skills](./skills.md).
6. **Where to go next.** Links, in this order:
   - [Installation & Initialization](./installation.md)
   - [Getting Started](./getting-started.md)
   - [Philosophy](./philosophy.md)
   - [Guides Overview](./index.md)
   - [Code Graph & Intelligence](./code-graph.md)

At the top of `docs/guide/index.md`, before section "1. Foundations & Philosophy", add a link to `./what-is-specd.md` that tells the reader to start there.

Public docs entry:

- In `apps/public-web/src/lib/public-docs-config.ts`, change `publicDocsHref` from `'/docs/guide'` to `'/docs/guide/what-is-specd'`. Do not set a custom `slug` on the new page. Docusaurus derives `/docs/guide/what-is-specd` from `docs/guide/what-is-specd.md`. `docs/guide/index.md` keeps `slug: /guide`, so `/docs/guide` remains the topic map.
- In `apps/public-web/sidebars.ts`, the `Getting Started` category items become `['guide/what-is-specd', 'guide/index', 'guide/installation', 'guide/getting-started']`.
- In the `Guide` category of that same file, move `'guide/code-graph'` to the first item so the Code Graph is the first topic after Getting Started.

`publicDocsHref` is imported by `apps/public-web/src/components/landing-page.tsx`, `apps/public-web/src/components/home-hero.tsx`, and `apps/public-web/docusaurus.config.ts`. Those files keep importing the constant. The navbar "Docs" link and the hero "Get Started" action follow the new value. Spec impact for `default:_global/docs` is MEDIUM (four direct dependents: `cli:change-invalidate`, `cli:guide`, `public-web:api-reference`, `public-web:public-site`). This change adds a guide page and does not alter those specs' requirements, so they stay out of this change.

Tests that assert the old route must expect `'/docs/guide/what-is-specd'`:

- `apps/public-web/test/lib/public-docs-config.spec.ts`
- `apps/public-web/test/components/landing-page.spec.tsx`

`apps/public-web/test/lib/sidebar-config.spec.ts` must assert that the first item of the `Getting Started` category is `'guide/what-is-specd'` and that the first item of the `Guide` category is `'guide/code-graph'`.

### Key decisions

- **Decision:** a new page, with the index left as the map.
- **Rejected:** rewriting `index.md` into the product introduction. That removes the topic map from the guide root.
- **Rejected:** giving the new page `slug: /guide`. That would move the current overview URL. `/docs/guide` stays the map. The promoted entry URL becomes `/docs/guide/what-is-specd`.

## Open questions

None. The opening page path, sidebar order, public docs href, and Code Graph section are fixed above. Code Graph command behavior documented in `code-graph.md` was verified against `@specd/code-graph` and `@specd/cli`.
