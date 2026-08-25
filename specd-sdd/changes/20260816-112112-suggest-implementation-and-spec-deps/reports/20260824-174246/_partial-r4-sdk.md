# Compliance Re-Audit Partial — round 4 sdk cache freshness

Auditor: read-only spec-compliance subagent (round 5, part B — sdk three-stage cache freshness).
Scope: `FsImplementationSuggestionCache` + `FsSpecDepsSuggestionCache` staged freshness flow, stamp VO `size`, spec-wording consistency, targeted tests.

## Staged-flow analysis (a-e above, file:line evidence)

Both adapters are line-for-line mirrors of the staged flow. Evidence below cites the implementation adapter (`packages/sdk/src/infrastructure/fs/fs-implementation-suggestion-cache.ts`, "impl") and the deps adapter (`packages/sdk/src/infrastructure/fs/fs-spec-deps-suggestion-cache.ts`, "deps"); identical logic exists at the mirrored offsets.

**Cheap `getSpecStamp()`** (impl :186-224 / deps :168-206): reads `repo.get()` artifacts only — `lastModified` from the main artifact stat (:202-207), declared inline `hash` if any (:208), optional `size` (:209-214). Confirmed against core: `FsSpecRepository._buildSpec` builds artifact entries as `{ filename, lastModified, size }` with **no hash** (`packages/core/src/infrastructure/fs/spec-repository.ts:1018-1023`), so in production `getSpecStamp().hash === ''` — exactly the cheap contract documented in the JSDoc (impl :177-185 / deps :159-167).

**a) Stage-1 false-fresh residual risk — CONFIRMED PRESENT, NOT EXPLICITLY DOCUMENTED.**
Stage 1 (impl :288-308 / deps :270-290): when both stamps carry `size >= 0` and `lastModified` matches and sizes are equal, `return cached` fires **without any content hashing** (impl :301-302). A content edit that preserves byte length AND leaves mtime unchanged (same-length write within mtime granularity, or an mtime-restoring copy) is served as FRESH forever until some other signal (graph fingerprint, another stage) trips. This is inherent to the design and acceptable, but neither `design.md:558-569` nor either spec bullet states it as an accepted residual risk — they document the decision rule ("equal `lastModified` + equal `size` is FRESH") and only the safe direction ("byte-length difference proves content change"). **Doc-gap finding:** risk is real-but-benign and should be named once in design.md as accepted debt.

**b) Stage-2 ordering — CORRECT in both adapters.**
When stage 1 is inconclusive (sizes present but lm drifted with equal size, or size missing on either side), execution falls through to `await this.enrichSpecHash(specId, currentStamp)` (impl :310-312 / deps :292-294) **before** the hash comparison. `enrichSpecHash` (impl :236-265 / deps :218-247) calls `repo.artifactMeta(specData, 'spec.md', { includeHash: true })` and writes back authoritative `hash` and `size` into the working copy, never throwing. Comparison gate `hashComparable` requires non-empty strings on BOTH sides (impl :313-317 / deps :295-299), then `return cachedStamp.hash === currentStamp.hash ? cached : null` (impl :318-320 / deps :300-302) — cached-vs-current hashes decide regardless of `lastModified`. Tests pin both directions: impl :229-265 (mismatch ⇒ null despite equal size), :267-303 (equal hash ⇒ fresh despite drifted mtime).

**c) Legacy stamps without size — BEHAVIOR PRESERVED.**
Stage-1 guard requires `typeof size === 'number'` on **both** stamps (impl :291-296 / deps :273-278), so a legacy persisted stamp lacking `size` skips the pre-filter entirely and lands directly on stage 2 (hash precedence) then stage 3 (timestamp fallback, impl :322-332 / deps :304-315) — precisely the pre-delta ordering verified in round 4. The existing no-size tests (impl :104-134 differing-hash stale, :136-166 matching-hash fresh; deps :410-440) exercise this exact path through real `set()`→`get()` with mock repos that expose no `artifactMeta`, so they double as legacy-stamp regression coverage. No cache-version bump was needed (absence of `size` = fallback path), consistent with tasks.md 6.2.

**d) Persist paths & invalidate interaction — SAFE, one efficiency nuance (see New issues #1).**

- `set()` enriches before persisting in BOTH adapters: impl :343-346, deps :325-328 — every entry written via `set()` carries authoritative SHA-256 (+stat-backed size when available). The impl adapter's optional `input.specContentHash` override (impl :347-350) is itself authoritative (caller-computed via `artifactMeta({includeHash:true})` at suggest-implementation-links.ts:686-694).
- `setMany()` stores caller entries verbatim (impl :375-392 / deps :352-368) — no enrichment inside the adapter. Its sole production caller is the Pass-1 warm-up prime (`suggest-spec-dependencies.ts:281-297`); stamps sourced there are analyzed below.
- `invalidate()` (impl :544-555 / deps :413-423) bumps `_generation`, resets `_data` to a live empty Map, clears header/dirty, unlinks the file. A subsequent `set()` proceeds safely: `ensureLoaded()` short-circuits on the non-null empty map, enrichment is repo-driven (independent of loaded state), header is rewritten by `set()` before persist. The generation-token race (invalidate vs in-flight load) remains guarded (impl :108-122 / deps :91-104, loadFromDisk token check) — verified in r4 and re-pinned by `fs-cache-concurrent-load.spec.ts` (all passing).

**e) Declared-hash leak into stored stamps — NO production leak.**
Grep confirms all four `getSpecStamp` call sites are immediately followed by `enrichSpecHash` (get + set × both adapters). In production the declared hash is always `''`; after `set()` it is replaced by the authoritative SHA-256 or stays `''`. A stored `''` hash is inert: the `hashComparable` length>0 guard routes such reads to stage 3, which degrades to the pre-delta timestamp semantics rather than false-fresh beyond lm equality. The only way a non-enriched stamp reaches disk is via `setMany()` with caller-fabricated entries — audited under New issues #1; no correctness impact.

## Spec consistency findings

1. **`specs/sdk/suggest-implementation-links/spec.md:38-42` — CONSISTENT.** Verified via `changes spec-preview suggest-implementation-and-spec-deps sdk:suggest-implementation-links --artifact specs`: merged bullet renders the three numbered stages verbatim — (1) cheap size/mtime pre-filter, equal lm+size ⇒ FRESH / differing size ⇒ STALE; (2) content-hash precedence when the pre-filter cannot decide or no size available, "regardless of `lastModified`"; (3) timestamp fallback only without usable hashes. This is a faithful restatement of impl :288-332 / deps :270-333 including branch order.
2. **`specs/sdk/suggest-spec-dependencies/spec.md:41` — CONSISTENT.** Merged Pass-2 bullet now reads "per-entry validation inside `get()` applies the same three-stage identity check as the implementation cache — cheap size/mtime pre-filter, then content-hash precedence, then timestamp fallback" (verified via spec-preview). Matches the deps adapter exactly; also correctly retains the `cacheVersion === '1.1.0'` load gate (deps :105-110).
3. `design.md:558-569` documents the rationale (hash fetched 2-4× per spec per pass) and the resolution (three-stage check, legacy stamps fall through unchanged, contracts updated in core) — coherent with code and specs.
4. Residual wording observations from r4 remain cosmetic-only (verify.md scenario phrasing); nothing in this delta contradicts them.

## Test evidence

| Command                                                                                                                                                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cd packages/sdk && rtk pnpm test`                                                                                                                       | `Test Files  4 failed \| 22 passed (26)` / `Tests  3 failed \| 209 passed (212)`                                                                                                                                                                                                                                                                                                                                      |
| `cd packages/sdk && rtk pnpm exec vitest run test/infrastructure/fs/fs-suggestion-cache.spec.ts test/infrastructure/fs/fs-cache-concurrent-load.spec.ts` | **`Test Files  2 passed (2)` / `Tests  17 passed (17)`**                                                                                                                                                                                                                                                                                                                                                              |
| verbose run, fs-suggestion-cache.spec.ts                                                                                                                 | **11/11 passed**, incl. all five staged-flow tests: `stage 1: equal size+mtime is a HIT without requesting any content hash`, `stage 1: a differing byte-size is a MISS without any hash comparison`, `stage 2: drifted mtime with equal size falls through to hash precedence`, `stage 2: drifted mtime with equal size and equal hash stays fresh`, plus deps `deps cache stage 1: a differing byte-size is a MISS` |

The 3 suite failures are **pre-existing environment issues, unrelated to this delta**: `dist/test/composition/package-boundary.spec.js`, `build-project-status-snapshot.spec.js`, `run-index-project-graph.spec.js` each fail with `ENOENT ... package.json` fixture lookups (`packages/sdk/dist/package.json`, `packages/sdk/code-graph/package.json`). None touch the FS suggestion caches or orchestration freshness logic.

Performance sanity (task 4): the stage-1-hit-avoids-hashing assertion exists and passes — `fs-suggestion-cache.spec.ts:190-194` explicitly `artifactMeta.mockClear()`s then asserts `expect(artifactMeta).not.toHaveBeenCalled()` after a same-lm+same-size read. Orchestrator benefit is automatic: freshness lives entirely inside the adapters, so Pass-1 warm-up (`suggest-spec-dependencies.ts:265-280`) and Pass-2 reads (`:300+`) get stage-1 short-circuits with zero orchestrator changes; misses pay exactly one enrichment inside `set()`.

## New issues (if any)

1. **Minor (perf, not correctness) — warm-up priming can overwrite enriched stamps with size-less ones.** On a cold run, `cache.set()` persists an enriched stamp (real hash + size) per spec, but the Pass-1 prime then overwrites each entry via `setMany()` using the result-level stamp built at `suggest-implementation-links.ts:492-498` (`{ lastModified, hash: realContentHash, artifacts: [] }`) which carries **no `size`**. Those primed entries skip stage 1 forever (until rewritten by `set()`), costing one extra `artifactMeta` per read. Suggestion: include `analysis`-sourced `size` (or reuse the enriched stamp from the just-executed `set()`) in the result payload.
2. **Minor (doc) — accepted false-fresh residual risk undocumented** (see analysis _a_). One sentence in design.md naming the same-mtime+equal-size collision as accepted would close it.
3. **Minor (test coverage) — deps adapter has no stage-2 drift test.** tasks.md 6.4 lists "drifted lm + equal size + hash mismatch/equal" cases; only the impl adapter has them (:229, :267). Deps code is line-identical, so risk is low, but the mirrored pair is untested.
4. Observation (pre-existing, not new): a stage-2 hash-match hit does not refresh the cached `lastModified`/`size` after pure mtime drift, so touched-but-unchanged specs keep paying one enrichment per read. Same behavior class as pre-delta; noting for completeness.

No blocking defects found. Nothing in this delta introduces a correctness regression.

## Summary counts

| Check                                           | Verdict                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| (a) Stage-1 false-fresh residual risk           | Present-by-design; **not explicitly documented** (minor doc gap)                               |
| (b) Stage-2 enrich-before-hash ordering         | ✅ VERIFIED both adapters (impl :310-320, deps :292-302)                                       |
| (c) Legacy stamps (no size)                     | ✅ Skip stage 1 entirely; pre-delta semantics preserved                                        |
| (d) set()/setMany()/invalidate() persist safety | ✅ SAFE (set enriches both adapters; invalidate interaction clean; setMany nuance = perf-only) |
| (e) Cheap-hash leak into stored stamps          | ✅ NONE in production paths                                                                    |
| Impl spec bullet (three-stage)                  | ✅ CONSISTENT (spec-preview verified)                                                          |
| Deps spec Pass-2 bullet                         | ✅ CONSISTENT (spec-preview verified)                                                          |
| Targeted cache tests                            | ✅ 17/17 passed (2 files)                                                                      |
| Full sdk suite                                  | 209/212 passed; 3 failures pre-existing env fixtures, unrelated                                |
| New issues                                      | 0 blocking · 3 minor · 1 observation                                                           |

**Verdict: the sdk three-stage cache-freshness delta is correctly implemented in both FS adapters, faithfully mirrored by updated spec bullets, performance assertions pin the cheap path, and no new correctness issue is introduced.**
