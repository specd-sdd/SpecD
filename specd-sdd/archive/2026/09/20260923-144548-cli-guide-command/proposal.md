# Proposal: cli-guide-command

## Motivation

When `specd` is adopted in external repositories (such as user applications, services, or independent monorepos), developers and AI agents do not have access to the `docs/` tree of the specd repository. Public LLMs have no pre-training on `specd` conventions, schemas, or workflow rules, and the MCP server package (`@specd/mcp`) is currently a stub.

Without on-demand documentation built directly into the CLI, developers and AI agents must guess configuration options, schema structures, and workflow semantics, resulting in misconfigurations and workflow stalls. Furthermore, the repository's current documentation suffers from structural inconsistencies: developer internals are mixed into user guides (e.g. `skills-template-rendering.md`), essential user guides like delta file authoring are hidden in example subdirectories, and contradictory information exists regarding the layered configuration cascade. A built-in `specd guide` command and a clean overhaul of both user and non-user documentation are needed to make `specd` fully autonomous and self-documenting.

## Current behaviour

Today, running `specd` in an external repository provides command-line flag syntax via `--help`, raw schema dumps via `specd schema show`, and resolved configuration dumps via `specd config show`. However:

1. There is no CLI mechanism to view conceptual guides, schema rules, workflow lifecycle states, or configuration tutorials.
2. In `docs/guide/`, internal developer documentation (such as Handlebars template compilation for skills) is mixed into the user-facing guides.
3. Crucial user guides, such as the AST delta specification (`delta-files.md`), are located under `docs/schemas/examples/` rather than within `docs/guide/`.
4. `docs/config/config-reference.md` states that `specd.local.yaml` is never merged or layered, contradicting the actual layered config cascade implementation documented in `docs/guide/configuration.md`.
5. There is no user guide for `code-graph` (existing docs in `docs/code-graph/` focus strictly on SQLite worker threads and internal domain classes).
6. There is no user guide for creating custom schemas, forking schemas (`specd schema fork`), extending schemas (`specd schema extend`), or authoring distributable schema plugins (`schemaPlugins`).

## Proposed solution

We propose a comprehensive documentation alignment and the introduction of `specd guide` in `@specd/cli`:

1. **User Guide Reorganization and Expansion (`docs/guide/`):**
   - Strictly separate user-facing guides from developer/internal monorepo references.
   - Standardize all guides on Docusaurus-native frontmatter (`title`, `description`, `sidebar_position`) for seamless compatibility with `apps/public-web`.
   - Provide a complete catalog of user guides:
     - `getting-started`: Consolidated onboarding, philosophy, directory structure (`specs/`, `.specd/`), and core mental model.
     - `configuration`: Authoritative reference combining narrative guidance and tabular field definitions, accurately reflecting the layered config cascade.
     - `workflow`: The 12 lifecycle states, transitions, human approval gates (`spec`, `signoff`), hooks, and skill roles.
     - `schemas`: Conceptual foundation explaining what schemas are in SpecD, their role in lifecycle governance, artifact DAGs, and constraints.
     - `standard-schema`: In-depth guide dedicated to `@specd/schema-std`: the 5 core artifacts (`proposal`, `specs`, `verify`, `design`, `tasks`), scopes, rules, and validation behavior.
     - `custom-schemas`: Practical guide on creating custom schemas, forking (`specd schema fork`), extending (`specd schema extend`), `schemaOverrides`, and authoring/publishing schema plugins (`schemaPlugins`).
     - `templates`: Structural template references for all standard artifacts with formatting constraints.
     - `deltas`: Comprehensive guide on `.delta.yaml` authoring: operations (`added`, `modified`, `removed`, `no-op`), AST selectors, positioning, and conflict resolution.
     - `code-graph`: User guide for Code Graph explaining the graph-first protocol, indexing (`graph index`), symbol search (`graph search`), blast-radius impact analysis (`graph impact`), and hotspot detection (`graph hotspots`).
     - `workspaces`: Managing single-repos, monorepos, external workspaces, and ownership (`owned`, `shared`, `readOnly`).
     - `selectors`: AST selector syntax for targeting spec sections, code, and structured artifacts.
     - `cli`: Consolidated user guide and command reference for `specd guide cli`, featuring concrete, copy-pasteable examples, parameter explanations, and practical usage workflows for every command.

2. **Total Repository Documentation Audit, docs/cli/ Completion, and Docusaurus Alignment:**
   - Conduct a comprehensive, file-by-file audit of **all** documentation across the entire repository — user-facing guides (`docs/guide/`) as well as technical package references and architectural documents (`docs/core/`, `docs/code-graph/`, `docs/sdk/`, `docs/cli/`, `docs/config/`, `docs/schemas/`, and `docs/adr/`).
   - Audit and complete `docs/cli/` so that every single CLI command has a dedicated, up-to-date document (auditing existing ones, adding missing ones for change, drafts, discarded, archives, schema, graph, and `guide.md`).
   - Add `docs/cli/index.md` as an entry point for the CLI reference section.
   - Update `apps/public-web/sidebars.ts` to make the full `docs/cli/` command catalog and `docs/guide/` fully navigable and error-free in Docusaurus.
   - Identify and fix all stale contracts, broken links, outdated code snippets, terminology drift, and contradictions (such as the config cascade disparity).
   - Relocate developer-internal documents (e.g. `skills-template-rendering.md`) from `docs/guide/` to appropriate technical reference locations (e.g. `docs/skills/`).
   - Ensure every single documentation file in `docs/` is completely up-to-date and accurately reflects current code.

3. **AI-Optimized `specd guide` CLI Command (`@specd/cli`):**
   - **Catalog Listing (`specd guide`):** Lists all available guide topics with titles, order, and concise descriptions.
   - **Document Inspection (`specd guide <topic>`):**
     - _Full Read (default):_ Displays the full content of the topic.
     - _Metadata & Outline (`--meta`):_ Emits document-level statistics (`lines`, `bytes`, `file`) and an array of all sections (`heading`, `level`, `startLine`, `endLine`, `lines`). This gives AI agents a complete document map in ~150 tokens without loading full content.
     - _Targeted Section Read (`--section <name>`):_ Extracts only the specified section body from its heading to the next heading of equal or higher level.
     - _Line Range Slicing (`--start-line <n> --lines <m>`):_ Reads a bounded window of lines (1-indexed), preventing context window blowup.
     - _Numbered Output (`--line-numbers`):_ Prefixes output lines with absolute 1-indexed line numbers for unambiguous referencing.
   - **Granular Section Search (`specd guide search <query>`):**
     - Performs fast in-memory BM25/TF-IDF search over parsed markdown sections using `minisearch`.
     - Supports field boosting (`title: 5`, `heading: 3`, `content: 1`), English stop-words filtering, and fuzzy matching.
     - Supports `--topic <id>` to scope search, `--limit <n>` (default: 5), and `--snippet-lines <n>` (default: 3).
     - Each search result provides structured metadata: `topic`, `file`, `section`, `level`, `startLine`, `endLine`, `score`, a contextual numbered `snippet` (with lines before and after the match), and a direct `readCommand` to fetch the complete section or line window.
   - **Parser Reuse:** Reuses `@specd/core`'s battle-tested `MarkdownParser` (and MDAST AST) to extract headings, sections, outlines, and exact line boundaries rather than relying on brittle ad-hoc regex.
   - **Output Formats:** `--format text|markdown|json|toon` across all subcommands, delivering ultra-compact, token-optimized responses for AI agents.
   - **Build-Time Bundling:** A compile-time build step packages `docs/guide/*.md` into `packages/cli/src/generated/guides.ts` so `@specd/cli` functions fully offline and self-contained with zero filesystem path fragility.

## Specs affected

### New specs

- `guide:conventions`: Defines package architecture (hexagonal: domain, application, infrastructure, composition), root configuration (`package.json`, `tsconfig.json`, `vitest.config.ts`, `test/`), comprehensive `README.md` standard, and zero-runtime `@specd/core` dependency constraint.
  - Depends on: none
- `guide:errors`: Defines the package error hierarchy (`SpecdGuideError`, `GuideTopicNotFoundError`, `GuideSectionNotFoundError`) adhering to the SpecD Error Contract with zero runtime core dependencies.
  - Depends on: `guide:conventions`, `default:_global/error-handling-conventions`
- `guide:guide-model`: Defines domain entities and value objects: `GuideTopic`, `GuideSection`, `GuideOutline`, `GuideSearchHit`, and `GuideSummary`.
  - Depends on: `guide:conventions`
- `guide:bundle-guides`: Defines the build-time compilation script (`scripts/bundle-guides.ts`) reading `docs/guide/*.md`, enforcing required Docusaurus frontmatter, extracting headings, computing line boundaries, and generating the static pre-bundled TypeScript catalog.
  - Depends on: `guide:conventions`, `guide:guide-model`
- `guide:list-guides`: Defines the application query and use case to list all available guide summaries ordered by `order`.
  - Depends on: `guide:conventions`, `guide:guide-model`
- `guide:get-guide`: Defines the application query and use case to retrieve a complete guide topic by ID.
  - Depends on: `guide:conventions`, `guide:guide-model`, `guide:errors`
- `guide:get-guide-outline`: Defines the application query and use case to extract document outlines and section line spans.
  - Depends on: `guide:conventions`, `guide:guide-model`, `guide:errors`
- `guide:slice-guide-content`: Defines the application utilities and queries for extracting specific sections by heading and slicing bounded line windows with 1-indexed line numbers.
  - Depends on: `guide:conventions`, `guide:guide-model`, `guide:errors`
- `guide:search-guides`: Defines the application search query, search port (`GuideSearchPort`), and in-memory BM25 search engine adapter using `minisearch`.
  - Depends on: `guide:conventions`, `guide:guide-model`
- `guide:composition`: Defines the composition facade (`createGuideEngine()`), dependency wiring, and public export boundaries (`index.ts`, `public.ts`).
  - Depends on: `guide:conventions`, `guide:guide-model`, `guide:errors`, `guide:list-guides`, `guide:get-guide`, `guide:get-guide-outline`, `guide:slice-guide-content`, `guide:search-guides`
- `cli:guide`: Defines the CLI commands `specd guide [topic]` and `specd guide search <query>` in `@specd/cli` as a thin delivery adapter over `@specd/guide`, handling Commander options (`--meta`, `--section`, `--start-line`, `--lines`, `--line-numbers`), `--format text|markdown|json|toon` output formatting, and typed error handling for unknown topics (`UNKNOWN_GUIDE_TOPIC`).
  - Depends on: `cli:entrypoint`, `default:_global/docs`, `guide:composition`

### Modified specs

- `default:_global/docs`: Establishes the architectural separation between user guides (`docs/guide/`) and developer package references; requires Docusaurus-standard frontmatter (`title`, `description`, `sidebar_position`) for all guide topics; and codifies alignment rules for non-user documentation.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:agent-instruction-template`: Updates the shared base agent instruction template to incorporate the on-demand documentation protocol using `specd guide` (`specd guide`, `specd guide <topic>`, `specd guide search <query>` with `--format toon`) so that all installed agent instruction files (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`) and skill templates instruct agents to look up documentation topics instead of guessing.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **`packages/guide`**:
  - New package `@specd/guide` with zero dependencies on `@specd/core`.
  - Implements `GuideCatalog`, `GuideSearchEngine` (backed by `minisearch`), section outline extraction, and line window slicing.
  - Includes a build-time compile script (`scripts/bundle-guides.ts`) that reads `docs/guide/*.md` at build time, parses frontmatter and headings, and emits a pre-calculated, structured TypeScript catalog.
- **`packages/cli`**:
  - Depends on `@specd/guide`.
  - Adds `packages/cli/src/commands/guide/` as a delivery adapter implementing `specd guide` listing, topic inspection, and `search`.
  - Registers the `guide` command in `packages/cli/src/index.ts`.
- **`packages/skills`**:
  - Updates `agent-instruction.md.tpl` to inject the `specd guide` instruction block into `AGENTS.md`, `CLAUDE.md`, etc.
  - Updates `shared.md.tpl` with shared guidelines on consulting `specd guide` during skill execution.
- **`docs/guide/`**:
  - Reorganized and expanded user guide markdown files, including new `docs/guide/cli.md` consolidating the CLI reference for `specd guide cli`.
  - Relocates `skills-template-rendering.md` to `docs/skills/`.
  - Moves and consolidates delta documentation from `docs/schemas/examples/delta-files.md` into `docs/guide/deltas.md`.
- **`docs/cli/`**:
  - Audits all existing command files, creates missing command files for full CLI coverage, and adds `docs/cli/index.md` and `docs/cli/guide.md`.
- **`docs/` (Entire Documentation Suite)**:
  - Complete, file-by-file audit and alignment across all directories (`docs/guide/`, `docs/core/`, `docs/code-graph/`, `docs/sdk/`, `docs/cli/`, `docs/config/`, `docs/schemas/`, `docs/adr/`) to fix stale contracts, eliminate contradictions, resolve broken links, and establish clean information architecture.
- **`apps/public-web`**:
  - Updates `apps/public-web/sidebars.ts` to index the reorganized guides and the full `docs/cli/` command catalog.

## Technical context

- **Standalone `@specd/guide` Package Architecture**: Rather than embedding search and catalog logic into `@specd/cli`, logic is isolated into `@specd/guide`. This allows future delivery hosts (such as `@specd/mcp`) to expose guide tools and resources without depending on `@specd/cli`.
- **Zero Runtime Core Dependency**: To avoid coupling to `@specd/core`'s AST and delta engines, markdown parsing (frontmatter, headings, section bounds) occurs strictly at **build time**. The resulting data is emitted as a typed, static catalog with pre-computed section line bounds, giving runtime lookups $O(1)$ performance and 0 ms parsing latency.
- **Frontmatter Standard**: `docs/guide/*.md` files use Docusaurus-native frontmatter (`title`, `description`, `sidebar_position`). This guarantees zero build breakage with `apps/public-web` and allows Docusaurus to populate HTML meta descriptions automatically.
- **Three-way Schema Documentation**: User guides for schemas are decoupled into:
  1. `schemas`: Core concepts and lifecycle role.
  2. `standard-schema`: `@specd/schema-std` artifacts, DAG, and validation.
  3. `custom-schemas`: Forking, extending, overrides, and authoring `schemaPlugins`.
- **In-Memory Search Architecture**: `minisearch` (~7 KB, 0 external dependencies) indexes pre-computed sections in memory, applying BM25 scoring with field boosting and stop-words removal.
- **Config Cascade Single Source of Truth**: Reconciles `docs/config/config-reference.md` with `docs/guide/configuration.md` to accurately document the layered config cascade (`specd.yaml`, `specd.*.yaml`, `specd.local.yaml`).
- **Command Reference with Real-World Examples**: `docs/guide/cli.md` provides realistic invocation examples and scenario recipes for every command and option, maximizing readability for humans and serving as clear few-shot patterns for AI agents.

## Open questions

None. All scope decisions, command naming (`specd guide`), search library (`minisearch`), frontmatter fields, and schema document splits have been fully aligned and agreed upon.
