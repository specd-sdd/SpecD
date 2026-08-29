# Spec-compliance audit — globals batch

**Mode:** change `workflow-transition-checks` (read-only)  
**Previews:** `default:_global/architecture`, `default:_global/logging` (via `changes spec-preview`)  
**Conformance (workspace specs, not in this change):** `default:_global/conventions`, `testing`, `eslint`, `docs`  
**Graph:** `stale: false` (`lastIndexedAt` 2026-08-29T10:57:16Z)  
**CLI:** `node packages/cli/dist/index.js`

**Architecture constraint (user-enforced blocking):** **PASS**

Preview `spec.md` / `verify.md` do **not** mention `evaluateLifecycle`, `packages/core/…`, or `LifecycleEngine`. Domain imports `Logger` from `observability/`, not `application/`. Domain calls `Logger.debug`.

---

## Requirements Summary

### `default:_global/architecture` (preview)

| ID  | Requirement                                                  | Kind         | Notes                                                                                          |
| --- | ------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------- |
| A1  | Layered structure (domain / application / infrastructure)    | constraint   | Unchanged by delta; core still layered.                                                        |
| A2  | Domain layer is pure + **ambient Logger exception**          | **changed**  | Process-level composition root assigns impl; packages choose call sites; link to logging spec. |
| A3  | Application uses ports only + Logger not an adapter import   | **changed**  | Diagnostic `Logger` allowed.                                                                   |
| A4  | Rich domain entities                                         | pre-existing | Out of delta; not re-audited line-by-line.                                                     |
| A5  | Value objects expose behaviour                               | pre-existing | Same.                                                                                          |
| A6  | Ports with shared construction are abstract classes          | pre-existing | Same.                                                                                          |
| A7  | Pure functions for stateless domain services                 | pre-existing | `evaluateLifecycleVerdict` remains a function in `domain/services/`.                           |
| A8  | Manual dependency injection                                  | pre-existing | Ambient Logger is an explicit exception, not ctor DI.                                          |
| A9  | Composition layer / `createKernel` / factories               | pre-existing | Logger assignment still happens inside `createKernel` (see discrepancies).                     |
| A10 | YAML validated at infrastructure boundary                    | pre-existing | Untouched.                                                                                     |
| A11 | Adapter packages contain no business logic                   | pre-existing | Untouched.                                                                                     |
| A12 | No circular `workspace:*` package deps                       | pre-existing | Untouched.                                                                                     |
| A13 | Curated public barrels                                       | pre-existing | `Logger` re-exported from core public surfaces.                                                |
| A-C | Constraints: domain ↛ application/infrastructure/composition | constraint   | Enforced by ESLint `no-restricted-imports`; observability is not a forbidden group.            |
| A-D | Spec Dependencies → `default:_global/logging`                | **changed**  | Extract vs persisted mismatch (below).                                                         |

Verify (delta): domain/application MAY import ambient `Logger`.

### `default:_global/logging` (preview)

| ID  | Requirement                                                                              | Kind         | Notes                                                                                   |
| --- | ---------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| L1  | Console compatibility (`log/info/debug/warn/error`)                                      | pre-existing | `LoggerPort` + facade.                                                                  |
| L2  | `log()` aliases `info()`                                                                 | pre-existing | Facade `Logger.log` → `impl.info`; `PinoLogger.log` → pino `info`.                      |
| L3  | Minimal **console** impl: `fatal`→`console.error`+`[FATAL]`; `trace`→debug/log+`[TRACE]` | pre-existing | Applies only to console-backed adapters; production uses Pino.                          |
| L4  | Log level semantics                                                                      | pre-existing | Levels exist on port; no ordering type.                                                 |
| L5  | Prefer logging abstraction over `console.*` in production                                | pre-existing | Kernel wires Pino; domain/application use `Logger`.                                     |
| L6  | **Ambient Logger**                                                                       | **changed**  | No-op before wiring; any layer MAY import; not for control flow; packages choose usage. |
| L-D | Spec Dependencies → `default:_global/architecture`                                       | **changed**  | Change plan already lists this; lock still `[]`.                                        |

### Conformance (globals not in change)

| Spec        | Relevance to this batch                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| conventions | kebab-case `logger.ts`; tests in `test/` mirroring `src/`; named exports; public return types; no `any`.                    |
| testing     | Vitest; `test/observability/logger.spec.ts` mirrors `src/observability/logger.ts`; `given…when…then` names on Logger tests. |
| eslint      | Layer `no-restricted-imports` does not block `domain` → `observability`. JSDoc disable on Logger/Pino files.                |
| docs        | JSDoc-on-all-symbols; no `docs/` hits for `observability/logger` (Logger is code-first).                                    |

---

## Implementation Status

| Requirement                             | Status                      | Evidence                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A2 Domain purity + Logger               | **Implemented**             | `packages/core/src/domain/services/lifecycle-verdict.ts` imports `Logger` from `../../observability/logger.js` (not `application/`). `Logger.debug` at diagnostic sites. No `domain` → `application/` / `infrastructure/` / `composition/` imports (search).                                   |
| A3 Application Logger                   | **Implemented**             | Use cases (`get-status`, `transition-change`, `validate-artifacts`, `archive-change`, `get-artifact-instruction`) call `Logger.debug`. Ports still live under `application/ports/`; `application/ports/logger.port.ts` re-exports observability types.                                         |
| A-C Domain ↛ application                | **Implemented**             | ESLint `packages/*/src/domain/**` forbids `**/application/**`. Domain Logger path is `observability/`.                                                                                                                                                                                         |
| L1 Console-compatible methods           | **Implemented**             | `LoggerPort` in `src/observability/logger.port.ts`; facade methods on `Logger`.                                                                                                                                                                                                                |
| L2 `log` ≡ `info`                       | **Implemented**             | `Logger.log` calls `Logger.impl.info` (`logger.ts` ~41–44). `PinoLogger.log` uses `this.logger.info`.                                                                                                                                                                                          |
| L3 Console prefix mapping               | **N/A / not this adapter**  | `PinoLogger` uses pino `fatal`/`trace`, not `console.error` + `[FATAL]`. Spec scopes this to console-object implementations.                                                                                                                                                                   |
| L5 No production `console` for app logs | **Implemented (core path)** | `createKernel` → `createDefaultLogger` (Pino).                                                                                                                                                                                                                                                 |
| L6 Ambient Logger                       | **Implemented**             | `NullLogger` default; `setImplementation` / `resetImplementation`; `createKernel` (`composition/kernel.ts` ~275) assigns `createDefaultLogger`. Domain has no logger ctor/port.                                                                                                                |
| A9 Process-level vs kernel              | **Implemented with caveat** | Architecture delta: _process-level composition root assigns; other packages MAY use facade without re-wiring_. Runtime assignment is still `createKernel` in `@specd/core` composition (typical host bootstrap). Standalone `createX` does not call `setImplementation` (only kernel + tests). |
| Observability location                  | **Implemented**             | Canonical module: `src/observability/logger.ts`. Shims: `src/application/logger.ts`, `application/ports/logger.port.ts`.                                                                                                                                                                       |
| Prior LOW tests location                | **Closed**                  | Only `packages/core/test/observability/logger.spec.ts` (no `test/application/**/logger.spec.ts`).                                                                                                                                                                                              |

---

## Discrepancies

### D1 — `DEPS_INCONSISTENT` on `default:_global/architecture` — **HIGH** (workflow / metadata)

**Observed (change status):** `deps.consistent` fail: extracted `dependsOn` `[default:_global/logging]` vs persisted `[]` for `default:_global/architecture`.

**Spec (preview):** Spec Dependencies lists logging (ambient Logger exception + composition-root assignment).

**Persisted:** `specs/_global/architecture/spec-lock.json` `"dependsOn": []`. Change `specDependsOn["default:_global/architecture"]` is empty. Contrast: `specDependsOn["default:_global/logging"]` already has `[default:_global/architecture]`.

**Interpretations:**

1. **Spec/delta correct, plan/lock stale** (most likely): architecture delta added the edge; publication plan and sidecar were not updated. Ready is blocked until plan + lock match extract.
2. **Persisted `[]` still intended:** then the architecture delta Spec Dependencies section should not list logging (would contradict the written exception).
3. **Both incomplete:** logging lock is also `"dependsOn": []` while the _change plan_ already has logging→architecture. After archive, architecture lock must gain logging or extract will keep failing.

This is the mismatch called out from prior 090131 / current lifecycle blockers. **Not an implementation bug.**

### D2 — Bidirectional spec dependency cycle — **MEDIUM** (spec graph)

**Architecture preview** depends on **logging**. **Logging preview** depends on **architecture**. That is a 2-node cycle in the spec DAG.

**Possible readings:**

- **Intentional cross-reference** for the Logger exception (each spec points at the other).
- **Should be one-way:** architecture→logging (exception lives in architecture; logging only _mentions_ architecture in prose) **or** logging→architecture only.

`deps.consistent` currently fails only the architecture side because the change plan already recorded logging→architecture.

### D3 — Prior 090131 MEDIUM (each-package wires vs logging vs `createKernel`) — **CLOSED as spec contradiction; residual composition note**

**Was:** architecture “each package wires Logger” vs logging “each package chooses” vs code `createKernel` wiring.

**Now (architecture delta):** _A process-level composition root assigns the implementation; other packages MAY use the facade without re-wiring. Each package chooses how and where to call it._

**Logging:** composition root assigns; each package chooses how/where to **use** it; no ctor-vs-ambient mandate.

Those texts **align**. Code still assigns in `createKernel`, which is a process-wide ambient write when hosts use the kernel. Residual (not a text clash): hosts that only call `createX(deps)` never run `Logger.setImplementation` → `NullLogger` (silent diagnostics). Specs do not require every factory to wire Logger.

### D4 — JSDoc ESLint disabled on observability Logger / Pino adapter — **LOW** (conformance vs `eslint`/`docs`)

`logger.ts` and `pino-logger.ts` start with `eslint-disable` for `jsdoc/require-jsdoc` (and related). Facade methods have short JSDoc; `NullLogger` methods do not. `docs` / `eslint` require JSDoc on functions/methods in `src/`.

**Readings:** (a) code should drop disable and document `NullLogger`; (b) specs over-reach for tiny private no-ops.

### D5 — Architecture does not name `observability/` as a layer — **LOW** (implicit)

Hexagon text still lists domain / application / infrastructure (+ composition). Implementation places the ambient facade under `src/observability/`. User-enforced location **matches code**. Architecture allows “the project's ambient Logger” without a path; ESLint does not treat observability as outer.

Not a fail of the blocking constraint.

### Non-discrepancies (checked)

- Architecture preview **forbidden strings:** none found.
- Domain **application imports:** none (other than unrelated `DeltaApplicationError` name).
- `Logger.log` ≡ `info`: implemented and tested (prior LOW **closed**).
- Tests under `application` for Logger: **gone**.

---

## Test Coverage

| Requirement / scenario            | Tests                                                                                                                                     | Verdict                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| L2 `log()` aliases `info()`       | `test/observability/logger.spec.ts` — _given an implementation, when log runs, then it aliases info_ (`impl.info` called; `impl.log` not) | **Covered**                                                                |
| L6 no-throw before wiring         | _given no implementation, when info or error runs, then it does not throw_                                                                | **Partial** — no `debug`/`log`; does not spy `console`                     |
| L6 no console until assigned      | verify: MUST NOT write to `console` unless assigned                                                                                       | **Missing**                                                                |
| L6 domain no logger port          | `evaluateLifecycleVerdict` is a function; `lifecycle-engine.spec.ts` spies `Logger.debug`                                                 | **Indirect** — no assertion “no logger in options type”                    |
| A2 domain Logger import permitted | Lint + compile; no dedicated eslint spec test in this package                                                                             | **Tooling, not a WHEN/THEN unit test** (matches architecture verify style) |
| L1 method presence                | Delegation test covers `info`/`error`/`child`/`isLevelEnabled`                                                                            | **Partial** — no explicit `warn`/`fatal`/`trace` on facade                 |
| L3 `[FATAL]` / `[TRACE]`          | No tests in core                                                                                                                          | **Uncovered** (console-minimal adapter absent)                             |
| L4 severity order                 | None                                                                                                                                      | **Uncovered** (no comparator API)                                          |
| Domain `Logger.debug`             | `lifecycle-engine.spec.ts` spy `Logger.debug` on `evaluateLifecycleVerdict`                                                               | **Covered**                                                                |

---

## Missing Tests

1. **L6 AND-clause:** after import, with default `NullLogger`, `console.log` / `console.error` / `console.debug` are **not** invoked (`vi.spyOn(console, …)`).
2. **L6 `Logger.debug` / `Logger.log` no-throw** on default impl (info/error only today).
3. **L3** if a console-backed `LoggerPort` is ever shipped: `[FATAL]` / `[TRACE]` prefix scenarios.
4. Optional: facade `warn` / `fatal` / `trace` delegation (parity with `info`).

Not missing (prior LOW): `log`≡`info`; file location `test/observability/logger.spec.ts`.

---

## Spec Dependency Chain

```
default:_global/architecture  --(preview extract)-->  default:_global/logging
default:_global/logging       --(preview + change plan)-->  default:_global/architecture
                                                      CYCLE (D2)

Persisted / lock:
  architecture spec-lock dependsOn: []     ≠ extract [logging]   → DEPS_INCONSISTENT (D1)
  logging spec-lock dependsOn: []
  change specDependsOn logging: [architecture]  (matches extract)
  change specDependsOn architecture: []         (mismatches extract)

Conformance (depth 1, not in change):
  logging ↔ architecture (mutual, preview)
  conventions → error-handling-conventions
  testing → architecture, conventions
  eslint → conventions  (and enforces architecture import rules)
  docs → conventions
```

Direct dependencies of **this change’s global specs** (preview): architecture↔logging only. Project-wide conformance specs are audit scope, not delta targets.

---

## Architecture constraint PASS/FAIL

| Check                                                         | Result                            |
| ------------------------------------------------------------- | --------------------------------- |
| Architecture **preview** must not mention `evaluateLifecycle` | **PASS**                          |
| Architecture **preview** must not mention `packages/core/…`   | **PASS**                          |
| Architecture **preview** must not mention `LifecycleEngine`   | **PASS**                          |
| Domain must not import application                            | **PASS**                          |
| Ambient `Logger` lives under `observability/`                 | **PASS**                          |
| Domain MAY `Logger.debug`                                     | **PASS** (`lifecycle-verdict.ts`) |

**Overall architecture constraint: PASS.**

---

## Summary counts

| Metric                                                  | Count                                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Specs in this batch (previews)                          | 2 (`architecture`, `logging`)                                                                       |
| Conformance specs reviewed                              | 4 (`conventions`, `testing`, `eslint`, `docs`)                                                      |
| Requirements tabulated (architecture + logging)         | 19 (13 architecture + 6 logging)                                                                    |
| Changed requirements in deltas                          | 4 (A2, A3, A-D, L6) + L-D                                                                           |
| Implemented (changed + Logger-related)                  | A2, A3, L1, L2, L5, L6                                                                              |
| N/A this adapter                                        | L3 (Pino ≠ console mapping)                                                                         |
| Discrepancies                                           | 5 (D1 HIGH, D2 MEDIUM, D3 closed+note, D4 LOW, D5 LOW)                                              |
| Prior 090131 MEDIUM (wiring wording)                    | **Closed** (process-level composition root)                                                         |
| Prior LOW (`log`≡`info` untested; tests in application) | **Closed**                                                                                          |
| Missing tests                                           | 3–4 (console silence; extra no-throw; optional L3/L1)                                               |
| Architecture constraint                                 | **PASS**                                                                                            |
| Workflow `deps.consistent`                              | **FAIL** (D1) — expected until architecture `dependsOn` is persisted as `[default:_global/logging]` |
