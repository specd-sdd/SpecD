# Spec-compliance audit (partial): globals (architecture + logging)

**Mode:** change `workflow-transition-checks`  
**Scope:** `default:_global/architecture`, `default:_global/logging`; conformance: `conventions`, `testing`, `eslint`, `docs`  
**Read-only**

---

## Implementation Status

| Requirement                    | Verdict     | Evidence                                                                                                                    |
| ------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Architecture package-agnostic  | **PASS**    | Preview delta: no `evaluateLifecycle`, no `packages/core`, no `LifecycleEngine`                                             |
| Logger exception in domain     | **PASS**    | `observability/logger.ts`; domain imports observability only                                                                |
| Process-level composition root | **PASS**    | `createKernel` assigns `Logger.setImplementation`                                                                           |
| `log` ≡ `info`                 | **PASS**    | `logger.ts`; `test/observability/logger.spec.ts`                                                                            |
| `DEPS_INCONSISTENT`            | **PASS**    | Live `changes status`: blockers are `ARTIFACT_DRIFT` only; architecture `dependsOn: (none)`                                 |
| One-way logging→architecture   | **PASS**    | logging delta depends on architecture; architecture Spec Dependencies edge removed                                          |
| Observability naming           | **PASS**    | Architecture delta: “observability facade, not a fourth hexagon layer”                                                      |
| JSDoc on Logger                | **PASS**    | `eslint-disable` removed from `observability/logger.ts`; `NullLogger` methods documented                                    |
| Pino adapter JSDoc             | **Partial** | `pino-logger.ts` uses `@inheritdoc` on methods; module helpers documented; `eslint-disable` reduced to `require-param` only |

---

## Discrepancies

### HIGH / MEDIUM

_None._

### LOW

#### D1 — Runtime error strings still say “engine-derived” (cross-spec with `core:change`)

`ArtifactFile` constructor error (`artifact-file.ts:54`) vs change spec “verdict-derived”. User-facing inconsistency only.

#### D2 — `change-repository.ts` JSDoc “engine-derived” (comment only)

Maps parent-review off persistable union — behaviour correct; wording stale.

---

## Test Coverage

| Requirement                 | Tests                                 |
| --------------------------- | ------------------------------------- |
| L2 log≡info                 | `test/observability/logger.spec.ts`   |
| L6 no console before assign | New test: no `console.*` when unwired |
| Domain Logger path          | compile + public-api import scan      |

---

## Closed vs prior `20260829-125651`

| Finding                        | Verdict                                         |
| ------------------------------ | ----------------------------------------------- |
| D1 DEPS_INCONSISTENT           | **CLOSED**                                      |
| D2 bidirectional cycle         | **CLOSED**                                      |
| D3 each-package wiring MEDIUM  | **CLOSED**                                      |
| D4 JSDoc eslint disable        | **CLOSED** (observability logger); pino partial |
| D5 observability layer unnamed | **CLOSED** in architecture delta prose          |

---

## Summary counts

|                         | Count                        |
| ----------------------- | ---------------------------- |
| HIGH                    | **0**                        |
| MEDIUM                  | **0**                        |
| LOW                     | **2** (error string wording) |
| Architecture constraint | **PASS (0 blocking)**        |
