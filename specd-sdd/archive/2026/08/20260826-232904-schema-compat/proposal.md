# Proposal: schema-compat

## Motivation

When creating and executing changes under custom or lightweight change workflow schemas (such as a fast-track or hotfix ceremony), the schema identity recorded in `spec-lock.json` upon archiving currently defaults to the change's specific schema name and version. This creates fragmentation and divergence across specs in the workspace even when their canonical specification format (`spec.md` and `verify.md`) adheres to the standard schema contract.

We need a declarative `compat` field on schemas and a unified 3-tier fallback hierarchy so that custom workflow schemas can declare compatibility with a canonical spec schema (e.g. `@specd/schema-std@1`), ensuring durable spec uniformity across the repository.

## Current behaviour

Today, `Schema.name()` and `Schema.version()` represent both the change workflow ceremony and the identity stamped into `spec-lock.json` during change archiving and spec state initialization. If a team creates a custom schema `hotfix` that produces standard `spec.md` and `verify.md` files, archiving a change stamped `"schema": { "name": "hotfix", "version": 1 }` into `spec-lock.json`, breaking canonical spec identity and tooling consistency.

## Proposed solution

1. **Declarative `compat` in `schema.yaml`**: Allow schemas to declare an optional `compat` field as a string (e.g. `@specd/schema-std@1` or `schema-std@1`) or as an object `{ name: string, version?: number }`. Schema plugins (`kind: schema-plugin`) are restricted and must not declare `compat`.
2. **3-Tier Resolution Hierarchy**: Define `Schema.canonicalSpecSchema()` with deterministic fallback:
   - Level 1: `this._compat` (if explicitly declared on the schema).
   - Level 2: `parseSchemaCompat(this._extends)` (if extending a parent schema).
   - Level 3: `{ name: this._name, version: this._version }` (fallback to self).
3. **Schema Merge & Extends Cascade**: Support `set.compat` and `remove.compat` in `mergeSchemaLayers`, and cascade `compat` across multi-level `extends` chains in `resolveExtendsChain`.
4. **Durable Spec State Persistence**: Use `canonicalSpecSchema()` when writing `spec-lock.json` during change archive (`ArchiveChange`), state initialization (`InitializePersistedSpecState`), and fallback metadata generation (`GenerateSpecMetadata`).

## Specs affected

### New specs

None.

### Modified specs

- `core:schema-format`: Adds the optional `compat` field to `schema.yaml`, validates format with Zod, and disallows `compat` on `kind: schema-plugin`.
  - Depends on (added): none
  - Depends on (removed): none

- `core:schema-merge`: Supports `set.compat` and `remove.compat` merge operations in `mergeSchemaLayers`.
  - Depends on (added): none
  - Depends on (removed): none

- `core:resolve-schema`: Cascades `compat` across parent and child schemas in `resolveExtendsChain`.
  - Depends on (added): none
  - Depends on (removed): none

- `core:archive-change`: Resolves `publicationPersistedSchema` from `schema.canonicalSpecSchema()` when writing `spec-lock.json`.
  - Depends on (added): none
  - Depends on (removed): none

- `core:initialize-persisted-spec-state`: Uses `schema.canonicalSpecSchema()` when creating initial `spec-lock.json` for unversioned specs.
  - Depends on (added): none
  - Depends on (removed): none

- `core:generate-metadata`: Uses `schema.canonicalSpecSchema()` when generating fallback metadata identity.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:schema-show`: Exposes `compat` identity in `specd schema show` text and JSON output formats.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Affected packages**: `@specd/core`, `@specd/cli`.
- **Domain models**: `Schema` value object gains `compat(): SchemaCompatIdentity | undefined` and `canonicalSpecSchema(): SchemaCompatIdentity`.
- **Infrastructure & CLI**: `schema-yaml-parser` parses and validates `compat` via Zod; CLI `schema show` displays declared `compat`.
- **Persistence**: `spec-lock.json` consistently receives canonical spec identities.

## Technical context

- **Fallback Hierarchy**: The agreed precedence is `compat` → `extends` → `name@version`.
- **Cascade Semantics**: If child Schema C extends Schema B (which declares `compat: @specd/rfc-std@2`), Schema C inherits B's `compat` unless C explicitly overrides it.
- **Backwards Compatibility**: Fully preserved; schemas without `compat` or `extends` maintain their existing behavior.

## Open questions

None.
