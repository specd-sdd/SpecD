# Spec-compliance audit (partial): globals, config, skills

**Mode:** change `workflow-transition-checks`  
**Scope:** `default:_global/architecture`, `default:_global/logging`, `core:config`, `skills:skill-templates-source`  
**Focus:** observability facade / no logging cycle, config workflow checks (approvals), skill template lifecycle-transition updates  
**Report:** `20260829-175039`  
**Read-only**

---

## default:\_global/architecture

### Requirements Summary

| Requirement                                            | Verdict  | Evidence                                                                                                                              |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Layered structure for packages with business logic     | **PASS** | `@specd/core` maintains `domain/`, `application/`, `infrastructure/`, `composition/` separation                                       |
| Domain layer is pure (I/O-free)                        | **PASS** | No `node:fs` / I/O imports under `packages/core/src/domain/`                                                                          |
| **Exception — ambient Logger**                         | **PASS** | Change delta adds sole cross-layer exception; `packages/core/src/observability/logger.ts`; domain import in `lifecycle-verdict.ts:13` |
| Observability facade, not fourth hexagon layer         | **PASS** | Delta prose; module at `src/observability/` (not `domain/` / `infrastructure/`)                                                       |
| Application layer uses ports only                      | **PASS** | Use cases receive ports via constructor; Logger import explicitly permitted in delta                                                  |
| Application may import ambient Logger                  | **PASS** | `application/logger.ts` re-exports observability facade; used from composition / infrastructure                                       |
| Process-level composition root wires Logger            | **PASS** | `createKernel` → `Logger.setImplementation(createDefaultLogger(...))` in `kernel.ts:275`                                              |
| Manual DI / no module-level singletons (general)       | **PASS** | Ambient Logger is the documented sole exception; wiring remains at composition root                                                   |
| No circular spec dependencies (logging ↔ architecture) | **PASS** | Change delta: architecture has no deps; logging → architecture only                                                                   |
| Package-agnostic architecture spec                     | **PASS** | Preview delta contains no `evaluateLifecycle`, `LifecycleEngine`, or `packages/core` references                                       |
| Curated public entry points (Logger export)            | **PASS** | `Logger` exported via `public.ts` / `application/logger.ts` → observability                                                           |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

_None._

### Test Coverage

| Scenario                                     | Covered?    | Tests                                                                                    |
| -------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| Domain imports ambient Logger permitted      | **Partial** | Compile-time + `lifecycle-verdict.ts` import; no dedicated architecture integration test |
| Application imports ambient Logger permitted | **Partial** | Widespread compile usage via `application/logger.js` re-export                           |
| Domain imports `node:fs` rejected            | **Yes**     | TypeScript layer rules / existing package structure                                      |
| Composition root wires implementation        | **Yes**     | `kernel.spec.ts`, `test/observability/logger.spec.ts`                                    |

### Spec Dependency Chain

- `default:_global/logging` → `default:_global/architecture` (one-way; **PASS**, no cycle)

---

## default:\_global/logging

### Requirements Summary

| Requirement                                                       | Verdict  | Evidence                                                                     |
| ----------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| Console compatibility (`log/info/debug/warn/error`)               | **PASS** | `LoggerPort` + `Logger` static methods in `logger.port.ts` / `logger.ts`     |
| `log()` aliases `info()`                                          | **PASS** | `logger.ts:50-51` delegates `log` → `impl.info`; test asserts alias          |
| Level mapping (`fatal`/`trace` prefixes for minimal/console impl) | **PASS** | `MinimalConsoleLogger` in `logger.spec.ts:81-116` implements prefix contract |
| Log level semantics                                               | **PASS** | `LogLevel` union on port; Pino-backed default logger                         |
| Policy on console usage                                           | **PASS** | Ambient facade replaces direct `console.*` in production paths reviewed      |
| **Ambient Logger — no-op before wiring**                          | **PASS** | `NullLogger` default; tests assert no throw and no console write             |
| **Ambient Logger — composition assigns impl**                     | **PASS** | `kernel.ts:275`                                                              |
| **Ambient import without logger port**                            | **PASS** | `lifecycle-verdict.ts` logs via ambient import, no constructor logger        |
| Spec depends on architecture for exception                        | **PASS** | Change delta `Spec Dependencies` lists architecture only                     |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

_None._

### Test Coverage

| Scenario                                           | Covered?    | Tests                                                        |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| Safe before wiring (no throw)                      | **Yes**     | `test/observability/logger.spec.ts`                          |
| Safe before wiring (no console)                    | **Yes**     | Same file, spy on `console.*`                                |
| `log()` ≡ `info()`                                 | **Yes**     | Same file                                                    |
| Delegation after `setImplementation`               | **Yes**     | Same file                                                    |
| Fatal mapping with `[FATAL]` prefix (minimal impl) | **Yes**     | `logger.spec.ts:130-137` — `minimal console logger contract` |
| Trace mapping with `[TRACE]` prefix (minimal impl) | **Yes**     | `logger.spec.ts:140-147` — same describe block               |
| Ambient import without logger port                 | **Partial** | Domain usage exists; no isolated domain-service test         |

---

## core:config

### Requirements Summary

| Requirement                                        | Verdict  | Evidence                                                                                                                              |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Approvals — spec gate disabled by default**      | **PASS** | `config-loader.ts:616` `spec: data.approvals?.spec ?? false`                                                                          |
| **Approvals — signoff gate disabled by default**   | **PASS** | `signoff: data.approvals?.signoff ?? false`                                                                                           |
| **Approvals — explicit `true` values loaded**      | **PASS** | `config-loader.spec.ts:961-973` “parses approvals booleans from config”                                                               |
| **Approvals — layered merge**                      | **PASS** | Merge test preserves `signoff: false` when local overrides `spec: true` (`config-loader.spec.ts:1836-1854`)                           |
| **Spec gate — in-place check, not pending hop**    | **PASS** | Change delta documents stay-in-`ready`; `transition-checks.spec.ts`, `lifecycle-verdict.spec.ts`, `transition-change.spec.ts` enforce |
| **Signoff gate — in-place check, not pending hop** | **PASS** | Change delta documents stay-in-`done`; CLI `transition.spec.ts` asserts no pending rewrite                                            |
| **Redesign exempt from spec gate**                 | **PASS** | Delta prose + `transition-checks.spec.ts:143-253` (`ready → designing` exempt)                                                        |
| **Independent flags**                              | **PASS** | Schema + loader treat `spec` / `signoff` independently                                                                                |
| Depends on `core:transition-checks`                | **PASS** | Change delta `Spec Dependencies` includes transition-checks                                                                           |
| Depends on `default:_global/architecture`          | **PASS** | Change delta `Spec Dependencies`                                                                                                      |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

_None._

### Test Coverage

| Scenario                                  | Covered? | Tests                                                                                                                                                                       |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parse explicit approvals booleans         | **Yes**  | `config-loader.spec.ts:961-973`                                                                                                                                             |
| Layered approvals merge                   | **Yes**  | `config-loader.spec.ts:1836-1854`                                                                                                                                           |
| Default `spec: false` when omitted        | **Yes**  | `config-loader.spec.ts:976-983` “defaults approvals to false when section omitted”                                                                                          |
| Default `signoff: false` when omitted     | **Yes**  | Same test asserts both flags                                                                                                                                                |
| Spec gate on does not require pending hop | **Yes**  | Verify delta cross-ref: `transition-change.spec.ts`, `cli/test/commands/change/transition.spec.ts:162` (“does not rewrite ready → implementing into pending-spec-approval”) |
| In-place spec gate (not pending hop)      | **Yes**  | `transition-checks.spec.ts`, `lifecycle-verdict.spec.ts`, `get-status.spec.ts:988`                                                                                          |

---

## skills:skill-templates-source

### Requirements Summary

| Requirement                                                         | Verdict  | Evidence                                                                        |
| ------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| **In-place approval gates in workflow templates**                   | **PASS** | Templates + `template-workflow.spec.ts:70-118`                                  |
| Verify: stay in `done`, no `pending-signoff`                        | **PASS** | `specd-verify/SKILL.md.tpl`; test asserts                                       |
| Implement: no unconditional `ready → implementing` when gate on     | **PASS** | `specd-implement/SKILL.md.tpl`; test asserts                                    |
| Shared: stay-in-state, forbid agent `changes approve`               | **PASS** | `shared.md.tpl`; test asserts                                                   |
| Shared hooks: no pending as happy-path intermediates                | **PASS** | `shared.md.tpl`; test asserts `MUST NOT run source.post` on backward            |
| New: pending rows drain-only                                        | **PASS** | `specd-new/SKILL.md.tpl` table; test asserts                                    |
| Design: stay in `ready` for spec gate                               | **PASS** | `specd-design/SKILL.md.tpl`; test asserts                                       |
| Entry `specd`: router only, no signoff teaching                     | **PASS** | `spec/SKILL.md.tpl`; test asserts                                               |
| Archive: requires `archivable`/`archiving`, signoff wait via verify | **PASS** | `specd-archive/SKILL.md.tpl`; test asserts                                      |
| **Overlap invalidation vs live archive overlap**                    | **PASS** | Hop skills exclude `OVERLAP_CONFLICT` from typical blockers; archive retains it |
| **Implementation tracking in verify/implement**                     | **PASS** | Shared cookbook + verify drain + implement zero-open gate; tests assert         |
| **Archive skill skips only pre hooks**                              | **PASS** | `--skip-hooks pre`, no post double-run; test asserts                            |
| **Design review scope without review file lists**                   | **PASS** | Uses `artifacts (details):` / `affectedArtifacts`; test asserts                 |
| Depends on `core:transition-checks`                                 | **PASS** | Change delta `Spec Dependencies`                                                |
| Template contract tests assert rules                                | **PASS** | `packages/skills/test/template-workflow.spec.ts`                                |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

_None._

### Test Coverage

| Scenario                                      | Covered? | Tests                                 |
| --------------------------------------------- | -------- | ------------------------------------- |
| No happy-path pending parking copy            | **Yes**  | `template-workflow.spec.ts:70-118`    |
| Verify drains IMPLEMENTATION_STATE            | **Yes**  | `template-workflow.spec.ts:120-146`   |
| Archive `--skip-hooks pre`                    | **Yes**  | `template-workflow.spec.ts:148-154`   |
| Design review scope                           | **Yes**  | `template-workflow.spec.ts:156-162`   |
| OVERLAP_CONFLICT vs invalidation              | **Yes**  | `template-workflow.spec.ts:164-179`   |
| Optimizer / metadata / command-role contracts | **Yes**  | Same file (pre-existing requirements) |

---

## Cross-spec consistency

| Check                                        | Verdict  | Notes                                                                                             |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| Architecture ↔ Logging (ambient exception)   | **PASS** | Mutual references aligned in change deltas                                                        |
| Architecture ↔ Logging (no dependency cycle) | **PASS** | Architecture `dependsOn: (none)`; logging → architecture                                          |
| Config ↔ transition-checks (in-place gates)  | **PASS** | Config delta documents in-place model; templates and lifecycle enforce it                         |
| Skills ↔ transition-checks                   | **PASS** | Templates teach same in-place / drain-only model                                                  |
| Config ↔ skills (approvals UX)               | **PASS** | Config defaults off; templates tell human to run `changes approve`                                |
| Config verify ↔ enforcement specs            | **PASS** | Verify delta scenario cross-references `core:transition-change` and `cli:change-transition` tests |

**Pre-archive note:** Workspace `specs/core/config/spec.md` still carries legacy pending-hop prose until this change archives. Implementation and change deltas already follow the in-place model — not counted as an implementation discrepancy.

---

## Closed vs prior audit (`20260829-172110/_partial-globals-skills.md`)

| Prior finding                                       | Verdict                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| D-LOG-1 Pino JSDoc eslint-disable                   | **CLOSED** — `pino-logger.ts` has no file-level eslint-disable; methods carry `@param` JSDoc     |
| D-LOG-2 console-prefix test gap                     | **CLOSED** — `logger.spec.ts:129-148` `minimal console logger contract`                          |
| D-CFG-1 config-loader default-approval test gap     | **CLOSED** — `config-loader.spec.ts:976-983`                                                     |
| D-CFG-2 in-place-gate verify scenario cross-package | **CLOSED** — verify delta adds scenario with explicit cross-ref to transition-change / CLI tests |
| D1 `DEPS_INCONSISTENT` (architecture/logging cycle) | **CLOSED** (prior)                                                                               |
| D2 bidirectional logging ↔ architecture cycle       | **CLOSED** (prior)                                                                               |
| D3 per-package wiring MEDIUM                        | **CLOSED** (prior)                                                                               |
| D4 JSDoc eslint-disable on observability logger     | **CLOSED** (prior)                                                                               |
| D5 observability layer unnamed                      | **CLOSED** (prior)                                                                               |

---

## Summary counts

| Spec                            | Requirements checked | PASS   | Partial | FAIL  | HIGH  | MEDIUM | LOW   |
| ------------------------------- | -------------------- | ------ | ------- | ----- | ----- | ------ | ----- |
| `default:_global/architecture`  | 11                   | 11     | 0       | 0     | 0     | 0      | 0     |
| `default:_global/logging`       | 9                    | 9      | 0       | 0     | 0     | 0      | 0     |
| `core:config`                   | 10                   | 10     | 0       | 0     | 0     | 0      | 0     |
| `skills:skill-templates-source` | 14                   | 14     | 0       | 0     | 0     | 0      | 0     |
| **Total**                       | **44**               | **44** | **0**   | **0** | **0** | **0**  | **0** |

**Overall:** Implementation conforms to all four scoped specs (including change deltas). **0 HIGH, 0 MEDIUM, 0 LOW.** All three LOW findings from the prior audit are closed. Residual **partial** test coverage only: no dedicated architecture integration test for domain ambient-Logger import (compile-time evidence sufficient for current scope).
