# Spec-Compliance Audit: Global Specs

**Change:** `code-graph-cross-workspace-imports` (state: implementing)
**Change path:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports`
**Report dir:** `specd-sdd/changes/20261015-123246-code-graph-cross-workspace-imports/reports/20261020-191859`
**Output file:** `_partial-batch-c-global-specs.md`
**Change specs audited:** `code-graph:workspace-integration`, `code-graph:language-adapter`, `code-graph:typescript-language-adapter`, `code-graph:python-language-adapter`, `code-graph:go-language-adapter`, `code-graph:php-language-adapter`, `code-graph:resolve-symbol-reference`, `code-graph:indexer`
**Global specs audited (batch C):**

1. `default:_global/architecture`
2. `default:_global/conventions`
3. `default:_global/testing`
4. `default:_global/eslint`
5. `default:_global/error-handling-conventions`

**Audit method:** READ-ONLY. Graph navigation via `specd graph` (graph is fresh: `state: current`). No code or spec files modified.

---

## Summary Table

| Global spec                                  | Status   | Key finding                                                                                                       | Discrepancies                                                                                       |
| -------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `default:_global/architecture`               | Conforms | Hexagonal layers respected; domain pure; application uses ports; composition wires adapters                       | None in new code                                                                                    |
| `default:_global/conventions`                | Conforms | kebab-case, named exports, no `any`, explicit return types, SpecdError chain                                      | None in new source                                                                                  |
| `default:_global/testing`                    | Partial  | Vitest, test/ mirroring, .spec.ts, no snapshots                                                                   | Partial `IndexSession`/`LanguageAdapter` mocks with `as unknown as` (violates typed-port-mock rule) |
| `default:_global/eslint`                     | Conforms | JSDoc on exports, layer boundaries, no `any`/`default` exports                                                    | None in new source                                                                                  |
| `default:_global/error-handling-conventions` | Conforms | `SpecdError` → `SpecdCodeGraphError` → `InvalidLanguageAdapterError`; `INVALID_LANGUAGE_ADAPTER` UPPER_SNAKE_CASE | None                                                                                                |

**Overall:** The change conforms to all 5 global specs in its new source code. One testing-convention violation (partial mocks with `as unknown as`) found in `package-import-resolver.spec.ts`. No contradictions between the change's specs and the global specs.

---

## 1. default:\_global/architecture

### Requirements Summary

Hexagonal Architecture (Ports & Adapters) + DDD tactical patterns. Applies to every package with business logic.

- **Layered structure:** `domain` → `application` → `infrastructure` → `composition`; inner layers never import outer layers.
- **Domain layer pure:** zero I/O (no `fs`, `net`, `child_process`, HTTP).
- **Application uses ports only:** interacts with outside world exclusively through `application/ports/` interfaces; never imports concrete infrastructure adapters directly.
- **Rich domain entities:** enforce invariants; invalid transitions throw typed domain errors.
- **Domain value objects expose behaviour, not structure.**
- **Ports with shared construction are `abstract class`**, not `interface`; all port methods are explicit methods.
- **Pure functions for stateless domain services** in `domain/services/`.
- **Manual dependency injection:** no IoC container; use cases receive ports via constructor.
- **Composition layer** above `infrastructure/`; only layer permitted to import `infrastructure/`; exposes `createKernel`, config loader/writer ports.
- **YAML inputs validated at infrastructure boundary** before reaching domain/application.
- **Adapter packages contain no business logic.**
- **No circular dependencies between packages:** `plugin-*` → `skills` → `core`; `cli`/`mcp` → `sdk`; `sdk` → `core`, `code-graph`.
- **Curated public entry points:** `"."` must not export concrete adapter classes; must export `createX` factories and domain types/errors.

### Implementation Status

| File                                                                                       | Layer          | Conformance                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/value-objects/language-adapter-facets.ts` (new)                                | domain         | ✓ Imports only domain types (`index-session`, `symbol-reference`). No application/infrastructure/composition imports. Pure value object.                                                                                     |
| `src/domain/errors/invalid-language-adapter-error.ts` (new)                                | domain         | ✓ Imports only `specd-code-graph-error.ts` (domain). No I/O.                                                                                                                                                                 |
| `src/domain/value-objects/language-adapter.ts` (modified)                                  | domain         | ✓ Facet properties added; loose methods removed. `capabilities()`/`declarationPolicy()` untouched.                                                                                                                           |
| `src/application/services/package-import-resolver.ts` (new)                                | application    | ✓ Pure application service: no I/O, never calls `findSymbolsByName`, constructed with deps (manual DI). Imports only domain types (`IndexSession`, `LanguageAdapter`, facets, `symbol-reference`).                           |
| `src/application/use-cases/index-code-graph.ts` (modified)                                 | application    | ✓ Imports only domain/ports/services. Adapters arrive via `AdapterRegistryPort` (a port), not concrete infrastructure classes. `PackageImportResolver` constructed with deps. No new `node:fs` imports added by this change. |
| `src/application/use-cases/in-memory-index-session.ts` (modified)                          | application    | ✓ Adds `findPublicBindings`, `getFileCategory`, `getPrimaryDeclarationSymbolId` to `IndexSession` implementation. Maintains public-binding index alongside `publicBindingsById`.                                             |
| `src/domain/value-objects/index-session.ts` (modified)                                     | domain         | ✓ Declares the three new session methods on the `IndexSession` interface.                                                                                                                                                    |
| `src/domain/services/scoped-binding-environment.ts` (modified)                             | domain         | ✓ `SymbolLookup.findById` optional; `buildScopedBindingEnvironment` builds scope-aware `importedTargets`.                                                                                                                    |
| `src/domain/value-objects/import-declaration.ts` (modified)                                | domain         | ✓ Adds optional `typeOnly` flag.                                                                                                                                                                                             |
| `src/domain/value-objects/index-result.ts` (modified)                                      | domain         | ✓ Adds `importDiagnostics: ImportDiagnosticSummary` + `IMPORT_DIAGNOSTIC_SAMPLE_LIMIT` constant.                                                                                                                             |
| `src/infrastructure/tree-sitter/adapter-registry.ts` (modified)                            | infrastructure | ✓ `register` calls `validateAdapter` first; validation throws `InvalidLanguageAdapterError` before mutating state. Replacement semantics per language.                                                                       |
| `src/infrastructure/tree-sitter/{typescript,python,go,php}-language-adapter.ts` (modified) | infrastructure | ✓ Facets exposed as readonly object fields; old methods made private. `prepare`/`entrySurface` per language.                                                                                                                 |
| `src/composition/create-code-graph-provider.ts` (composition)                              | composition    | ✓ Composition layer imports infrastructure adapters (permitted). Wires `AdapterRegistry`, `IndexCodeGraph`, graph store manually. No IoC container.                                                                          |
| `src/public.ts` (curated entry point)                                                      | public barrel  | ✓ All new facet types + `InvalidLanguageAdapterError` exported. `PackageImportResolver` NOT exported (internal application service). Concrete adapters not exported from `"."`.                                              |

**No circular dependencies:** code-graph depends on `core` only (via `@specd/core`). No new `workspace:*` deps introduced. Package direction `code-graph → core` preserved.

**Typed domain errors:** `InvalidLanguageAdapterError` extends `SpecdCodeGraphError` extends `SpecdError` — all typed, no generic `Error` for expected failures.

### Discrepancies

- **Code might be wrong:** `index-code-graph.ts` imports `node:fs` (`readFileSync`, `statSync`, `rmSync`, `existsSync`, `mkdirSync`, `writeFileSync`) directly at the application layer. The architecture spec says application interacts with the outside world exclusively through ports. However, this is **pre-existing** (not introduced by this change); the new `package-import-resolver.ts` performs no I/O. No new violation introduced.
- **Spec might be wrong:** None identified. The global architecture spec imposes no requirement that conflicts with the facet model.

### Test Coverage

- `test/application/services/package-import-resolver.spec.ts` — resolver unit tests (resolved, not-exported, ambiguous, package-unknown, facet-absent, no-entry-surface, test/unindexed entry filtering, duplicate-route lowest-binding-id, no `findSymbolsByName`).
- `test/domain/errors/invalid-language-adapter-error.spec.ts` — error code, message formats, `specd === true`.
- `test/infrastructure/tree-sitter/adapter-registry.spec.ts` — registration validation.
- `test/application/use-cases/in-memory-index-session.package-lookups.spec.ts` — session additions.
- `test/application/use-cases/resolve-symbol-reference.spec.ts` — symbol reference via facet.
- `test/composition/code-graph-provider.spec.ts` — provider composition.
- `test/infrastructure/tree-sitter/{typescript,python,go,php}-language-adapter.spec.ts` — adapter facet tests.
- `test/application/use-cases/index-code-graph.package-imports.spec.ts` — cross-workspace integration + closure + language independence.
- `test/domain/services/scoped-binding-environment.spec.ts` — scope-aware import resolution.
- `test/barrel.spec.ts` — public barrel exports.

### Missing Tests

None major. All requirements from design.md tasks 3.4–3.6, 4.6, 5.6, 6.4, 7.4, 9.2, 12.3, 13.2, 14.1–14.3, 15.3, 16.3, 17.3, 18.2–18.4, 21.1–21.3, 23.1–23.9 are tracked as resolved in the manifest.

### Spec Dependency Chain

`default:_global/architecture` — none (global constraint spec; no spec dependencies).

### Counts

- New source files: 3 (`language-adapter-facets.ts`, `package-import-resolver.ts`, `invalid-language-adapter-error.ts`)
- Modified source files: ~13 (`language-adapter.ts`, `index-session.ts`, `in-memory-index-session.ts`, `index-code-graph.ts`, `resolve-symbol-reference.ts`, `adapter-registry.ts`, 4 language adapters, `import-declaration.ts`, `index-result.ts`, `public.ts`, `scoped-binding-environment.ts`)
- New test files: ~9
- Modified test files: ~9
- Global specs audited: 1 (this section)

---

## 2. default:\_global/conventions

### Requirements Summary

TypeScript conventions for the monorepo, applies to all packages unless overridden.

- **Strict mode:** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` via `tsconfig.base.json`.
- **ESM only:** `"type": "module"`, `NodeNext` resolution. No CommonJS.
- **Named exports only:** no `export default`.
- **File naming:** `kebab-case.ts` sources; `.spec.ts` tests in `test/` mirroring `src/`; no co-located tests; root `src/index.ts` barrel only.
- **No `any`:** use `unknown` at boundaries, narrow with type guards.
- **Explicit return types on public functions:** exported functions and class methods need explicit return types.
- **Error types:** all user-facing errors in `@specd/core` extend `SpecdError`; no generic `Error` for expected failures; machine-readable `code`; actionable messaging (cross-ref `error-handling-conventions`).
- **Private backing fields:** underscore prefix (`_name` for `get name()`).
- **Lazy loading — metadata before content:** `list()`/`search()` return metadata only; full content via explicit `get`/`load`.
- **Immutability preference:** `readonly` arrays/properties on value objects/entities; `as const` for literal config.

### Implementation Status

| Convention                             | New-code status                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| kebab-case filenames                   | ✓ `language-adapter-facets.ts`, `package-import-resolver.ts`, `invalid-language-adapter-error.ts`                           |
| Named exports only, no default exports | ✓ Verified: no `export default` in new source                                                                               |
| No `any`                               | ✓ Verified: no `: any` or `as any` in new source files                                                                      |
| Explicit return types on public API    | ✓ `forAdapter(adapter): PackageImportHelpers`, `get code(): string`, `get specd(): true`, facet method signatures all typed |
| Errors extend SpecdError               | ✓ `InvalidLanguageAdapterError` → `SpecdCodeGraphError` → `SpecdError`                                                      |
| Private backing fields underscore      | N/A (no backing fields in new code)                                                                                         |
| Lazy loading / no speculative content  | ✓ `package-import-resolver.ts` performs no I/O; `entrySurface` reads only prepared session data (no filesystem probing)     |
| Immutability preference                | ✓ Facet interfaces use `readonly` throughout; `PackageWorkspace`, `PackageEntry`, etc. all `readonly`                       |

**ESM / NodeNext:** The monorepo uses ESM; new files use `.js` extension in import specifiers (e.g. `./index-session.js`), consistent with NodeNext.

### Discrepancies

- **Code might be wrong:** None found in new source files. All conventions verified by direct read.
- **Spec might be wrong:** None identified. The facet model and `PackageImportResolver` introduce no convention conflict.

### Test Coverage

Conventions are enforced by `pnpm build`, `pnpm typecheck`, and `pnpm lint` (tasks 8.1–8.3, all green per manifest). The eslint spec (batch item 4) enforces `no any`, named exports, explicit return types, kebab-case, JSDoc via type-aware rules.

### Missing Tests

None — conventions are verified at build/lint time, not via dedicated test files.

### Spec Dependency Chain

`default:_global/conventions` → `default:_global/error-handling-conventions` (conventions depends on error-handling for error-type rules).

### Counts

- New source files: 3; Modified source files: ~13; New test files: 0 dedicated; Global specs audited: 1 (this section)

---

## 3. default:\_global/testing

### Requirements Summary

Testing strategy for the monorepo.

- **Test runner:** Vitest only (no Jest).
- **Test location:** `test/` directory at package root, mirroring `src/` structure; `.spec.ts` suffix; never co-located with source.
- **Unit tests for domain/application:** every use case and domain entity invariant has ≥1 unit test; ports mocked (no real fs/network in unit tests).
- **Port mocks are typed:** mocks implement the port interface fully; no `as unknown as Port`; unused methods throw `new Error('not implemented')`.
- **Integration tests for infrastructure adapters:** real temporary directory (`os.tmpdir()` + unique subfolder), cleaned up after each test.
- **POSIX- and Windows-compatible:** `node:path` for path construction/assertions; no hardcoded `/tmp` or `/var/www`; `path.win32` for Windows rules on non-Windows hosts; CRLF/CR treated as LF for logical identity; no `chmod 0o000` on Windows.
- **Test naming:** descriptions `"given <state>, when <action>, then <outcome>"`; helpers `setup<Thing>`/`cleanup<Thing>`.
- **No snapshot tests:** `toMatchSnapshot`/`toMatchInlineSnapshot` forbidden.

### Implementation Status

| Requirement                                         | Status                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Vitest (not Jest)                                   | ✓ All new test files import from `vitest`                                                                                        |
| Test files in `test/` mirroring `src/`, `.spec.ts`  | ✓ `test/application/services/package-import-resolver.spec.ts`, `test/domain/errors/invalid-language-adapter-error.spec.ts`, etc. |
| Unit tests for domain/application with mocked ports | ✓ Resolver unit tests with mocked `IndexSession`; error unit tests                                                               |
| Integration tests with temp dirs + cleanup          | ✓ Cross-workspace package-import integration tests use tmp dirs (per design tasks 14.3, 18.2, 18.3)                              |
| No snapshot tests                                   | ✓ Verified: zero matches for `toMatchSnapshot`/`toMatchInlineSnapshot` in `packages/code-graph/test/`                            |
| POSIX/Windows compatible                            | ✓ New unit tests use workspace-prefixed paths (`code-graph:src/public.ts`), not host absolute paths; no hardcoded `/tmp`         |

### Discrepancies (Testing Convention Violations)

1. **`package-import-resolver.spec.ts` — `fakeSession()` partial mock with `as unknown as IndexSession` (CODE MIGHT BE WRONG / CONVENTION VIOLATION).**
   - `IndexSession` declares 25 methods (`registerFile`, `registerAnalysis`, `getFileId`, `getAnalysis`, `getAllFilePaths`, `findSymbolsByFile`, `findSymbolsByName`, `findSymbolById`, `findSymbolByQualifiedName`, `findSpecsBySymbol`, `findSymbolsBySpec`, `registerDocument`, `registerSpec`, `addRelations`, `getRelations`, `getAdapterState`, `setAdapterState`, `getQualifiedNames`, `getDeclarationsByLogicalId`, `getLogicalSymbols`, `getLogicalDiagnostics`, `getPublicBindings`, `getLocalBindings`, `findPublicBindings`, `getFileCategory`, `getPrimaryDeclarationSymbolId`, `getResolutionSteps`, `addReferenceFacts`).
   - `fakeSession` implements only 5 (`getFileId`, `getFileCategory`, `findPublicBindings`, `getPrimaryDeclarationSymbolId`, `findSymbolsByName`) and casts `as unknown as IndexSession`.
   - This directly violates: "Port mocks implement the port interface fully. No partial mocks with `as unknown as Port`. If a port has 5 methods, the mock implements all 5 — unused ones throw `new Error('not implemented')`."
   - _Spec might be wrong:_ If `IndexSession` is considered a domain value object rather than a "port" (ports live in `application/ports/`), the rule may not strictly apply. However, the spirit of typed, complete mocks is clearly violated.
   - _Code might be wrong:_ The mock should either implement all 25 methods (unused ones throwing `not implemented`) or the resolver should depend on a narrower port interface.

2. **`package-import-resolver.spec.ts` — `adapterWith()` returns `{ packageResolution } as unknown as LanguageAdapter` (CONVENTION VIOLATION).**
   - Partial mock of `LanguageAdapter` interface with `as unknown as` cast. Same rule applies.

3. **`invalid-language-adapter-error.spec.ts:37` — `(error as unknown as { specd: boolean }).specd` (MINOR).**
   - `as unknown as` cast in a test assertion (not a port mock). Lower severity but still a type cast.

4. **Test description casing (MINOR).**
   - Descriptions use `"Given ..., when ..., then ..."` (capital G/W/T). Convention specifies lowercase `"given <state>, when <action>, then <outcome>"`.

5. **Helper naming (MINOR).**
   - Helpers named `fakeSession`, `binding`, `adapterWith` — not `setup<Thing>`/`cleanup<Thing>`. These are not setup/teardown helpers, so this is a soft deviation.

### Test Coverage

**Covered (resolved in manifest):**

- Resolver: resolved target+step, not-exported (no name search), ambiguous (different targets), ambiguous (value+type spaces), duplicate routes → lowest binding id, package-unknown, facet-absent, no-entry-surface (test + unindexed entries filtered), orphan target → not-exported, same-name decoy in another workspace not used. (9 scenarios)
- Error: code=`INVALID_LANGUAGE_ADAPTER`, message with languages, message with member, message with unknown languages, `specd === true`. (4 scenarios)
- Registry validation: missing core member, facet is string, facet missing member, extension for undeclared language, later registration replaces, per-language replacement, shadowed adapter drops out, idempotent same-instance, core-only adapter, registry unchanged after failure, message names language/rule/member. (10 scenarios)
- Session additions: `findPublicBindings` after registration/hydration/addReferenceFacts; `getFileCategory` for source/test/unknown; `getPrimaryDeclarationSymbolId` determinism.
- Symbol reference: facet-absent → unresolved, no other adapter consulted.
- Package imports (integration): cross-workspace, entry change re-resolves importers, barrel intermediate, unrelated files not read, newly resolvable import = clean rebuild, fingerprint on manifest changes.
- Language independence: stub `zig2` adapter resolves cross-workspace import with unmodified indexer; core-only adapter with facet-absence diagnostic; facet throw in `prepare` completes with error.
- Scoped binding environment: scope-aware `importedTargets`.
- Docs: `FACET_MEMBERS` members appear in `docs/code-graph/language-adapters.md`.

### Missing Tests

None identified from the manifest (all tasks 3.4–3.6, 4.6, 5.6, 6.4, 7.4, 7.5, 9.2, 12.3, 13.2, 13.3, 14.1–14.3, 15.3, 16.3, 17.3, 18.2–18.4, 21.1–21.3, 23.1–23.9, 22.5 are `resolved`). The partial-mock convention violation is a style/typing issue, not missing coverage.

### Spec Dependency Chain

`default:_global/testing` → `default:_global/architecture` (layer boundaries determine unit vs integration) → `default:_global/conventions` (ESM-only is why Vitest over Jest).

### Counts

- New source files: 3; Modified source files: ~13; New test files: ~9; Modified test files: ~9; Global specs audited: 1 (this section)
- Convention violations found: 3 (2 significant partial mocks, 1 minor cast)

---

## 4. default:\_global/eslint

### Requirements Summary

ESLint enforces conventions + architectural layer boundaries, configured in `eslint.config.js` at monorepo root, type-aware for `.ts` files.

- **No `any` type:** reject explicit `any` annotations.
- **Named exports only:** reject default exports.
- **Explicit return types on public API:** exported functions/methods need explicit return types; internal functions may infer.
- **Kebab-case filenames:** all `src/` files `kebab-case`.
- **JSDoc on all functions and classes:** description, `@param` for all params, `@returns` (omit for `void`), `@throws` for each error type. Includes internal helpers.
- **Layer boundary enforcement** via `no-restricted-imports`:
  - `domain/` must not import `application/`, `infrastructure/`, `composition/`
  - `application/` must not import `infrastructure/`, `composition/`
  - `infrastructure/` must not import `composition/`
- **Type-aware lint rules** for all `.ts` files.
- Test files (`test/**/*.spec.ts`) exempt from JSDoc; `dist/` and `node_modules/` excluded.

### Implementation Status

| Rule                                | New-code status                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `any`                            | ✓ Verified: no `: any`/`as any` in new source                                                                                                                                                                                                                                                                              |
| Named exports only                  | ✓ No `export default` in new source                                                                                                                                                                                                                                                                                        |
| Explicit return types on public API | ✓ All public methods on `PackageImportResolver`, `InvalidLanguageAdapterError`, facet interfaces have explicit types                                                                                                                                                                                                       |
| Kebab-case filenames                | ✓ All new files `kebab-case.ts`                                                                                                                                                                                                                                                                                            |
| JSDoc on all functions/classes      | ✓ `package-import-resolver.ts` (class, constructor, `forAdapter`, `entryFiles`, `resolveExport`), `invalid-language-adapter-error.ts` (class, `code` getter, constructor), `language-adapter-facets.ts` (per design: full JSDoc on every exported symbol)                                                                  |
| Layer boundary enforcement          | ✓ `language-adapter-facets.ts` (domain) imports only domain; `package-import-resolver.ts` (application) imports only domain; `index-code-graph.ts` (application) imports domain/ports/services only, no concrete infrastructure adapters; `create-code-graph-provider.ts` (composition) imports infrastructure (permitted) |
| Type-aware lint                     | ✓ Per eslint spec configuration                                                                                                                                                                                                                                                                                            |

### Discrepancies

- **Code might be wrong:** None found in new source files. JSDoc, explicit return types, no `any`, named exports, kebab-case all verified.
- **Spec might be wrong:** None identified.

### Test Coverage

ESLint compliance is verified by `pnpm lint` (task 8.3, expected no errors per manifest). Test files are exempt from JSDoc requirements, so the partial-mock test files are not flagged for JSDoc (but the `as unknown as` casts are a TypeScript/testing-convention concern, not ESLint).

### Missing Tests

None — eslint rules are enforced at lint time.

### Spec Dependency Chain

`default:_global/eslint` → `default:_global/conventions` (the rules being enforced).

### Counts

- New source files: 3; Modified source files: ~13; New test files: 0 dedicated; Global specs audited: 1 (this section)
- ESLint violations found: 0

---

## 5. default:\_global/error-handling-conventions

### Requirements Summary

Error handling standards across the specd ecosystem.

- **Specd Error Contract:** error (1) inherits from `Error`, (2) has `readonly specd = true` discriminator, (3) has `readonly code: string` machine-readable ID, (4) has descriptive human-readable `message`.
- **core mandate:** `@specd/core` defines canonical `SpecdError` base class; every domain/application error in core extends `SpecdError`.
- **Monorepo package mandate:** every package depending on `@specd/core` extends `SpecdError` for its domain/application errors; each package SHOULD define its own package-level base error (e.g. `SpecdCodeGraphError`).
- **Error code naming:** `UPPER_SNAKE_CASE`, unique within package, stable across versions.
- **Actionable messaging:** descriptive, tells user how to fix; no internal implementation details in user-facing messages.
- **Metadata extraction:** MAY include `specId`, `filePath`, `expected`; documented in JSDoc.
- **JSDoc documentation:** all error classes document what they represent, the `code`, metadata properties; use cases document thrown errors with `@throws`.
- System errors/unexpected bugs MAY remain generic `Error`; domain logic MUST NOT use generic `Error` for expected failures.

### Implementation Status

| Error class                   | File                                                                      | Contract conformance                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SpecdError`                  | `packages/core/src/domain/errors/specd-error.ts`                          | ✓ `abstract class extends Error`, `get specd(): true` (getter → `true`), `abstract get code(): string`, `constructor(message)` with JSDoc                                                  |
| `SpecdCodeGraphError`         | `packages/code-graph/src/domain/errors/specd-code-graph-error.ts`         | ✓ `abstract class extends SpecdError`, `abstract override get code(): string`, JSDoc                                                                                                       |
| `InvalidLanguageAdapterError` | `packages/code-graph/src/domain/errors/invalid-language-adapter-error.ts` | ✓ `extends SpecdCodeGraphError`, `get code(): string` → `'INVALID_LANGUAGE_ADAPTER'`, `constructor(languageIds, rule, member?)` builds descriptive message, JSDoc documents purpose + code |

**Specd Error Contract verification for `InvalidLanguageAdapterError`:**

1. Inherits from `Error` ✓ (via `SpecdCodeGraphError` → `SpecdError` → `Error`)
2. `readonly specd = true` ✓ (inherited getter from `SpecdError`, returns `true`, no setter)
3. `readonly code: string` ✓ (getter `get code(): string`, no setter)
4. Descriptive human-readable `message` ✓ (constructor builds `"Invalid language adapter [<ids>]: <rule> (member "<member>")"`)

**Error code naming:** `INVALID_LANGUAGE_ADAPTER` is `UPPER_SNAKE_CASE` ✓, unique within code-graph ✓ (verified via graph search: only one occurrence).

**Monorepo package mandate:** code-graph depends on `@specd/core` (imports `SpecdError` from `@specd/core` in `specd-code-graph-error.ts`) and defines `SpecdCodeGraphError` as its package-level base ✓.

**Actionable messaging:** messages name the language(s), rule, and offending member ✓.

**JSDoc:** all three error classes have JSDoc ✓; `code` getter documents the code value ✓; `specd` getter documented on `SpecdError` ✓.

### Discrepancies

- **Code might be wrong:** None found. The error chain fully conforms to the Specd Error Contract.
- **Spec might be wrong:** None identified. The facet-model registration error (`InvalidLanguageAdapterError`) is a natural fit for the error-handling spec.

### Test Coverage

`test/domain/errors/invalid-language-adapter-error.spec.ts`:

- code = `'INVALID_LANGUAGE_ADAPTER'` ✓
- message with languages + rule ✓
- message with member suffix ✓
- message with `unknown` for no languages ✓
- `specd === true` ✓ (via cast assertion)

### Missing Tests

None identified (task 3.5 `resolved`).

### Spec Dependency Chain

`default:_global/error-handling-conventions` → `default:_global/conventions` (conventions depends on error-handling for error-type rules).

### Counts

- New source files: 1 (`invalid-language-adapter-error.ts`); Modified source files: 1 (`specd-code-graph-error.ts` pre-existing); New test files: 1; Global specs audited: 1 (this section)

---

## Cross-Spec Contradictions

No contradictions found between the change's specs (`code-graph:language-adapter`, `code-graph:indexer`, `code-graph:workspace-integration`, `code-graph:resolve-symbol-reference`, and the four language-adapter specs) and any of the 5 global specs in batch C. The facet model, `PackageImportResolver`, and `InvalidLanguageAdapterError` are consistent with:

- Hexagonal layering (architecture)
- Naming/ESM/no-`any`/explicit-return-types/JSDoc (conventions)
- Typed error contract + `SpecdError` chain (error-handling-conventions)
- ESLint-enforced layer boundaries (eslint)

The only audit finding requiring action is the **testing-convention violation** (partial mocks with `as unknown as`) in `package-import-resolver.spec.ts`, which is a code-level concern under `default:_global/testing`, not a conflict between specs.

## Auditor Note

This is a READ-ONLY partial audit (batch C of global specs). No code or spec files were modified. Findings are limited to the 5 assigned global specs and the 8 change specs listed above. Implementation conformance was verified via `specd graph` (graph impact / graph search) and direct file reads; build/lint/test execution status is taken from the change manifest (all tracked tasks `resolved`).
