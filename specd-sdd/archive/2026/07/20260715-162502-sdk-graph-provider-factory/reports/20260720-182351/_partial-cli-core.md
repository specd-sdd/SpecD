# Spec Compliance Partial Report — cli-core

**Change:** `sdk-graph-provider-factory`  
**Batch:** `cli-core`  
**Mode:** change audit (merged previews)  
**Date:** 2026-07-20  
**Auditor scope:** `cli:graph-stats`, `cli:graph-impact`, `cli:graph-search`, `cli:graph-hotspots`, `cli:graph-cli-context`, `core:vcs-adapter-port`, `core:vcs-adapter`  
**Method:** `changes spec-preview` + graph-first navigation + read-only inspection of `packages/cli` and `packages/core`  
**Graph freshness:** not stale (`project status --graph`)

---

## Remediation checklist (MUST)

| ID         | Requirement                                                                                                                             | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLC-01** | `graph stats` calls `process.exit(0)` **after** `withOpenGraphProvider` completes                                                       | **PASS** | `packages/cli/src/commands/graph/stats.ts` awaits `withOpenGraphProvider(...)` then calls `process.exit(0)` on the next statement. Test `exits with code 0 only after the SDK lifecycle helper completes` asserts order `['close', 'exit:0']`.                                                                                                                                |
| **CLC-02** | `VcsAdapter` exported as **runtime value** from `@specd/core` (not type-only) via `application/ports/index.ts` and public/ports barrels | **PASS** | `application/ports/index.ts`: `export { VcsAdapter } from './vcs-adapter.js'`. Public root `src/public.ts`: `export { VcsAdapter } from './application/ports/vcs-adapter.js'`. Ports subpath `src/ports.ts` (`@specd/core/ports`): same value export. Barrel test asserts `typeof corePublic.VcsAdapter === 'function'` and `corePorts.VcsAdapter === corePublic.VcsAdapter`. |
| **CLC-03** | `createVcsAdapter` prefixes external providers then falls through to built-ins                                                          | **PASS** | `packages/core/src/composition/vcs-adapter.ts` builds `[...providers, ...BUILTIN_VCS_PROVIDERS]` when externals are supplied. Tests: `tries external providers before built-ins`, `falls through unmatched external providers to built-in git`, `returns NullVcsAdapter when external and built-in probes all miss`.                                                          |

---

## Findings summary

| Severity                                                  | Count                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| Critical                                                  | 0                                                           |
| High                                                      | 1                                                           |
| Medium                                                    | 1                                                           |
| Low / Info                                                | 2                                                           |
| Compliant specs (no blocking gaps beyond listed findings) | 6 of 7 fully aligned; 1 with HIGH verify/spec inconsistency |

---

## Finding F-01 — HIGH — Stale VERIFY vs SPEC/implementation (`cli:graph-stats`)

**Spec:** `cli:graph-stats` (merged preview)  
**Location:** VERIFY scenario _“Command delegates health to GetGraphHealth via SDK”_

**Merged VERIFY still says:**

> **AND** graph context and lifecycle go through `cli:graph-cli-context`

**Merged SPEC requires (Statistics retrieval / Constraints / Spec Dependencies):**

- Obtain host via `openSpecdHost` from `@specd/sdk`
- Open provider via `withOpenGraphProvider`
- Delegate health to `createGetGraphHealth`
- `graph stats` **MUST NOT** call `resolveGraphCliContext`
- Other VERIFY scenarios correctly require `openSpecdHost` / `allowBootstrapFallback` and exit only after `withOpenGraphProvider` close

**Merged `cli:graph-cli-context` agrees with SPEC (not the stale VERIFY line):**

> `graph stats` MUST bootstrap through `openSpecdHost` … without `resolveGraphCliContext`

**Implementation (`packages/cli/src/commands/graph/stats.ts`):**

- Imports `openSpecdHost`, `withOpenGraphProvider`, `createGetGraphHealth` from `@specd/sdk`
- Does **not** import or call `resolveGraphCliContext`
- Uses `allowBootstrapFallback: true` for `--path` / no-config paths
- Passes `ListWorkspaces` results when `kernel !== null`

**Interpretation:** This is almost certainly a **stale VERIFY artifact** left over from the pre-SDK-host-bootstrap design. The SPEC, sibling verify scenarios, `cli:graph-cli-context`, and code/tests all agree on the new contract. The leftover AND-clause would fail a literal verify-driven audit while describing incorrect behaviour.

**Recommendation:** Update the VERIFY scenario to replace the `cli:graph-cli-context` clause with assertions that match SPEC (e.g. host via `openSpecdHost`, lifecycle via `withOpenGraphProvider`, no `resolveGraphCliContext`). Treat as **spec/verify drift**, not an implementation bug.

**Test coverage note:** CLI tests cover SDK bootstrap and exit-after-close, but do not assert “`resolveGraphCliContext` was not called” (the module simply never imports it). Optional strengthening only.

---

## Finding F-02 — MEDIUM — Internal wording drift in `cli:graph-impact` SPEC (symbol/spec paths)

**Spec:** `cli:graph-impact`  
**Issue:** File-impact requirements and VERIFY correctly describe `resolveGraphCliContext` + `withProvider` and `@specd/sdk` symbols. Symbol/spec narrative sections still use older imperative steps (“Creates a `CodeGraphProvider`… Opens the provider… Closes the provider”) that read like inline lifecycle management.

**Implementation:** `impact.ts` uses `resolveGraphCliContext` + `withProvider` for all selectors (`--file` / `--symbol` / `--spec`). `createCodeGraphProvider` appears only as a TypeScript type helper (`ReturnType<typeof createCodeGraphProvider>`), not as CLI-owned open/close.

**Interpretation:** Prefer treating as **documentation drift inside the same SPEC** (file path updated, symbol/spec path not fully rewritten). Behaviour matches the shared `cli:graph-cli-context` model and VERIFY “Impact uses SDK graph context”.

**Recommendation:** Align symbol/spec requirement prose with the file-impact / VERIFY wording (`resolveGraphCliContext` + `withProvider`).

---

## Finding F-03 — LOW / INFO — Hotspot defaults partly applied by provider, not CLI literal args

**Spec:** `cli:graph-hotspots` — default policy `kinds = class,method,function`, importer-only excluded, `minScore > 0`, `minRisk >= MEDIUM`, `limit = 20`.

**Implementation:** CLI always passes default kinds when `--kind` omitted. `limit` / `minScore` / `minRisk` / importer-only are omitted when unset; `code-graph` `compute-hotspots` applies matching defaults (`limit ?? 20`, `minScore ?? 1`, `minRisk ?? 'MEDIUM'`, `includeImporterOnly === true` only when flag set). Docs in `docs/cli/cli-reference.md` document the same defaults.

**Interpretation:** Observable behaviour matches the SPEC. Strict reading (“the command SHALL apply”) is satisfied via delegation to provider defaults rather than explicit CLI option objects. No functional non-compliance found.

---

## Finding F-04 — LOW / INFO — `composition/index.ts` still re-exports concrete VCS adapters

**Spec:** `core:vcs-adapter` Constraint — concrete adapter classes MUST NOT appear in any **public** export.

**Public surface:** `public.ts` / `@specd/core` and `ports.ts` / `@specd/core/ports` do **not** export `GitVcsAdapter` / `HgVcsAdapter` / `SvnVcsAdapter` / `NullVcsAdapter`. Barrel test asserts `GitVcsAdapter` absent from public root.

**Internal:** `packages/core/src/composition/index.ts` re-exports concrete adapters (used by tests / internal composition). Not exposed via package `exports` `"."` or `"./ports"`.

**Interpretation:** Compliant with the public-API constraint; note only if “public” is ever interpreted as any package-internal barrel.

---

## Per-spec audit

### 1. `cli:graph-stats`

#### Requirements summary

| Requirement                                                                                     | Status                                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Command signature (`--config` / `--path` mutex, `--format`)                                     | Compliant                                                     |
| Host via `openSpecdHost`; bootstrap `allowBootstrapFallback`; MUST NOT `resolveGraphCliContext` | Compliant (code + tests)                                      |
| Health via `createGetGraphHealth` + workspaces from `ListWorkspaces` when kernel present        | Compliant                                                     |
| No host-managed pre-open lock probe                                                             | Compliant (no lock probe in handler)                          |
| Text/JSON output (counts, relations, stale, fingerprintMismatch)                                | Compliant (implementation + tests)                            |
| `process.exit(0)` after SDK wrapper close (**CLC-01**)                                          | Compliant                                                     |
| Errors → exit 3 for busy/stale/infra                                                            | Assumed via shared error path; not re-audited end-to-end here |

#### Implementation status

`packages/cli/src/commands/graph/stats.ts` matches merged SPEC and `cli:graph-cli-context` exception for stats.

#### Discrepancies

- **F-01 (HIGH):** VERIFY scenario still claims lifecycle through `cli:graph-cli-context`.

#### Test coverage

- SDK lifecycle + exit order (**CLC-01**)
- Config / path / no-config host input
- Mutex `--config`+`--path`
- Staleness / fingerprint fields in JSON
- Gap: no negative assert on `resolveGraphCliContext` (low risk)

#### Spec dependency notes

Depends on `sdk:host-context`, `sdk:with-open-graph-provider`, `code-graph:get-graph-health`. Aligned with those intents in this batch. Conflicts only with its own stale VERIFY line (F-01).

---

### 2. `cli:graph-impact`

#### Requirements summary

| Requirement                                                                                 | Status                                                     |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Exactly one of `--file` / `--symbol` / `--spec`                                             | Compliant                                                  |
| Direction normalize dependents→upstream, dependencies→downstream; invalid fails before open | Compliant (parse before context)                           |
| Context via `resolveGraphCliContext` + `withProvider`; platform from `@specd/sdk`           | Compliant                                                  |
| File selector resolution / ambiguity errors                                                 | Compliant (provider `resolveFileSelector`)                 |
| Symbol multi-match / not-found exit 0                                                       | Present in handler (not fully re-traced line-by-line)      |
| Spec impact + `SPEC_NOT_FOUND`                                                              | Uses `GraphSpecNotFoundError`; VERIFY expects machine code |
| JSON aggregate aliases `directDepsCount` etc.                                               | Compliant (CLI adds aliases alongside provider fields)     |
| No pre-open lock probe                                                                      | Compliant                                                  |
| `process.exit(0)` after provider close                                                      | Via `withProvider`                                         |

#### Implementation status

`impact.ts` + `with-provider.ts` + `resolve-graph-cli-context.ts` match the shared graph CLI model.

#### Discrepancies

- **F-02 (MEDIUM):** Symbol/spec SPEC prose still describes manual provider open/close.

#### Test coverage

Substantial `graph-impact.spec.ts` (selectors, context flags, direction). Relies on mocked `resolveGraphCliContext`.

#### Spec dependency notes

Depends on `cli:graph-cli-context` — consistent for impact (unlike stats).

---

### 3. `cli:graph-search`

#### Requirements summary

| Requirement                                                        | Status                                          |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| Signature / category flags / filters / `--spec-content` text ban   | Compliant in command registration + action      |
| Context via `resolveGraphCliContext` + `withProvider`; SDK symbols | Compliant                                       |
| Delegate `searchSymbols` / `searchSpecs` / `searchDocuments`       | Compliant                                       |
| Text headers, snippet markers, sanitization                        | Present via `normalizeSnippet` + render helpers |
| No pre-open lock probe; exit after close                           | Compliant via `withProvider`                    |

#### Implementation status

`search.ts` matches merged SPEC for CLI orchestration. Ranking/token expansion owned by store backend (out of CLI package depth; not treated as CLI non-compliance).

#### Discrepancies

None material in CLI wiring for this change batch.

#### Test coverage

`graph-search.spec.ts` covers context resolution paths and command behaviour with mocks.

---

### 4. `cli:graph-hotspots`

#### Requirements summary

| Requirement                                        | Status                                                      |
| -------------------------------------------------- | ----------------------------------------------------------- |
| Signature + defaults                               | Compliant (kinds at CLI; other defaults at provider — F-03) |
| Context resolution precedence                      | Compliant via `resolveGraphCliContext`                      |
| Kind list trim/validate; replace defaults          | Compliant (`parseGraphKinds`)                               |
| Delegate `provider.getHotspots` via `withProvider` | Compliant                                                   |
| Text/JSON output shape                             | Compliant                                                   |
| CLI reference docs                                 | Present in `docs/cli/cli-reference.md`                      |

#### Implementation status

`hotspots.ts` aligned with SPEC and `cli:graph-cli-context`.

#### Discrepancies

- **F-03 (INFO):** default application split CLI/provider.

#### Test coverage

`graph-hotspots.spec.ts` covers context and filter delegation patterns.

---

### 5. `cli:graph-cli-context`

#### Requirements summary

| Requirement                                                                                                                                             | Status                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `resolveGraphCliContext` uses SDK (`resolveCliContext` → `openSpecdHost`; bootstrap synthetic workspace)                                                | Compliant                            |
| `withProvider` → `withOpenGraphProvider`; SIGINT/SIGTERM; `process.exit(0)`                                                                             | Compliant                            |
| Graph commands: search/hotspots/impact via `withProvider`; stats via `openSpecdHost` without `resolveGraphCliContext`; index via `runIndexProjectGraph` | Compliant (`index-graph.ts` checked) |
| No host-managed pre-open lock probes                                                                                                                    | Compliant                            |

#### Implementation status

`resolve-graph-cli-context.ts`, `with-provider.ts`, and command handlers match merged SPEC.

#### Discrepancies

None in this module. Cross-spec noise is F-01 in `cli:graph-stats` VERIFY contradicting this SPEC’s stats exception.

#### Test coverage

`graph-cli-context.spec.ts` covers `withProvider` → SDK + exit(0). Bootstrap resolution test is light (`catch` null / mode check).

---

### 6. `core:vcs-adapter-port`

#### Requirements summary

| Requirement                                                                                        | Status                                           |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Abstract class + protected `cwd` ctor                                                              | Compliant                                        |
| Port methods (`rootDir`, `branch`, `isClean`, `ref`, `refAt`, `show`, `modifiedFiles`, `identity`) | Present on abstract class                        |
| Static `detect` default `null`                                                                     | Compliant                                        |
| Public runtime export (**CLC-02**)                                                                 | Compliant                                        |
| `NullVcsAdapter` contract                                                                          | Compliant (`infrastructure/null/vcs-adapter.ts`) |

#### Implementation status

Port + null adapter match merged SPEC. Public export remediations verified.

#### Discrepancies

None for this batch’s remediations. Full git/hg/svn behavioural matrix not re-executed in this audit (covered by existing infra tests; out of remediation focus).

#### Test coverage

Barrel runtime export test; `VcsAdapter.detect` null in composition tests; Null adapter behaviour covered in port/infra tests historically.

---

### 7. `core:vcs-adapter` (factory; merged preview notes no-op delta / original)

#### Requirements summary

| Requirement                                                    | Status                                               |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| Probe order git → hg → svn                                     | Compliant (`BUILTIN_VCS_PROVIDERS`)                  |
| External providers before built-ins; fall through (**CLC-03**) | Compliant                                            |
| Fallback `NullVcsAdapter` without throw                        | Compliant                                            |
| Optional `cwd` → `process.cwd()`                               | Compliant                                            |
| Returns `VcsAdapter` port                                      | Compliant                                            |
| Concrete adapters not on public exports                        | Compliant (F-04 note on internal composition barrel) |

#### Implementation status

`createVcsAdapter` matches SPEC including external-provider prefixing.

#### Discrepancies

- **F-04 (INFO)** only.

#### Test coverage

Strong for CLC-03 (`vcs-adapter.spec.ts`).

---

## Spec dependency / consistency chain (batch-local)

```
cli:graph-search ──┐
cli:graph-impact ──┼──► cli:graph-cli-context ──► sdk:with-open-graph-provider / sdk host
cli:graph-hotspots─┘
cli:graph-stats ──────► openSpecdHost + withOpenGraphProvider (explicit exception; MUST NOT resolveGraphCliContext)
                        ▲
                        └── CONFLICT: graph-stats VERIFY still says “through cli:graph-cli-context” (F-01)

core:vcs-adapter ──► core:vcs-adapter-port (runtime export CLC-02; factory CLC-03)
```

No contradiction found between `core:vcs-adapter` and `core:vcs-adapter-port` after remediations.

---

## Counts

| Metric                                           | Value                            |
| ------------------------------------------------ | -------------------------------- |
| Specs audited                                    | 7                                |
| Requirements areas reviewed                      | ~35+                             |
| Findings                                         | 4 (1 High, 1 Medium, 2 Low/Info) |
| Remediations CLC-01..03                          | 3 / 3 PASS                       |
| Blocking implementation bugs found in this batch | 0                                |
| Spec/verify defects found                        | 1 High (F-01), 1 Medium (F-02)   |

---

## Verdict for parent aggregator

**Implementation for cli-core remediations is compliant.** Primary actionable defect is **VERIFY drift in `cli:graph-stats`** (F-01): stale claim that stats lifecycle goes through `cli:graph-cli-context`, while merged SPEC, sibling scenarios, `cli:graph-cli-context`, and code all require `openSpecdHost` / forbid `resolveGraphCliContext`. Treat F-01 as verify-artifact cleanup, not a code fix.
