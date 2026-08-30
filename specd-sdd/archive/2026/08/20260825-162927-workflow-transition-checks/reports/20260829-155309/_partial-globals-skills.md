# Spec-compliance audit (partial): globals, config, skills

**Mode:** change `workflow-transition-checks`  
**Scope:** `default:_global/architecture`, `default:_global/logging`, `core:config`, `skills:skill-templates-source`  
**Focus:** observability facade / no logging cycle, config workflow checks (approvals), skill template lifecycle-transition updates  
**Read-only**

---

## default:\_global/architecture

### Requirements Summary

| Requirement                                            | Verdict  | Evidence                                                                                          |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| Domain layer is pure (I/O-free)                        | **PASS** | No `node:fs` / I/O imports under `packages/core/src/domain/`                                      |
| **Exception — ambient Logger**                         | **PASS** | `packages/core/src/observability/logger.ts`; domain import in `lifecycle-verdict.ts`              |
| Observability facade, not fourth hexagon layer         | **PASS** | Change delta prose; module lives at `src/observability/` (not `domain/` / `infrastructure/`)      |
| Application layer uses ports only                      | **PASS** | Use cases still receive ports via constructor; Logger import explicitly permitted in delta        |
| Application may import ambient Logger                  | **PASS** | `application/logger.ts` re-exports observability facade; used from composition / infrastructure   |
| Process-level composition root wires Logger            | **PASS** | `createKernel` → `Logger.setImplementation(createDefaultLogger(...))` in `kernel.ts:275`          |
| Manual DI / no module-level singletons (general)       | **PASS** | Ambient Logger is the documented sole exception; wiring remains at composition root               |
| No circular spec dependencies (logging ↔ architecture) | **PASS** | Live `changes status`: `default:_global/architecture` `dependsOn[0]`; logging → architecture only |
| Package-agnostic architecture spec                     | **PASS** | Preview delta contains no `evaluateLifecycle`, `LifecycleEngine`, or `packages/core` references   |
| Curated public entry points (Logger export)            | **PASS** | `Logger` exported via `public.ts` / `application/logger.ts` → observability                       |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

**D-ARCH-1 — Runtime error string still says “engine-derived” (cross-spec with `core:change`)**

- **Spec says:** Change/artifact vocabulary uses “verdict-derived” for non-persistable statuses.
- **Code says:** `artifact-file.ts:54` throws `'pending-parent-artifact-review is verdict-derived…'` (correct) but prior audits flagged related “engine-derived” strings elsewhere; `change-repository.ts:1695` JSDoc still says “verdict-derived” (correct). No blocking architecture violation.
- **Assessment:** No architecture constraint breach; wording is consistent in inspected paths. Residual risk is comment drift only.

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

| Requirement                                                       | Verdict  | Evidence                                                                      |
| ----------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| Console compatibility (`log/info/debug/warn/error`)               | **PASS** | `LoggerPort` + `Logger` static methods in `logger.port.ts` / `logger.ts`      |
| `log()` aliases `info()`                                          | **PASS** | `logger.ts:50-51` delegates `log` → `impl.info`; test asserts alias           |
| Level mapping (`fatal`/`trace` prefixes for minimal/console impl) | **PASS** | Pino adapter uses native levels; spec targets minimal console implementations |
| Log level semantics                                               | **PASS** | `LogLevel` union on port; Pino-backed default logger                          |
| Policy on console usage                                           | **PASS** | Ambient facade replaces direct `console.*` in production paths reviewed       |
| **Ambient Logger — no-op before wiring**                          | **PASS** | `NullLogger` default; tests assert no throw and no console write              |
| **Ambient Logger — composition assigns impl**                     | **PASS** | `kernel.ts:275`                                                               |
| **Ambient import without logger port**                            | **PASS** | `lifecycle-verdict.ts` logs via ambient import, no constructor logger         |
| Spec depends on architecture for exception                        | **PASS** | Preview `Spec Dependencies` lists architecture only                           |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

**D-LOG-1 — Pino adapter retains file-level `eslint-disable jsdoc/require-param`**

- **Spec says:** JSDoc on logging surface (implicit via global docs/eslint conventions).
- **Code says:** `pino-logger.ts:1` disables `jsdoc/require-param`; methods use `@inheritdoc`.
- **Assessment:** Acceptable adapter pattern; observability facade itself has full JSDoc (`logger.ts`). **Partial** only.

**D-LOG-2 — No dedicated tests for console-minimal `fatal`/`trace` prefix mapping**

- **Spec says:** Minimal console implementations must prefix `[FATAL]` / `[TRACE]`.
- **Code says:** Production path uses Pino; `pino-logger.spec.ts` does not exercise prefix mapping.
- **Assessment:** Requirement targets minimal/console fallback, not Pino. **Test gap**, not implementation bug.

### Test Coverage

| Scenario                             | Covered?    | Tests                                                |
| ------------------------------------ | ----------- | ---------------------------------------------------- |
| Safe before wiring (no throw)        | **Yes**     | `test/observability/logger.spec.ts`                  |
| Safe before wiring (no console)      | **Yes**     | Same file, spy on `console.*`                        |
| `log()` ≡ `info()`                   | **Yes**     | Same file                                            |
| Delegation after `setImplementation` | **Yes**     | Same file                                            |
| Ambient import without logger port   | **Partial** | Domain usage exists; no isolated domain-service test |

---

## core:config

### Requirements Summary

| Requirement                                        | Verdict  | Evidence                                                                |
| -------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| **Approvals — spec gate disabled by default**      | **PASS** | `config-loader.ts:616` `spec: data.approvals?.spec ?? false`            |
| **Approvals — signoff gate disabled by default**   | **PASS** | `signoff: data.approvals?.signoff ?? false`                             |
| **Approvals — explicit `true` values loaded**      | **PASS** | `config-loader.spec.ts` “parses approvals booleans from config”         |
| **Approvals — layered merge**                      | **PASS** | Merge test preserves `signoff: false` when local overrides `spec: true` |
| **Spec gate — in-place check, not pending hop**    | **PASS** | Preview delta documents stay-in-`ready`; no pending-hop as happy path   |
| **Signoff gate — in-place check, not pending hop** | **PASS** | Preview delta documents stay-in-`done`                                  |
| **Redesign exempt from spec gate**                 | **PASS** | Delta prose: `ready → designing` MUST NOT require spec gate             |
| **Independent flags**                              | **PASS** | Schema + loader treat `spec` / `signoff` independently                  |
| Depends on `core:transition-checks`                | **PASS** | Preview `Spec Dependencies` includes transition-checks                  |
| Depends on `default:_global/architecture`          | **PASS** | Preview `Spec Dependencies`                                             |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

**D-CFG-1 — Verify scenarios for approval defaults not named in config-loader tests**

- **Spec says (verify):** GIVEN `specd.yaml` does not declare `approvals.spec` / `approvals.signoff`, THEN defaults are `false`.
- **Code says:** Defaults applied in loader (`?? false`).
- **Tests say:** No dedicated `it('defaults approvals when section omitted')` mirroring logging-default test pattern; only explicit-parse and merge cases assert `config.approvals`.
- **Assessment:** Implementation **PASS**; **test coverage gap (LOW)**.

**D-CFG-2 — Verify scenario “Spec gate on does not require pending hop” lives outside config package tests**

- **Spec says (verify):** With `approvals.spec: true`, wait is `approval.spec` check, not pending hop.
- **Code says:** In-place gate enforced in lifecycle / transition-checks (`approval-spec.ts`, `transition-change.ts`).
- **Tests say:** Covered in `transition-change.spec.ts` (stay in `ready`, `APPROVAL_REQUIRED`) — not in `config-loader.spec.ts`.
- **Assessment:** Behavior **PASS**; scenario is cross-cutting (config documents, lifecycle enforces). Acceptable split.

### Test Coverage

| Scenario                              | Covered?    | Tests                                                                              |
| ------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| Parse explicit approvals booleans     | **Yes**     | `config-loader.spec.ts:961-973`                                                    |
| Layered approvals merge               | **Yes**     | `config-loader.spec.ts:1836-1854`                                                  |
| Default `spec: false` when omitted    | **Partial** | Loader code only                                                                   |
| Default `signoff: false` when omitted | **Partial** | Loader code only                                                                   |
| In-place spec gate (not pending hop)  | **Yes**     | `transition-change.spec.ts`, `lifecycle-engine.spec.ts` (outside config spec file) |

---

## skills:skill-templates-source

### Requirements Summary

| Requirement                                                         | Verdict  | Evidence                                                                        |
| ------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| **In-place approval gates in workflow templates**                   | **PASS** | Templates + `template-workflow.spec.ts:70-118`                                  |
| Verify: stay in `done`, no `pending-signoff`                        | **PASS** | `specd-verify/SKILL.md.tpl`; test asserts                                       |
| Implement: no unconditional `ready → implementing` when gate on     | **PASS** | `specd-implement/SKILL.md.tpl`; test asserts                                    |
| Shared: stay-in-state, forbid agent `changes approve`               | **PASS** | `shared.md.tpl:376-387`; test asserts                                           |
| Shared hooks: no pending as happy-path intermediates                | **PASS** | `shared.md.tpl:502-507`; test asserts `MUST NOT run source.post` on backward    |
| New: pending rows drain-only                                        | **PASS** | `specd-new/SKILL.md.tpl` table; test asserts                                    |
| Design: stay in `ready` for spec gate                               | **PASS** | `specd-design/SKILL.md.tpl`; test asserts                                       |
| Entry `specd`: router only, no signoff teaching                     | **PASS** | `spec/SKILL.md.tpl`; test asserts                                               |
| Archive: requires `archivable`/`archiving`, signoff wait via verify | **PASS** | `specd-archive/SKILL.md.tpl`; test asserts                                      |
| **Overlap invalidation vs live archive overlap**                    | **PASS** | Hop skills exclude `OVERLAP_CONFLICT` from typical blockers; archive retains it |
| **Implementation tracking in verify/implement**                     | **PASS** | Shared cookbook + verify drain + implement zero-open gate; tests assert         |
| **Archive skill skips only pre hooks**                              | **PASS** | `--skip-hooks pre`, no post double-run; test asserts                            |
| **Design review scope without review file lists**                   | **PASS** | Uses `artifacts (details):` / `affectedArtifacts`; test asserts                 |
| Depends on `core:transition-checks`                                 | **PASS** | Preview delta `Spec Dependencies`                                               |
| Template contract tests assert rules                                | **PASS** | `packages/skills/test/template-workflow.spec.ts`                                |

### Discrepancies

#### HIGH / MEDIUM

_None._

#### LOW

**D-SKL-1 — Pending state names still appear in templates (by design)**

- **Spec says:** Pending states MAY appear only as **drain** for in-flight changes.
- **Code says:** `specd-new/SKILL.md.tpl` lists `pending-spec-approval` / `pending-signoff` with “Drain only:” labels; `shared.md.tpl` mentions pending for drain context.
- **Assessment:** **PASS** — matches spec allowance; not a discrepancy.

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

| Check                                        | Verdict  | Notes                                                               |
| -------------------------------------------- | -------- | ------------------------------------------------------------------- |
| Architecture ↔ Logging (ambient exception)   | **PASS** | Mutual references aligned in change deltas                          |
| Architecture ↔ Logging (no dependency cycle) | **PASS** | `architecture dependsOn: (none)`; logging → architecture            |
| Config ↔ transition-checks (in-place gates)  | **PASS** | Config documents in-place model; templates and lifecycle enforce it |
| Skills ↔ transition-checks                   | **PASS** | Templates teach same in-place / drain-only model                    |
| Config ↔ skills (approvals UX)               | **PASS** | Config defaults off; templates tell human to run `changes approve`  |

---

## Closed vs prior audit (`20260829-142635/_partial-globals.md`)

| Prior finding                                       | Verdict                                            |
| --------------------------------------------------- | -------------------------------------------------- |
| D1 `DEPS_INCONSISTENT` (architecture/logging cycle) | **CLOSED**                                         |
| D2 bidirectional logging ↔ architecture cycle       | **CLOSED**                                         |
| D3 per-package wiring MEDIUM                        | **CLOSED**                                         |
| D4 JSDoc eslint-disable on observability logger     | **CLOSED**                                         |
| D5 observability layer unnamed                      | **CLOSED**                                         |
| D1 engine-derived error strings                     | **OPEN (LOW)** — comment-only / cross-spec wording |

---

## Summary counts

| Spec                            | Requirements checked | PASS   | Partial | FAIL  | HIGH  | MEDIUM | LOW   |
| ------------------------------- | -------------------- | ------ | ------- | ----- | ----- | ------ | ----- |
| `default:_global/architecture`  | 10                   | 10     | 0       | 0     | 0     | 0      | 0     |
| `default:_global/logging`       | 9                    | 7      | 2       | 0     | 0     | 0      | 2     |
| `core:config`                   | 10                   | 10     | 0       | 0     | 0     | 0      | 2     |
| `skills:skill-templates-source` | 14                   | 14     | 0       | 0     | 0     | 0      | 0     |
| **Total**                       | **43**               | **41** | **2**   | **0** | **0** | **0**  | **4** |

**Overall:** Implementation conforms to all four scoped specs. No HIGH or MEDIUM discrepancies. Four LOW items: Pino JSDoc eslint exception, missing console-prefix tests, config-loader default-approval test gap, and cross-package placement of in-place-gate verify scenario. Architecture/logging cycle and observability-facade model are **fully aligned** with change deltas.
