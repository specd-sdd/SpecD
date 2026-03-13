---
status: accepted
date: 2026-03-13
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0016: Schema Construction Boundary — Separated Parsing and Domain Validation

## Context and Problem Statement

`FsSchemaRegistry` was a single 757-line class that handled three distinct concerns: YAML parsing with Zod validation, pure domain construction (building `Schema`, `ArtifactType`, `Selector`, etc.), and filesystem I/O (path resolution, template loading). This meant that any new `SchemaRegistry` adapter (in-memory for tests, remote for a future SaaS mode) would have to duplicate the parsing and construction logic or import from a filesystem-specific module.

Additionally, the domain builders (`buildSelector`, `buildValidationRule`, `buildMetadataExtraction`, etc.) lived inside an infrastructure file despite having zero infrastructure dependencies — they only operate on plain objects and domain types. This violated the architecture constraint that domain code must not reside in infrastructure.

## Decision Drivers

- Domain purity: builders that convert raw shapes to domain value objects have no I/O dependency and belong in `domain/services/`
- Adapter independence: YAML parsing and Zod validation are infrastructure concerns (they depend on `yaml` and `zod` libraries) but are not adapter-specific — any registry adapter should share the same structural validation
- Testability: a pure synchronous `buildSchema` function is trivially unit-testable without filesystem fixtures
- The hexagonal architecture constraint (ADR-0001) requires that domain code never imports from infrastructure

## Considered Options

- Keep everything in `FsSchemaRegistry` — single file, single class
- Extract only domain builders to `domain/services/`, leave Zod schemas in the adapter
- Three-layer split: shared infrastructure parsing, pure domain service, adapter-only I/O

## Decision Outcome

Chosen option: "Three-layer split", because it fully separates the three concerns and makes each independently testable and reusable.

The schema loading pipeline is split into three layers with a typed intermediate boundary:

**Layer 1 — Infrastructure parsing** (`infrastructure/schema-yaml-parser.ts`): `parseSchemaYaml(ref, yamlContent)` parses raw YAML and validates against a Zod schema. Returns a `SchemaYamlData` intermediate type — a plain object with `| undefined` on optional fields. This layer performs structural validation only (required fields, type checks, refinement rules). It depends on `yaml` and `zod` but not on `fs` or any adapter. Any `SchemaRegistry` implementation can import it.

**Layer 2 — Domain service** (`domain/services/build-schema.ts`): `buildSchema(ref, data, templates)` is a pure synchronous function that receives the validated intermediate data and a pre-loaded template map. It performs semantic validation (duplicate IDs, ID format, dependency graph cycles, optional-requires-optional) and constructs the `Schema` entity with all its nested domain value objects. Zero I/O, zero infrastructure imports.

**Layer 3 — Adapter I/O** (`infrastructure/fs/schema-registry.ts`): `FsSchemaRegistry` handles path resolution, file reading, template loading, and orchestrates calls to layers 1 and 2. Reduced from 757 to ~230 lines.

The `SchemaYamlData` type is the explicit contract between layers 1 and 2. It is defined in the domain service as a plain TypeScript interface (not Zod-inferred) so that `buildSchema` has no infrastructure dependency.

### Consequences

- Good, because `buildSchema` is a pure function testable with plain objects — no filesystem fixtures needed
- Good, because `parseSchemaYaml` can be reused by any future `SchemaRegistry` adapter (in-memory, remote)
- Good, because `buildSelector` and other domain builders now live in `domain/services/` where they belong
- Good, because `FsSchemaRegistry` is reduced to I/O orchestration — easy to read and maintain
- Neutral, because the intermediate `SchemaYamlData` type adds an explicit boundary that must be kept in sync with the Zod schema — but this is intentional coupling that makes the contract visible

### Confirmation

- `domain/services/build-schema.ts` has zero imports from `infrastructure/` or `application/`
- `infrastructure/schema-yaml-parser.ts` has zero imports from `infrastructure/fs/`
- `infrastructure/fs/schema-registry.ts` imports from both `schema-yaml-parser` and `build-schema` but contains no Zod schemas or domain builders
- All 934 existing tests pass without modification after the split

## More Information

### Spec

- [`specs/core/build-schema/spec.md`](../../specs/core/build-schema/spec.md)
- [`specs/core/parse-schema-yaml/spec.md`](../../specs/core/parse-schema-yaml/spec.md)
- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
