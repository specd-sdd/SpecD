# Guide Package Conventions

## Purpose

`@specd/guide` provides a standalone documentation engine that delivers pre-bundled guides, section outline extraction, line-window slicing, and in-memory search for CLI, MCP, and programmatic hosts. To ensure maintainability, testability, and uniformity across the monorepo, this spec establishes the structural layout, hexagonal architecture boundaries, error hierarchy, root project deliverables (including package configuration and README), and the strict zero-runtime core dependency rule.

## Requirements

### Requirement: Hexagonal Architecture and Layer Separation

`@specd/guide` MUST strictly adhere to hexagonal architecture:

- `domain/`: Contains enterprise business logic, entities, value objects, domain errors, and domain services. Must NOT import from `application/`, `infrastructure/`, or `composition/`.
- `application/`: Contains use-case interactors, queries, and driven ports (interfaces). Depends only on `domain/`. Must NOT import from `infrastructure/` or `composition/`.
- `infrastructure/`: Contains driven adapters implementing application ports (e.g. static pre-bundled catalog storage, in-memory BM25 search engine with `minisearch`). Depends on `domain/` and `application/`.
- `composition/`: Contains dependency injection factories, composition root, and the unified engine facade (`createGuideEngine()`).
- `src/public.ts` is the curated root barrel for the package `.` export. It MUST expose only the facade, supported domain types, options, errors, and host utilities; it MUST NOT leak adapters, bundle assets, or the SDK catalog factory.
- `src/index.ts` is the broader internal barrel for the `./internal` export. It MAY re-export application and infrastructure implementation symbols for controlled internal use, but MUST NOT expose the SDK catalog factory or generated SDK catalog.

### Requirement: Standalone Zero Core Dependency

`@specd/guide` MUST NOT declare any runtime dependency on `@specd/core`, `@specd/cli`, or `@specd/mcp`.

- The package MUST be self-contained and run in lightweight environments (such as CI runners, client CLI binaries, or MCP server processes) without pulling in the SpecD kernel, AST parsers, delta engines, or schema validators.
- Markdown frontmatter and heading parsing for guide bundling MUST occur strictly at build time, preventing runtime AST parsing overhead.
- Runtime lookup MAY load the package's pre-bundled JSON catalog assets, but MUST NOT read documentation source roots or parse Markdown, frontmatter, or TypeDoc output at runtime.
- Every runtime JSON catalog asset MUST be included in the published package alongside the entry points that load it.

### Requirement: Error Handling Architecture

The package MUST define its error hierarchy under `domain/errors/` as specified in `guide:errors`:

- All package domain errors MUST extend a package-level base class `SpecdGuideError` that implements the SpecD Error Contract (`specd = true`, `code: string`) without importing from `@specd/core`.
- Concrete errors for missing topics (`GuideTopicNotFoundError`) and missing sections (`GuideSectionNotFoundError`) MUST be thrown by application queries and handled gracefully by delivery adapters.

### Requirement: Package Deliverables and Configuration

The package root (`packages/guide/`) MUST provide the complete standard configuration and assets expected of all monorepo packages:

- `package.json`: Configured with package name `@specd/guide`, type `module`, scripts (`build`, `test`, `lint`), and clean dependency declarations.
- The package MUST declare its entry points through the `exports` field. The package MUST NOT be required to declare `main` or `types`, and MUST NOT declare those fields as its delivery mechanism.
- The `exports` field MUST declare the main entry (`.`), the internal escape hatch (`./internal`), and the SDK collection entry (`./sdk`).
- The `build` and `build:dev` scripts MUST run the catalog bundler before the bundler's output is consumed.
- Build-time documentation tooling MUST be declared as a `devDependency` and MUST NOT become a runtime dependency.
- `tsconfig.json`: TypeScript configuration matching monorepo compiler settings.
- `vitest.config.ts`: Vitest test configuration.
- `test/`: Comprehensive unit and integration test suite covering domain models, queries, adapters, and composition facade.

### Requirement: Package README

The package root MUST include a detailed, high-quality `README.md` (`packages/guide/README.md`) that documents:

- Package overview, motivation, and the zero-runtime-core-dependency design.
- Architectural diagram illustrating the hexagonal layers (`domain/`, `application/`, `infrastructure/`, `composition/`).
- Catalog of pre-bundled guide topics.
- Quick start usage guide showing how to initialize `createGuideEngine()` and invoke queries.
- Data schema reference for domain models (`GuideTopic`, `GuideSection`, `GuideOutline`, `GuideSearchHit`, `GuideSummary`).
- The SDK collection entry point and how to reach it.

The documented topic catalog MUST stay in parity with the topics actually present in the generated user collection. Every topic named in the README MUST exist in the catalog, and every topic in the catalog MUST be documented. A README that names a topic that is absent from the catalog, or omits a topic that is present, MUST be treated as a documentation defect requiring correction in the same change.

## Constraints

- Zero runtime dependencies on `@specd/core`.
- Monorepo package conventions must be observed across all directories and files.
- All line numbers across the package MUST be 1-indexed.

## Spec Dependencies

_none — this is a global constraint spec_
