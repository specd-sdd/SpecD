# SDK compliance audit — `sdk:host-context`, `sdk:with-open-graph-provider`

**Change:** `sdk-graph-provider-factory`  
**Mode:** change audit batch = SDK  
**Date stamp:** 20260720-182351  
**Auditor posture:** read-only (no code/spec mutations)

## Scope and evidence

| Item           | Detail                                                                                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specs          | Merged via `node packages/cli/dist/index.js changes spec-preview sdk-graph-provider-factory sdk:host-context --format text` and `… sdk:with-open-graph-provider --format text`                                                                             |
| Navigation     | Graph-first: `project status --graph`, `graph search` for `createSdkContext` / `openSpecdHost` / `withOpenGraphProvider` / `SdkHostContext`, `graph impact` on `sdk:src/composition/host-context.ts` and `sdk:src/composition/with-open-graph-provider.ts` |
| Graph health   | Fresh (`stale: false`, fingerprint match) at audit start                                                                                                                                                                                                   |
| Implementation | `packages/sdk/src/composition/host-context.ts`, `packages/sdk/src/composition/with-open-graph-provider.ts`, barrel via `packages/sdk/src/composition/index.ts` → `packages/sdk/src/index.ts`                                                               |
| Focused tests  | `packages/sdk/test/composition/host-context.spec.ts`, `packages/sdk/test/composition/with-open-graph-provider.spec.ts`                                                                                                                                     |
| Related ports  | `createVcsAdapter` / `VcsAdapter.rootDir()` (sync, throws on `NullVcsAdapter`), `createBootstrapGraphConfig`, `ConfigNotFoundError`                                                                                                                        |

**Known gaps re-checked this pass:** `allowBootstrapFallback` edges, `beforeOpen` rejection path, `withOpenGraphProvider` must not `process.exit`, and `rootDir()` called synchronously (no `await`) after `createVcsAdapter` in `openSpecdHost`.

---

## Requirements table

### `sdk:host-context`

| ID    | Requirement                                                                                                                    | Verdict  | Evidence                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HC-01 | `SdkHostContext` is readonly `{ kernel, createGraphProvider }` only                                                            | **Pass** | `host-context.ts` L20–25: interface exposes only those two readonly members                                                                                                   |
| HC-02 | Context MUST NOT store duplicate `SpecdConfig`; config via kernel                                                              | **Pass** | No `config` on `SdkHostContext`; `OpenSpecdHostResult` alone adds `config` / `configFilePath` (L62–67) as bootstrap result, not context state                                 |
| HC-03 | `createGraphProvider` is sync and returns a fresh provider each call                                                           | **Pass** | Factory is `() => createCodeGraphProvider(...)` (L83); test returns distinct mock instances on two calls                                                                      |
| HC-04 | `createSdkContext` awaits `createKernel(config, options?.kernel)` then returns factory closing over same `config`              | **Pass** | L76–84; tests assert same `config` reference to kernel and provider, and graph options forwarding                                                                             |
| HC-05 | `SdkContextOptions` = `{ kernel?, graph? }`; omitted `graph` preserves code-graph defaults                                     | **Pass** | L30–35; `createCodeGraphProvider(config, options?.graph)` passes `undefined` when omitted                                                                                     |
| HC-06 | Reject mixed `configPath` + `startDir` before loader                                                                           | **Pass** | L101–103 throws before `createDefaultConfigLoader`; test asserts loader not called                                                                                            |
| HC-07 | Loader modes: forced `configPath` / discovery `startDir` / else `process.cwd()`                                                | **Pass** | L105–112; tests cover all three                                                                                                                                               |
| HC-08 | Await `createSdkContext`; return `{ config, configFilePath, ...ctx }`                                                          | **Pass** | L130–135                                                                                                                                                                      |
| HC-09 | Warnings stay on `config.warnings`; no top-level `warnings`                                                                    | **Pass** | Result type has no `warnings`; tests assert `'warnings' in result === false` and `config.warnings` preserved                                                                  |
| HC-10 | `allowBootstrapFallback?: boolean` default false; on discovery `ConfigNotFoundError` + flag true → VCS root + synthetic config | **Pass** | Catch L117–128: fallback only when `configPath` unset AND `allowBootstrapFallback === true` AND `ConfigNotFoundError`; then `createVcsAdapter` + `createBootstrapGraphConfig` |
| HC-11 | Preserve error when no VCS root; never fallback on explicit `configPath`                                                       | **Pass** | `configPath !== undefined` short-circuits to rethrow (L119); `NullVcsAdapter.rootDir()` throws `"no VCS detected"` synchronously so no-VCS fails without synthetic config     |
| HC-12 | `rootDir()` after `createVcsAdapter` is synchronous (no `await`)                                                               | **Pass** | L125–126: `const vcs = await createVcsAdapter(startDir)` then `const root = vcs.rootDir()` — **no await** on `rootDir`. Matches `VcsAdapter.rootDir(): string` port (sync)    |
| HC-13 | Host bootstrap MUST NOT perform config writes                                                                                  | **Pass** | No `createConfigWriter` / `initProject` / `addPlugin` / `removePlugin` on context or in this module                                                                           |

### `sdk:with-open-graph-provider`

| ID    | Requirement                                                                                          | Verdict  | Evidence                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| WO-01 | Signature: create provider → optional `beforeOpen` → `open` → `fn` → `close` → optional `afterClose` | **Pass** | `with-open-graph-provider.ts` L25–57                                                                                                |
| WO-02 | Options shape `{ beforeOpen?, afterClose? }`                                                         | **Pass** | L5–10                                                                                                                               |
| WO-03 | On `fn` throw: still `close`; close failures MUST NOT mask original                                  | **Pass** | catch → `close(true)` suppresses close/`afterClose` errors then rethrows original (L52–56, L27–44); tested                          |
| WO-04 | `beforeOpen` ok + `open()` fails → still close path + `afterClose`                                   | **Pass** | Same catch/`cleanupStarted` path; test `runs close and afterClose when open fails after beforeOpen`                                 |
| WO-05 | Open failure without `beforeOpen` → close + propagate; `afterClose` after close attempt              | **Pass** | Previously F1 (open-without-hook skipped cleanup) is **fixed**; test `runs close and afterClose when open fails without beforeOpen` |
| WO-06 | Success path: close/`afterClose` failures MAY propagate                                              | **Pass** | `close(false)` rethrows; tests for close fail and afterClose fail after success                                                     |
| WO-07 | MUST NOT call `process.exit()`                                                                       | **Pass** | Source has zero `process.exit`; focused spy test on success path. Helper has no exit on any branch                                  |
| WO-08 | Hooks do not alter `CodeGraphProvider` contract                                                      | **Pass** | Consumes only `open`/`close`; no provider mutation or wrapping type                                                                 |

---

## Discrepancies

**None (implementation vs mandatory spec language).**

| Severity | Topic | Code vs spec interpretation       |
| -------- | ----- | --------------------------------- |
| —        | —     | No Fail-level contradiction found |

### Known-gap re-check notes (not Fail)

| Topic                          | Spec reading                                                                                                      | Code                                                                         | Status                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `allowBootstrapFallback` edges | Fallback only for discovery + flag + `ConfigNotFoundError`; never for `configPath`; no-VCS must fail normally     | Guard order L118–123; sync `rootDir()` throw on null VCS                     | **Compliant**; negative edges lack dedicated tests (see coverage)                         |
| `beforeOpen` rejection         | Spec explicitly requires cleanup when open fails _after_ successful `beforeOpen`; silent on hook rejection itself | Rejecting `beforeOpen` hits catch → `close(true)` → original error preserved | **Compliant / defensive**; no contradiction. Spec does not forbid cleanup on hook failure |
| No `process.exit`              | SDK helper must never exit                                                                                        | No exit in module; spy test on normal completion                             | **Compliant** (error paths also exit-free by inspection)                                  |
| Sync `rootDir()`               | Implied by VCS port + bootstrap flow                                                                              | `await createVcsAdapter` then bare `vcs.rootDir()`                           | **Compliant**                                                                             |

---

## Test coverage gaps

Non-blocking; implementation already satisfies the behaviors.

### `host-context.spec.ts`

| Gap | Merged scenario / edge                                                                                   | Current coverage                                                           |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| G1  | Explicit `configPath` + `allowBootstrapFallback: true` still propagates loader error (no synthetic host) | Only happy-path fallback tested (`uses a synthetic graph host only when…`) |
| G2  | Flag omitted / `false` → `ConfigNotFoundError` propagates (no VCS / bootstrap)                           | Implied by default path, not asserted                                      |
| G3  | Fallback enabled but no VCS root → `rootDir()` / adapter error propagates                                | Not tested (implementation relies on `NullVcsAdapter.rootDir()` throw)     |
| G4  | Runtime/type assertion that `SdkHostContext` has no write APIs                                           | Type-only; no export/shape test for absence of `initProject` etc.          |

### `with-open-graph-provider.spec.ts`

| Gap | Merged scenario / edge                                                                                                | Current coverage                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| G5  | Rejecting `beforeOpen`: close + `afterClose` attempted; hook error preserved (close/`afterClose` failures suppressed) | Open-failure paths covered; **hook rejection not isolated**         |
| G6  | `process.exit` unused on error/cleanup paths                                                                          | Spy only on successful completion; source inspection closes the gap |

Previously closed regressions still covered: open failure without `beforeOpen` (WO-05), open failure after `beforeOpen` (WO-04), callback error vs close failure (WO-03).

---

## Summary counts

| Metric                                             |                                             Count |
| -------------------------------------------------- | ------------------------------------------------: |
| Specs audited                                      |                                                 2 |
| Requirements evaluated                             | 21 (13 host-context + 8 with-open-graph-provider) |
| **Pass**                                           |                                            **21** |
| **Fail**                                           |                                             **0** |
| Spec/code discrepancies                            |                                                 0 |
| Test-coverage gaps (non-blocking)                  |                                         6 (G1–G6) |
| Known prior Fail (open-without-beforeOpen cleanup) |                             Resolved / still Pass |

**Audit conclusion:** SDK batch for `sdk:host-context` and `sdk:with-open-graph-provider` is **implementation-compliant**. Re-checked edges (`allowBootstrapFallback`, `beforeOpen` rejection handling, no `process.exit`, synchronous `rootDir()` after `createVcsAdapter`) all match the merged specs; remaining items are regression-test holes only.
