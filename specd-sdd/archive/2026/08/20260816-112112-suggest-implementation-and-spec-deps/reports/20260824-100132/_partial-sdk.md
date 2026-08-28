# Compliance Audit Partial — sdk area

Change: `suggest-implementation-and-spec-deps` (state: verifying)
Audited specs: `sdk:suggest-implementation-links`, `sdk:suggest-spec-dependencies`
Evidence date: 2026-08-24. All tests cited were executed green during this audit:
`vitest run test/orchestration/suggest-implementation-links.spec.ts test/orchestration/suggest-spec-dependencies.spec.ts` → 27 passed; `test/infrastructure/fs/fs-suggestion-cache.spec.ts` + `fs-cache-concurrent-load.spec.ts` → 7 passed (workdir `packages/sdk`).

Primary implementation files inspected:

- packages/sdk/src/orchestration/suggest-implementation-links.ts
- packages/sdk/src/orchestration/suggest-spec-dependencies.ts
- packages/sdk/src/application/ports/implementation-suggestion-cache-port.ts
- packages/sdk/src/application/ports/spec-deps-suggestion-cache-port.ts
- packages/sdk/src/domain/value-objects/implementation-suggestion-cache.ts
- packages/sdk/src/domain/value-objects/spec-deps-suggestion-cache.ts
- packages/sdk/src/infrastructure/fs/fs-implementation-suggestion-cache.ts
- packages/sdk/src/infrastructure/fs/fs-spec-deps-suggestion-cache.ts

---

## Spec 1: sdk:suggest-implementation-links

### Requirements Summary (count)

6 requirements in spec.md; 13 scenarios in verify.md.

1. Use Case Interface
2. Input Validation & Error Handling
3. 3-Tier Analysis Algorithm
4. Already-Included Marking
5. Additive Mutation Semantics (`apply: true`)
6. Standard Factory & Composition Overloads

### Implementation Status (per requirement)

**1. Use Case Interface — SATISFIED**

- `async execute(input)` at suggest-implementation-links.ts:339.
- All input fields present: `specId` (:106), `specIds` (:108), `workspace` (:110), `all` (:112), `apply` (:114), `rebuildCache` (:116), `confidenceThreshold` with `'HIGH'|'MEDIUM'|'MED'|'LOW'` union (:118), `onProgress` (:120).
- MED→MEDIUM normalization implemented in zod schema (suggest-implementation-links.ts:54–59).
- Progress event union contains exactly `discovery-start`, `discovery-done`, `start`, `spec-start`, `spec-done`, `done` (:92–98); emission order discovery-start first (:383), discovery-done precedes start (:425 vs :443).

**2. Input Validation & Error Handling — SATISFIED**

- No targeting option → `InvalidInputError`: superRefine guard (:81–89) thrown as InvalidInputError (:340–346).
- Unknown workspace → `WorkspaceNotFoundError` (:349–353).
- Invalid confidence threshold → `InvalidInputError` via zod enum failure (:54–59, :340–346).
- Missing `specId`/`specIds` → `SpecNotFoundError` after discovery (:427–436). All errors extend `SpecdError` (imported from @specd/core, :18–20).
- Minor deviation: schema also accepts lowercase variants `'high'|'medium'|'med'|'low'` (:55), i.e. values technically outside the spec's allowed set are accepted and normalized rather than rejected (see Discrepancies D1-1).

**3. 3-Tier Analysis Algorithm — PARTIAL**

- Tier 1 core mechanics all present:
  - `repo.list(undefined, { includeMeta: true, ... })` across workspaces (:400) — matches "Queries SpecRepository.list({ includeMeta: true })".
  - 2-stage cache staleness (`lastModified` then `hash`) in FsImplementationSuggestionCache.get() (fs-implementation-suggestion-cache.ts:238–261); cache file path `.specd/tmp/fs-cache/implementation-suggestions/suggestions.json` (:58–64, :72–78); domain interfaces exported from value object (implementation-suggestion-cache.ts:5–57, version '1.1.0' at :2).
  - Reads spec.md via `repo.artifact(spec, 'spec.md')` (:682–685); real hash via `repo.artifactMeta(..., { includeHash: true })` (:687–694).
  - Symbol extraction: title words via GetSpecMetadata fallback (:705–716), AST code blocks (:697–698 regex, :822–832 extraction), backticked terms matching PascalCase / camelCase-with-uppercase / `fn()` / `Obj.method` patterns (:728–743 isCodeIdentifierCandidate, :842–865 inline backtick scan), reserved keywords + SPEC_PROSE_KEYWORDS stop-words (:183–265, :702–703).
  - Naming derivative path candidates: kebab→Pascal/Camel/snake (:790–803), factory prefixes register/create/get/handle/parse/resolve (:812–817), path variant expansion over validated source subdirs (:868–935).
  - Candidate existence validated on disk before suggestion (:1012–1015, :1093–1096) — uses async `access` (asyncFileExists :45–52) instead of the literal `existsSync`; functionally equivalent (see Discrepancies D1-2).
  - computePathSpecAffinity (:274–320): split `[\/\\_\-.:]+` (:286), plural stemming `length > 2 && !endsWith('ss')` (:282–285), per-missing-token penalty `-150` recorded as `missing-distinctive-tokens` (:1077–1080), HIGH barred when affinity unclean (:1522–1525 `isCleanAffinity` requirement).
  - code-graph symbol query scoped to workspace via `workspace` property on the query object (:956–959).
  - Variable kind filtered (:963–966); parentId-based top-level preservation / loose child sieving (:1440–1493 verifiedSymbols, top-level node names :1421–1429).
  - isCompoundIdentifier (:724–726); single-word PascalCase restricted to files declaring it top-level (`parentId === undefined`) (:1445–1447, :1477–1493).
  - Exact primary match +200 `primary-symbol-match` (:1050–1052); derivative match +50 `derivative-symbol-match` (:1053–1055).
  - Candidates lacking any spec-title symbol match discarded (:1365–1419).
  - Confidence assignment: HIGH ≥150 w/ primary-or-token/slug reason & clean affinity (:1519–1525), MEDIUM ≥80 (:1526–1527), LOW otherwise (:1518). Matches "HIGH >= 150 with clean affinity, MEDIUM 80–149, LOW < 80".
  - **Short-circuit after Tier 1 NOT implemented literally** — see Discrepancies D1-3.
- Tier 2:
  - Hierarchical domain prefix derivation exists inside the derivedPaths loop: coverage ≥0.3 branch checks distinctive missing sub-tokens in candidate content via disk read + `codeGraphProvider.search` FTS (:1121–1211), awards `subtoken-content-match` +160 (:1180–1188) and attaches declared top-level symbols (:1188–1199).
  - **Tier 2 does not short-circuit the flow either** (same finding D1-3); Tier 3 gating on empty map is correct though.
- Tier 3:
  - Triggered only when `suggestionMap.size === 0` (:1215) ✓.
  - Extracts `<tag>` syntax tags (:1217–1230) and Requirement-heading keywords (:1232–1243), queries code-graph multi-term co-occurrence (:1246–1289), ranks by density, keeps top hits, assigns `fallback-content-co-occurrence` with MEDIUM-range score `min(140, 80 + count*15)` (:1292–1313 → confidence MEDIUM via :1526). Matches spec.

**4. Already-Included Marking — SATISFIED**

- `alreadyIncluded` computed by canonical-path set comparison against persisted lock files (:503–516); field on every entry (value object implementation-suggestion-cache.ts:32; default false at :1536 pre-marking).
- Result entries carry marking into response (:518–524).

**5. Additive Mutation Semantics (`apply: true`) — SATISFIED**

- Set-union semantics: only non-`alreadyIncluded` suggestions applied via `updatePersistedImplementation.execute({ ..., action: 'add', ... })` (:532–555), preserving existing links; mutation counters returned (:575–583).

**6. Standard Factory & Composition Overloads — SATISFIED**

- 3 overload signatures + handler (:1594–1624); type guard (:1632–1640).
- `resolveSuggestImplementationLinksDeps(resolver)` (:1559–1586) wires core use-case factories and FsImplementationSuggestionCache.
- Public exports verified in packages/sdk/src/index.ts:14–16.

### Discrepancies

**D1-1 — confidenceThreshold accepts lowercase values outside the documented enum.**

- Evidence: suggest-implementation-links.ts:54–59 (`z.enum(['HIGH','MEDIUM','MED','LOW','high','medium','med','low'])` + uppercase normalization) vs spec: "If `confidenceThreshold` is specified with an invalid string outside `['HIGH', 'MEDIUM', 'MED', 'LOW']`, `execute()` MUST throw `InvalidInputError`."
- Hypothesis A (spec drift): the spec should document case-insensitive acceptance as intended lenient UX; implementation is correct.
- Hypothesis B (implementation bug): inputs like `'high'` are contract-invalid per the current spec text and must be rejected; the lenient schema silently broadens the API contract. Severity: low (no wrong results produced; normalization maps to valid levels).

**D1-2 — File-existence check uses async `access` instead of literal `existsSync`.**

- Evidence: suggest-implementation-links.ts:45–52 (`access(filePath, constants.F_OK)`) used at :1013, :1094, :1145, :1278; spec text says "`existsSync`" (Tier 1 bullet and Constraints).
- Hypothesis A (spec drift): spec over-specifies the Node API; the constraint's intent ("lightweight infrastructure concern") is satisfied by any existence probe.
- Hypothesis B (implementation bug): none functionally; purely textual mismatch. Severity: informational.

**D1-3 — Tier short-circuiting between Tiers 1 and 2 is not implemented.**

- Evidence: spec says "If Tier 1 produces matching candidates with `HIGH` or `MEDIUM` confidence, the algorithm short-circuits and returns" and "If Tier 2 produces matching candidates, the algorithm short-circuits and returns." In analyzeSpec there is a single continuous pipeline: graph-symbol scoring (Tier 1, :952–1088) always flows into the derivedPaths loop containing naming-derivative and subtoken-content-match logic (Tier 2, :1091–1212); no early return exists when high/medium candidates already exist. Only Tier 3 is correctly gated on zero candidates (:1215).
- Impact: additional lower-tier candidates can be appended even after a successful Tier 1 (e.g. a `subtoken-content-match` entry adding +160 could reach HIGH), changing output versus a strict cascade reading of the spec.
- Hypothesis A (spec drift): the shipped design intentionally merges tiers into one additive-scoring pass (scores/reasons accumulate; ordering by score at :1540 compensates), and the spec paragraph describes an earlier cascade prototype.
- Hypothesis B (implementation bug): missing early-return optimization/guard causes extra graph queries and potentially extra (possibly noisy) suggestions that the spec forbids. Needs owner decision; severity medium because observable result sets can differ from spec.

**D1-4 — Title resolution fallback chain incomplete vs spec.**

- Evidence: spec says title comes from "`GetSpecMetadata` title with fallbacks to `readMetadataSnapshot` and Markdown H1 title". Implementation resolves title only from (a) list metadata passed as `initialTitle` (:406, :705) or (b) `getSpecMetadata.execute` (:706–716). There is no direct `readMetadataSnapshot` call and no H1-title parse of spec.md content anywhere in the file (verified by grep: no H1 regex, no readMetadataSnapshot reference).
- Hypothesis A (spec drift): `initialTitle` from `repo.list({ includeMeta: true })` effectively IS the metadata-snapshot fallback (list reads `.specd-metadata.yaml` internally), so the chain is satisfied semantically; the H1 fallback was dropped intentionally because list/get always supply titles for real repositories.
- Hypothesis B (implementation bug): specs whose repository returns no metadata and no GetSpecMetadata title fall through to empty title, weakening primary-symbol extraction where the spec mandates an H1 fallback. Severity: low-medium (edge-case behavior gap).

### Test Coverage

Test file: packages/sdk/test/orchestration/suggest-implementation-links.spec.ts (12 tests, all passing).

| Verify scenario                                            | Test                                                                  | Assessment                                                                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suggest links for target spec (returns HIGH suggestion)    | `analyzes specs and returns confidence-scored suggestions` (:211–226) | Covered analogously with fixture repo; not the exact `cli:spec-implementation` fixture from verify.md                                                                            |
| Missing target options throws InvalidInputError            | :393–398                                                              | Covered (asserts both error type + SpecdError instance)                                                                                                                          |
| Non-existent workspace throws WorkspaceNotFoundError       | :400–409                                                              | Covered                                                                                                                                                                          |
| Invalid confidence threshold throws InvalidInputError      | :411–420                                                              | Covered (uses `'SUPER_HIGH'`)                                                                                                                                                    |
| MED shorthand normalizes to MEDIUM                         | :377–391                                                              | Covered exactly                                                                                                                                                                  |
| Non-existent spec ID error                                 | :422–435                                                              | Covered                                                                                                                                                                          |
| Cache staleness fast-path and rebuild                      | `persists real SHA-256 content hash in cache stamp` (:363–375)        | WEAK — stamp persistence asserted, but no assertion that a second execute serves from cache without re-running graph queries, nor that `rebuildCache: true` bypasses cache reads |
| Path/token affinity disqualifies missing tokens            | (none directly)                                                       | MISSING — no unit test exercises `-150` penalty / HIGH bar; computePathSpecAffinity is private and untested in isolation                                                         |
| Primary exact (+200) vs derivative (+50) differentiation   | Partially via `restricts single-word PascalCase terms...` (:252–318)  | WEAK — verifies top-level restriction but never asserts scores/reason strings `primary-symbol-match`/`derivative-symbol-match`                                                   |
| Tier 2 hierarchical domain prefix + subtoken content match | (none)                                                                | MISSING — no test for domain-prefix candidate + FTS sub-token confirmation scenario                                                                                              |
| Tier 3 fallback tag/keyword co-occurrence                  | (none)                                                                | MISSING — no test drives the `fallback-content-co-occurrence` path                                                                                                               |
| Already-included marking                                   | (none directly)                                                       | MISSING — setup seeds an existing lock file (`existing.ts` :153) but no test asserts `alreadyIncluded: true/false` on result entries                                             |
| Additive application of links                              | `performs additive set union when apply: true` (:228–239)             | MODERATE — asserts update called & counter >0; does not assert `action: 'add'` argument shape nor that already-included files are skipped                                        |
| Config-based factory resolution                            | `supports factory constructor overloads` (:437–449)                   | WEAK — only deps-form overload tested; config-form (`createSuggestImplementationLinks(config)`) and `resolveSuggestImplementationLinksDeps` output never exercised               |
| Progress callback events emission                          | :451–471                                                              | Covered incl. ordering assertions                                                                                                                                                |

Additional tests beyond scenarios: CRLF/multi-language code-block identifier extraction (:320–361).

### Dependency & Global Conformance findings

- Declared deps per `changes status`: `code-graph:symbol-model`, `code-graph:traversal`, `code-graph:language-adapter`, `core:get-persisted-spec-implementation`, `core:update-persisted-spec-implementation`.
  - code-graph:symbol-model — used via `findSymbols`, `SymbolNode`, `SymbolKind`, `parentId` handling (:23–29 imports; :952–1088; :1421–1493). Consistent with symbol-model spec (canonical `ws:path` identities respected at :992–1016).
  - code-graph:traversal — consumed indirectly here through provider `findSymbols`/`search`; heavy traversal usage lives in the sibling spec. Consistent; no contradiction found.
  - code-graph:language-adapter — `createBuiltinAdapterRegistry()` supplies supported extensions + reserved keywords (:172–181). Consistent with adapter-registry role.
  - core:get-persisted-spec-implementation — `getPersistedImplementation.execute({ specId })` (:463–465) matches its result contract (`implementation[]`, file-level vs symbol-level distinction preserved via `link.symbols ?? []`). The sdk swallows errors into empty lock data (:473–475) including the typed `SpecNotFoundError` the dep spec mandates for unknown specs — acceptable consumer-side tolerance, not a contradiction, but it conflates "unknown spec" with "uninitialized" (see shared note N1).
  - core:update-persisted-spec-implementation — invoked with `{ specId, action: 'add', file, symbols? }` (:537–546) exactly per its input contract; canonical `workspace:path` identity preserved because suggestion files are stored workspace-prefixed (:1016). Boundary/confinement enforcement delegated to the core use case — consistent.
- default:\_global/testing — VIOLATION (minor, systemic): "Port mocks are typed… No partial mocks with `as unknown as Port`." The suite builds partial mocks cast via `as unknown as SpecRepository` (:142–146) and `as any` providers (:168–187). In-memory caches DO fully implement their abstract ports (good). Severity low but a direct convention conflict.
- default:\_global/architecture — TENSION (design intent): orchestration modules import infrastructure adapters directly (`FsImplementationSuggestionCache` at :37; constructed as default at :359–366 and in resolver :1576–1581). Architecture spec reserves infrastructure imports for the composition layer ("application layer … never imports infrastructure adapters directly"). Mitigations: ports are injectable (`cache?: ImplementationSuggestionCachePort` :153), and the sdk mirrors core's hexagonal layout with `orchestration/` as its application layer. Report as accepted-deviation candidate needing an explicit note in global architecture or sdk docs.
- default:\_global/conventions — kebab-case files ✓, named exports ✓, SpecdError hierarchy ✓; JSDoc present throughout ✓.
- default:\_global/logging — `Logger.debug` used, no raw console ✓ (:674, :718, :937, etc.).

---

## Spec 2: sdk:suggest-spec-dependencies

### Requirements Summary (count)

4 requirements in spec.md; 11 scenarios in verify.md.

1. Use Case Interface
2. Input Validation & Error Handling
3. Cache Warm-up & 2-Pass Dependency Deduction (Passes 1, 2, 2.5, 2.6, 3)
4. Standard Factory & Composition Overloads

### Implementation Status (per requirement)

**1. Use Case Interface — SATISFIED**

- `async execute(input)` at suggest-spec-dependencies.ts:236.
- Inputs: `specId` (:133), `specIds` (:135), `workspace` (:137), `all` (:139), `apply` (:141), `rebuildCache` (:143), `createAlignmentChange` (:145), `changeNamePrefix` (:147), `onProgress` (:149); zod schema mirror :102–128.
- Progress events include all nine required types incl. `warmup-progress` wrapper (:37–49) and `validation-start`/`validation-done` (:47–48, emitted :787–790, :872–875).

**2. Input Validation & Error Handling — SATISFIED**

- Empty targeting → `InvalidInputError` (schema superRefine :120–128; thrown :237–243).
- Unknown workspace → `WorkspaceNotFoundError` (:246–250).
- Missing spec IDs → `SpecNotFoundError` post-discovery (:353–362).

**3. Cache Warm-up & 2-Pass Dependency Deduction — PARTIAL**

Pass 1 — SATISFIED:

- Warm-up executes `SuggestImplementationLinks.execute({ all: true, apply: false })` dry-run (:265–270).
- Primes impl cache via `setMany` + flush when stamps available (:281–298).
- Reverse lookup via `implCache.findSpecByFile(affPath)` O(1), hub filtering encapsulated in the fs adapter (SHARED_HUB_SPEC_THRESHOLD, fs-implementation-suggestion-cache.ts:18, :387–408; findSpecByFile :415–429) — satisfies "without ad-hoc loops or manual hub filtering in the use case".
- SpecDepsSuggestionCachePort initialized to `FsSpecDepsSuggestionCache` under `.specd/tmp/fs-cache/spec-deps-suggestions/suggestions.json` (:300–307; fs path fs-spec-deps-suggestion-cache.ts:53/:61).
- Deviation: spec names `SpecDepsSuggestionCachePort.isSpecFresh` validating `cacheVersion === '1.1.0'` — no such method exists anywhere in the SDK (grep confirmed 0 hits). Freshness/versioning is achieved structurally: version gate in loadFromDisk (fs-spec-deps-suggestion-cache.ts:98–110, `SPEC_DEPS_CACHE_VERSION='1.1.0'` value-object :4) + stamp/graph-fingerprint validation inside get() (:211–243). See Discrepancy D2-1.

Pass 2 — SATISFIED:

- Cache HIT served directly when fresh & rebuildCache false (:389–414).
- `fileToSpecFingerprint` cross-check against recomputed map fingerprint; mismatch ⇒ MISS (:314 fingerprint snapshot; :389–403 discard; stored on write :743–750; VO field spec-deps-suggestion-cache.ts:20–25; port input :19–20).
- Import tracing: gathers target implementation files from SpecRepository-persisted state + warm-up results (:416–447); depth-1 downstream impact via `analyzeFileImportImpact` preferring, falling back to `analyzeFileImpact` (queryDownstreamImpact :69–77; maxDepth=1 hard-coded at :74/:76) — satisfies "analyzeFileImpact (maxDepth = 1)".
- Imported files mapped to owning specIds via findSpecByFile (:495); barrel re-exports expanded one hop (:500–539).
- Items tagged `status: 'already-configured'|'new'` + `alreadyIncluded` (:543–551; cached path :408–414) so CLI can render `[already included]`.

Pass 2.5 Directional validation — SATISFIED:

- Outbound edges reused from Pass 2 (:452, :490–493); inverted candidates (candidate imports target, target doesn't import candidate) pruned (:615–661, prune at :655–661).

Pass 2.6 Transitive reduction — SATISFIED:

- For each candidate B, if another candidate A has B in its direct persisted deps, B pruned (:665–733; memoized getDirectDeps :671–710; prune :714–732). Uses GetPersistedSpecDeps then falls back to repository persisted state — consistent with dep specs.

Pass 3 Mutation/validation/change creation — SATISFIED:

- Only NEW ids (`alreadyIncluded === false`) unioned via `UpdatePersistedSpecDeps.execute({ specId, add })` (:767–780) — idempotent add per core:update-persisted-spec-deps.
- ValidateSpecs executed post-apply (:786–792); issues parsed into invalidSpecs with `[artifactId, description]` failures (:798–814).
- Alignment change `align-spec-deps-<timestamp>` created only when invalid AND `createAlignmentChange` authorized (:816–855; name `${prefix}-${Date.now()}` :821–822); `.specd-exploration.md` written with `- [artifactId]: description` lines (:834–847).
- `status: 'all-valid'` ⇒ NO change under any circumstances (:863–868). Constraint honored.

**4. Standard Factory & Composition Overloads — SATISFIED**

- 3 overload signatures + handler (:958–988); type guard (:996–1004); `resolveSuggestSpecDependenciesDeps` (:915–950) wiring createGetPersistedSpecDeps / createUpdatePersistedSpecDeps / createValidateSpecs / createCreateChange / both caches. Exports verified (packages/sdk/src/index.ts:18–22).

### Discrepancies

**D2-1 — `SpecDepsSuggestionCachePort.isSpecFresh` named by the spec does not exist.**

- Evidence: spec Pass 2 bullet "Evaluates `SpecDepsSuggestionCachePort.isSpecFresh` (validating `cacheVersion === '1.1.0'`)"; port declares only get/set/setMany/getAll/flush/invalidate (spec-deps-suggestion-cache-port.ts:44–77); grep for `isSpecFresh` across packages/sdk → 0 matches. Version check lives in private loadFromDisk (fs-spec-deps-suggestion-cache.ts:98–110).
- Hypothesis A (spec drift): the API was reshaped during implementation — freshness folded into `get()` self-validation and version gating into load; the spec still references an interim method name. Behavior (old-version entries discarded and regenerated, fs test :165–207) matches the spec's _intent_ and its verify scenarios.
- Hypothesis B (implementation bug): a required public port operation was never implemented, leaving consumers unable to query freshness without performing a get. Severity: low-medium (API surface mismatch; runtime behavior conforms).

**D2-2 — Validation errors silently coerced to `all-valid`.**

- Evidence: if `validateSpecs.execute({})` throws, the catch leaves `postApplyValidation` undefined (:869–871) yet `validation-done` is emitted with fallback status `'all-valid'` (:872–875). Also, validation only runs when `this.deps.validateSpecs` was injected (:786) — the deps-form factory allows omitting it (`validateSpecs?: ValidateSpecs` :209), whereas the spec presents ValidateSpecs as an unconditional Pass-3 step whenever `apply: true`.
- Hypothesis A (spec drift): spec should document the optional-validator dependency and the fail-open reporting policy.
- Hypothesis B (implementation bug): a crashed validator masquerading as "all-valid" suppresses the alignment-change safety net the spec mandates ("If invalid specs exist … creates a single alignment change"); fail-open is the unsafe direction. Severity: medium.

**D2-3 — Alignment-change creation depends on injected `createChange`; scaffolding partially duplicated.**

- Evidence: spec Constraint permits "directory creation and `.specd-exploration.md` writing … within the orchestration layer", but implementation additionally requires an injected `CreateChange` use case (:212, gated at :820) and then ALSO performs raw mkdir/writeFile (:846–847). With `deps`-form construction omitting `createChange`, `createAlignmentChange: true` yields `invalid-specs-detected` without any change and without error — silent capability loss.
- Hypothesis A (spec drift): spec should state the CreateChange collaboration explicitly as a required dep for authorized creation.
- Hypothesis B (implementation bug): unauthorized/no-op creation path violates "Creates a single alignment change gathering ALL failing specs" when authorization was given. Severity: medium.

**D2-4 — `warmup-progress` events forwarded only via raw inner callback (informational).**

- Evidence: warm-up passes its own onProgress translating inner events (:269); spec lists `warmup-progress` among emitted events ✓. No discrepancy — listed to confirm check performed.

### Test Coverage

Test file: packages/sdk/test/orchestration/suggest-spec-dependencies.spec.ts (15 tests, all passing) plus packages/sdk/test/infrastructure/fs/fs-suggestion-cache.spec.ts (3 tests).

| Verify scenario                                                | Test                                                                                                                | Assessment                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suggest deps from code imports (reason references import path) | `performs cache warm-up and traces import graph dependencies` (:242–261)                                            | Covered analogously; reason string `Code import relationship via <path>` asserted indirectly (only specId asserted). Reason-content assertion weak                                                                                                        |
| Missing target options throws InvalidInputError                | :568–573                                                                                                            | Covered                                                                                                                                                                                                                                                   |
| Non-existent workspace throws WorkspaceNotFoundError           | :575–584                                                                                                            | Covered                                                                                                                                                                                                                                                   |
| Non-existent spec ID error                                     | :586–599                                                                                                            | Covered                                                                                                                                                                                                                                                   |
| Directional pruning of inverted suggestions                    | :601–729                                                                                                            | Covered thoroughly incl. barrel-seeded inversion                                                                                                                                                                                                          |
| Transitive reduction                                           | :731–834                                                                                                            | Covered exactly per scenario roles                                                                                                                                                                                                                        |
| Cache version mismatch triggers regeneration                   | `discards and regenerates a cache file persisted with an older cacheVersion` (fs-suggestion-cache.spec.ts:165–207)  | Covered at adapter level (write 1.0.0 file → miss → regenerated header 1.1.0)                                                                                                                                                                             |
| Ownership change invalidates cached suggestions                | `recomputes cached suggestions when an imported file changes owner between runs` (:345–456)                         | Covered end-to-end incl. new-owner suggestion replacing old                                                                                                                                                                                               |
| Post-apply validation + conditional alignment change creation  | `handles invalid specs after applying dependencies and reports diagnostic` (:281–302)                               | WEAK — asserts status + suggestedAlignmentCommand only; `createAlignmentChange: true` path NEVER tested: no test for change name pattern `align-spec-deps-*`, `.specd-exploration.md` contents `[artifactId]: description`, or CreatedAlignmentChangeInfo |
| No change creation when all valid                              | Indirect via `applies suggested dependencies...` asserting `postApplyValidation?.status === 'all-valid'` (:263–279) | MODERATE — doesn't assert absence of createdChange explicitly, acceptable                                                                                                                                                                                 |
| Config-based factory resolution                                | `supports factory constructor overloads` (:458–470)                                                                 | WEAK — deps form only; config form + resolve helper untested                                                                                                                                                                                              |
| Progress callback events emission                              | :836–852                                                                                                            | Covered for presence of all six key event types; sequential order not asserted (unlike impl-links test)                                                                                                                                                   |

Additional tests: barrel hop expansion (:472–566), already-configured tagging (:304–320), deps-cache serving second run without graph queries (:322–343), apply-only-new union (:263–279).

Missing/negative-space coverage worth adding: D2-2 fail-open path (throwing validator), D2-3 omitted-createChange path, `changeNamePrefix` customization, `specIds`/`workspace`/`all` targeting variants (all tests use single `specId`).

### Dependency & Global Conformance findings

- Declared deps per `changes status`: `sdk:suggest-implementation-links`, `code-graph:traversal`, `core:get-persisted-spec-deps`, `core:update-persisted-spec-deps`.
  - sdk:suggest-implementation-links — warm-up delegation (:265–270) consistent; also relies on its cache priming side effect (:281–298), which the dep spec's public contract doesn't promise (implicit coupling; benign, same package).
  - code-graph:traversal — **CONTRADICTION (minor)**: sdk calls `analyzeFileImportImpact` first (queryDownstreamImpact :73–75). This function exists in code-graph (composition/code-graph-provider.ts:162/:818; services/analyze-file-impact.ts:165) but is NOT part of the merged code-graph:traversal spec, which documents only `analyzeFileImpact`/`analyzeFilesImpact`/`analyzeSpecImpact`/`detectChanges`. The sdk therefore consumes a provider capability outside its declared dependency's specified surface. Hypothesis A: spec drift — traversal spec should add the import-impact variant (or the sdk spec should declare the provider interface itself). Hypothesis B: implementation bug — should call only the specced `analyzeFileImpact` (the fallback already covers it; behavior would include CALLS-derived edges too, slightly widening suggestions). Depth-1 + direction 'downstream' usage otherwise conforms to traversal's File impact contract (affectedFiles aggregation, dedup).
  - core:get-persisted-spec-deps — used for existingDependsOn (:383–387) and direct-dep lookups (:677–681). Contract-conformant. Shared note N1: sdk catches ALL errors including the dep-spec-mandated `SpecNotFoundError` for unknown specs and treats them as uninitialized (`dependsOn: []`). Not a violation of the dep spec (that governs the core use case), but the sdk cannot distinguish "unknown spec" from "lock-less spec" — acceptable, note for reviewers.
  - core:update-persisted-spec-deps — `{ specId, add }` non-empty add (:771–774) matches input contract & idempotent-add semantics; readOnly-workspace rejection surfaces then swallowed (:777–779) — swallowed mutation errors mean `updatedSpecsCount` may under-report while validation proceeds. Minor robustness concern, not contradiction.
- `kernel.specs.validate` reference in spec verified real: kernel exposes `specs.validate: ValidateSpecs` (packages/core/src/composition/kernel.ts:235) — spec↔code consistency ✓.
- code-graph:symbol-model consistency (transitively via impl-links): file ownership identity `ws:path` respected by findSpecByFile keys (fs-impl-cache :352–356, :415–429) — consistent with symbol-model canonical paths.
- default:\_global/testing — same partial-mock violation pattern as Spec 1 (`as unknown as SpecRepository` :177–179; `as any` providers :205–216, :350–361, :523–542, :664–695, :794–806). In-memory caches fully implement abstract ports ✓. Integration-flavored fs tests use tmpdir + cleanup ✓ per conventions.
- default:\_global/architecture — same orchestration→infrastructure default-wiring tension (FsSpecDepsSuggestionCache imported at :33; defaults at :300–307, :941–946). Additionally Pass-3 writes files directly via node:fs/promises mkdir/writeFile (:846–847) — explicitly permitted by the change spec's Constraints, but in tension with the global architecture rule; recommend documenting as sanctioned exception.
- default:\_global/error-handling-conventions — thrown errors are core SpecdError subclasses ✓; however several internal failures are swallowed silently (mutation catch :777–779; exploration-write has no try/catch so it propagates ✓). Mixed but acceptable.
- default:\_global/logging — Logger.debug only ✓ (:398, :474, :496, :656, :720).

---

## Summary counts

| Metric                               | Count                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements checked                 | 10 (6 impl-links + 4 spec-deps)                                                                                                                                     |
| Satisfied                            | 7                                                                                                                                                                   |
| Partial                              | 3 (impl-links Req 3; spec-deps Req 3 via D2-1/D2-2/D2-3 nuances — core passes conform)                                                                              |
| Not found                            | 0                                                                                                                                                                   |
| Discrepancies raised                 | 7 (D1-1..D1-4, D2-1..D2-3)                                                                                                                                          |
| High-severity discrepancies          | 0                                                                                                                                                                   |
| Medium-severity discrepancies        | 3 (D1-3 tier short-circuit, D2-2 fail-open validation, D2-3 conditional change creation gaps)                                                                       |
| Verify scenarios accounted for       | 24 (13 + 11)                                                                                                                                                        |
| Scenarios with solid test coverage   | 14                                                                                                                                                                  |
| Scenarios with weak/partial coverage | 5 (cache fast-path, affinity penalty, config-factory ×2, all-valid-no-change)                                                                                       |
| Scenarios with NO test coverage      | 5 (Tier 2 subtoken, Tier 3 co-occurrence, already-included marking [impl-links], alignment-change creation + .specd-exploration.md, progress ordering [spec-deps])  |
| Dependency-spec contradictions       | 1 (undocumented `analyzeFileImportImpact` reliance on code-graph:traversal)                                                                                         |
| Global-spec conformance findings     | 3 (testing: partial mocks; architecture: orchestration→infrastructure imports + direct fs writes [partially sanctioned]; logging/conventions/error-handling: clean) |

Overall: implementation tracks both specs closely; all 34 audited tests green. Priority follow-ups: (1) resolve Tier short-circuit wording vs merged-pipeline reality (D1-3); (2) decide fate of `isSpecFresh` API mention (D2-1); (3) make post-apply validation fail-safe and require/validate `createChange` when `createAlignmentChange: true` (D2-2/D2-3); (4) add missing tests for Tier 2/Tier 3, already-included marking, and the alignment-change creation path.
