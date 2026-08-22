# Partial Global Conformance Report

- **Audit mode:** change
- **Change:** `nonblocking-sqlite-graph-store` (specs `code-graph:sqlite-graph-store`, `code-graph:composition`)
- **Scope:** project-wide / GLOBAL conformance of change specs and their implementation in `packages/code-graph/`
- **Date:** 2026-08-19
- **Read-only audit:** no code or spec files were modified.

---

## 1. Global spec conformance of the change specs

The two change spec artifacts (merged content via `changes spec-preview`, deltas under
`specd-sdd/changes/20260818-162313-nonblocking-sqlite-graph-store/deltas/code-graph/`) were
checked against each `default:_global/*` spec.

### default:\_global/spec-layout — PASS

- Both specs have paired `spec.md` + `verify.md` (deltas exist for all four files; on-disk
  `specs/code-graph/sqlite-graph-store/{spec,verify}.md` and
  `specs/code-graph/composition/{spec,verify}.md` are present).
- `spec.md` contains **no** `#### Scenario:` headings; all scenarios live in `verify.md`
  (verified by grep: 0 scenario headings in both `spec.md` files; 50+ in the `verify.md` files).
- `verify.md` contains no requirement prose; scenarios are grouped under `### Requirement:`
  headings using the same names as `spec.md` (14/14 requirement pairs for
  sqlite-graph-store, 9/9 for composition) — required for AST delta selectors.
- `## Spec Dependencies` present in both `spec.md` files:
  - sqlite-graph-store: `code-graph:graph-store`, `core:config`, `code-graph:symbol-model`,
    `code-graph:workspace-integration` — canonical labels, correctly linked.
  - composition: 10 entries incl. `default:_global/architecture` and the host use-case specs.
- Observation (non-blocking): sqlite-graph-store `verify.md` is large (~50 scenarios) and a
  number of scenarios largely restate the requirement prose (e.g. "Graph and tmp directories
  are derived from configPath"). The layout spec advises omitting scenarios that merely
  restate the obvious happy path. Not a hard failure.

### default:\_global/architecture — PASS (spec content)

- sqlite-graph-store positions `SQLiteGraphStore` explicitly as an infrastructure adapter and
  mandates "Storage-agnostic consumers MUST depend on `code-graph:graph-store`" — consistent
  with port/adapter isolation.
- composition mandates registry-driven backend selection, a type-only `CodeGraphProvider`
  interface, factory-only construction, synchronous factory with async `open()`, and that the
  concrete implementation class, `GraphStore`, and `IndexCodeGraph` stay internal — all
  consistent with the "Curated public package entry points" requirement.

### default:\_global/conventions / error-handling-conventions — PASS (spec content)

- The specs prescribe only typed errors (`StoreOverloadError`, `StoreWorkerError`,
  `StoreNotOpenError`, `SpecNotFoundError`) and reference the abstract `GraphStore` contract;
  no generic-`Error` prescriptions appear in the spec prose.

### default:\_global/eslint / logging — PASS (spec content)

- N/A for prose; nothing in the specs conflicts with the lint rules or the logging policy.

### default:\_global/testing — PASS (spec content)

- Scenarios are behavioral and testable (FIFO, backpressure, drain timeout, FTS ranking
  ladder, schema rebuild); no snapshot or Jest mandates.

### default:\_global/docs — WARN

- Neither spec has an `## ADRs` section. The spec-layout spec permits omission only when no
  ADR exists. This change adopts a significant architectural decision — a dedicated
  persistent `node:worker_threads` backend for the default SQLite graph store (replacing
  Ladybug as the default backend id), with a strongly-typed IPC protocol, backpressure,
  drain/deadline lifecycle, and a schema-version-9 reference schema. Per
  `default:_global/docs` ("ADR creation ... affects multiple packages, constrains future
  development, or was a non-obvious choice between real alternatives"), an ADR should be
  created alongside this change. `docs/adr/` contains no ADR referencing sqlite / worker
  threads / non-blocking execution (grep confirmed). **Gap.**

---

## 2. Implementation conformance to global specs

Files inspected: `src/infrastructure/sqlite/*`, `src/composition/*`, `src/public.ts`,
`src/index.ts`, `src/domain/errors/*`, `package.json`, `tsconfig.json`,
`tsconfig.base.json`, `test/infrastructure/sqlite/*`, `test/composition/*`. `tsc --noEmit`,
`eslint .`, and the Vitest suite all run clean (`lint` exit 0; tests pass; the
`run-vitest.sh` wrapper masks a documented `ERR_IPC_CHANNEL_CLOSED` tinypool teardown quirk).

### Architecture — PASS

- Layered `domain/` / `application/` / `infrastructure/` / `composition/` present; grep
  confirms **no** `domain/` or `application/` module imports from `infrastructure/` or
  `composition/`, and `infrastructure/` does not import `composition/`. `composition/`
  imports `infrastructure/` (allowed).
- `GraphStore` port is an `abstract class` (`src/domain/ports/graph-store.ts:117`), matching
  the "ports with shared construction" rule.
- No IoC: factory wiring is manual in `createCodeGraphProvider`
  (`src/composition/create-code-graph-provider.ts`).
- `"."` barrel (`src/public.ts`) exports `CodeGraphProvider` type-only and never exports
  `SQLiteGraphStore`, `LadybugGraphStore`, `AdapterRegistry`, or `IndexCodeGraph`; these are
  available only from `"./internal"` (`src/index.ts:25-31`). `src/public.ts` uses no
  unrestricted `export *` of infrastructure.
- `package.json` `exports`: `"." -> dist/public.js`, `"./internal" -> dist/index.js`.
- Factory is synchronous; native `better-sqlite3` loading is deferred to `open()` inside the
  worker (`loadDatabaseModule`, `sqlite-graph-database.ts:288-295`).
- Default backend id `sqlite` with `ladybug` retained (`create-code-graph-provider.ts:22-35`).

### Conventions — PASS (one minor pre-existing)

- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`;
  package is `"type": "module"` with `NodeNext`.
- Named exports only (no `export default`); kebab-case filenames; no `any`; no
  `@ts-ignore`/`@ts-expect-error`.
- Explicit return types on exported functions/methods.
- Private backing fields use underscore prefix (`_isOpen`, `_storageGeneration` in
  `code-graph-provider.ts:199-200`).
- Minor: `SpecNotFoundError.specIdValue` (`src/domain/errors/spec-not-found-error.ts:7`)
  backs `get specId()` without the leading underscore. Pre-existing, not introduced by this
  change's footprint; low severity.

### Error handling — FAIL (moderate)

- `SpecdCodeGraphError` extends `SpecdError` (`src/domain/errors/specd-code-graph-error.ts:6`);
  codes are `UPPER_SNAKE_CASE` and unique across the package; JSDoc present; `specId`
  metadata round-trips through worker error serialization.
- However, generic `Error` is thrown for **expected failure modes / validation errors**,
  which violates `default:_global/error-handling-conventions` ("All user-facing errors ...
  SHALL follow the Specd Error Contract"; "Domain logic MUST NOT use generic Error for
  expected failure modes or validation errors") and `default:_global/conventions`:
  - `src/infrastructure/sqlite/sqlite-graph-store.ts:880` — `throw new Error('A bulk index
session is already active')`
  - `src/infrastructure/sqlite/sqlite-graph-store.ts:898` — `throw new Error('Bulk index
session is already finished')`
  - `src/infrastructure/sqlite/sqlite-graph-store.ts:912-917` — state-machine rejection
    `throw new Error('Bulk index session is "..." ...')`
  - `src/infrastructure/sqlite/sqlite-worker-client.ts:230` — `throw new Error('Invalid
maxPendingOperations: ...')` (validation error)
  - `src/infrastructure/sqlite/sqlite-graph-database.ts:2239,2263` — schema-incompatibility
    rejection on `open()` (`throw new Error('SQLite graph storage schema ... incompatible ...')`)
  - `src/infrastructure/sqlite/sqlite-worker.ts:116,503,598` — session missing/duplicate and
    unknown-op errors (worker-side; the first two are expected failure modes surfaced to hosts)

### ESLint — FAIL (minor; partially enforced)

- Layer-boundary `no-restricted-imports` and no-`any`/named-exports/kebab rules pass (`eslint .` exit 0).
- JSDoc-on-all-symbols requirement is not fully satisfied:
  - `SQLiteGraphStoreOptions` (a type **exported from the `"."` barrel**) carries an empty
    JSDoc block — `src/infrastructure/sqlite/sqlite-runtime-descriptor.ts:12-14` (`/**\n *\n */`).
  - `WorkerBulkSession` internal interface carries an empty JSDoc block —
    `src/infrastructure/sqlite/sqlite-worker.ts:62-64`.
- Note: `eslint .` passes despite these, indicating the configured JSDoc rules are weaker than
  the spec text (spec requires a description on every symbol).

### Logging — PASS

- No `console.*` usage in `src/` (grep: none). The only `console.log` match is a string
  literal inside a tree-sitter test fixture, not production code.

### Spec layout (implementation side) — PASS

- No scenarios in implementation docs; n/a.

### Testing — PASS with minor violations

- Vitest only (no Jest imports; `test/run-vitest.sh` invokes `vitest`); tests in `test/`
  mirroring `src/`; all files use `.spec.ts`; no snapshot tests (`toMatchSnapshot` /
  `toMatchInlineSnapshot`: none).
- Infrastructure integration tests run against real temp dirs (`mkdtempSync(tmpdir())`) with
  `afterEach` cleanup (`test/composition/code-graph-provider.spec.ts:26-30`,
  `test/infrastructure/sqlite/sqlite-worker-lifecycle.spec.ts`, etc.). Worker lifecycle,
  FIFO, backpressure, drain-timeout, crash-recovery, and session-invalidation scenarios from
  the verify.md are covered by dedicated specs and pass.
- Minor: partial port mocks cast `as unknown as Port` appear in change-scoped tests:
  `test/composition/host-use-case-factories.spec.ts:50` (`as unknown as GetSpecCoverage`),
  `test/application/use-cases/get-change-spec-coverage.spec.ts:28,32,47,50`, and the shared
  helper `test/helpers/make-mock-spec-repository.ts:48` (`as unknown as SpecRepository`).
  `default:_global/testing` requires full interface mocks without `as unknown as`.

### Docs — FAIL (minor-to-moderate)

- Missing ADR for the non-blocking worker-thread SQLite backend decision (see §1 docs WARN).
- Empty JSDoc blocks (see ESLint section) also fall under `default:_global/docs`
  ("JSDoc on all symbols").

---

## 3. Discrepancies — spec drift vs implementation bug

| #   | Discrepancy                                                                                                                                                                    | Evidence                                                                                                                                                                         | Classification                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Generic `Error` for expected failure modes (bulk-session state machine, `maxPendingOperations` validation, schema-incompatibility on `open`, worker session missing/duplicate) | `sqlite-graph-store.ts:880,898,912-917`; `sqlite-worker-client.ts:230`; `sqlite-graph-database.ts:2239,2263`; `sqlite-worker.ts:116,503`                                         | **Implementation bug.** Change specs reference only typed store errors; the global error-handling spec requires the Specd Error Contract for all user-facing errors and forbids generic `Error` for expected failures. |
| 2   | Empty JSDoc on exported `SQLiteGraphStoreOptions` and internal `WorkerBulkSession`                                                                                             | `sqlite-runtime-descriptor.ts:12-14`; `sqlite-worker.ts:62-64`                                                                                                                   | **Implementation bug** (minor). Violates eslint/docs JSDoc requirements; lint config does not enforce it.                                                                                                              |
| 3   | Missing ADR for a significant architectural decision (worker-thread non-blocking default SQLite backend, schema-version-9 reference schema)                                    | `docs/adr/` has no sqlite/worker-thread/non-blocking ADR (grep); neither change spec lists `## ADRs`                                                                             | **Spec drift / incomplete change artifact.** Global docs spec requires an ADR for decisions that constrain future development or were non-obvious alternatives.                                                        |
| 4   | Partial port mocks cast `as unknown as Port` in change-scoped tests                                                                                                            | `test/composition/host-use-case-factories.spec.ts:50`; `test/application/use-cases/get-change-spec-coverage.spec.ts:28,32,47,50`; `test/helpers/make-mock-spec-repository.ts:48` | **Implementation bug** (minor). Violates `default:_global/testing` "Port mocks are typed". Partly pre-existing helper usage.                                                                                           |
| 5   | `SpecNotFoundError.specIdValue` backing field lacks underscore prefix                                                                                                          | `spec-not-found-error.ts:7`                                                                                                                                                      | **Pre-existing**, not change-attributable; low severity. Convention literal text says backing fields must use `_` prefix.                                                                                              |
| 6   | (Observation) sqlite-graph-store `verify.md` scenario volume / near-restatement of requirement prose                                                                           | `specs/code-graph/sqlite-graph-store/verify.md` (~50 scenarios)                                                                                                                  | **Spec drift, cosmetic.** Layout spec advises omitting scenarios that merely restate the happy path; not a hard failure.                                                                                               |

---

## 4. Summary counts

**Specs audited:** 9 global specs + 2 change specs.

**Change-spec conformance (vs global specs):**

- Pass: architecture, conventions, error-handling (spec content), eslint, logging, spec-layout, testing (7)
- Fail / gap: docs (missing ADR) (1)
- Warn/observation: spec-layout verify.md volume (non-blocking)

**Implementation conformance (vs global specs):**

- Pass: architecture, logging, spec-layout (8 of 9 global domains clean)
- Fail: error-handling-conventions (generic `Error`), eslint/docs (empty JSDoc), docs (missing ADR) (3)
- Pass-with-minor-violations: conventions, testing (2)

**Discrepancy classification:**

- Implementation bugs: 3 (generic `Error` — moderate; empty JSDoc — minor; partial mocks — minor)
- Spec drift / incomplete artifacts: 2 (missing ADR — moderate; verify.md volume — cosmetic)
- Pre-existing / not change-attributable: 1 (`specIdValue` naming — low)

**Recommended follow-ups (read-only audit; not performed):**

1. Replace generic `Error` for expected failure modes with typed `SpecdCodeGraphError` subclasses (e.g. a bulk-session-state error and a schema-incompatibility error), and extend `deserializeWorkerError` for round-trips.
2. Add real descriptions to the two empty JSDoc blocks.
3. Create an ADR documenting the non-blocking worker-thread SQLite backend decision (and add `## ADRs` links to both change specs).
4. Replace `as unknown as` partial mocks with full typed port implementations in the flagged tests.
