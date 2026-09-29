# Tasks: complete-guide-config-documentation

## 1. Core JSDoc Alignment

- [x] 1.1 Update `ArchiveStorageConfig.archivePattern` JSDoc in `packages/core/src/application/specd-config.ts`
      `packages/core/src/application/specd-config.ts`: `ArchiveStorageConfig.archivePattern` — document all 6 supported pattern tokens and remove negative mentions of unsupported variables
      Approach: List all 6 supported variables (`{{year}}`, `{{month}}`, `{{day}}`, `{{date}}`, `{{change.name}}`, `{{change.archivedName}}`). Note that `{{change.archivedName}}` uses format `YYYYMMDD-HHmmss-<name>`. Remove the comment stating `{{change.workspace}} is not supported`.
      (Req: User guide documentation and frontmatter)

## 2. Configuration & Workspace Documentation Updates

- [x] 2.1 Update `docs/guide/configuration.md`
      `docs/guide/configuration.md`: Configuration reference — document missing pattern variables, standard adapters, `metadataPath`, `graph`, reserved names, and context IDs
      Approach: In `storage.archive.pattern`, document all 6 supported variables (`{{year}}`, `{{month}}`, `{{day}}`, `{{date}}`, `{{change.name}}`, `{{change.archivedName}}`), note plain replacement (`replaceAll`) rather than Nunjucks, and do not mention unsupported variables. In workspace configuration, document `specs.fs.metadataPath`, `graph` configuration block, reserved workspace name `'root'`, standard adapter format (`adapter: { type: 'fs', config: { ... } }`) exclusively (omitting legacy syntax), and optional context entry `id` for delta removal cascades.
      (Req: User guide documentation and frontmatter)
- [x] 2.2 Update `docs/guide/configuration-examples.md`
      `docs/guide/configuration-examples.md`: Configuration examples — add realistic archive patterns and modern workspace configurations
      Approach: Add example snippets showing `storage.archive.pattern` with `{{year}}/{{month}}/{{change.name}}` and `archive/{{year}}/{{change.archivedName}}`. Update workspace examples to exclusively demonstrate standard structured adapter syntax and `metadataPath`.
      (Req: User guide documentation and frontmatter)
- [x] 2.3 Update `docs/guide/workspaces.md`
      `docs/guide/workspaces.md`: Workspaces guide — document reserved names, prefix rules, non-default defaults, and complete options
      Approach: Document that `'root'` is a reserved workspace identifier. Document prefix segment regex rules (`/^[a-z0-9_][a-z0-9_-]*$/`) and clarify that prefixes are display-only and do not replace the required `workspace:` qualifier in spec IDs. Correct `contextIncludeSpecs` default for non-default workspaces to `[]` (None). Add missing `metadataPath` and `graph` settings to the options table.
      (Req: User guide documentation and frontmatter)
- [x] 2.4 Document `specd project update` and plugin asset orchestration in `docs/guide/configuration.md` and `docs/guide/installation.md`
      `docs/guide/configuration.md`, `docs/guide/installation.md`: Plugin documentation — document `specd project update` lifecycle role and trigger conditions
      Approach: In the Agent Plugins sections of `configuration.md` and `installation.md`, document `specd project update`. Clarify that manually editing `plugins.agents` in `specd.yaml` or upgrading SpecD/plugin packages requires running `specd project update` to synthesize project-managed assets (`AGENTS.md`, `CLAUDE.md`, skill templates). Clarify that ordinary `specd.yaml` changes are loaded dynamically at runtime without requiring an update command.
      (Req: User guide documentation and frontmatter)
- [x] 2.5 Update `docs/guide/cli.md` project update description
      `docs/guide/cli.md`: CLI guide — upgrade `specd project update` documentation
      Approach: In the `specd project` section of `cli.md`, clearly explain that `specd project update` executes declared plugin orchestration and synthesizes agent instructions and skill assets, distinguishing it from `update-metadata`.
      (Req: User guide documentation and frontmatter)

## 3. Workflow, Context, and Schema Documentation Updates

- [x] 3.1 Update `docs/guide/context-compilation.md`
      `docs/guide/context-compilation.md`: Context compilation guide — fix configuration keys, document wildcard rules, and template variables
      Approach: Replace obsolete `context.include`/`context.exclude` with `contextIncludeSpecs`/`contextExcludeSpecs`. Document wildcard pattern matching rules (`*`, `workspace:*`, `prefix/*`). Document that context compilation instructions support variable expansion (`{{change.name}}`, `{{change.path}}`, `{{project.root}}`).
      (Req: User guide documentation and frontmatter)
- [x] 3.2 Update `docs/guide/schemas.md`
      `docs/guide/schemas.md`: Custom schemas guide — document template variable expansion
      Approach: Correct the section claiming templates do not support variable expansion. Document that `{{change.name}}`, `{{change.path}}`, and `{{project.root}}` are expanded in `template`, `instruction`, `deltaInstruction`, and `rules` blocks.
      (Req: User guide documentation and frontmatter)
- [x] 3.3 Update `docs/guide/workflow.md`
      `docs/guide/workflow.md`: Workflow guide — document hook variable interpolation and shell command escaping
      Approach: Document hook variable interpolation (`{{project.root}}`, `{{change.name}}`, `{{change.path}}`, and `{{change.archivedName}}` for post-archive hooks). Document shell escaping mechanics using `expandForShell()` for `run:` commands to prevent shell injection.
      (Req: User guide documentation and frontmatter)

## 4. Public Web Route Alignment

- [x] 4.1 Update public documentation navigation routes
      `apps/public-web/src/lib/public-docs-config.ts`: Public docs config — update `publicDocsHref` to `/docs/guide`
      Approach: Update `publicDocsHref` from `/docs/guide/getting-started` to `/docs/guide` so both the navbar "Docs" link and the hero "Get Started" button navigate to the documentation overview and guide directory.
      (Req: User guide documentation and frontmatter)

## 5. Code Graph Overhaul & Prominence Expansion

- [x] 5.1 Comprehensive Code Graph Guide Overhaul
      `docs/guide/code-graph.md`: Code Graph user guide — document all subcommands, flags, and playbooks
      Approach: Rewrite `code-graph.md` to exhaustively cover document indexing and search (`--documents`), full-text source search (`--files`, `--snippet`), spec search (`--specs`, `--spec-content`), spec impact (`--spec <id>`), public export analysis (`--export <name> --from <surface>`), multi-file aggregated blast radius, traversal directions (`dependents`, `dependencies`, `both`) and depth, hotspot detection, and coverage diagnostics.
      (Req: User guide documentation and frontmatter)
- [x] 5.2 Elevate Code Graph Prominence Across Guides
      `docs/guide/index.md`, `docs/guide/philosophy.md`, `docs/guide/skills.md`, `docs/guide/cli.md`: Prominence expansion — position Code Graph as a core platform pillar
      Approach: In `index.md`, elevate Code Graph in the navigation map. In `philosophy.md`, explain its role in eliminating context-wasting lexical grep for AI agents. In `skills.md`, document the Graph-First Protocol enforced during `/specd-design` and `/specd-implement`. In `cli.md`, document all `specd graph` options and recipes.
      (Req: User guide documentation and frontmatter)

## 6. Guide Re-bundling and Verification

- [x] 6.1 Re-bundle guides with `@specd/guide` and rebuild CLI
      `packages/guide`, `packages/cli`: Guide compiler — regenerate bundled JSON guide data and rebuild CLI
      Approach: Run `pnpm --filter @specd/guide build` and `pnpm --filter @specd/cli build`.
      (Req: User guide documentation and frontmatter)
- [x] 6.2 Automated verification (typecheck and tests)
      Run `pnpm typecheck` across workspace, and run test suites across core, guide, and public-web.
      Approach: Run `pnpm typecheck` and `pnpm test`.
      (Req: User guide documentation and frontmatter)
- [x] 6.3 Manual / CLI E2E verification
      `packages/cli`: CLI guide inspect — verify rendered output in terminal
      Approach: Execute `node packages/cli/dist/index.js guide code-graph --meta` and inspect updated sections.
      (Req: User guide documentation and frontmatter)

## 7. Opening page: What is SpecD?

- [x] 7.1 Write `docs/guide/what-is-specd.md` and point the guide index at it
      `docs/guide/what-is-specd.md`, `docs/guide/index.md`: Opening page — what SpecD is, what a reader can do, and the Code Graph
      Approach: Create the page with `sidebar_position: 0` and the six sections from design (what SpecD is, what you can do, how the pieces fit, the Code Graph with example commands, people and agents, where to go next). Set `docs/guide/index.md` `sidebar_position` to `1` and link to `./what-is-specd.md` before the foundations list.
      (Req: User guide documentation and frontmatter)
- [x] 7.2 Make the page the public docs entry and the first sidebar item
      `apps/public-web/src/lib/public-docs-config.ts`, `apps/public-web/sidebars.ts`, `apps/public-web/test/lib/public-docs-config.spec.ts`, `apps/public-web/test/components/landing-page.spec.tsx`, `apps/public-web/test/lib/sidebar-config.spec.ts`: Public docs entry — open on What is SpecD and lead the Guide category with the Code Graph
      Approach: Set `publicDocsHref` to `'/docs/guide/what-is-specd'`. Getting Started items start with `guide/what-is-specd`, then `guide/index`, `guide/installation`, `guide/getting-started`. Move `guide/code-graph` to the first Guide category item. Update the href and sidebar tests to match.
      (Req: User guide documentation and frontmatter)
- [x] 7.3 Re-bundle guides and verify the opening page
      `packages/guide`, `packages/cli`, `apps/public-web`: Guide compiler and public docs — serve What is SpecD first
      Approach: Run `pnpm --filter @specd/guide build`, `pnpm --filter @specd/cli build`, `pnpm --filter @specd/public-web test`, and `node packages/cli/dist/index.js guide what-is-specd --meta`.
      (Req: User guide documentation and frontmatter)
