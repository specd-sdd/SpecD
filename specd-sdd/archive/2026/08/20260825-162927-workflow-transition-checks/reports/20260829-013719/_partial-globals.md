# Spec-compliance partial: project-wide globals

- **Mode:** change `workflow-transition-checks`
- **Batch:** `_partial-globals.md`
- **Read-only:** no code or spec files were modified.
- **Change previews (`changes spec-preview`):** `default:_global/architecture`, `default:_global/logging`
- **Conformance-only (`specs show` / disk):** `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/docs`
- **Graph:** `graph stats` → `stale: false`, `contentFresh: true`, `coverageComplete: true`. `graph search "Logger"` resolved `core:src/observability/logger.ts` (class) with public bindings on `observability/logger.ts`, `observability/index.ts`, `application/logger.ts`, `application/index.ts`. `graph impact --symbol Logger` returned `not_found`. Import/layer checks used source reads after graph.

**USER-ENFORCED (blocking if violated):** architecture preview MUST remain package-agnostic — MUST NOT mention `evaluateLifecycle`, `packages/core/...` paths, or `LifecycleEngine`. Ambient `Logger` is the only inner-layer import exception. Domain must not import `application/`. Logging: `log` vs `info`; domain MAY call `Logger.debug`. Observability vs domain imports checked.

**Verdict on user constraint:** **PASS (0 blocking).** Merged architecture `spec.md` / `verify.md` preview contains none of the forbidden terms. Disk `specs/_global/architecture/spec.md` likewise. (`spec-lock.json` lists `packages/core/...` file coverage — lock metadata, not the architecture prose preview.)

**Prior LOW (re-checked, still open):** (1) `log()` vs `info()` identity is not asserted on the ambient facade. (2) Logger unit tests live at `test/application/logger-port.spec.ts` instead of mirroring `src/observability/`.

---

## Requirements Summary

### `default:_global/architecture` (change preview)

| ID  | Requirement                                                                                                | In this change’s delta? |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| A1  | Packages with business logic: `domain` / `application` / `infrastructure`; inner layers never import outer | No (baseline)           |
| A2  | Domain is pure (no I/O); **exception: ambient Logger** is the sole inner-layer import exception            | **Yes**                 |
| A3  | Application uses `application/ports/` only; ambient Logger is not an infrastructure adapter                | **Yes**                 |
| A4  | Rich domain entities; invalid transitions throw typed errors                                               | No                      |
| A5  | Value objects expose behaviour, not internal structure                                                     | No                      |
| A6  | Ports with shared construction: `abstract class`; methods not property signatures                          | No                      |
| A7  | Stateless domain operations: plain functions in `domain/services/`                                         | No                      |
| A8  | Manual DI at package entry; no IoC                                                                         | No                      |
| A9  | Only `composition/` imports `infrastructure/`; kernel / `createX` factories                                | No                      |
| A10 | YAML validated at infrastructure boundary                                                                  | No                      |
| A11 | Adapter packages contain no business logic                                                                 | No                      |
| A12 | No circular `workspace:*` dependencies                                                                     | No                      |
| A13 | Curated public barrels; hosts use `@specd/sdk`                                                             | No                      |

**Verify.md (change):** scenarios “Domain imports ambient Logger” and “Application imports ambient Logger”.

**Package-agnostic check:** preview does not name `evaluateLifecycle`, `LifecycleEngine`, or `packages/core/...`. Application `evaluateLifecycle` (`application/services/lifecycle-evaluation.ts`) and domain `evaluateLifecycleVerdict` / `lifecycle-engine.ts` re-export barrel exist in code; architecture correctly does not mention them.

### `default:_global/logging` (change preview)

| ID  | Requirement                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Interface: `log()`, `info()`, `debug()`, `warn()`, `error()` (console-compatible)                                                                                                                             |
| L2  | `log()` SHALL be an alias of `info()`                                                                                                                                                                         |
| L3  | Minimal **console** impl: `fatal` → `console.error` + `[FATAL]`; `trace` → `console.debug`/`log` + `[TRACE]`                                                                                                  |
| L4  | Levels: `trace` < `debug` < `info`/`log` < `warn` < `error` < `fatal`; `fatal` = process-terminating critical                                                                                                 |
| L5  | Production code avoids direct `console.*`; use logging abstraction                                                                                                                                            |
| L6  | **Ambient Logger** (added): composition assigns impl; no-op before wiring; any layer MAY import (`debug`, `trace`, diagnostic `info`); not for control flow / persistence; each package chooses how to use it |

Disk logging has L1–L5 only. Preview adds L6 and `## Spec Dependencies` → architecture.

### `default:_global/conventions` (disk, conformance)

TypeScript `strict` / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`; ESM `NodeNext`; named exports only; kebab-case sources; tests `test/` mirroring `src/` with `.spec.ts`; no `any`; explicit return types on public API; core errors extend `SpecdError`; underscore backing fields; lazy `list()`; immutability preference. Layer barrels only for `domain`/`application`/`composition` when >50 modules.

### `default:_global/testing` (disk, conformance)

Vitest; `test/` mirror; unit tests mock ports (no fs/net/process); full typed port mocks; infrastructure integration with tmpdir cleanup; `"given <state>, when <action>, then <outcome>"`; no snapshots.

### `default:_global/eslint` (disk, conformance)

No `any`; named exports; explicit public return types; kebab-case `src/`; JSDoc on functions/classes (tests exempt); `no-restricted-imports` for architecture layers.

### `default:_global/docs` (disk, scoped)

Docs under `docs/`; ADRs MADR; CLI/MCP/core/SDK alignment; JSDoc on symbols; composition-surface and listing-contract docs stay in-change. Audited only for Logger / architecture-delta drift.

---

## Implementation Status

### Architecture (A2 / A3 / layers) — change-relevant

| Req | Status                               | Evidence                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Mostly implemented**               | `@specd/core` has `domain/`, `application/`, `infrastructure/`, `composition/`. Additional sibling **`observability/`** (not named in the spec; package-agnostic spec cannot name core paths).                                                                                                                                                                                     |
| A2  | **Implemented via `observability/`** | Production domain Logger import: only `packages/core/src/domain/services/lifecycle-verdict.ts` → `../../observability/logger.js`. No `src/domain/**` import from `application/` (name `DeltaApplicationError` is not a layer import). No `node:fs` in that Logger path. Domain calls **`Logger.debug`** (two sites in `lifecycle-verdict.ts`) with no logger constructor argument. |
| A3  | **Implemented**                      | Use cases import `Logger` from `application/logger.js` (re-export of observability). Logger is not a use-case constructor port.                                                                                                                                                                                                                                                    |
| A7  | **Implemented for verdict**          | `evaluateLifecycleVerdict` is a plain exported function. `lifecycle-engine.ts` is a named re-export, not a class. **`LifecycleEngine` does not exist as a class.**                                                                                                                                                                                                                 |
| A9  | **Implemented for Logger wiring**    | `composition/kernel.ts` calls `Logger.setImplementation(createDefaultLogger(...))`.                                                                                                                                                                                                                                                                                                |

**Observability vs application shims:**

| Path                                   | Role                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `src/observability/logger.ts`          | Canonical ambient `Logger` + `NullLogger`             |
| `src/observability/logger.port.ts`     | Canonical `LoggerPort` / `LogLevel`                   |
| `src/observability/index.ts`           | Layer barrel re-export                                |
| `src/application/logger.ts`            | `export { Logger } from '../observability/logger.js'` |
| `src/application/ports/logger.port.ts` | Re-export of observability port types                 |

Domain **must not** import `application/logger.js` (eslint `**/application/**`). Application/infra/composition **may** import the application shim. Same class, two import graphs.

**`evaluateLifecycle`:** lives only in application (`lifecycle-evaluation.ts`); wraps `evaluateLifecycleVerdict` + guidance. Architecture preview correctly omits it.

### Logging

| Req | Status                                          | Evidence                                                                                                                                                                                                       |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **Implemented**                                 | `LoggerPort` + static `Logger` methods include the five console methods plus `fatal`, `trace`, `isLevelEnabled`, `child`.                                                                                      |
| L2  | **Implemented in Pino; facade is pass-through** | `PinoLogger.log` and `PinoLogger.info` both call `this.logger.info(...)`. Ambient `Logger.log` calls `impl.log`, not `impl.info`. Alias holds for the default adapter; a custom `LoggerPort` could split them. |
| L3  | **N/A in repo**                                 | No console-backed logger. Pino has no `[FATAL]` / `[TRACE]` prefixes.                                                                                                                                          |
| L4  | **Partial**                                     | `LogLevel` includes extra `'silent'`. `fatal` logs via pino; does not terminate the process. Ordering not encoded as a comparable type.                                                                        |
| L5  | **Core yes; CLI still `console.*`**             | CLI: `console.warn` in `load-config.ts`, `cli-context.ts`; `console.error` in `spec-preview.ts`. Verify allows excluding bootstrap.                                                                            |
| L6  | **Implemented for no-op + ambient debug**       | Default `NullLogger`; `setImplementation` / `resetImplementation`. Domain uses `Logger.debug` without a port. Only **core** `createKernel` assigns the impl.                                                   |

### Conventions / testing / eslint (change-touched Logger / verdict files)

| Check                                                                          | Status                                                                                                                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kebab-case `observability/logger.ts`, `logger.port.ts`, `lifecycle-verdict.ts` | Pass                                                                                                                                                                           |
| Named exports, no default on Logger                                            | Pass                                                                                                                                                                           |
| Explicit return types on `Logger` static methods                               | Pass                                                                                                                                                                           |
| Test path mirror for Logger                                                    | **Fail pairing:** tests at `test/application/logger-port.spec.ts` vs source `src/observability/logger.ts` (and `logger.port.ts`)                                               |
| Lifecycle tests vs source                                                      | **Partial:** `test/domain/services/lifecycle-engine.spec.ts` matches barrel `lifecycle-engine.ts`, not `lifecycle-verdict.ts`                                                  |
| `observability/index.ts` barrel                                                | Extra barrel; conventions exception lists domain/application/composition only                                                                                                  |
| Vitest + full `LoggerPort` mock in `logger-port.spec.ts`                       | Pass                                                                                                                                                                           |
| Test titles `given/when/then`                                                  | Logger tests do not follow the pattern                                                                                                                                         |
| ESLint domain ↛ application/infrastructure/composition                         | **Conformant.** No Logger exception in eslint; domain imports `observability/` which is unrestricted. Importing `application/logger` from `src/domain/` would be a lint error. |
| JSDoc                                                                          | File-level `eslint-disable jsdoc/require-jsdoc` on `observability/logger.ts` (`NullLogger`) and `lifecycle-verdict.ts` (private helpers)                                       |

### Docs

`docs/` has **no** `Logger` / `LoggerPort` / `observability` hits. No stale documented Logger contract. Optional gap only if L6 is treated as a newly specified public integrator API (`Logger` already exported from core `"."` via application shims).

---

## Discrepancies

Each item: **severity**, **classification** (`code-wrong` | `spec-wrong` | `both`), evidence, both-sides reading.

### D1 — Architecture still says “three layers”; code has `observability/`

- **Severity:** LOW
- **Classification:** both
- **Spec might be right:** A1 requires three layers; a fourth folder is undescribed.
- **Code might be right:** naming `observability/` or `packages/core/...` in the **global architecture spec would violate the user-enforced package-agnostic constraint**. The exception is “import ambient Logger”, not “import application”.
- **Not a user-constraint violation.**

### D2 — “Each package wires the implementation at its composition root” (architecture A2) vs “each package chooses” (logging L6) vs single `createKernel` call

- **Severity:** MEDIUM
- **Classification:** both (intra-change spec tension; code matches logging better)
- **Evidence:** only `packages/core/src/composition/kernel.ts` calls `Logger.setImplementation`. CLI/code-graph/SDK consume the static facade.
- **Architecture might be right:** every package composition root should assign an impl.
- **Logging + code might be right:** one process-level assignment is enough; other packages choose ambient use without re-wiring.

### D3 — Port types live in `observability/logger.port.ts`, not authored in `application/ports/`

- **Severity:** LOW
- **Classification:** both
- **Architecture A3 / A13:** ports live under `application/ports/` (and `@specd/core/ports`).
- **Code:** types defined in observability, re-exported from `application/ports/logger.port.ts`. Domain importing `application/ports` would fail eslint.
- **Spec might be right:** move the interface into application/ports (would force eslint exception or domain staying on observability types only).
- **Code might be right:** keep port beside the ambient facade so domain never imports `application/`.

### D4 — Architecture `## Spec Dependencies` is still `*none*` while body links to logging; logging (change) depends on architecture

- **Severity:** LOW
- **Classification:** spec-wrong (documentation graph)
- One-way declared dependency + reverse prose link. Not a package cycle.

### D5 — Ambient `Logger.log` does not call `info()` on the facade

- **Severity:** LOW
- **Classification:** both
- **Spec L2:** `log()` SHALL be treated as an alias for `info()`.
- **Code:** `Logger.log` → `impl.log`; `Logger.info` → `impl.info`. Pino aliases both to `info`. A non-aliasing `LoggerPort` would diverge.
- **Spec might be right:** facade should call `impl.info` from both, or document that alias is an adapter contract.
- **Code might be right:** alias is an implementation concern of `LoggerPort` adapters.

### D6 — `LogLevel` includes `silent`; `fatal` does not terminate the process

- **Severity:** LOW
- **Classification:** both
- Spec L4: `fatal` = immediate process termination; no `silent`.
- Code: pino `silent` + `fatal` log only.
- **Spec might be right:** document `silent` and non-terminating fatal, or implement termination.
- **Code might be right:** process kill is a host concern; pino semantics are enough.

### D7 — L3 console prefix mapping has no implementation

- **Severity:** INFO
- **Classification:** spec-wrong _if_ L3 is claimed as always-on; **N/A** if scoped to “minimal console implementations” only
- No console logger in-repo to pass or fail L3.

### D8 — CLI `console.warn` / `console.error`

- **Severity:** LOW
- **Classification:** both
- L5 vs verify “excluding bootstrapping”. CLI warnings are user-facing bootstrap UX.

### D9 — JSDoc eslint-disable on observability `NullLogger` and lifecycle-verdict helpers

- **Severity:** LOW
- **Classification:** both
- ESLint/docs: JSDoc on all functions. Code disables the rule for private helpers / no-op methods.
- **Spec might be right:** document `NullLogger` methods.
- **Code might be right:** global JSDoc rule is too strict for no-ops and private engine helpers.

### D10 — `observability/index.ts` barrel not in conventions exception list

- **Severity:** LOW
- **Classification:** both
- Conventions: no `index.ts` except package root and listed layer barrels. Domain already imports `logger.js` directly.

### D11 — Docs silence on public `Logger` / `LoggerPort`

- **Severity:** INFO
- **Classification:** spec-wrong _only if_ L6 is a new public API requiring `docs/core/` in the same change; otherwise **pre-existing** undocumented export
- No contradictory stale docs found.

**Forbidden-term / layer-import findings:** none. Domain does not import `application/`. Ambient Logger is the only production inner-layer exception (`observability/`).

---

## Test Coverage

| Spec scenario                                     | Coverage                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture: domain ↛ infrastructure / `node:fs` | ESLint + tsc; no dedicated vitest                                                                                                                                                    |
| Architecture: domain MAY import ambient Logger    | Production import compiles; **no** lint fixture asserting allow vs deny paths                                                                                                        |
| Architecture: application MAY import Logger       | Indirect via use-case tests spying `Logger.debug`                                                                                                                                    |
| Logging L1 methods exist                          | Type-level `LoggerPort`; no interface contract test                                                                                                                                  |
| Logging L2 `log()` ≡ `info()`                     | **Uncovered** on ambient `Logger`. Pino both call `logger.info` — **no explicit test** that `PinoLogger.log` and `.info` are identical                                               |
| Logging L3 prefixes                               | Missing (no console impl)                                                                                                                                                            |
| Logging L4 severity order                         | Missing                                                                                                                                                                              |
| Logging L5 console lint                           | ESLint does not ban `console.*`                                                                                                                                                      |
| Logging L6 no-throw before wiring                 | Partial: `logger-port.spec.ts` only `info`/`error`; **no** `console` spy proving no-op writes nothing                                                                                |
| Logging L6 no logger port in domain               | Production `evaluateLifecycleVerdict` has no logger param; tests spy `Logger` from **`application/logger.js`** in `lifecycle-engine.spec.ts` — they do not assert signature omission |
| Testing: full port mock                           | `logger-port.spec.ts` implements all `LoggerPort` methods                                                                                                                            |
| Testing: given/when/then                          | Logger tests use informal titles                                                                                                                                                     |

Pino: `test/infrastructure/logging/pino-logger.spec.ts` (callback destination, `child`, `isLevelEnabled`) — adapter, not ambient alias.

---

## Missing Tests

1. **Prior LOW (still open):** `Logger.log` and `Logger.info` (and/or `PinoLogger.log` / `.info`) produce identical underlying calls.
2. **Prior LOW (still open):** `test/observability/logger.spec.ts` (and/or `logger.port.spec.ts`) mirroring `src/observability/` — today only `test/application/logger-port.spec.ts`.
3. All ambient methods no-throw **and** `console.*` not invoked before `setImplementation`.
4. `resetImplementation` restores no-op (not asserted).
5. ESLint/compiler fixture: domain import of `application/logger` fails; import of `observability/logger` succeeds.
6. Console `[FATAL]`/`[TRACE]` **only if** a console adapter is claimed.
7. Per-package `setImplementation` **only if** architecture A2 wiring sentence is treated as binding.

---

## Spec Dependency Chain

```
default:_global/architecture (change preview)
  Spec Dependencies: none (body still links logging)
  ↑ depended on by: default:_global/logging (change)
  ↑ depended on by: default:_global/testing (disk)
  ↑ restated by: default:_global/eslint layer rules (disk; eslint Spec Dependencies list conventions only)

default:_global/logging (change preview)
  → default:_global/architecture

default:_global/conventions (disk)
  → default:_global/error-handling-conventions
  ↑ depended on by: testing, eslint, docs

default:_global/testing (disk)
  → architecture, conventions

default:_global/eslint (disk)
  → conventions (architecture layers encoded but not listed)

default:_global/docs (disk)
  → conventions
```

This change’s core specs (`core:transition-checks`, `core:lifecycle-engine`, `core:change`, …) depend on architecture via change `specDependsOn`; those are out of this batch except for confirming architecture stays package-agnostic.

---

## Summary counts

| Spec                                     | Reqs reviewed                  | Implemented (change-relevant / conformance)                                                 | Discrepancies                              | Missing tests         | Blocking (user architecture constraint) |
| ---------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------- | --------------------------------------- |
| `default:_global/architecture` (preview) | 13                             | A2/A3/A7/A9 yes (observability layout caveat)                                               | 4 (D1–D4)                                  | 3                     | **0**                                   |
| `default:_global/logging` (preview)      | 6                              | L1 yes; L2 yes with facade caveat; L3 N/A; L4 partial; L5 mostly; L6 yes (core-only wiring) | 4 (D5–D8) + shared D2                      | 5 (incl. 2 prior LOW) | 0                                       |
| `default:_global/conventions` (disk)     | 10 (change-relevant subset ~8) | kebab/named/ESM/returns yes; test pairing / extra barrel no                                 | 2 (D10 + test pairing)                     | 0 lint-enforced       | 0                                       |
| `default:_global/testing` (disk)         | 6                              | Vitest/mocks yes; naming informal                                                           | 1 (naming)                                 | shared with logging   | 0                                       |
| `default:_global/eslint` (disk)          | 6                              | Layer rules **conformant** to Logger exception                                              | 1 (D9 JSDoc) + undeclared architecture dep | 0                     | 0                                       |
| `default:_global/docs` (disk)            | scoped                         | no stale Logger docs                                                                        | 1 INFO (D11)                               | 0                     | 0                                       |

| Totals (this batch)                            | Count                                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Requirements reviewed                          | 47 (13+6+10+6+6+scoped docs not double-counted as 6; docs treated as 1 scoped check) — **conservative unique: 13+6+8+6+6+1 = 40** |
| Unique discrepancies (D1–D11)                  | 11 (1 MEDIUM, 8 LOW, 2 INFO)                                                                                                      |
| Missing tests listed                           | 7                                                                                                                                 |
| Blocking user-enforced architecture violations | **0**                                                                                                                             |
| Prior LOW still open                           | **2** (`log`/`info` tests; observability test path mirror)                                                                        |

**Highest-signal for parent report:**

1. Architecture **preview is package-agnostic** — no `evaluateLifecycle`, `LifecycleEngine`, or `packages/core/...` in spec prose. **User constraint held.**
2. Domain **does not** import `application/`; sole production Logger import is **`observability/logger.js`**; domain **does** call `Logger.debug`. ESLint needs **no** Logger exception if that layout is kept.
3. Dual surface `observability/*` vs `application/logger.ts` is the main layout smell vs “ports live in application/ports”.
4. `log()`↔`info()` holds in Pino, **not tested**; ambient facade does not force alias.
5. Logger tests still under `test/application/`, not `test/observability/`.
6. Architecture vs logging disagree on per-package `setImplementation`; code wires only in `createKernel`.
