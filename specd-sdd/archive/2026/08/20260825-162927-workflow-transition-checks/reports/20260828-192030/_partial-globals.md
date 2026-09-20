# Partial audit: project globals (architecture / logging + consistency globals)

- **Mode:** change `workflow-transition-checks`
- **Graph:** `stale: false`, indexed `2026-08-28T17:21:07.186Z`, ref `2948f1a2`
- **Change-owned (previewed via `changes spec-preview`):** `default:_global/architecture`, `default:_global/logging`
- **Disk base (not change-owned):** `default:_global/conventions`, `testing`, `eslint`, `spec-layout`, `docs`, `error-handling-conventions`
- **Read-only:** no spec or source files modified

---

## `default:_global/architecture` (CHANGE PREVIEW)

### Requirements Summary

| Requirement                                  | Normative intent                                                                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layered structure                            | Packages with business logic use `domain` / `application` / `infrastructure`; inner never imports outer. Notes `@specd/core` as current only such package.                                      |
| Domain layer is pure                         | Domain: stdlib + domain types only. **Exception:** ambient `Logger` for diagnostics in any layer/package; sole intentional cross-layer import exception. Composition root wires implementation. |
| Application layer uses ports only            | Use cases talk through `application/ports/` only. Ambient `Logger` is **not** an infrastructure adapter import.                                                                                 |
| Rich domain entities                         | Entities own invariants/transitions; typed domain errors.                                                                                                                                       |
| Domain value objects                         | Behaviour via methods/getters; no leaked internals.                                                                                                                                             |
| Ports with shared construction               | Abstract classes + explicit methods, not property signatures.                                                                                                                                   |
| Pure functions for stateless domain services | Stateless domain ops = exported functions in `domain/services/`, not classes.                                                                                                                   |
| Manual DI                                    | No IoC; constructors receive ports.                                                                                                                                                             |
| Composition layer                            | `composition/` only may import `infrastructure/`; Kernel/`createX`/`CompositionResolver` contract (heavily named after core/sdk).                                                               |
| YAML validated at infra boundary             | `ConfigValidationError` / `SchemaValidationError` extend `SpecdError`.                                                                                                                          |
| Adapter packages                             | CLI/MCP/plugins contain no business logic.                                                                                                                                                      |
| No circular workspace deps                   | Directed graph `plugin-*` → `skills` → `core`; `cli`/`mcp` → `sdk` → `core`,`code-graph`.                                                                                                       |
| Curated public entry points                  | `.` / `./ports` / `./extensions` / `./internal` export rules.                                                                                                                                   |

**Change delta vs disk:** only Domain purity + Application ports sections gained the Logger exception. Disk architecture has **no** `evaluateLifecycle` and **no** lifecycle file paths. Change preview also has **no** `evaluateLifecycle` and **no** `lifecycle-*.ts` paths. Focus criterion (architecture package-agnostic for this Logger work) is **met for the delta**. Residual core-named Kernel/SDK/error types remain in unchanged sections.

### Implementation Status

| Area                                       | Status            | Evidence                                                                                                                                                                                                               |
| ------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ambient Logger in domain                   | **Compliant**     | `packages/core/src/domain/services/lifecycle-verdict.ts` imports `Logger` from `../../observability/logger.js`. ESLint on this file: **0 errors**.                                                                     |
| Logger not treated as infra adapter        | **Compliant**     | Facade lives in `src/observability/`, not `infrastructure/`. `PinoLogger` is the adapter. Application re-export: `src/application/logger.ts` → observability.                                                          |
| Composition wires Logger                   | **Compliant**     | `packages/core/src/composition/kernel.ts` calls `Logger.setImplementation(createDefaultLogger(...))`.                                                                                                                  |
| Domain must not import application         | **Non-compliant** | `packages/core/src/domain/services/lifecycle-engine.ts` import/re-export of `evaluateLifecycle` from `../../application/services/lifecycle-evaluation.js`. ESLint: `no-restricted-imports` ×2.                         |
| Stateless domain services as functions     | **Partial**       | Verdict is `evaluateLifecycleVerdict` (function). Deprecated `LifecycleEngine` **class** remains in domain with public field initializers (`projectArtifacts`, `findBlockingParent`) — also `no-restricted-syntax` ×2. |
| Three named layers only                    | **Partial**       | Code adds sibling `src/observability/` (not in the three-layer list). This is how domain can import Logger without hitting `**/application/**`.                                                                        |
| Layer ESLint                               | **Enforced**      | `eslint.config.js` restricts domain→application/infrastructure/composition. Does **not** restrict `observability/`.                                                                                                    |
| Verify: “TS compiler rejects domain→infra” | **Drift**         | Enforcement is ESLint `no-restricted-imports`, not `tsc` path mapping. Pre-existing.                                                                                                                                   |

Graph: `Logger` dependents include `lifecycle-verdict.ts`, `lifecycle-engine.ts` (indirect), application use cases, `kernel.ts`. `evaluateLifecycle` is application (`lifecycle-evaluation.ts`), not architecture.

### Discrepancies

1. **code-wrong (HIGH)** — Domain file `lifecycle-engine.ts` imports application `evaluateLifecycle`. Architecture (change): inner layers never import outer; Logger is the **sole** exception. ESLint agrees (2× `no-restricted-imports`). Architecture is right; this shim belongs outside `domain/` (e.g. application or public barrel).

2. **spec-wrong (change `core:lifecycle-engine` vs this global) (HIGH)** — Change lifecycle-engine spec says a deprecated shim MAY live in domain and MUST delegate to `evaluateLifecycle` / `evaluateLifecycleVerdict`, and names `domain/services/lifecycle-verdict.ts`. That **contradicts** architecture’s sole-exception rule and “stateless domain services are functions, not classes”. Architecture/global is the constraint spec; lifecycle-engine should move the application re-export out of `domain/`.

3. **both (MEDIUM)** — Architecture still describes only three folders. Implementation’s `observability/` is a fourth, package-local module that makes the Logger exception lint-legal. Spec could name “ambient Logger module, not `application/`/`infrastructure/`” without listing core paths. Code could document why observability sits beside domain.

4. **spec-wrong (LOW, residual, not this delta)** — Composition / YAML / barrels still name `SpecdConfig`, `@specd/core`, `FsConfigLoader` (verify), `ChangeRepository`. Does **not** include `evaluateLifecycle` or lifecycle file paths (focus check **pass**). Package-agnostic purity of the whole architecture spec is incomplete, but the Logger delta did not add core lifecycle APIs.

5. **spec-wrong (LOW)** — Verify still says “TypeScript compiler must reject” domain→infra / use-case→adapter. Reality: ESLint. `tsc` does not encode those folder rules.

### Test Coverage

| Requirement                        | Tests                                                                                                                     | Adequacy                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Domain may import Logger           | `test/domain/services/lifecycle-engine.spec.ts` spies `Logger.debug` during `evaluateLifecycleVerdict`                    | Covers ambient use, not lint permission |
| Application may import Logger      | Indirect via use-case tests + kernel                                                                                      | Weak as architecture scenario           |
| Domain must not import application | **None** as a positive architecture test; ESLint is the fitness function and currently **fails** on `lifecycle-engine.ts` | Gap + failing production file           |
| Layered imports                    | No dedicated eslint fixture tests                                                                                         | Relies on CI lint                       |
| Ports / Kernel / YAML / adapters   | Covered by other package specs                                                                                            | Out of this batch’s focus               |

### Missing Tests

- Scenario: domain file importing `../observability/logger` does **not** trip `no-restricted-imports`.
- Scenario: domain file importing `../application/**` **does** trip lint (currently true in production, so a regression test would fail until the shim moves).
- Architecture verify “compiler rejects” vs lint: no automated mapping.

### Spec Dependency Chain

- Architecture: `_none — this is a global constraint spec`
- **Dependents in this change:** `default:_global/logging` (change), `core:lifecycle-engine`, `core:transition-change`, `core:transition-checks`, `core:change`, `core:archive-change`, `core:storage`, `core:config`, `core:validate-artifacts`, …
- **Contradiction:** `core:lifecycle-engine` (change) depends on architecture but authorizes a domain→application shim.

### Summary counts

- Requirements: **13**
- Implemented: **11** (Logger exception + layers generally hold; composition/ports exist)
- Partial: **2** (observability folder; `LifecycleEngine` class + public fields)
- Missing implementation: **1** clean domain boundary for lifecycle shim
- Discrepancies: **5** (1 code-wrong, 2 spec-wrong, 1 both, 1 residual spec-wrong)
- Missing tests: **3**
- Change-spec conflicts with this global: **1** (`core:lifecycle-engine` domain shim)

---

## `default:_global/logging` (CHANGE PREVIEW)

### Requirements Summary

| Requirement                               | Normative intent                                                                                                                                                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Console Compatibility                     | Interface MUST have `log`, `info`, `debug`, `warn`, `error` with console-like signatures.                                                                                                                                                                 |
| Method Aliasing                           | `log()` SHALL be an alias of `info()`.                                                                                                                                                                                                                    |
| Level Mapping for Minimal Implementations | **If** implementation is console-based: `fatal` → `console.error` + `[FATAL]`; `trace` → `console.debug`/`log` + `[TRACE]`.                                                                                                                               |
| Log Level Semantics                       | Ordered severity `trace` < `debug` < `info` < `warn` < `error` < `fatal`.                                                                                                                                                                                 |
| Policy on Console Usage                   | Prefer logging abstraction over global `console` in production.                                                                                                                                                                                           |
| Ambient Logger (**added by change**)      | Packages MAY expose static `Logger`; composition root assigns impl; pre-wire **no-op** (no throw, no console); any layer MAY import; not for control flow; **does not prescribe constructor injection vs ambient**. Exception documented in architecture. |

**Change vs disk:** disk logging had no Ambient Logger requirement and Spec Dependencies `_none`. Change adds Ambient Logger and depends on architecture. Preview is **generic** (monorepo-wide), **not** core-only constructor-injection rules. Focus criterion **met**.

### Implementation Status

| Area                          | Status                       | Evidence                                                                                                                                                                                            |
| ----------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Console-compatible methods    | **Compliant**                | `LoggerPort` + static `Logger` expose required methods plus `fatal`, `trace`, `isLevelEnabled`, `child`.                                                                                            |
| `log` ≡ `info`                | **Partial**                  | Facade delegates `log`→`impl.log` and `info`→`impl.info` separately. `PinoLogger` maps **both** to `pino.info`. NullLogger both no-op. Alias is by convention of impls, not a single facade method. |
| Console prefix mapping        | **N/A for Pino**             | Spec scopes prefixes to console-based minimal impls. `PinoLogger` uses pino levels, not `[FATAL]`/`[TRACE]` prefixes. No console-adapter class found.                                               |
| Console policy in core `src/` | **Compliant (spot-check)**   | No `console.log/warn/error/debug/info` under `packages/core/src`.                                                                                                                                   |
| Ambient no-op                 | **Compliant**                | `NullLogger`; `Logger.resetImplementation()`. Test: `test/application/logger-port.spec.ts` “does not throw when using default null implementation”.                                                 |
| Wired at composition          | **Compliant**                | `createKernel` → `Logger.setImplementation`.                                                                                                                                                        |
| Domain without logger port    | **Compliant**                | `evaluateLifecycleVerdict` has no logger ctor arg; uses `Logger.debug`. Matches verify “Ambient import without logger port”.                                                                        |
| Generic vs core-only          | **Compliant to change spec** | Spec text is package-agnostic. Code comments still say “across core” (`logger.ts`) — implementation locality, not a spec constructor rule.                                                          |

### Discrepancies

1. **both (LOW)** — `log()` is not implemented as a call-through to `info()` on the facade. Spec wants aliasing; code uses parallel methods. Pino happens to alias. A custom `LoggerPort` could split them.

2. **spec-wrong (LOW)** — Verify “linting or code review SHOULD flag `console.*`” is not an ESLint rule in `eslint.config.js` (no `no-console`). Policy is social/CI-optional. Core src currently clean.

3. **none (constructor rules)** — Change logging does **not** require injecting a logger port into domain constructors. Code matches. Old worry (core-only ctor rules in logging) is **not** present in preview.

### Test Coverage

| Requirement              | Tests                                             | Adequacy                                                                                    |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Methods exist / delegate | `logger-port.spec.ts`                             | Good for proxy; does not assert `log` vs `info` identity                                    |
| No-op before wiring      | Same file, no-throw                               | Does **not** spy `console` to prove no write                                                |
| Pino routing             | `test/infrastructure/logging/pino-logger.spec.ts` | Callback dest, child, `isLevelEnabled`; no fatal/trace prefix (correct if not console impl) |
| Ambient domain logging   | `lifecycle-engine.spec.ts` `Logger.debug` spy     | Good                                                                                        |
| Severity order           | **None**                                          | Spec verify scenario untested as data                                                       |

### Missing Tests

- `Logger.log` and `Logger.info` invoke the same underlying level/method.
- No-op impl does not call `console.*` (spy).
- Console-adapter `[FATAL]`/`[TRACE]` if such an adapter is ever added.
- Cross-package ambient Logger (cli/code-graph) — spec allows “packages MAY”; only core implements the facade.

### Spec Dependency Chain

- Depends on: `default:_global/architecture` (change)
- Used by: `core:lifecycle-engine`, `core:change`, `core:archive-change`, `core:storage` (change specDependsOn)
- Consistent with architecture Logger exception.

### Summary counts

- Requirements: **6**
- Implemented: **5** (aliasing partial)
- Partial: **1**
- Missing implementation: **0** (no console mapper required while Pino is the adapter)
- Discrepancies: **2** (both LOW)
- Missing tests: **4**
- Change-spec conflicts with this global: **0**

---

## `default:_global/conventions` (DISK)

### Requirements Summary

Strict TS (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); ESM `type:module` + NodeNext; named exports only; kebab-case `src`, tests in `test/**/*.spec.ts`, no `index.ts` except package root (layer barrels allowed if >50 modules); no `any`; explicit return types on public APIs; core user-facing errors extend `SpecdError`; `_backing` fields; lazy list/search metadata vs get/artifact/resolve; prefer `readonly` / `as const`.

### Implementation Status

Monorepo `tsconfig.base.json` + eslint `no-explicit-any`, `explicit-module-boundary-types`, default-export ban, kebab-case filenames align. Out of change focus except where Logger/JSDoc interact.

### Discrepancies

1. **spec-wrong (MEDIUM)** — `## Spec Dependencies` both says `_none — this is a global constraint spec_` **and** lists `default:_global/error-handling-conventions`. Violates `default:_global/spec-layout` (section must be `_none` **or** a list).

2. **spec-wrong vs eslint/docs (LOW)** — Conventions do not mention ambient Logger; they do not forbid importing observability from domain. No conflict with the change.

### Test Coverage

Enforced by compiler/lint, not Vitest scenarios named after conventions.

### Missing Tests

None required for this change’s Logger work. Spec-layout self-check of the Dependencies section is missing (meta).

### Spec Dependency Chain

Intended: error-handling-conventions. Architecture/logging do not depend on conventions. ESLint depends on conventions.

### Summary counts

- Requirements: **9**
- Implemented: **9** (spot-check; not a full monorepo sweep)
- Partial: **0**
- Missing implementation: **0**
- Discrepancies: **1** (spec-wrong Dependencies section)
- Missing tests: **1** (meta)
- Change-spec conflicts: **0**

---

## `default:_global/testing` (DISK)

### Requirements Summary

Vitest only; `test/` mirrors `src`; unit tests for use cases and entity invariants with full port mocks (`Error('not implemented')`); integration tests for fs adapters with tmpdir cleanup; names `given…, when…, then…`; helpers `setupX`/`cleanupX`; no snapshots.

### Implementation Status

Logger tests use Vitest `describe`/`it` with short names, not `given/when/then`. Domain lifecycle tests exist including Logger.debug spy. Unit tests do not need a logger port mock (ambient) — **aligns** with architecture/logging change.

### Discrepancies

1. **code-wrong (LOW vs testing spec)** — `logger-port.spec.ts` / `pino-logger.spec.ts` titles are not `given…, when…, then…`. Widespread repo pattern; not introduced as Logger-specific regression uniquely.

2. **none vs architecture** — Testing spec says domain is unit-testable because it has no I/O. Ambient Logger is a side effect. Change architecture/logging explicitly allow diagnostic logs. Tests that spy `Logger.debug` remain unit tests (no fs). **Compatible** if logging is not treated as I/O. If a reviewer treats any module-level mutable logger as I/O, the exception is the intended resolution.

### Test Coverage

Testing spec itself is process; coverage of Logger scenarios listed under logging/architecture.

### Missing Tests

None unique beyond logging’s missing cases.

### Spec Dependency Chain

Depends on architecture + conventions. Change architecture’s Logger exception should be read as allowing observability in domain unit tests.

### Summary counts

- Requirements: **6**
- Implemented: **6** at strategy level
- Partial: **1** (naming convention in logger tests)
- Missing implementation: **0**
- Discrepancies: **1**
- Missing tests: **0** additional
- Change-spec conflicts: **0** (Logger vs purity resolved by architecture exception)

---

## `default:_global/eslint` (DISK)

### Requirements Summary

Enforce conventions + architecture layers via root `eslint.config.js`; type-aware; no `any`; no default export; explicit returns; kebab-case `src`; JSDoc on all functions/classes/types including internals (`test/**/*.spec.ts` exempt); `no-restricted-imports` for domain/application/infrastructure folder rules; lint-staged.

### Implementation Status

`eslint.config.js` matches the three folder patterns. **No Logger allowlist** and **none needed** while Logger lives under `observability/` (not in restricted groups). Domain `lifecycle-verdict.ts` Logger import is legal. Domain `lifecycle-engine.ts` application import is **correctly rejected**.

JSDoc: `logger.ts` and `pino-logger.ts` use file-level `eslint-disable` for jsdoc rules. `lifecycle-verdict.ts` disables jsdoc for private helpers.

### Discrepancies

1. **spec-wrong (MEDIUM)** — ESLint spec does not mention the architecture Logger exception. Implementation accidentally supports it via folder placement. If Logger were re-exported only from `application/logger.ts` and domain imported that path, lint would **forbid** the architecture-permitted import. Spec should say: do not restrict the ambient Logger module; **do** keep forbidding `application/` including `application/logger.ts` from domain.

2. **both (HIGH, cross-spec)** — ESLint + docs spec: JSDoc required on **all** source symbols. Docs **verify** says internal helpers without JSDoc **must not** error. Direct contradiction. Code uses eslint-disable in logging/lifecycle files.

3. **code-wrong (HIGH)** — `lifecycle-engine.ts` fails eslint (`no-restricted-imports`, `no-restricted-syntax`, `jsdoc/require-jsdoc`). Fitness function works; production file is red.

### Test Coverage

No eslint rule unit tests. CI lint is the verifier. Current failure on `lifecycle-engine.ts` means CI lint of that file cannot be green.

### Missing Tests

- Fixture: domain → `observability/logger` allowed.
- Fixture: domain → `application/logger` denied (protects exception from being implemented as application import).

### Spec Dependency Chain

Depends on conventions. **Should** depend on architecture (layer rules); currently does not list it. Architecture verify overlaps eslint.

### Summary counts

- Requirements: **6**
- Implemented: **6** (rules exist; one production file violates them)
- Partial: **0**
- Missing implementation: **0** of rules; **1** violating file
- Discrepancies: **3**
- Missing tests: **2**
- Change-spec conflicts: **0** with logging; **eslint vs architecture** only if Logger is imported from `application/`

---

## `default:_global/spec-layout` (DISK)

### Requirements Summary

`specs/_global/` for cross-cutting only; package specs under `specs/<package>/`; paired `spec.md`/`verify.md`; required sections; Spec Dependencies `_none` or list with canonical IDs; deltas stay in change dirs.

### Implementation Status

Architecture/logging deltas live under the change path, not synced to `specs/` — **compliant**. Previewed architecture/logging keep Purpose/Requirements/Dependencies. Logging change adds Dependencies on architecture (was `_none` on disk).

### Discrepancies

1. **spec-wrong (MEDIUM)** — Architecture (even after Logger delta) still contains core Kernel/`@specd/core` barrel details in `_global/`. Spec-layout: `_global/` is not for a single package’s internals. Pre-existing; Logger delta did not worsen it.

2. **spec-wrong** — `default:_global/conventions` Dependencies section invalid (see conventions).

3. **LOW** — Preview title `default:\_global/logging` uses escaped underscore in heading; cosmetic.

### Test Coverage

N/A (layout). Change `deps.consistent` check passed on change status.

### Missing Tests

None for this batch.

### Spec Dependency Chain

spec-layout → schema-format, content-extraction, spec-id-format.

### Summary counts

- Requirements: **6**
- Implemented: **6** for change artifacts
- Partial: **0**
- Missing implementation: **0**
- Discrepancies: **2** (architecture-in-\_global; conventions Dependencies)
- Missing tests: **0**
- Change-spec conflicts: **0** for logging/architecture pairing

---

## `default:_global/docs` (DISK)

### Requirements Summary

`docs/{adr,cli,mcp,core,schemas}/` tree (spec tree is incomplete vs repo `guide/`, `sdk/`, `config/`); MADR ADRs; CLI/MCP/core/sdk docs; JSDoc on all symbols with `@param`/`@returns`/`@throws`; docs stay aligned with composition and template-variable contracts.

### Implementation Status

Not change-owned. Logger/architecture deltas do not update ADRs or `docs/core`. Ambient Logger is a significant architectural exception (ADR-0001 hexagonal) without a new ADR in this change.

### Discrepancies

1. **spec-wrong (LOW)** — Directory structure requirement omits `docs/sdk`, `docs/guide`, `docs/config` that later requirements reference.

2. **both (HIGH)** — JSDoc verify vs eslint/docs requirement on **internal** helpers (see eslint).

3. **spec-wrong vs ADR creation (MEDIUM)** — Ambient Logger as sole cross-layer exception is a non-obvious architecture change. Docs “ADR creation” says significant multi-package constraints get an ADR. This change did not add one. Could be “follows from observability already in code” (spec-wrong if required; skippable if considered implementation detail of logging).

### Test Coverage

Linter JSDoc; no docs tests.

### Missing Tests

None.

### Spec Dependency Chain

Depends on conventions.

### Summary counts

- Requirements: **11**
- Implemented: **n/a full sweep**
- Partial: **1** (JSDoc disables in logger/lifecycle)
- Missing implementation: **0** for Logger docs unless ADR required
- Discrepancies: **3**
- Missing tests: **0**
- Change-spec conflicts: **0** directly; ADR gap is process

---

## `default:_global/error-handling-conventions` (DISK)

### Requirements Summary

Specd Error Contract (`Error`, `specd=true`, `code`, message); core `SpecdError`; package bases SHOULD exist; `UPPER_SNAKE_CASE` codes; actionable messages; optional metadata; JSDoc on errors. Generic `Error` only for OOM/network/bugs.

### Implementation Status

Logging is not an error channel. Architecture YAML errors still name `SpecdError` subclasses. Domain Logger must not be used for control flow (logging spec); lifecycle still throws typed errors separately.

### Discrepancies

None specific to this change’s Logger/architecture deltas. Testing spec’s mock `new Error('not implemented')` is a documented exception for unused mock methods, not production domain errors.

### Test Coverage

Package error tests exist elsewhere.

### Missing Tests

None for this batch.

### Spec Dependency Chain

Depends on conventions. Architecture YAML requirement depends on `SpecdError` types (implicit).

### Summary counts

- Requirements: **7**
- Implemented: **7** (not re-audited exhaustively)
- Partial: **0**
- Missing implementation: **0**
- Discrepancies: **0** (this focus)
- Missing tests: **0**
- Change-spec conflicts: **0**

---

## Cross-cutting: change specs vs these globals

| Change spec              | vs architecture                                                                                                                                   | vs logging                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `core:lifecycle-engine`  | **Conflict:** domain path `lifecycle-verdict.ts`; allows `LifecycleEngine` class shim; re-exports application `evaluateLifecycle` from **domain** | **Aligned:** `Logger.debug` diagnostics, no logger port                  |
| `core:transition-checks` | Depends on architecture; check I/O in execute not domain — aligned with purity                                                                    | n/a                                                                      |
| Other change specs       | Must not put `evaluateLifecycle` into **architecture** — they did not                                                                             | Must not add core-only logger ctor rules into **logging** — they did not |

`evaluateLifecycle` correctly lives in **application** (`lifecycle-evaluation.ts`) per graph. Architecture global does not mention it. The defect is the **domain** shim importing it.

---

## Batch totals

| Spec                                |   Reqs | Impl | Partial | Missing impl | Discrepancies | Missing tests |
| ----------------------------------- | -----: | ---: | ------: | -----------: | ------------: | ------------: |
| architecture (change)               |     13 |   11 |       2 |            1 |             5 |             3 |
| logging (change)                    |      6 |    5 |       1 |            0 |             2 |             4 |
| conventions                         |      9 |    9 |       0 |            0 |             1 |             1 |
| testing                             |      6 |    6 |       1 |            0 |             1 |             0 |
| eslint                              |      6 |    6 |       0 |       1 file |             3 |             2 |
| spec-layout                         |      6 |    6 |       0 |            0 |             2 |             0 |
| docs                                |     11 |    — |       1 |            0 |             3 |             0 |
| error-handling                      |      7 |    7 |       0 |            0 |             0 |             0 |
| **Sum (do not double-count files)** | **64** |      |         |              |        **17** |        **10** |

**Highest severity:** domain `lifecycle-engine.ts` vs architecture + eslint (`no-restricted-imports`). **Focus pass:** architecture preview has no `evaluateLifecycle` / lifecycle file paths; logging preview is generic ambient Logger, not core constructor rules. **Logger vs domain purity:** `lifecycle-verdict.ts` import of `observability/logger` is the intended exception and is lint-clean.
