# Spec-compliance partial: project-wide globals

- **Mode:** change `workflow-transition-checks`
- **Batch:** `_partial-globals.md`
- **Change specs (via `changes spec-preview`):** `default:_global/architecture`, `default:_global/logging`
- **Disk specs (`specs show`, not in change):** `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/docs` (docs only if public API/docs drifted)
- **Graph:** `graph stats` → `stale: false`, `contentFresh: true`, `coverageComplete: true`. Code-graph relations are empty (`fileCount: 0`, `IMPORTS: 0`, `languages[0]`, coverage reason `no-language-adapter`). Symbol search still resolved `Logger` and `evaluateLifecycle`. `graph impact --file` failed (`no indexed file matches`). `graph impact --symbol Logger` returned `not_found`. File-level import checks used source reads after graph.

**User-enforced architecture constraint (audited):** architecture spec remains package-agnostic. Ambient `Logger` is the only inner-layer import exception. Spec MUST NOT mention `evaluateLifecycle`, core file paths, or `LifecycleEngine`.

---

## `default:_global/architecture` (change preview)

### Requirements Summary

| ID  | Requirement                                                                                   | Change delta?                 |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| A1  | Layered structure: `domain` / `application` / `infrastructure` with inner-never-imports-outer | No (baseline)                 |
| A2  | Domain layer is pure (no I/O); **exception: ambient Logger**                                  | **Yes** — exception paragraph |
| A3  | Application uses ports only; Logger import is not an infrastructure adapter                   | **Yes** — Logger sentence     |
| A4  | Rich domain entities / typed errors                                                           | No                            |
| A5  | Value objects expose behaviour, not structure                                                 | No                            |
| A6  | Ports with shared construction are abstract classes; methods not property signatures          | No                            |
| A7  | Stateless domain operations are plain functions in `domain/services/`                         | No                            |
| A8  | Manual DI at package entry; no IoC                                                            | No                            |
| A9  | `composition/` only layer that imports `infrastructure/`; kernel / factories                  | No                            |
| A10 | YAML validated at infrastructure boundary                                                     | No                            |
| A11 | Adapter packages contain no business logic                                                    | No                            |
| A12 | No circular package dependencies                                                              | No                            |
| A13 | Curated public barrels; hosts use SDK                                                         | No                            |

**Verify.md (change):** added scenarios “Domain imports ambient Logger” and “Application imports ambient Logger”.

**Package-agnostic / forbidden terms:** change `spec.md` / `verify.md` deltas and merged preview **do not** mention `evaluateLifecycle`, `LifecycleEngine`, or `packages/core/...` paths. Disk `specs/_global/architecture/spec.md` likewise has none of those terms. **PASS** for the user constraint.

### Implementation Status

| Req                | Status                                           | Evidence                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1                 | **Mostly implemented** (pre-existing)            | Core uses `domain/`, `application/`, `infrastructure/`, `composition/`. Code also has `observability/` (sibling of `domain`), not named in the spec.                                                                                                                                                                                                      |
| A2                 | **Implemented as specified, via sibling module** | Domain has no `node:fs` / net imports in this audit. Sole domain production `Logger` import: `packages/core/src/domain/services/lifecycle-verdict.ts` → `../../observability/logger.js`. **No** `src/domain/**` import from `application/` except `domain/errors` exporting `DeltaApplicationError` (name collision, not a layer import).                 |
| A3                 | **Implemented**                                  | Use cases import `Logger` from `application/logger.js` (re-export). Use cases still take ports via constructors; Logger is not a constructor port.                                                                                                                                                                                                        |
| A4–A6, A8, A10–A13 | **Not re-litigated**                             | Outside this change’s architecture delta. No contradiction found with the Logger exception.                                                                                                                                                                                                                                                               |
| A7                 | **Implemented for new lifecycle verdict**        | `evaluateLifecycleVerdict` is a plain function in `domain/services/lifecycle-verdict.ts`. `domain/services/lifecycle-engine.ts` is a named re-export barrel of that module (not a class). Application `evaluateLifecycle` lives in `application/services/lifecycle-evaluation.ts` (guidance assembly) — architecture does not name that symbol (correct). |
| A9                 | **Implemented**                                  | `createKernel` in `composition/kernel.ts` is the composition root that calls `Logger.setImplementation(createDefaultLogger(...))`. `composition-resolver.ts` imports infrastructure adapters (allowed: it is `composition/`). `createKernelBuilder.build()` delegates to `createKernel` (same wiring).                                                    |

**Observability vs `application/logger`:**

- Canonical implementation: `packages/core/src/observability/logger.ts` + `logger.port.ts`.
- Compatibility shims: `application/logger.ts` and `application/ports/logger.port.ts` re-export observability.
- Public barrel `packages/core/src/public.ts` exports `Logger` / `LoggerPort` from the **application** shims, not `observability/` (keeps the extra folder off the documented package layout in the spec).
- Domain **must** import observability (or an equally non-`application/` path). Importing `application/logger.js` from `src/domain/` would trip `no-restricted-imports`.
- Application, infrastructure, and composition generally import the application shim (e.g. `FsChangeRepository` → `../../application/logger.js`, `kernel.ts` → `../application/logger.js`). That is legal under eslint (infra/composition may import application) but is a second path to the same ambient facade.

### Discrepancies

1. **Three layers vs `observability/` (spec vs code)**
   - **Spec might be right:** staying package-agnostic forbids naming `observability/` or core paths; “import ambient Logger” is the exception, location is an implementation detail.
   - **Code might be right:** a fourth folder is how the exception is realized without weakening `domain ↛ application`.
   - **Both:** A1 still says packages “must be organized in three layers”; a sibling `observability/` is not described. Not a user-constraint violation (no core paths in the spec).

2. **“Each package wires the implementation at its composition root” (architecture A2 text) vs process-level wiring**
   - Only `@specd/core` `createKernel` calls `Logger.setImplementation`. CLI, code-graph, SDK consume `@specd/core`’s static `Logger`. No other package composition root wires a logger.
   - **Spec might be right:** every package with a composition root should assign an impl (CLI/code-graph would be incomplete).
   - **Code might be right:** logging change text says each package _chooses_ how to use Logger; one process-level assignment in kernel is enough.
   - Tension is **inside this change** (architecture wording vs logging wording).

3. **`LoggerPort` canonical file is `observability/logger.port.ts`**
   - Architecture: ports live in `application/ports/`.
   - Code: types defined in observability, re-exported from `application/ports/logger.port.ts`.
   - **Spec might be right:** move the interface into `application/ports` and have observability import the port (domain importing a port from application would **fail** eslint — so this would force either an eslint exception or keeping types in observability).
   - **Code might be right:** port beside the ambient facade avoids domain → application imports.

4. **Architecture `## Spec Dependencies` still `*none*`** while the exception body links to `default:_global/logging`. Logging’s change delta **does** depend on architecture. One-way documented dependency + reverse prose link. Documentation-cycle smell, not a runtime cycle.

No discrepancy on forbidden symbols in the architecture spec itself.

### Test Coverage

| Scenario (verify.md)                    | Coverage                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain imports infrastructure / node:fs | Enforced by eslint `no-restricted-imports` + TS; not a dedicated vitest.                                                                                                                                                                                                            |
| Domain imports ambient Logger           | **No** lint/unit test that domain _may_ import Logger. Production import exists and compiles. Domain tests import Logger from **`application/logger.js`** (`test/domain/services/lifecycle-engine.spec.ts`) — tests are not under `src/domain/` so eslint layer rules do not apply. |
| Application imports Logger              | Exercised indirectly by use-case tests that spy on `Logger.debug`.                                                                                                                                                                                                                  |
| Use case receives port via constructor  | Pre-existing; not Logger.                                                                                                                                                                                                                                                           |
| Other architecture scenarios            | Pre-existing eslint/tsc; not expanded by this change.                                                                                                                                                                                                                               |

`packages/core/test/application/logger-port.spec.ts` covers no-throw default impl and delegation after `setImplementation` — supports A2/A3 observability more than hexagonal structure.

### Missing Tests

- No test that a **domain** module importing `application/logger` is a lint error, while importing observability (or the public `Logger` type-only) is allowed.
- No compiler/eslint fixture for “Logger is not treated as infrastructure adapter”.
- Domain lifecycle tests live in `lifecycle-engine.spec.ts` while the implementation file is `lifecycle-verdict.ts` (conventions file-pairing; see conventions section).

### Spec Dependency Chain

- Architecture (change): **none** listed.
- Downstream in this change: `default:_global/logging` (preview) depends on architecture; several core specs (`core:transition-checks`, `core:lifecycle-engine`, `core:change`, …) depend on architecture per change `specDependsOn`.
- Disk `default:_global/testing` depends on architecture (layer unit vs integration).
- Disk `default:_global/eslint` does **not** list architecture as a spec dependency, but its “Layer boundary enforcement” requirement restates architecture import rules.

### Summary counts — architecture

|                                                       | Count                                |
| ----------------------------------------------------- | ------------------------------------ |
| Requirements reviewed                                 | 13                                   |
| Implemented (change-relevant A2/A3/A7/A9)             | 4 (with observability layout caveat) |
| Discrepancies                                         | 4                                    |
| Missing tests                                         | 3                                    |
| Blocking vs user constraint (forbidden terms in spec) | 0                                    |

---

## `default:_global/logging` (change preview)

### Requirements Summary

| ID  | Requirement                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L1  | Console-compatible methods: `log`, `info`, `debug`, `warn`, `error`                                                                                                      |
| L2  | `log()` is an alias of `info()`                                                                                                                                          |
| L3  | Minimal **console** impl: `fatal` → `console.error` + `[FATAL]`; `trace` → `console.debug`/`log` + `[TRACE]`                                                             |
| L4  | Level semantics: trace < debug < info < warn < error < fatal                                                                                                             |
| L5  | Avoid direct `console.*` in production; use logging abstraction                                                                                                          |
| L6  | **Ambient Logger** (change add): composition assigns impl; **no-op before wiring**; any layer may import; not for control flow / persistence; each package chooses usage |

Disk `specs/_global/logging/spec.md` has L1–L5 only (`Spec Dependencies: none`). Change preview adds L6 and a dependency on architecture.

### Implementation Status

| Req | Status                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **Implemented**                                              | `LoggerPort` in `observability/logger.port.ts` includes those methods plus `fatal`, `trace`, `isLevelEnabled`, `child`. Ambient `Logger` static methods match.                                                                                                                                                                                                        |
| L2  | **Implemented in Pino adapter; facade is pass-through**      | `PinoLogger.log` calls `this.logger.info(...)`. Ambient `Logger.log` calls `impl.log`, not `impl.info`. Alias holds if every impl aliases; a non-aliasing impl would split `log` vs `info`.                                                                                                                                                                           |
| L3  | **N/A in code**                                              | No console-backed logger. `PinoLogger` uses pino levels; **no** `[FATAL]` / `[TRACE]` prefixes.                                                                                                                                                                                                                                                                       |
| L4  | **Partially implemented**                                    | `LogLevel` union: `'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal' \| 'silent'`. Extra `silent` not in spec. Ordering not encoded as a comparable enum. `fatal` does **not** terminate the process (pino fatal only).                                                                                                                                    |
| L5  | **Mostly; CLI still uses `console`**                         | Core production logging uses `Logger`. CLI: `console.warn` in `load-config.ts`, `cli-context.ts`; `console.error` in `spec-preview.ts`.                                                                                                                                                                                                                               |
| L6  | **Implemented for no-op + ambient use; wiring is core-only** | `NullLogger` default; `setImplementation` / `resetImplementation`. Domain `lifecycle-verdict.ts` logs via ambient `Logger.debug` with **no** logger constructor argument. Kernel assigns pino at `createKernel`. `@specd/cli` / `@specd/code-graph` do not call `setImplementation` (they use core’s static after kernel boot, or no-op if kernel was never created). |

`Logger.isLevelEnabled('debug')` in `packages/cli/src/handle-error.ts` gates whether a stack is written to **stderr**. That is diagnostic output shaping, not domain control flow. Borderline vs “MUST NOT be used for control flow”.

### Discrepancies

1. **No-op MUST NOT write to console (verify L6)**
   - **Code:** `NullLogger` methods are empty — no `console` calls.
   - **Tests:** `logger-port.spec.ts` only asserts `not.toThrow()`; does **not** spy `console`.
   - Spec correct / tests incomplete, or tests sufficient if empty methods are accepted as proof.

2. **“Each package wires the implementation” (architecture) vs “each package chooses” (logging L6)**
   - See architecture discrepancy 2. Logging text matches the code better.

3. **L3 console mapping**
   - **Spec might be right:** a console adapter should exist for “minimal implementations”.
   - **Code might be right:** pino is not a console adapter; L3 does not apply.
   - No in-repo console logger to violate or satisfy L3.

4. **L5 CLI `console.*`**
   - **Spec might be right:** migrate warnings/errors to `Logger`.
   - **Code might be right:** bootstrapping / user-facing CLI stderr is excluded (verify says “excluding bootstrapping or infrastructure adapters”). CLI warnings are arguably bootstrap UX, not core domain.

5. **Public dual module**
   - Tests and most packages import `@specd/core` / `application/logger.js`. Domain production uses `observability/logger.js`. Same class; two import graphs. Logging spec is generic (good) and does not require a single path.

6. **`LogLevel` includes `silent`**
   - Extension beyond spec. Harmless if treated as implementation; spec-incomplete if `silent` is part of the contract.

### Test Coverage

| Scenario                           | Coverage                                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic methods available            | Type-level on `LoggerPort`; no interface snapshot test.                                                                                                                                       |
| `log()` calls `info()`             | **Missing** on ambient `Logger`. Pino `log` → `info` untested explicitly.                                                                                                                     |
| Fatal/trace prefixes               | **Missing** (no console impl).                                                                                                                                                                |
| Severity ordering                  | **Missing**.                                                                                                                                                                                  |
| Console usage lint/review          | ESLint does not ban `console.*`.                                                                                                                                                              |
| Logger safe before wiring          | Partial: no-throw for `info`/`error` only; not all methods; no console spy.                                                                                                                   |
| Ambient import without logger port | **Implemented in production** (`evaluateLifecycleVerdict`); tests spy `Logger` in `lifecycle-engine.spec.ts` / use-case specs; they do not assert the function signature omits a logger port. |

`packages/core/test/infrastructure/logging/pino-logger.spec.ts`: callback destination, `child`, `isLevelEnabled` — infrastructure adapter, not ambient facade.

### Missing Tests

- `Logger.log` vs `Logger.info` identical delegation.
- All ambient methods no-throw + no `console` I/O before `setImplementation`.
- `resetImplementation` restores no-op (partially implied).
- Console `[FATAL]`/`[TRACE]` if a console adapter is claimed.
- Package-level wiring tests for CLI/code-graph (only if L6 is interpreted as per-package `setImplementation`).

### Spec Dependency Chain

- Logging (change) → `default:_global/architecture` (ambient exception).
- Disk logging → none.
- Architecture does not list logging as a spec dependency.

### Summary counts — logging

|                       | Count                                                     |
| --------------------- | --------------------------------------------------------- |
| Requirements reviewed | 6                                                         |
| Implemented           | 4 (L1, L2 with caveat, L6 with wiring caveat, L4 partial) |
| N/A / untested        | L3                                                        |
| Discrepancies         | 6                                                         |
| Missing tests         | 5                                                         |

---

## `default:_global/conventions` (disk — conformance of this change)

### Requirements Summary

TypeScript strict/ESM/named exports/kebab-case/`no any`/explicit public return types/`SpecdError`/underscore backing fields/lazy loading/immutability.

### Implementation Status (change-touched files)

| Check                                          | Result                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kebab-case                                     | `lifecycle-verdict.ts`, `observability/logger.ts`, `logger.port.ts` — **pass**                                                                                                                                                                                                                                                        |
| Named exports                                  | `export class Logger` — **pass**; `application/logger.ts` re-export — **pass**                                                                                                                                                                                                                                                        |
| Tests in `test/` mirroring `src/`              | Logger tests: `test/application/logger-port.spec.ts` vs source `src/observability/logger.ts` — **mismatch**. Lifecycle tests: `test/domain/services/lifecycle-engine.spec.ts` vs `src/domain/services/lifecycle-verdict.ts` (+ re-export `lifecycle-engine.ts`) — **partial** (matches barrel name, not primary implementation file). |
| Explicit return types on public Logger methods | **pass**                                                                                                                                                                                                                                                                                                                              |
| No default export                              | **pass**                                                                                                                                                                                                                                                                                                                              |
| Layer barrels                                  | `domain/services/index.ts` pre-existing; `observability/index.ts` added as a barrel under a non-root folder — conventions allow layer barrels only for domain/application/composition when >50 modules. **`observability/index.ts` is an extra barrel** not listed in the exception.                                                  |

### Discrepancies

1. **Test path vs source path for Logger**
   - Spec: `change.ts` → `test/.../change.spec.ts`.
   - Code: tests sit under `application/` because of the shim.
   - Spec right: add `test/observability/logger.spec.ts`. Code right: testing the public application re-export is what consumers use.

2. **`observability/index.ts` barrel**
   - Spec might be right: delete barrel, import `logger.js` directly (domain already does).
   - Code might be right: small package-local index; conventions exception is incomplete.

3. **JSDoc file-level eslint-disable** on `observability/logger.ts` (`NullLogger` methods) and `lifecycle-verdict.ts` (private helpers) — conflicts with eslint/docs JSDoc-on-everything (see eslint). Conventions themselves do not require JSDoc (docs spec does).

### Test Coverage / Missing Tests

Conventions are enforced by eslint/tsc more than vitest. No new convention-specific tests required for this change beyond pairing filenames.

### Spec Dependency Chain

- Conventions → `default:_global/error-handling-conventions`.
- Testing and eslint depend on conventions.

### Summary counts — conventions

|                                         | Count                                  |
| --------------------------------------- | -------------------------------------- |
| Requirements reviewed (change-relevant) | 8                                      |
| Conformance issues                      | 2 (test pairing; observability barrel) |
| Missing tests                           | 0 (lint-enforced)                      |

---

## `default:_global/testing` (disk — conformance of this change)

### Requirements Summary

Vitest; `test/` mirror; unit tests mock ports; full port mocks; infrastructure integration with tmpdir cleanup; `given/when/then` names; no snapshots.

### Implementation Status

| Check              | Result                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest             | `logger-port.spec.ts` and `pino-logger.spec.ts` use vitest — **pass**                                                                                                                                                                  |
| Unit tests no fs   | Logger proxy tests mock `LoggerPort` — **pass**                                                                                                                                                                                        |
| Full port mock     | `logger-port.spec.ts` implements all `LoggerPort` methods — **pass**                                                                                                                                                                   |
| Integration tmpdir | `pino-logger.spec.ts` uses callback/`pino.destination(1)` for empty destinations — **not** tmpdir-based; acceptable for a stream logger                                                                                                |
| Test descriptions  | Logger tests: `'does not throw when using default null implementation'` — **not** `given/when/then`                                                                                                                                    |
| Snapshots          | No `toMatchSnapshot` under `packages/core/test` — **pass**                                                                                                                                                                             |
| Domain unit tests  | `lifecycle-engine.spec.ts` is unit-level; imports application `evaluateLifecycle` and test helpers from `test/application/use-cases/helpers.ts` — allowed for tests; does not violate “unit tests must not touch filesystem” by itself |

### Discrepancies

1. **Naming pattern** for new/updated logger tests vs testing spec. Widespread pre-existing debt; this change’s logger tests continue it.

2. **`pino-logger.spec.ts` `createDefaultLogger([])`** uses stdout destination (`pino.destination(1)`). Testing spec: unit tests must not touch fs/network/processes; this is an **infrastructure** test writing to stdout — grey area (I/O), not tmpdir leak.

### Missing Tests

Same as logging section. Testing spec also wants every invariant-enforcing domain method tested: `evaluateLifecycleVerdict` is covered in `lifecycle-engine.spec.ts` (including Logger spy usage) — **present**, naming/file pairing aside.

### Spec Dependency Chain

- Testing → architecture, conventions.

### Summary counts — testing

|                                           | Count                               |
| ----------------------------------------- | ----------------------------------- |
| Requirements reviewed                     | 6                                   |
| Conformance issues                        | 2 (naming; stdout I/O in pino test) |
| Missing tests (from logging/architecture) | 5                                   |

---

## `default:_global/eslint` (disk — conformance of this change)

### Requirements Summary

No `any`; named exports; explicit public return types; kebab-case; JSDoc on all functions/classes; **layer `no-restricted-imports`**.

### Implementation Status — `no-restricted-imports`

Root `eslint.config.js`:

- `packages/*/src/domain/**`: forbid `**/application/**`, `**/infrastructure/**`, `**/composition/**`.
- `application/**`: forbid infrastructure, composition.
- `infrastructure/**`: forbid composition.
- **No** exception pattern for Logger or `observability/**`.
- **No** restriction on `observability/` from domain.

**This matches the intended exception:** domain may import ambient Logger **without** importing `application/`. There is **no** eslint hole allowing `domain → application/logger`.

If an author followed the spec literally and imported `Logger` from `../application/logger.js` inside `src/domain/`, **eslint would correctly fail**. Production domain code uses observability — **conformant**.

### Discrepancies

1. **JSDoc requirement vs file eslint-disable**
   - `observability/logger.ts`: file-level disable of `jsdoc/require-jsdoc` (and param/returns) while `Logger` public methods still have JSDoc; `NullLogger` methods do not.
   - `lifecycle-verdict.ts`: disable for private helpers.
   - **Spec might be right:** document helpers or drop the disable.
   - **Code might be right:** eslint spec is too strict for private engine helpers; architecture/logging do not require JSDoc on NullLogger.

2. **eslint spec `## Spec Dependencies` lists conventions only**, not architecture, while it encodes architecture layers. Pre-existing. This change does **not** need an eslint delta if observability stays outside restricted groups.

3. **eslint does not forbid `console.*`** despite logging L5 / verify “linting or code review check”. Logging verify is SHOULD-level for console. Not an eslint-spec miss unless logging is considered in scope for eslint.

### Test Coverage / Missing Tests

Layer scenarios in eslint verify.md are enforced by the config, not vitest. No missing eslint _rule_ for this change.

### Spec Dependency Chain

- ESLint → conventions (disk). Architecture is an undeclared peer.

### Summary counts — eslint

|                                 | Count                                                  |
| ------------------------------- | ------------------------------------------------------ |
| Requirements reviewed           | 6                                                      |
| Layer rules vs Logger exception | **Conformant**                                         |
| Discrepancies                   | 2 (JSDoc disables; undeclared architecture dependency) |
| Missing tests                   | 0                                                      |

---

## `default:_global/docs` (disk — only if public API/docs drifted)

### Scope decision

This change specifies **ambient `Logger`** as a cross-layer observability surface and already **exports** `Logger` / `LoggerPort` from `@specd/core` `"."`. `docs/` has **zero** hits for `Logger`, `LoggerPort`, or `observability`.

- **No stale lifecycle/logging doc contract** was found (nothing in `docs/` documents the old or new Logger API).
- **No** template-variable / listing-shape / CLI-reference edits are implied by the **logging/architecture** deltas alone (CLI check _output_ belongs to CLI/lifecycle specs, not this batch).

### Discrepancy (optional, docs-spec lens)

Docs spec: new public ports under `application/ports/` get `docs/core/` entries. `LoggerPort` is re-exported from `application/ports`. If reviewers treat L6 as **newly specified public API**, `docs/core/` silence is a **same-change documentation gap**. If Logger was already public and undocumented, this is **pre-existing** and not introduced by the delta text.

**Recommendation for parent report:** do **not** fail the globals batch on docs unless the change is explicitly selling Logger as a new integrator contract. Flag as **INFO / optional**.

### Summary counts — docs

|                                     | Count    |
| ----------------------------------- | -------- |
| Drift of existing docs              | 0        |
| Optional undocumented public Logger | 1 (INFO) |

---

## Cross-cutting: domain/services vs application; observability vs application/logger

| Check                                        | Result                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/domain/services` imports `application/` | **None** (production)                                                                       |
| Domain Logger import                         | **Only** `lifecycle-verdict.ts` → `observability/logger.js`                                 |
| `evaluateLifecycle`                          | Application wrapper over `evaluateLifecycleVerdict`; **not** in architecture spec (correct) |
| `LifecycleEngine`                            | **No** class; `lifecycle-engine.ts` re-exports verdict types/functions                      |
| `application/logger.ts`                      | One-line re-export of observability                                                         |
| `no-restricted-imports`                      | Domain cannot use the application shim; observability is the allowed path                   |

---

## Overall summary counts

| Spec                                    | Reqs reviewed | Discrepancies | Missing tests | Blocking (user architecture constraint) |
| --------------------------------------- | ------------- | ------------- | ------------- | --------------------------------------- |
| `default:_global/architecture` (change) | 13            | 4             | 3             | **0**                                   |
| `default:_global/logging` (change)      | 6             | 6             | 5             | 0                                       |
| `default:_global/conventions` (disk)    | 8 relevant    | 2             | 0             | 0                                       |
| `default:_global/testing` (disk)        | 6             | 2             | 5 (shared)    | 0                                       |
| `default:_global/eslint` (disk)         | 6             | 2             | 0             | 0                                       |
| `default:_global/docs` (disk)           | scoped        | 0–1 INFO      | 0             | 0                                       |

**Highest-signal findings for the parent report:**

1. Architecture **preview is package-agnostic** and **does not** mention `evaluateLifecycle`, `LifecycleEngine`, or core file paths — user constraint **held**.
2. Domain **does not** import application; ambient Logger lives in **`observability/`**; eslint layer rules **do not** need a Logger exception if that layout is kept.
3. Dual surface `observability/*` vs `application/logger.ts` is the main implementation smell vs “ports live in application/ports”.
4. Ambient no-op is implemented; tests do not prove “no console”; `log()`↔`info()` untested on the facade.
5. Only `createKernel` wires `Logger.setImplementation`; architecture vs logging wording disagree on per-package wiring.
6. Docs: no Logger documentation; optional gap only if L6 is a new public API.
