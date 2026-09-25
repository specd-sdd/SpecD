# Proposal: complete-guide-config-documentation

## Motivation

Following the recent documentation overhaul and guide command release, an exhaustive verification revealed that several core configuration capabilities, pattern variable substitutions, security mechanisms, and syntax constraints are missing or misstated across `docs/guide/`. Additionally, the operational behavior and necessity of `specd project update` is insufficiently documented, and the user-facing documentation for the **Code Graph** is disproportionately scarce—omitting critical capabilities such as document indexing and search, full-text indexed source file search, spec-level impact analysis, public export surface analysis, and the central role that graph intelligence plays across agent skills and developer refactoring workflows.

Elevating the Code Graph to its proper prominence across the documentation and providing an exhaustive user guide is essential for both developers and AI coding agents operating via `specd guide`.

The guide and the public docs still open on a table of contents. A new reader does not get a direct answer to what SpecD is, what they can do with it, or that the Code Graph is one of the product's main parts. Philosophy explains spec-driven development as a discipline. Getting Started assumes the reader already wants the tutorial.

## Current behaviour

Currently:

- `docs/guide/configuration.md` only documents four archive pattern variables (`{{change.archivedName}}`, `{{change.name}}`, `{{year}}`, `{{date}}`), omitting `{{month}}` and `{{day}}`. The `{{change.archivedName}}` example incorrectly states a date-prefixed slug rather than the true timestamp format `YYYYMMDD-HHmmss-<name>`, and calls pattern expansion a "Nunjucks template" instead of fixed token replacement.
- `workspaces.<name>.specs.fs.metadataPath` is completely undocumented across all guide files;
- Template variable expansion for hooks (`run:` and `instruction:`) and artifact templates is missing or contradicted;
- `context-compilation.md` contains a critical bug referring to non-existent `context.include`/`context.exclude` fields;
- `workspaces.md` lists an incorrect default for `contextIncludeSpecs` (`['*']` instead of `[] (None)`) and omits `graph` configuration from its reference table;
- The forbidden workspace name `'root'` is not documented;
- `specd project update` is only briefly summarized in `docs/guide/cli.md` as "Updates project settings or synchronizes metadata caches", and is missing from `configuration.md` and `installation.md`. There is no clear explanation that `specd project update` triggers plugin asset orchestration (updating `AGENTS.md`, `CLAUDE.md`, skill templates) when plugins are manually declared/updated in `specd.yaml` or when upgrading SpecD;
- `docs/guide/code-graph.md` is only 90 lines long and omits document search (`--documents`), full-text source file search (`--files`), spec content search (`--specs`, `--spec-content`), spec-level blast radius (`impact --spec <id>`), public export surface analysis (`--export <name> --from <surface>`), multi-file aggregated impact, directional filtering (`dependencies`, `dependents`, `both`), depth traversal limits, risk scoring models, coverage diagnostics (`coverageDiagnostics`), and practical workflows;
- The Code Graph is treated as an isolated utility rather than a foundational pillar across `index.md`, `philosophy.md`, `getting-started.md`, and `skills.md`.
- The first page of `docs/guide/` (`index.md`, slug `/guide`) is a topic map. Public docs navigation (`publicDocsHref` in `apps/public-web/src/lib/public-docs-config.ts`) sends the navbar and the hero "Get Started" action to that map. There is no opening page that states what SpecD is and what a reader can do with it, including the Code Graph.

## Proposed solution

Audit, expand, and align all relevant documentation files under `docs/guide/` with the exact codebase implementation in `@specd/core`, `@specd/code-graph`, and `@specd/cli`:

1. Update `docs/guide/configuration.md` to document all supported archive pattern variables (`{{year}}`, `{{month}}`, `{{day}}`, `{{date}}`, `{{change.name}}`, `{{change.archivedName}}`), document `metadataPath`, document `workspaces.root` restriction, document `context` entry `id` attribute, document hook template variables and shell-escaping security behavior, and document standard `adapter: { type, config }` syntax exclusively. Do not mention unsupported variables or legacy formats.
2. In `docs/guide/configuration.md` (under Agent Plugins) and `docs/guide/installation.md`, document `specd project update`: clarify that manual changes to `plugins.agents` or upgrading SpecD/plugin packages require running `specd project update` to regenerate project-managed assets (`AGENTS.md`, `CLAUDE.md`, skills), whereas general `specd.yaml` configurations are loaded in real time on every CLI command without needing any update command.
3. Update `docs/guide/cli.md` to clarify that `specd project update` orchestrates declared plugins and synthesizes agent instructions and skill assets, and document comprehensive `specd graph` flags (`--documents`, `--files`, `--specs`, `--spec`, `--export`, `--depth`, `--snippet`).
4. Overhaul `docs/guide/code-graph.md` into a comprehensive, deep-dive user guide covering:
   - Indexing mechanics, AST extraction, and document indexing (`docs/`, architecture docs, guides).
   - Multi-category search: symbols (`--symbols`, `--kind`), source files (`--files`, `--snippet`), specifications (`--specs`, `--spec-content`), and markdown documents (`--documents`).
   - Blast radius and impact analysis: symbols, files, specs (`--spec <id>`), public export routes (`--export <name> --from <surface>`), aggregated multi-file impact, traversal directions (`dependents`, `dependencies`, `both`), depth controls (`--depth`), and risk levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
   - Hotspot analysis and architectural coupling metrics.
   - Graph health, stats, stale index detection, and implementation coverage diagnostics (`coverageDiagnostics`).
   - Real-world playbooks for developers and agents (safe refactoring, spec-to-code traceability, debt reduction).
5. Elevate Code Graph prominence across related guides:
   - `docs/guide/index.md`: Highlight Code Graph as a core pillar of SpecD.
   - `docs/guide/philosophy.md`: Explain the intelligence layer's role in grounding agents and eliminating blind lexical grep.
   - `docs/guide/skills.md`: Detail how `/specd-design` and `/specd-implement` enforce the Graph-First Protocol.
6. Update `docs/guide/configuration-examples.md` to reflect `{{month}}`, standard adapter syntax, and `metadataPath`.
7. Update `docs/guide/workspaces.md` to fix `contextIncludeSpecs` default to `None / []`, correct `prefix` description, add `graph` settings and `metadataPath` to the workspace fields table, and note the reserved `'root'` workspace name.
8. Update `docs/guide/context-compilation.md` to fix references to `contextIncludeSpecs` and `contextExcludeSpecs`, and document pattern syntax rules.
9. Update `docs/guide/schemas.md` to document variable expansion in artifact templates (`{{change.name}}`, `{{change.path}}`, `{{project.root}}`).
10. Update `docs/guide/workflow.md` to include `{{change.archivedName}}` for post-archiving hooks and shell-escaping behavior.
11. Update JSDoc in `packages/core/src/application/specd-config.ts` to document all supported variables (`{{year}}`, `{{month}}`, `{{day}}`, `{{date}}`, `{{change.name}}`, `{{change.archivedName}}`) and remove negative mentions of unsupported variables.
12. Re-bundle guides via `@specd/guide` so that `specd guide` serves the updated content.
13. Add `docs/guide/what-is-specd.md` as the first page of the user guide and of the public docs. It explains what SpecD is, what a reader can do with it, and treats the Code Graph as a core part of the product (search, blast radius, and spec-to-code traceability), then points to installation, the quickstart, philosophy, and the Code Graph guide. Point `publicDocsHref` and the guide sidebar order at this page so it is the opening document. Keep `docs/guide/index.md` as the topic map, linked from the new page.

## Specs affected

### New specs

None.

### Modified specs

- `default:_global/docs`: Update requirements to enforce accuracy and completeness of user guide documentation for configuration parameters, pattern variables, template variable substitutions, project update plugin orchestration, comprehensive Code Graph user documentation, and an opening "What is SpecD?" page that presents the Code Graph as a core capability.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- Documentation under `docs/guide/` (`what-is-specd.md`, `index.md`, `code-graph.md`, `philosophy.md`, `skills.md`, `cli.md`, `getting-started.md`, `specs.md`, `configuration.md`, `configuration-examples.md`, `workspaces.md`, `context-compilation.md`, `schemas.md`, `workflow.md`, `installation.md`).
- Public web configuration in `apps/public-web/src/lib/public-docs-config.ts`.
- Codebase JSDoc comment in `packages/core/src/application/specd-config.ts`.
- Bundled guide catalog in `packages/guide/src/infrastructure/generated/guides.ts`.
- Spec delta and verification scenario in `specs/_global/docs/`.
- No breaking API or runtime changes. All changes align documentation with existing implementation behavior.

## Technical context

- `_expandPattern()` in `packages/core/src/infrastructure/fs/archive-repository.ts` performs direct token substitution for `{{year}}`, `{{month}}`, `{{day}}`, `{{date}}`, `{{change.name}}`, `{{change.archivedName}}`.
- `TemplateExpander` in `packages/core/src/application/template-expander.ts` provides `expand()` (verbatim) and `expandForShell()` (single-quote escaped for shell commands).
- `get-artifact-instruction.ts` expands variables on `template`, `instruction`, `deltaInstruction`, `rules.pre`, and `rules.post`.
- `config-loader.ts` validates and rejects `'root'` as a workspace name, and normalizes `metadataPath` on specs adapters.
- `registerProjectUpdate` in `packages/cli/src/commands/project/update.ts` invokes `updatePluginsWithKernel()` from `packages/cli/src/commands/plugins/update.ts`, which runs `UpdatePlugin.execute()` in `@specd/plugin-manager` to reinstall agent assets (`plugin.install(config, options)`).
- `@specd/code-graph` exposes `SearchCodeGraph` (`symbols`, `files`, `specs`, `documents`), `AnalyzeImpact` (`symbol`, `file`, `spec`, `export`, `direction`, `depth`), `RankHotspots` (coupling metrics and risk scoring), and `IsolatedIndexWorker` (background multi-workspace AST and markdown indexing).
- `bundle-guides.ts` compiles all `docs/guide/*.md` files into `GUIDES_CATALOG`.

## Open questions

None. The opening page is a new guide document, `docs/guide/what-is-specd.md`, placed first in the guide and in public docs navigation. The Code Graph is explained on that page as a core capability, with the detailed command reference remaining in `docs/guide/code-graph.md`.
