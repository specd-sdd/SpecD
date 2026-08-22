# Spec Compliance Report — incremental: section 21 cleanup pass

- Change: nonblocking-sqlite-graph-store
- Date: 2026-08-22 00:09
- Scope: incremental audit of the pre-compliance cleanup pass (typed selector error, batch ambiguity enrichment, param-limit regression, §21 artifacts). Main implementation audited in reports/20260821-230442.
- Verification evidence this cycle: code-graph targeted suites 181/181 PASS; cli graph-impact 32/32 PASS; full turbo suite passed as verifying pre-hook before done → archivable.
- Verdict: **CLEAN** — no discrepancies across all 7 audited items.

## Detailed Findings (verbatim partial report)

# Incremental audit — section 21 cleanup pass

Change: `nonblocking-sqlite-graph-store`
Scope: follow-up "section 21" cleanup pass only (main implementation covered by reports/20260821-230442).
Mode: read-only incremental audit.

## Items audited

1. **`packages/code-graph/src/domain/errors/invalid-graph-selector-error.ts` (NEW)** — **conformant**
   - Extends `SpecdCodeGraphError` (`invalid-graph-selector-error.ts:7`), mirrors canonical pattern of `invalid-relation-type-error.ts:6`.
   - `get code()` returns `'INVALID_GRAPH_SELECTOR'` (`invalid-graph-selector-error.ts:12-14`).
   - Message-preserving constructor: takes `message: string`, passes straight to `super(message)` (`invalid-graph-selector-error.ts:20-22`) — appropriate since callers supply full descriptive text (unlike relation-type error which formats its input).
   - JSDoc on class (:3-6), getter (:8-11), and constructor (:16-19). Unit test confirms `error.name === 'InvalidGraphSelectorError'`.

2. **Barrel exports** — **conformant**
   - `src/domain/errors/index.ts:4` — named export present.
   - `src/index.ts:219` — named export from curated public entry.
   - `src/public.ts:204` — named export.
   - No default exports anywhere in code-graph `src/` (grep for `export default`: zero matches); `domain/index.ts:1-2` uses `export * from` re-export of named-only barrels. Named-export-only convention holds.

3. **`packages/code-graph/src/application/services/resolve-graph-selector.ts`** — **conformant**
   - Both generic throws replaced with typed error: `'empty file selector'` at :64, `'empty symbol selector'` at :101, both `throw new InvalidGraphSelectorError(...)`.
   - No other `throw` statements exist in the file — zero generic `Error` throws introduced or remaining.
   - `mapWithConcurrency` usage intact at :114 and :136 (`RESOLVER_CONCURRENCY = 16`).

4. **`packages/cli/src/commands/graph/impact.ts`** — **conformant**
   - Ambiguous path issues exactly ONE batch lookup: `provider.getSymbolsByIds(...)` at impact.ts:612, results mapped back into a `Map` keyed by symbol id (:610-614) so candidate order is preserved (map over `resolved.candidates` in original order, :615-620) and missing-symbol filtering preserved (`filter(candidate => candidate !== null)` → `present`, :621).
   - Single-symbol path is a direct `provider.getSymbol(resolved.match.symbolId)` at :649 — no artificial `Promise.all` batching remains.
   - Display-path formatting is pure: all paths flow through `toGraphDisplayPath(config, ...)` (`resolve-impact-file-selectors.ts:70-87`), a synchronous projection using only `SpecdConfig` + `node:path` `relative`/`join`; doc comment states "no graph store access" and code confirms zero provider/store reads.

5. **Merged spec consistency (`changes spec-preview nonblocking-sqlite-graph-store code-graph:composition`)** — **conformant**
   - Merged spec.md section "Requirement: Symbol-reference provider surface" contains the new paragraph: "Selector validation failures that are reachable from host input … SHALL reject with a typed graph error carrying a stable machine-readable code (`INVALID_GRAPH_SELECTOR`) rather than a generic `Error`, preserving the descriptive message. When ambiguous-symbol presentation must enrich candidates with symbol details, it SHALL issue exactly one exact batch lookup rather than one call per candidate."
   - Merged verify.md contains both new scenarios under that requirement: "Empty selector input rejects with a typed error" and "Ambiguity presentation enriches candidates through one batch lookup" (both defined in `deltas/code-graph/composition/verify.md.delta.yaml:149-161`).
   - Requirement↔scenario parity: the composition delta adds NO new requirements (all ops are `modified` sections plus one added "ADRs" prose section, `spec.md.delta.yaml`). Every modified requirement retains ≥1 scenario in merged verify.md (CodeGraphProvider facade ×4, Factory function ×8, Package exports ×7, Lifecycle management ×3, Symbol-reference provider surface ×6). Parity satisfied.

6. **Test coverage of new behavior** — **conformant**
   - `test/domain/errors/specd-code-graph-error.spec.ts:29-35` — `InvalidGraphSelectorError extends SpecdCodeGraphError` case (name/code/message).
   - `test/composition/code-graph-provider.spec.ts:584-602` — "rejects empty selectors with the typed graph selector error": asserts both empty file and empty symbol selectors reject with `InvalidGraphSelectorError`, `.code === 'INVALID_GRAPH_SELECTOR'`, messages preserved.
   - `packages/cli/test/commands/graph-impact.spec.ts:869-871` — asserts `getSymbolsByIds` called exactly once with candidate ids AND `getSymbol` never called (ambiguous-symbol test block ~:840-872).
   - `test/infrastructure/sqlite/sqlite-graph-store.spec.ts:81` — "accounts for all bind parameters when chunking ids together with relation types".
   - Execution: `pnpm vitest run` on the three code-graph files → PASS 151 / FAIL 0; on cli graph-impact.spec.ts → PASS 32 / FAIL 0.

7. **tasks.md section 21** — **conformant**
   - All six entries checked `[x]`: 21.1–21.6 (`tasks.md:653-681`).
   - Approaches match implementation:
     - 21.1 ↔ one-batch enrichment + direct single `getSymbol` in impact.ts; graph-impact.spec.ts updated to assert batch API (matches approach text).
     - 21.2 ↔ error class following `InvalidRelationTypeError` pattern, barrel exports, resolver replacement, unit + provider tests (all verified above).
     - 21.3 ↔ fan-out classification recorded in design.md §21 ("Task 3/4/5 execution record") with retained-case justifications matching task approach.
     - 21.4 ↔ verification-only batch-symmetry walk recorded in design.md §21 ("confirmed identical semantics on all eight layers").
     - 21.5 ↔ new chunk regression exists (sqlite-graph-store.spec.ts:81) and passes; design.md records "6 types × 905 ids", `idChunkSize = 900 − |types|`.
     - 21.6 ↔ regression scope recorded in design.md §21 Task 6; current typecheck-relevant suites green (see item 6).

## Discrepancies

_none_

## Verdict

CLEAN
