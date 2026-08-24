# Spec Compliance Re-Audit (r2) — change: suggest-implementation-and-spec-deps

Date: 2026-08-24 · Closure verification after Both-cycle fixes

## Aggregate

- cli/docs/code-graph: 4/4 round-1 findings CLOSED, no regressions
- global: F7 CLOSED-CODE; F6 PARTIAL (+N1 new); F1-F5 OPEN (documented debt where applicable)

## Detailed Findings (verbatim partials)

---

# Compliance Re-Audit Partial — cli + docs + code-graph (r2)

Change: `20260816-112112-suggest-implementation-and-spec-deps` (round-2 closure verification)
Scope: round-1 findings D1, D2, F6, F7 from `reports/20260824-100132/_partial-cli.md`; code-graph PASS re-check; regression scan.
Method: source inspection with file:line citations; targeted vitest run (`test/commands/graph-index.spec.ts` → 9/9 PASS); grep for residual internal imports; git diff scope check on code-graph barrels; docs↔CLI flag-by-flag comparison.

---

## Closure table (finding → verdict → evidence)

| Finding                                                                | Verdict                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** — `ArtifactConflictError` message lacked retry guidance         | ✅ **CLOSED (fixed)**             | Constructor message at packages/core/src/domain/errors/artifact-conflict-error.ts:56-57 now appends: _"Re-load the artifact and retry your change to apply it on top of the latest content."_ `handleError` passes messages verbatim to output (packages/cli/src/handle-error.ts), so the CLI-emitted text for all `specs implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | deps`mutation commands now satisfies "indicating a concurrent modification **and instructing the user to retry**". Also restores conformance with`default:\_global/error-handling-conventions` actionable-message guidance.                                                                                                                                             |
| **D2** — readOnly errors surfaced bare workspace name                  | ✅ **CLOSED (fixed)**             | update-persisted-spec-implementation.ts:90-93 now throws: _"Workspace \"\<ws\>\" is read-only: implementation links cannot be modified. Change the workspace ownership in specd.yaml to allow writes."_ Same pattern in update-persisted-spec-deps.ts:79-82 (_"...persisted dependencies cannot be modified..."_). Messages state blocked operation + cause + resolution, matching the `core:workspace` convention and the conforming pattern (archive-change.ts:348-350). Both audited CLI specs' error-mapping requirements are now fully met.                                                                                                                                                                                                                                                                                                                                                                                     |
| **F6** — CLI imported `@specd/code-graph/internal`                     | ✅ **CLOSED (fixed)**             | (a) Grep of packages/cli for `code-graph/internal`: **0 hits**; packages/cli/src/commands/graph/index-graph.ts:3 imports `{ acquireGraphIndexLock } from '@specd/code-graph'`. (b) Lock exports added to public barrel: packages/code-graph/src/public.ts:6 (`acquireGraphIndexLock`, `getGraphIndexLockPath` from `./infrastructure/index-lock.js`). (c) Build artifacts fresh & consistent: dist mtime 1787561678 > src mtime 1787561024; packages/code-graph/dist/public.d.ts:1 exports `ar as acquireGraphIndexLock … aJ as getGraphIndexLockPath`. (d) Test mock updated: packages/cli/test/commands/graph-index.spec.ts:4 imports from `'@specd/code-graph'`, mock at :11-14 spreads actual + overrides only `acquireGraphIndexLock`. (e) **Targeted run: `Test Files 1 passed (1)` / `Tests 9 passed (9)`** including the lock-ownership test (:160-185 asserts `acquireGraphIndexLock` called once, worker env propagation). |
| **F7** — docs/cli/spec-deps.md stale (`--depends-on`, merge semantics) | ✅ **CLOSED (rewritten)**         | Doc (29 lines) now documents `--dep <id>...` everywhere (required on add/remove, optional on set) matching deps.ts:91/:114/:137. Usage block lines 8-13 match subcommand signatures exactly (list/add/remove/set/clear/suggest incl. suggest flags `--spec/--all/--workspace/--apply/--create-change/--rebuild-cache` = deps.ts:176-181). Claim "--format text\|json\|toon (default text) and --config \<path\> per subcommand" verified against deps.ts:73-74, :92-93, :115-116, :138-139, :157-158, :182-183. Rules section matches core semantics verified in r1: dedupe by use case (:21 ↔ applyDependsOnMutation), remove-on-uninitialized no-op (:22), missing-lock matrix (:25). Errors section (:27-29) accurate post-D1/D2. No stale `--depends-on` remains.                                                                                                                                                                |
| **code-graph r1 PASS holds after public.ts export addition**           | ✅ **HOLDS**                      | Git diff vs HEAD shows exactly one changed file: `packages/code-graph/src/public.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 1 +` (the lock-export line). Internal barrel index.ts untouched — its own lock export at index.ts:236 pre-existed this fix. Nothing removed from public.ts; its export set remains a strict subset of the internal barrel (internal-only items SQLiteGraphStore/AdapterRegistry/language adapters/ResolveSymbolReference/IndexSession remain internal-only, unchanged). |
| **9 minor cli test-coverage gaps (r1)**                                | ⚠️ **CONFIRMED OPEN (unchanged)** | spec-implementation.spec.ts and spec-deps.spec.ts contain exactly the same 4+4 test cases as r1 (`rg "it("` → list/add/suggest×2 impl :64/:81/:112/:136; list/set/suggest×2 deps :62/:79/:106/:130). No new remove/clear/error-mapping coverage added this cycle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## New issues introduced by fixes (if any)

None found. Specifically checked:

- **Double `release()` semantics:** unchanged and safe. packages/cli/src/commands/graph/index-graph.ts:155 calls `release()` on normal child exit and again at :160 in the `finally` block, but packages/code-graph/src/infrastructure/index-lock.ts:78-80 guards with `if (released) return; released = true` — idempotent. The F6 fix moved only the import source, not lock behavior.
- **Public API surface:** `public.d.ts` correctly includes the two lock exports alongside the pre-existing set; no accidental export removals or renames (diff scope = 1 insertion).
- **D1/D2 wording side effects:** none observed; error codes (`ARTIFACT_CONFLICT`, readOnly) and `specd:true` discriminator unchanged; only human-readable text extended.

Minor observation (pre-existing, not introduced): the new readOnly messages use _"is read-only"_ while archive-change.ts:349 and the change-edit/change-create test convention strings use _"readOnly"_ — a cosmetic phrasing divergence across core, both convention-conforming.

---

## Remaining open items

1. **The 9 known minor cli test gaps — all still open:**
   - impl: no `remove` delegation test
   - impl: no error-mapping tests (5 typed errors)
   - impl: no `initialized:false` text + JSON rendering tests
   - impl: `[already included]` tag not asserted
   - impl: no `--format toon` acceptance test
   - deps: add/remove/clear have no mutation-delegation tests (only `set`)
   - deps: no remove-on-uninitialized no-op test
   - deps: no set-with-zero-`--dep` clears test
   - deps: no error-mapping tests / no `initialized:false` rendering tests
     (Counted as 9 in r1's rollup; itemization here preserves each gap.)
2. **D3 (r1 observation, unresolved, out-of-scope for this audit):** `suggestedAlignmentCommand` still hardcodes `node packages/cli/dist/index.js changes create align-spec-deps …` instead of portable `specd …`.
3. **Residual readOnly bare-message sites in core (outside audited specs):** update-persisted-spec-optimizations.ts:172, update-persisted-spec-schema.ts:83, initialize-persisted-spec-state.ts:165 still throw `ReadOnlyWorkspaceError(workspace)` with the workspace name as the entire message. The D2 fix pattern was applied only to the two use cases inherited by the cli specs. Flagging for the change owner as optional consistency follow-up; not a violation of any assigned spec.

---

## Summary counts

| Metric                             | Count                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| Round-1 findings re-audited        | 4 (D1, D2, F6, F7)                                                                               |
| Closed / fixed                     | 4 (all verified with citations + passing test)                                                   |
| Still open                         | 0 findings; 9 minor test gaps confirmed open                                                     |
| New issues introduced by fixes     | 0                                                                                                |
| Regression check                   | graph-index.spec.ts 9/9 PASS; code-graph barrels diff-clean (+1 line public.ts only); dist fresh |
| Residual out-of-scope observations | 2 (core readOnly bare-message siblings; D3 hardcoded prefix)                                     |

**Verdict: cli area round-1 blocking findings are fully resolved; area remains compliant with no regressions detected.**

---

# Compliance Re-Audit Partial — global conformance (r2)

Change: `suggest-implementation-and-spec-deps` (verifying) · Auditor: read-only subagent · Date: 2026-08-24
Scope: closure verification of round-1 findings (`reports/20260824-100132/_partial-global.md`, F1–F8) against `specs/_global/*`, plus violation scan of files changed this cycle.

## Closure table (F1..F7 → verdict → evidence incl. global rule text)

### F1 · Public SDK `"."` barrel exports concrete Fs cache adapters — **OPEN** (accepted debt documented; rule unamended)

- **Global rule:** `default:_global/architecture` requirement "Curated public package entry points": `"."` … "**MUST NOT export concrete adapter classes or infrastructure implementations**" (`specs/_global/architecture/spec.md:73`); repeated verbatim as a Constraint (`:94`). Applies to `@specd/sdk`.
- **Status:** Code unchanged — `packages/sdk/src/index.ts:63-64` still exports `FsImplementationSuggestionCache` / `FsSpecDepsSuggestionCache`. design.md's new "Architectural exceptions (accepted debt)" section item 3 covers it with rationale.
- **Judgment on documentation posture:** `_global/architecture` contains **no exception/waiver mechanism** — every relevant clause is an absolute RFC-2119 MUST NOT ("MUST NOT export…", "Only `composition/` may import from `infrastructure/`"), with no carve-out for documented deviations anywhere in the spec. Therefore documenting-as-accepted-debt does **not** restore conformance with the global text as written; it is a transparent interim posture whose closure requires either amending `_global/architecture` (the design.md-stated plan: "refactoring to a pure composition-root model is deferred to a dedicated architecture change") or reverting the exports before archive. Kept OPEN pending that amendment/fix.

### F2 · Orchestration layer instantiates infrastructure / writes files directly — **OPEN** (accepted debt documented; rule + contradictory spec clauses unamended)

- **Global rules:** "`application/` must not import from `infrastructure/`" (`architecture/spec.md:83`); "Only `composition/` may import from `infrastructure/`" (`:85`); "Application layer uses ports only … never imports infrastructure adapters directly" (`:19`).
- **Status:** Code unchanged — default `Fs*Cache` construction inside `execute()` and direct `mkdir`/`writeFile` for `.specd-exploration.md` remain. design.md exceptions items 1–2 now document both deviations.
- **Residual spec-level contradiction:** the merged change specs still codify the deviation against the global: `sdk:suggest-implementation-links` Constraints — "Candidate file existence validation (`existsSync`) is permitted as a lightweight infrastructure concern within the orchestration layer" (spec-preview Constraints, first bullet); `sdk:suggest-spec-dependencies` Constraints — "Alignment change scaffolding (directory creation and `.specd-exploration.md` file writing) is permitted as a lightweight infrastructure concern within the orchestration layer". These clauses assert permission the global does not grant; same closure conditions as F1.

### F3 · Module-level memoized singleton in orchestration — **OPEN** (borderline, unchanged)

- **Global rule:** "`Use cases receive all dependencies via constructor — no module-level singletons, in any package`" (`architecture/spec.md:87`).
- **Status:** Not covered by the new exceptions section (which lists only three SDK deviations, none naming the memo). `cachedBuiltinRegistryData` persists at `packages/sdk/src/orchestration/suggest-implementation-links.ts:165-180` (now promise-serialized per commit `e7aec196`, but still module-scoped state). Borderline verdict unchanged.

### F4 · Partial port mocks cast `as unknown as Port` — **OPEN** (confirmed untouched)

- **Global rule:** `default:_global/testing` — "Port mocks implement the port interface fully. No partial mocks with `as unknown as Port`."
- **Evidence (current):** `packages/sdk/test/orchestration/suggest-implementation-links.spec.ts:146`; `packages/sdk/test/orchestration/suggest-spec-dependencies.spec.ts:179, 513, 661, 791` — all `{ … } as unknown as SpecRepository` sites intact. This cycle's test edits to these suites are purely additive coverage (alreadyIncluded tagging, discovery-event ordering, cache-version regeneration) and do not touch the mocks.

### F5 · code-graph change-spec constraint "No dependency on @specd/core" vs globals — **OPEN** (confirmed untouched)

- **Global rules:** `default:_global/error-handling-conventions` Monorepo Package Mandate — "Every package in the specd monorepo that depends on `@specd/core` MUST extend `SpecdError` for its own domain and application errors" (`error-handling-conventions/spec.md:26`), presupposing the dependency the constraints deny.
- **Evidence (current merged specs):** `specs/code-graph/language-adapter/spec.md:227` "- No dependency on @specd/core"; `specs/code-graph/graph-store/spec.md:312` "- No dependency on `@specd/core` — error types extend `CodeGraphError`". Meanwhile `SpecdCodeGraphError extends SpecdError` (`src/domain/errors/specd-code-graph-error.ts`) and `createBuiltinAdapterRegistry` takes core's `SpecdConfig`. No rewording occurred this cycle.

### F6 · CLI internal-barrel import + direct code-graph runtime dependency — **PARTIALLY CLOSED** (import: CLOSED-CODE · package.json dep: still OPEN)

- **Closed dimension (code):**
  - `packages/cli/src/commands/graph/index-graph.ts:3` now reads `import { acquireGraphIndexLock } from '@specd/code-graph'` (was `@specd/code-graph/internal`); repo-wide grep for `'@specd/code-graph/internal'` in `packages/cli/src`: **0 matches**. Test mock swapped likewise (`packages/cli/test/commands/graph-index.spec.ts:1,10-11`).
  - Public export added: `packages/code-graph/src/public.ts:6` `export { acquireGraphIndexLock, getGraphIndexLockPath } from './infrastructure/index-lock.js'`; built artifacts contain the symbols (`dist/public.js` ×2, `dist/public.d.ts` ×1).
- **Still-open dimension:** `packages/cli/package.json:27` still declares `"@specd/code-graph": "workspace:*"`. Architecture verify scenario (`specs/_global/architecture/verify.md:112-115`) — "**GIVEN** `packages/cli/package.json` … **THEN** `@specd/sdk` is declared **AND** `@specd/core` and `@specd/code-graph` are absent" — still fails. (Prose constraint `:97` bans depending on "**both** core and code-graph", which CLI literally passes; the verify scenario is stricter.) Removing the dependency would additionally require surfacing the lock helpers through `@specd/sdk`, which was not done.

### F7 · Stale `docs/cli/spec-deps.md` — **CLOSED-CODE**

- **Global rule:** `default:_global/docs` — command output-contract changes MUST update the `docs/cli/` reference in the same change.
- **Evidence:** file rewritten this cycle: Usage block now documents `--dep <id>...` on `add`/`remove`/`set`, `clear`, and the full `suggest [<specPath>] [--spec <id>...] [--all] [--workspace <name>] [--apply] [--create-change] [--rebuild-cache]` surface plus `--format text|json|toon` (`docs/cli/spec-deps.md:8-16`) — matches implemented `deps.ts` flags and the merged `cli:spec-deps` spec. The fabricated "remove runs before add when both appear in one mutation" semantics are gone, replaced by accurate one-action-per-call rules incl. no-op-on-uninitialized `remove` (`:21-25`) and current error surface (`:27-29`). Consistent with the docs mandate.

## New issues introduced by fixes

### N1 · code-graph public `"."` barrel now exports infrastructure functions (undocumented deviation) — **NEW VIOLATION (minor)**

- **Rule:** `architecture/spec.md:73,94` — public `"."` barrels "**MUST NOT export concrete adapter classes or infrastructure implementations**", explicitly applicable to `@specd/code-graph`.
- **Evidence:** the F6 remediation added `export { acquireGraphIndexLock, getGraphIndexLockPath } from './infrastructure/index-lock.js'` to `packages/code-graph/src/public.ts:6` — functions residing in `src/infrastructure/` exported through the curated `"."` entry point. While they are utility functions rather than adapter _classes_, the rule text also bars "infrastructure implementations", and by-location these qualify.
- **Why flagged separately from F1's accepted debt:** design.md's "Architectural exceptions (accepted debt)" section enumerates only SDK-side deviations (Fs caches, mkdir/writeFile, sdk barrel); this code-graph barrel export has **no corresponding accepted-debt entry**, so it is currently an undocumented breach. Either add it to the exceptions list (with the same rationale) or route the helpers via composition/sdk before archive.

### N2 · Fail-open post-apply validation newly codified — **observation, no global contradiction found**

- Merged `sdk:suggest-spec-dependencies` Pass 3 now specifies: "If `ValidateSpecs` itself throws, post-apply validation degrades gracefully to `status: \"all-valid\"` (fail-open) so a broken validator never blocks apply; the thrown error is logged at debug level."
- Checked against globals: `_global/error-handling-conventions` mandates the Specd Error Contract and forbids generic `Error` for expected failure modes, but contains **no fail-closed mandate**; logging at debug via the Logger abstraction complies with `_global/logging`. Not a violation — noted because silently reporting `all-valid` after a validator crash masks invalid-spec detection; consider a distinct degraded status (e.g. `validation-unavailable`) in a future revision.

### Conformant additions this cycle

- `packages/sdk/src/orchestration/suggest-spec-dependencies.ts:820-824` — new fail-fast `InvalidInputError` when `createAlignmentChange` is set without a `CreateChange` dependency; matches the newly added Pass 3 requirement verbatim and conforms to the Specd Error Contract (`extends SpecdError`, UPPER_SNAKE_CASE code).
- `packages/core/src/domain/errors/artifact-conflict-error.ts:55-58` — message-only change appending actionable remediation guidance ("Re-load the artifact and retry…"); strengthens compliance with "Actionable Messaging" (`error-handling-conventions/spec.md:34`). Class shape, `ARTIFACT_CONFLICT` code, JSDoc unchanged.
- Core readOnly messages (`update-persisted-spec-deps.ts:79-82`, mirrored in `update-persisted-spec-implementation.ts:90-93`) — message-only enrichment explaining cause + fix ("Change the workspace ownership in specd.yaml to allow writes."); conforms to Actionable Messaging; no behavioral or typing changes.
- This cycle's test additions use real FS adapters under `os.tmpdir()` with cleanup (fs-suggestion-cache.spec.ts) — testing-globals compliant.

## Summary counts

| Verdict                                                         | Count | Findings                                                                                                                    |
| --------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| CLOSED-CODE                                                     | 1     | F7 (docs/cli/spec-deps.md rewritten)                                                                                        |
| PARTIALLY CLOSED (code closed, dep declaration open)            | 1     | F6 (internal import removed + public exports incl. dist; `cli/package.json:27` still violates architecture verify scenario) |
| OPEN — accepted debt documented, global rule absolute/unamended | 2     | F1, F2 (+ residual contradictory "lightweight infrastructure concern" clauses in both sdk change specs)                     |
| OPEN — confirmed unchanged                                      | 3     | F3 (borderline memo singleton), F4 (partial mocks ×5), F5 (code-graph no-core constraint ×2)                                |
| New violations                                                  | 1     | N1 (code-graph `"."` barrel exports `infrastructure/index-lock.js` symbols; undocumented in design.md exceptions)           |

**Overall:** real progress — F7 fully closed, F6 half-closed (remaining work is deleting the `@specd/code-graph` entry from `packages/cli/package.json` once the lock helpers are reachable via `@specd/sdk`). F1/F2 moved from silent violation to explicitly accepted debt; since `_global/architecture` uses unconditional MUST NOT language with no exception mechanism, these cannot be counted as conformant until the planned dedicated architecture change amends the global spec. F3/F4/F5 remain exactly as reported in round 1. One new small deviation (N1) was introduced by the F6 fix and should either join the accepted-debt list or be rerouted before archive.
