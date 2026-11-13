# Verification: Guide Package Conventions

## Requirements

### Requirement: Hexagonal Architecture and Layer Separation

#### Scenario: Layer imports remain one-directional

- **WHEN** source imports are statically checked
- **THEN** domain and application layers MUST respect their declared dependency boundaries
- **AND** infrastructure adapters MUST implement the application ports

#### Scenario: Curated public barrel remains a clean package boundary

- **WHEN** the package `.` export is inspected
- **THEN** it MUST expose only the documented facade, domain values, options, errors, and host utilities
- **AND** it MUST NOT leak adapters, bundle assets, driven ports, or the SDK factory

#### Scenario: Internal barrel is explicitly scoped to the internal subpath

- **WHEN** the package export map is inspected
- **THEN** `src/index.ts` MUST be reachable only through `./internal`
- **AND** it MAY expose application and infrastructure symbols
- **AND** it MUST NOT export the SDK factory or generated SDK catalog

### Requirement: Standalone Zero Core Dependency

#### Scenario: package.json has zero dependencies on specd packages

- **GIVEN** `packages/guide/package.json`
- **WHEN** inspecting `dependencies` and `peerDependencies`
- **THEN** neither `@specd/core`, `@specd/cli`, nor `@specd/mcp` is present
- **AND** only runtime dependencies strictly required (such as `minisearch`) are declared

#### Scenario: Runtime lookup uses only published pre-bundled JSON assets

- **GIVEN** an installed package with its generated JSON catalog assets
- **WHEN** an engine resolves a guide at runtime
- **THEN** it MAY load its packaged JSON asset
- **AND** it MUST NOT read a documentation source root
- **AND** it MUST NOT parse Markdown, frontmatter, TypeDoc output, or a core delta engine

#### Scenario: Bundler execution happens strictly at build time

- **GIVEN** `pnpm build` is executed in `packages/guide`
- **WHEN** the build script compiles static catalog artifacts
- **THEN** Markdown heading parsing and frontmatter extraction occur during build
- **AND** the resulting JSON assets are included in the published package

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

#### Scenario: Package manifest declares the standard scripts and type

- **WHEN** the package manifest is inspected
- **THEN** it MUST declare name `@specd/guide`, type `module`, and `build`, `test` and `lint` scripts

#### Scenario: Entry points are declared through exports, not main or types

- **WHEN** the package manifest is inspected
- **THEN** entry points MUST be declared through the `exports` field
- **AND** the manifest MUST NOT be required to declare `main` or `types`
- **AND** the manifest MUST NOT declare `main` or `types` as its delivery mechanism

#### Scenario: All three subpaths are declared

- **WHEN** the package manifest is inspected
- **THEN** `exports` MUST declare the main entry, the `./internal` escape hatch, and the `./sdk` SDK collection entry
- **AND** each MUST resolve to an importable file and a matching types file

#### Scenario: Build runs the bundler before consuming its output

- **WHEN** the `build` and `build:dev` scripts are inspected
- **THEN** each MUST run the catalog bundler before the compilation step that consumes the generated catalogs

#### Scenario: Build-time tooling is a dev dependency only

- **WHEN** the package manifest is inspected
- **THEN** the build-time documentation tooling MUST be declared under `devDependencies`
- **AND** it MUST NOT appear under `dependencies`

### Requirement: Package README

#### Scenario: README documents the package overview and architecture

- **WHEN** the package README is inspected
- **THEN** it MUST document the package overview, motivation, and the zero-runtime-core-dependency design
- **AND** it MUST illustrate the hexagonal layers
- **AND** it MUST document the SDK collection entry point and how to reach it

#### Scenario: README documents the domain data schema

- **WHEN** the package README is inspected
- **THEN** it MUST document `GuideTopic`, `GuideSection`, `GuideOutline`, `GuideSearchHit` and `GuideSummary`

#### Scenario: README topic catalog stays in parity with the generated catalog

- **GIVEN** the generated user catalog
- **WHEN** the README's documented topic list is compared against the catalog's topics
- **THEN** every topic named in the README MUST exist in the catalog
- **AND** every topic in the catalog MUST be documented in the README
- **AND** any mismatch MUST be reported as a documentation defect
