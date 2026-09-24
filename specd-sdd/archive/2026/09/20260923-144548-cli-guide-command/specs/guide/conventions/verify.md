# Verification: Guide Package Conventions

## Requirements

### Requirement: Hexagonal Architecture and Layer Separation

#### Scenario: Domain layer imports from application or infrastructure are rejected

- **GIVEN** source files in `packages/guide/src/domain/`
- **WHEN** source code is statically checked for module imports
- **THEN** no domain file imports from `packages/guide/src/application/`, `packages/guide/src/infrastructure/`, or `packages/guide/src/composition/`
- **AND** all domain types and errors remain pure and self-contained

#### Scenario: Application layer imports from infrastructure or composition are rejected

- **GIVEN** source files in `packages/guide/src/application/`
- **WHEN** source code is statically checked for module imports
- **THEN** no application file imports from `packages/guide/src/infrastructure/` or `packages/guide/src/composition/`
- **AND** the application layer interacts with storage and search purely through driven ports

#### Scenario: Infrastructure layer implements driven ports

- **GIVEN** adapter implementations in `packages/guide/src/infrastructure/`
- **WHEN** TypeScript compilation is executed
- **THEN** `PrebundledGuideCatalogAdapter` implements `GuideCatalogPort`
- **AND** `MiniSearchGuideEngineAdapter` implements `GuideSearchPort`

#### Scenario: Public entry points expose clean boundaries

- **GIVEN** consumers importing from `@specd/guide`
- **WHEN** inspecting exported symbols from `index.ts` and `public.ts`
- **THEN** only the facade `createGuideEngine`, `GuideEngine` interface, domain models, options, and error classes are re-exported
- **AND** internal adapter mechanics and raw bundle files are not directly leaked

### Requirement: Standalone Zero Core Dependency

#### Scenario: package.json has zero dependencies on specd packages

- **GIVEN** `packages/guide/package.json`
- **WHEN** inspecting `dependencies` and `peerDependencies`
- **THEN** neither `@specd/core`, `@specd/cli`, nor `@specd/mcp` is present
- **AND** only runtime dependencies strictly required (such as `minisearch`) are declared

#### Scenario: AST parsers and core delta engines are not pulled at runtime

- **GIVEN** runtime execution of `@specd/guide`
- **WHEN** tracing loaded modules in Node.js
- **THEN** no MarkdownParser, AST sectionizer, or delta merge modules from `@specd/core` are loaded into memory

#### Scenario: Bundler execution happens strictly at build time

- **GIVEN** `pnpm build` is executed in `packages/guide`
- **WHEN** the build script compiles static catalog artifacts
- **THEN** Markdown heading parsing and frontmatter extraction occur during build
- **AND** runtime lookup executes without filesystem access or parsing latency

### Requirement: Error Handling Architecture

#### Scenario: Domain errors extend SpecdGuideError

- **GIVEN** any domain error instantiated in `@specd/guide`
- **WHEN** inspecting its prototype chain
- **THEN** it inherits from `SpecdGuideError`
- **AND** it satisfies `error instanceof SpecdGuideError`

#### Scenario: Domain errors conform to SpecD Error Contract

- **GIVEN** an error thrown by `@specd/guide`
- **WHEN** inspected by a consumer or CLI error formatter
- **THEN** `error.specd` equals `true`
- **AND** `error.code` is a non-empty string in `UPPER_SNAKE_CASE`
- **AND** `error.message` contains a human-readable explanation

#### Scenario: Error classes do not inherit from @specd/core SpecdError

- **GIVEN** `SpecdGuideError`
- **WHEN** checking module dependencies of `domain/errors/`
- **THEN** `SpecdGuideError` inherits directly from native JavaScript `Error`
- **AND** it does not import from `@specd/core`

### Requirement: Package Deliverables and Configuration

#### Scenario: Valid package.json manifest

- **GIVEN** `packages/guide/package.json`
- **WHEN** parsed as JSON
- **THEN** `name` equals `@specd/guide`
- **AND** `type` equals `module`
- **AND** `main`, `types`, and `exports` correctly target `dist/`

#### Scenario: Full build, test, and lint scripts succeed

- **GIVEN** `packages/guide`
- **WHEN** running `pnpm build`, `pnpm test`, and `pnpm lint`
- **THEN** all three scripts exit with code 0 without errors or unhandled rejections

### Requirement: Package README

#### Scenario: README covers package architecture, catalog, and quick start

- **GIVEN** `packages/guide/README.md`
- **WHEN** the document is reviewed
- **THEN** it contains a description of the zero-runtime-core-dependency architecture
- **AND** it contains an ASCII or Mermaid architecture diagram of the hexagonal layers
- **AND** it lists the pre-bundled guide catalog topics
- **AND** it includes code examples for `createGuideEngine()` instantiation and search usage
