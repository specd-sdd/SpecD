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
