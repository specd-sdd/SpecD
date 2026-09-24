# Tasks: cli-guide-command

## 1. Guide Package Scaffolding & Domain Layer

- [x] 1.1 Scaffold `@specd/guide` package root files
      `packages/guide/package.json`, `packages/guide/tsconfig.json`, `packages/guide/vitest.config.ts`: Create package manifests
      Approach: Configure name `@specd/guide`, type `module`, zero dependencies on `@specd/core`, and configure `minisearch` as a dependency
      (Req: guide:conventions - Package Deliverables and Configuration)
- [x] 1.2 Create package README
      `packages/guide/README.md`: Author package documentation
      Approach: Document zero-core-dependency architecture, hexagonal layer diagram, topic catalog, quick start, and entity reference
      (Req: guide:conventions - Package README)
- [x] 1.3 Implement domain errors hierarchy
      `packages/guide/src/domain/errors/`: `SpecdGuideError`, `GuideTopicNotFoundError`, `GuideSectionNotFoundError`, `GuideSectionAmbiguousError`
      Approach: Inherit from native `Error`, declare `readonly specd = true`, upper snake_case `code`, and include `availableTopics` / `availableHeadings` / `matchingIndices`
      (Req: guide:errors - SpecdGuideError Base Class, GuideTopicNotFoundError, GuideSectionNotFoundError, GuideSectionAmbiguousError)
- [x] 1.4 Implement domain models and value objects
      `packages/guide/src/domain/models/`: `GuideTopic`, `GuideSection`, `GuideOutline`, `GuideSearchHit`, `GuideSummary`
      Approach: Pure TypeScript interfaces with 1-indexed line spans and byte counting definitions
      (Req: guide:guide-model - GuideTopic Entity, GuideSection Value Object, GuideSummary, GuideOutline, GuideSearchHit)

## 2. Guide Application Layer & Ports

- [x] 2.1 Define application ports
      `packages/guide/src/application/ports/`: `GuideCatalogPort`, `GuideSearchPort`, `GuideSearchOptions`
      Approach: Define driven port interfaces for listing, retrieving, and full-text searching guides
      (Req: guide:list-guides - GuideCatalogPort Contract, guide:search-guides - GuideSearchPort Contract)
- [x] 2.2 Implement ListGuidesQuery
      `packages/guide/src/application/queries/list-guides-query.ts`: `ListGuidesQuery`
      Approach: Query `catalogPort.listGuides()`, sort ascending by `order` (`sidebar_position`), break ties alphabetically by `topic`
      (Req: guide:list-guides - ListGuidesQuery Implementation)
- [x] 2.3 Implement GetGuideQuery
      `packages/guide/src/application/queries/get-guide-query.ts`: `GetGuideQuery`
      Approach: Lookup topic case-insensitively, strip optional `.md` extension, throw `GuideTopicNotFoundError` if missing
      (Req: guide:get-guide - GetGuideQuery Implementation, Topic Not Found Handling)
- [x] 2.4 Implement GetGuideOutlineQuery
      `packages/guide/src/application/queries/get-guide-outline-query.ts`: `GetGuideOutlineQuery`
      Approach: Construct `GuideOutline` value object from guide's pre-computed outline without transferring full body text
      (Req: guide:get-guide-outline - GetGuideOutlineQuery Implementation)
- [x] 2.5 Implement GetGuideSectionQuery and Slicing Utilities
      `packages/guide/src/application/queries/get-guide-section-query.ts`, `packages/guide/src/application/queries/slice-guide-lines.ts`: Slicing helpers
      Approach: Case-insensitive and slug heading matching, 1-indexed section number selection, ambiguity detection with GuideSectionAmbiguousError, bounded line slicing, padded right-aligned 1-indexed line number formatting
      (Req: guide:slice-guide-content - GetGuideSectionQuery, SliceGuideLinesQuery, Line Number Formatting Utility)
- [x] 2.6 Implement SearchGuidesQuery
      `packages/guide/src/application/queries/search-guides-query.ts`: `SearchGuidesQuery`
      Approach: Return empty array for blank query, delegate to `GuideSearchPort`, apply topic filter and limit
      (Req: guide:search-guides - SearchGuidesQuery Implementation)

## 3. Guide Bundler & Infrastructure Layer

- [x] 3.1 Implement build-time bundling script
      `packages/guide/scripts/bundle-guides.ts`: Script compiling `docs/guide/*.md`
      Approach: Parse YAML frontmatter (`title`, `description`, `sidebar_position`), scan headings ignoring code fences, calculate 1-indexed `startLine` and `endLine`
      (Req: guide:bundle-guides - Build-Time Compilation Script, Mandatory Frontmatter Validation, Heading and Line Range Extraction)
- [x] 3.2 Emit static catalog artifact
      `packages/guide/src/infrastructure/generated/guides.ts`: Pre-bundled catalog
      Approach: Deterministic generation of `GUIDES_CATALOG` array and `GUIDES_INDEX` lookup map
      (Req: guide:bundle-guides - Static Catalog Artifact Generation)
- [x] 3.3 Implement PrebundledGuideCatalogAdapter
      `packages/guide/src/infrastructure/adapters/prebundled-guide-catalog-adapter.ts`: `PrebundledGuideCatalogAdapter`
      Approach: Implement `GuideCatalogPort` backed by static generated catalog
      (Req: guide:list-guides, guide:get-guide)
- [x] 3.4 Implement MiniSearchGuideEngineAdapter
      `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts`: `MiniSearchGuideEngineAdapter`
      Approach: In-memory `minisearch` instance indexing `GuideSection` items, with boosting (`title: 5`, `heading: 3`, `content: 1`), prefix/fuzzy search, and line-numbered snippet generation with `readCommand`
      (Req: guide:search-guides - In-Memory Search Engine Adapter, Contextual Snippet and Read Command Generation)

## 4. Guide Composition Facade & Entry Points

- [x] 4.1 Implement GuideEngine facade and factory
      `packages/guide/src/composition/guide-engine.ts`: `GuideEngine`, `createGuideEngine()`
      Approach: Wire `PrebundledGuideCatalogAdapter`, `MiniSearchGuideEngineAdapter`, and all queries into a single facade
      (Req: guide:composition - GuideEngine Facade Interface, createGuideEngine Factory Function)
- [x] 4.2 Define public package exports
      `packages/guide/src/index.ts`, `packages/guide/src/public.ts`: Public API
      Approach: Export `createGuideEngine`, error classes, domain types, and options
      (Req: guide:composition - Public API Export Surface, guide:conventions - Hexagonal Architecture and Layer Separation)

## 5. Guide Automated Tests

- [x] 5.1 Unit test domain entities and error classes
      `packages/guide/test/unit/domain/errors.test.ts`, `packages/guide/test/unit/domain/models.test.ts`
      Approach: Test inheritance, error codes, duck typing, UTF-8 byte counting, and line counting
      (Req: guide:errors, guide:guide-model)
- [x] 5.2 Unit test application queries and slicing
      `packages/guide/test/unit/application/queries.test.ts`, `packages/guide/test/unit/application/slicing.test.ts`
      Approach: Test `ListGuidesQuery`, `GetGuideQuery`, slug section matching, line padding, and edge cases (startLine <= 0, lineCount 0, out of bounds)
      (Req: guide:list-guides, guide:get-guide, guide:slice-guide-content)
- [x] 5.3 Unit test bundle script and search adapter
      `packages/guide/test/unit/infrastructure/bundle.test.ts`, `packages/guide/test/unit/infrastructure/search.test.ts`
      Approach: Test frontmatter validation, code block comment exclusion, fuzzy search, stop words, and snippet extraction
      (Req: guide:bundle-guides, guide:search-guides)
- [x] 5.4 Integration test composition root
      `packages/guide/test/integration/guide-engine.test.ts`
      Approach: Instantiate `createGuideEngine()` and execute listing, reading, outline extraction, and search end-to-end
      (Req: guide:composition)

## 6. Documentation Suite Audit & User Guides (`docs/guide/`)

- [x] 6.1 Audit, standardize frontmatter, and update core user guides
      `docs/guide/getting-started.md`, `docs/guide/configuration.md`, `docs/guide/workflow.md`, `docs/guide/workspaces.md`: User guides
      Approach: Add Docusaurus frontmatter (`title`, `description`, `sidebar_position`), align config cascade rules, verify accuracy
      (Req: default:\_global/docs - User guide documentation and frontmatter)
- [x] 6.2 Decouple schema documentation into three distinct guides
      `docs/guide/schemas.md`, `docs/guide/standard-schema.md`, `docs/guide/custom-schemas.md`: Schema guides
      Approach: Author conceptual overview, standard schema specification guide, and custom schemas guide (`fork`, `extend`, `schemaPlugins`)
      (Req: default:\_global/docs - User guide documentation and frontmatter)
- [x] 6.3 Relocate deltas guide and author code-graph guide
      `docs/guide/deltas.md`, `docs/guide/code-graph.md`, `docs/guide/selectors.md`, `docs/guide/templates.md`: User guides
      Approach: Move delta authoring from `docs/schemas/examples/delta-files.md` to `docs/guide/deltas.md`, write comprehensive `code-graph.md` user guide
      (Req: default:\_global/docs - User guide documentation and frontmatter)
- [x] 6.4 Relocate developer-internal documentation
      `docs/guide/skills-template-rendering.md` -> `docs/skills/skills-template-rendering.md`
      Approach: Move internal template rendering documentation out of user-facing `docs/guide/`
      (Req: default:\_global/docs - User guide documentation and frontmatter)
- [x] 6.5 Author consolidated CLI user guide
      `docs/guide/cli.md`: CLI guide for `specd guide cli`
      Approach: Provide copy-pasteable examples, parameter explanations, and practical recipes for all CLI workflows
      (Req: default:\_global/docs - CLI documentation)

## 7. Complete CLI Documentation Audit & Creation (`docs/cli/`)

- [x] 7.1 Author CLI reference index
      `docs/cli/index.md`: Index of all CLI commands
      Approach: Create full CLI command catalog and overview
      (Req: default:\_global/docs - CLI documentation)
- [x] 7.2 Audit and author missing CLI command reference docs
      `docs/cli/guide.md`, `docs/cli/changes.md`, `docs/cli/drafts.md`, `docs/cli/discarded.md`, `docs/cli/archive.md`, `docs/cli/schema.md`, `docs/cli/graph.md`, etc.
      Approach: Ensure 100% command coverage with purpose, flags, examples, and exit codes
      (Req: default:\_global/docs - CLI documentation)

## 8. Monorepo Documentation Audit & Cascade Alignment

- [x] 8.1 Reconcile configuration cascade documentation
      `docs/config/config-reference.md`: Configuration reference
      Approach: Fix contradiction regarding `specd.local.yaml`, accurately document deep-merge cascade layering
      (Req: default:\_global/docs - Documentation stays aligned with removed/renamed template variables and list/summary contracts)
- [x] 8.2 Audit remaining documentation in docs/core, docs/sdk, docs/code-graph, docs/adr
      `docs/core/`, `docs/sdk/`, `docs/code-graph/`, `docs/adr/`: Documentation audit
      Approach: Fix stale contracts, broken links, and terminology drift across all remaining files
      (Req: default:\_global/docs - Directory structure)

## 9. CLI Delivery Adapter (`packages/cli`)

- [x] 9.1 Add `@specd/guide` dependency to `@specd/cli`
      `packages/cli/package.json`: Add `"@specd/guide": "workspace:*"`
      Approach: Link guide package into CLI workspace
      (Req: cli:guide - Commander CLI Integration)
- [x] 9.2 Implement CLI guide command formatters
      `packages/cli/src/commands/guide/formatters.ts`: Formatter functions
      Approach: Format catalog, outline, section, and search hits for `text`, `markdown`, `json`, and `toon`
      (Req: cli:guide - Structured Output Formatting)
- [x] 9.3 Implement CLI guide command action handler
      `packages/cli/src/commands/guide/index.ts`: Commander command setup
      Approach: Handle `specd guide [topic]` with `--meta`, `--section`, `--start-line`, `--lines`, `--line-numbers` and `search <query>` with `--topic`, `--limit`, `--snippet-lines`. Map domain errors to exit code 1
      (Req: cli:guide - Guide Catalog Listing Command, Guide Topic Inspection Command, Document Metadata and Outline Flags, Section and Window Slicing Flags, Guide Search Subcommand)
- [x] 9.4 Register guide command in CLI entrypoint
      `packages/cli/src/index.ts`: Program registration
      Approach: Call `registerGuideCommand(program)` in CLI entrypoint
      (Req: cli:guide - Commander CLI Integration)
- [x] 9.5 CLI unit and integration tests
      `packages/cli/test/commands/guide/guide.test.ts`
      Approach: Test `specd guide`, `specd guide <topic>`, `--meta`, `--section`, `--lines`, `search`, and error exits
      (Req: cli:guide)

## 10. Agent Instructions Integration (`packages/skills`)

- [x] 10.1 Update agent instruction Handlebars template
      `packages/skills/templates/prompt/agent-instruction.md.tpl`: Agent instruction template
      Approach: Add `## On-Demand Documentation Protocol` instructing agents to consult `specd guide [topic]`, `--meta`, `--section`, and `search` using `--format toon`
      (Req: skills:agent-instruction-template - Shared Base Instruction Template)
- [x] 10.2 Update shared skill instructions
      `packages/skills/templates/prompt/shared.md.tpl` or `.specd/config/skills/shared/shared.md`: Shared skill instructions
      Approach: Add guidance for skills to consult `specd guide` on-demand
      (Req: skills:agent-instruction-template)
- [x] 10.3 Test agent instruction rendering
      `packages/skills/test/agent-instruction-template.test.ts`: Test renderBaseAgentInstruction
      Approach: Assert rendered output contains the `specd guide` on-demand protocol and `--format toon` examples
      (Req: skills:agent-instruction-template)

## 11. Public Web & Docusaurus Verification

- [x] 11.1 Update Docusaurus sidebar configuration
      `apps/public-web/sidebars.ts`: Sidebar layout
      Approach: Index reorganized user guides and complete `docs/cli/` catalog in Docusaurus sidebars
      (Req: default:\_global/docs - User guide documentation and frontmatter)
- [x] 11.2 Verify Docusaurus build
      Run `pnpm --filter public-web build`
      Approach: Ensure build passes with 0 broken links and 0 errors
      (Req: default:\_global/docs - User guide documentation and frontmatter)

## 12. CLI Entrypoint & Responsive Layout (cli:entrypoint)

- [x] 12.1 Implement responsive terminal-width table calculation
      `packages/cli/src/helpers/table.ts`: `fitColumnsToTerminal` function
      Approach: Calculate available width, reduce rightmost columns first down to 10-char minimum, cascading leftward, and truncate cell content with ellipsis
      (Req: cli:entrypoint - Responsive Terminal Table Layout)
- [x] 12.2 Decouple Commander CLI factory for introspection and testing
      `packages/cli/src/program.ts`, `packages/cli/src/index.ts`: `createProgram` factory
      Approach: Extract command registration into pure factory function returning configured `Command` instance without side-effect execution
      (Req: cli:entrypoint - Decoupled Commander Factory)
- [x] 12.3 Automated dynamic documentation coverage test
      `packages/cli/test/documentation-coverage.spec.ts`: Dynamic test suite
      Approach: Introspect Commander commands dynamically and verify all commands and subcommands are documented in `docs/cli/` and `docs/guide/cli.md`
      (Req: cli:entrypoint - Dynamic Documentation Coverage Verification)
- [x] 12.4 Unit test responsive table layout
      `packages/cli/test/helpers/table.spec.ts`: Unit tests
      Approach: Test `fitColumnsToTerminal` under unconstrained, moderate reduction, multi-column cascade, 10-char floor, and narrow terminal scenarios
      (Req: cli:entrypoint - Responsive Terminal Table Layout)
